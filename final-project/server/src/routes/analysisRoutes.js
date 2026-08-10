import express from 'express'
import { validateAnalysisInput } from '../services/inputValidation.js'
import { createOrchestrationService } from '../services/orchestrationService.js'
import { multiJobAnalysisRequestSchema, multiJobAnalysisResponseSchema } from '../schemas/analysisSchemas.js'
import { timingLog } from '../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

export const createAnalysisRouter = (config) => {
  const router = express.Router()
  const orchestrationService = createOrchestrationService(config)

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

  router.post('/run-single', async (req, res, next) => {
    const requestStartedAt = Date.now()
    timingLog('REQUEST START /api/analysis/run-single')
    try {
      const { normalizedResume, job } = req.body || {}

      if (!normalizedResume || !job) {
        return res.status(400).json({ message: 'normalizedResume and job are required' })
      }

      const result = await orchestrationService.runSingleJob({ normalizedResume, job })
      timingLog('REQUEST END /api/analysis/run-single', { totalMs: Date.now() - requestStartedAt })
      return res.json(result)
    } catch (error) {
      timingLog('REQUEST FAILED /api/analysis/run-single', { totalMs: Date.now() - requestStartedAt, error: error.message })
      next(error)
    }
  })

  router.post('/run', async (req, res, next) => {
    try {
      const parsed = multiJobAnalysisRequestSchema.safeParse(req.body || {})

      if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid multi-job request', issues: parsed.error.issues })
      }

      const { normalizedResume, jobs } = parsed.data
      const result = await orchestrationService.runMultiJob({ normalizedResume, jobs })
      const validated = multiJobAnalysisResponseSchema.safeParse(result)

      if (!validated.success) {
        return res.status(500).json({ message: 'Multi-job response validation failed', issues: validated.error.issues })
      }

      return res.json(validated.data)
    } catch (error) {
      next(error)
    }
  })

  return router
}
