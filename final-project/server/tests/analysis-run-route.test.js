import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'

describe('POST /api/analysis/run endpoint', () => {
  const normalizedResume = {
    originalText: 'Experienced React developer with JavaScript skills.',
    evidence: [{ id: 'ev-001', text: 'Experienced React developer with JavaScript skills.' }],
  }

  it('successfully processes 1-job analysis and returns validated schema response with result details', async () => {
    const response = await request(createApp({ aiProvider: 'mock' }))
      .post('/api/analysis/run')
      .send({
        normalizedResume,
        jobs: [{ title: 'Frontend Engineer', description: 'Build React interfaces.' }],
      })

    expect(response.status).toBe(200)
    expect(response.body.rankedJobs).toHaveLength(1)
    expect(response.body.rankedJobs[0].status).toBe('succeeded')
    expect(response.body.rankedJobs[0].result).toBeDefined()
    expect(response.body.rankedJobs[0].result.workers).toBeDefined()
  })

  it('successfully processes 3-job analysis and returns ranked results', async () => {
    const response = await request(createApp({ aiProvider: 'mock' }))
      .post('/api/analysis/run')
      .send({
        normalizedResume,
        jobs: [
          { title: 'Frontend Engineer', description: 'Build React interfaces.' },
          { title: 'Fullstack Dev', description: 'React and Node.' },
          { title: 'UI Engineer', description: 'CSS and Design Systems.' },
        ],
      })

    expect(response.status).toBe(200)
    expect(response.body.rankedJobs).toHaveLength(3)
    expect(response.body.overallStatus).toBe('complete')
  })

  it('a genuinely partial job (a worker failed but the job still completed) passes response schema validation and returns 200, not a validation 500', async () => {
    // Empty evidence makes the mock bulletRewrite worker's fallback
    // evidenceId ('ev-001') reference resume evidence that doesn't exist,
    // so bulletRewrite fails but the job still completes — a real partial
    // result, not a synthetic one. This exercises the actual
    // multiJobAnalysisResponseSchema.safeParse(...) validation in the route.
    const response = await request(createApp({ aiProvider: 'mock' }))
      .post('/api/analysis/run')
      .send({
        normalizedResume: { originalText: '', evidence: [] },
        jobs: [{ title: 'Frontend Engineer', description: 'React and TypeScript required.' }],
      })

    expect(response.status).toBe(200)
    expect(response.body.message).not.toBe('Multi-job response validation failed')
    expect(response.body.overallStatus).toBe('partial')
    expect(response.body.partial).toBe(true)
    expect(response.body.rankedJobs[0].status).toBe('partial')
  })
})
