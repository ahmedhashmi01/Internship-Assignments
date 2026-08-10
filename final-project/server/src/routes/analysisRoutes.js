import express from 'express'
import { validateAnalysisInput } from '../services/inputValidation.js'
import { createOrchestrationService } from '../services/orchestrationService.js'
import { multiJobAnalysisRequestSchema, multiJobAnalysisResponseSchema } from '../schemas/analysisSchemas.js'
import { isDbConnected } from '../db/mongoose.js'
import { buildHistoryDoc, isUsableResult } from '../services/historyService.js'
import { timingLog } from '../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

const passthrough = (_req, _res, next) => next()

// Dependencies (guestUsageService, historyService, authMiddleware) are injected
// so the analyzer stays fully functional — and every existing AI test keeps
// passing — even when no database is configured. Guest-limit enforcement and
// history persistence only activate when a DB connection is live.
export const createAnalysisRouter = ({
  config,
  guestUsageService,
  historyService,
  authMiddleware,
  orchestrationService: injectedOrchestration,
  analysisLimiter = passthrough,
}) => {
  const router = express.Router()
  // Injectable so tests can assert exactly when the AI layer is (not) invoked.
  const orchestrationService = injectedOrchestration || createOrchestrationService(config)

  // Reserve the guest's single analysis slot BEFORE any AI call. Returns a
  // guard whose release() gives the slot back if the run fails or is unusable,
  // so a failed analysis never permanently consumes the allowance. Shared by
  // every AI-triggering route so none of them can be used to bypass the limit.
  const beginGuestGuard = async (req) => {
    const userId = req.auth?.userId || null
    const guestId = req.guestId || null
    const enforce = isDbConnected() && !userId && Boolean(guestId)
    if (enforce) await guestUsageService.reserve(guestId) // throws SIGNUP_REQUIRED when over limit
    let released = false
    const release = async () => {
      if (enforce && !released) {
        released = true
        await guestUsageService.release(guestId).catch(() => {})
      }
    }
    return { userId, guestId, enforce, release }
  }

  router.post('/validate-input', (req, res, next) => {
    try {
      const result = validateAnalysisInput(req.body || {}, config)

      if (result.errors.length > 0) {
        return res.status(400).json({
          validationErrors: result.errors,
          normalizedResume: result.normalizedResume,
          jobs: result.jobs,
        })
      }

      return res.json({
        validationErrors: [],
        normalizedResume: result.normalizedResume,
        jobs: result.jobs,
      })
    } catch (error) {
      next(error)
    }
  })

  // run-single triggers real AI, so it enforces the same optionalAuth + guest
  // limit as /run — a guest cannot bypass their allowance through this route.
  router.post('/run-single', analysisLimiter, authMiddleware.optionalAuth, async (req, res, next) => {
    const requestStartedAt = Date.now()
    timingLog('REQUEST START /api/analysis/run-single')

    const { normalizedResume, job } = req.body || {}
    if (!normalizedResume || !job) {
      return res.status(400).json({ message: 'normalizedResume and job are required' })
    }

    let guard
    try {
      guard = await beginGuestGuard(req)
    } catch (error) {
      return next(error) // SIGNUP_REQUIRED — AI never invoked
    }

    try {
      const result = await orchestrationService.runSingleJob({ normalizedResume, job })
      if (!result) await guard.release() // nothing usable → don't consume the allowance
      timingLog('REQUEST END /api/analysis/run-single', { totalMs: Date.now() - requestStartedAt })
      return res.json(result)
    } catch (error) {
      await guard.release()
      timingLog('REQUEST FAILED /api/analysis/run-single', { totalMs: Date.now() - requestStartedAt, error: error.message })
      next(error)
    }
  })

  router.post('/run', analysisLimiter, authMiddleware.optionalAuth, async (req, res, next) => {
    // 1. Validate first — a malformed request never reserves or consumes the
    //    guest allowance and never reaches an AI provider.
    const parsed = multiJobAnalysisRequestSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid multi-job request', issues: parsed.error.issues })
    }

    const { normalizedResume, jobs } = parsed.data

    // 2. Reserve the guest slot BEFORE any AI call. Over-limit throws
    //    SIGNUP_REQUIRED (403) here, so providers are never invoked.
    let guard
    try {
      guard = await beginGuestGuard(req)
    } catch (error) {
      return next(error)
    }
    const { userId, guestId } = guard

    // 3. Run the analysis. Any crash releases the reservation so a failed run
    //    does not permanently consume the allowance.
    let result
    try {
      result = await orchestrationService.runMultiJob({ normalizedResume, jobs })
    } catch (error) {
      await guard.release()
      return next(error)
    }

    const validated = multiJobAnalysisResponseSchema.safeParse(result)
    if (!validated.success) {
      await guard.release()
      return res.status(500).json({ message: 'Multi-job response validation failed', issues: validated.error.issues })
    }

    // 4a. Not usable → release the reservation (allowance not consumed) and
    //     return the result unchanged.
    if (!isUsableResult(validated.data)) {
      await guard.release()
      return res.json(validated.data)
    }

    // 4b. Usable → the reservation is now legitimately consumed. Persist the
    //     analysis to the owner's history (best-effort; a save failure must not
    //     fail the analysis the user just ran).
    if (isDbConnected() && (userId || guestId)) {
      try {
        const saved = await historyService.save(
          buildHistoryDoc({ userId, guestId: userId ? null : guestId, jobs, result: validated.data }),
        )
        return res.json({ ...validated.data, historyId: saved._id.toString() })
      } catch (saveError) {
        console.error('History save failed:', saveError.name)
      }
    }

    return res.json(validated.data)
  })

  return router
}
