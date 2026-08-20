import express from 'express'
import { discoverJobs as defaultDiscoverJobs } from '../services/jobDiscovery/jobDiscoveryService.js'
import { jobDiscoveryRequestSchema } from '../schemas/jobDiscoverySchemas.js'

// POST /api/jobs/discover — live/demo job discovery. Never 502s merely
// because one external source failed (jobSearchService degrades gracefully
// to the next provider, then the demo catalog); only a genuine bug reaches
// the error handler. `discoverJobsFn` is injectable so route tests never hit
// real HTTP or a real AI provider.
export const createJobDiscoveryRouter = ({ config = {}, deps = {}, discoverJobsFn = defaultDiscoverJobs } = {}) => {
  const router = express.Router()

  router.post('/discover', async (req, res, next) => {
    const parsed = jobDiscoveryRequestSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid job discovery request', issues: parsed.error.issues })
    }

    try {
      const result = await discoverJobsFn({
        evidence: parsed.data.resume?.evidence || [],
        candidateProfile: parsed.data.candidateProfile,
        preferences: parsed.data.preferences,
        config,
        deps,
      })
      return res.json(result)
    } catch (error) {
      next(error)
    }
  })

  return router
}
