import express from 'express'
import { extractJobFromUrl, JobExtractionError } from '../services/jobUrlExtractor.js'
import { jobExtractRequestSchema } from '../schemas/jobExtractSchemas.js'

// POST /api/jobs/extract — fetch a public job posting URL and return editable
// title/company/location/description. Network primitives (fetch/DNS/aiService)
// are injectable via `deps` so tests never hit the real network.
export const createJobRouter = ({ config = {}, deps = {} } = {}) => {
  const router = express.Router()

  router.post('/extract', async (req, res, next) => {
    const parsed = jobExtractRequestSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ message: 'A valid job posting URL is required', issues: parsed.error.issues })
    }

    try {
      const job = await extractJobFromUrl(parsed.data.url, { config, deps })
      return res.json(job)
    } catch (error) {
      // Normalized, safe failure — the frontend falls back to manual paste.
      if (error instanceof JobExtractionError) {
        return res.status(error.statusCode).json({ message: error.message, code: error.code })
      }
      return next(error)
    }
  })

  return router
}
