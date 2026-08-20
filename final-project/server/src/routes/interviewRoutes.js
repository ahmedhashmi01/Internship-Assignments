import express from 'express'
import { createAiService } from '../services/ai/providerService.js'
import { createInterviewService } from '../services/interviewService.js'
import { interviewRequestSchema, interviewResponseSchema } from '../schemas/interviewSchemas.js'

// POST /api/interview/questions — on-demand interview question generation.
// `interviewService` is injectable so tests control AI behavior deterministically.
export const createInterviewRouter = ({ config = {}, interviewService } = {}) => {
  const router = express.Router()
  const service = interviewService || createInterviewService({ config, aiService: createAiService(config) })

  router.post('/questions', async (req, res, next) => {
    const parsed = interviewRequestSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid interview request', issues: parsed.error.issues })
    }

    try {
      const result = await service.generateQuestions(parsed.data)
      const validated = interviewResponseSchema.safeParse(result)
      if (!validated.success) {
        return res.status(502).json({ message: 'Interview questions could not be generated right now. Please try again.' })
      }
      return res.json(validated.data)
    } catch (error) {
      // Normalize provider/generation failures — never leak provider internals.
      return res.status(502).json({ message: 'Interview questions could not be generated right now. Please try again.' })
    }
  })

  return router
}
