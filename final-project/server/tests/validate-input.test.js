import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'

describe('POST /api/analysis/validate-input', () => {
  it('accepts a valid resume and up to three jobs', async () => {
    const response = await request(createApp())
      .post('/api/analysis/validate-input')
      .send({
        resumeText: '  Experienced frontend developer.\nBuilt React apps.\nLed team onboarding.  ',
        jobs: [
          { title: 'Frontend Engineer', description: 'Build user interfaces with React.' },
          { title: 'Product Engineer', description: 'Work across frontend and backend systems.' },
        ],
      })

    expect(response.status).toBe(200)
    expect(response.body.validationErrors).toEqual([])
    expect(response.body.normalizedResume.originalText).toBe('Experienced frontend developer.\nBuilt React apps.\nLed team onboarding.')
    expect(response.body.normalizedResume.evidence[0]).toMatchObject({ id: 'ev-001' })
    expect(response.body.jobs).toHaveLength(2)
  })

  it('returns validation errors for an empty resume', async () => {
    const response = await request(createApp())
      .post('/api/analysis/validate-input')
      .send({ resumeText: '   \n  ', jobs: [{ title: 'Developer', description: 'Build things.' }] })

    expect(response.status).toBe(400)
    expect(response.body.validationErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'resumeText' })]),
    )
  })

  it('returns validation errors for an oversized resume', async () => {
    const response = await request(createApp())
      .post('/api/analysis/validate-input')
      .send({
        resumeText: 'A'.repeat(20001),
        jobs: [{ title: 'Developer', description: 'Build things.' }],
      })

    expect(response.status).toBe(400)
    expect(response.body.validationErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'resumeText' })]),
    )
  })

  it('returns validation errors when more than three jobs are provided', async () => {
    const response = await request(createApp())
      .post('/api/analysis/validate-input')
      .send({
        resumeText: 'Experienced engineer.',
        jobs: [
          { title: 'One', description: 'First' },
          { title: 'Two', description: 'Second' },
          { title: 'Three', description: 'Third' },
          { title: 'Four', description: 'Fourth' },
        ],
      })

    expect(response.status).toBe(400)
    expect(response.body.validationErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'jobs' })]),
    )
  })
})
