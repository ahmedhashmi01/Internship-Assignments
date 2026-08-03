import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'

describe('POST /api/analysis/run endpoint', () => {
  const normalizedResume = {
    originalText: 'Experienced React developer with JavaScript skills.',
    evidence: [{ id: 'ev-001', text: 'Experienced React developer with JavaScript skills.' }],
  }

  it('successfully processes 1-job analysis and returns validated schema response with result details', async () => {
    const response = await request(createApp())
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
    const response = await request(createApp())
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
})
