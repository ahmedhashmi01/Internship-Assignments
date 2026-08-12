import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/server.js'
import { createInterviewService } from '../src/services/interviewService.js'

const baseInput = {
  job: { title: 'Frontend Engineer', description: 'Build React and TypeScript apps. Kubernetes experience required.' },
  analysis: { matchedSkills: ['React'], mandatoryGaps: ['Kubernetes'], atsKeywords: ['TypeScript'] },
  resumeEvidence: [
    { id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' },
    { id: 'ev-002', text: 'Improved load time across analytics dashboards.' },
  ],
  count: 5,
  difficulty: 'standard',
}

// A fake AI service returning a valid interview payload (with one hallucinated
// evidence id that normalization must drop).
const okAiService = () => ({
  generateJson: vi.fn(async () => ({
    questions: [
      { category: 'resume', question: 'Tell me about your React work.', whyThisQuestion: 'Grounded in evidence.', evidenceIds: ['ev-001', 'ev-999'] },
      { category: 'role', question: 'How do you use TypeScript?', whyThisQuestion: 'Core requirement.', evidenceIds: [] },
      { category: 'gap', question: 'How would you approach Kubernetes?', whyThisQuestion: 'Missing skill.', evidenceIds: [], relatedRequirement: 'Kubernetes' },
    ],
  })),
})

describe('createInterviewService', () => {
  it('generates normalized questions, assigns iq-ids, and drops invalid evidence ids', async () => {
    const aiService = okAiService()
    const service = createInterviewService({ config: { interviewMaxQuestions: 10 }, aiService })
    const { questions } = await service.generateQuestions(baseInput)

    expect(questions.length).toBe(3)
    expect(questions[0].id).toBe('iq-001')
    expect(questions.every((q) => q.difficulty === 'standard')).toBe(true)
    // ev-999 (not in provided evidence) is stripped; ev-001 kept.
    expect(questions[0].evidenceIds).toEqual(['ev-001'])
  })

  it('enforces the max question count', async () => {
    const many = {
      questions: Array.from({ length: 20 }, (_v, i) => ({
        category: 'role',
        question: `Q${i}`,
        whyThisQuestion: 'why',
        evidenceIds: [],
      })),
    }
    const aiService = { generateJson: vi.fn(async () => many) }
    const service = createInterviewService({ config: { interviewMaxQuestions: 10 }, aiService })

    const { questions } = await service.generateQuestions({ ...baseInput, count: 10 })
    expect(questions.length).toBe(10)
  })

  it('retries exactly once on malformed AI output, then succeeds', async () => {
    const generateJson = vi
      .fn()
      .mockRejectedValueOnce(new Error('invalid json'))
      .mockResolvedValueOnce(okAiService().generateJson.getMockImplementation()())
    const service = createInterviewService({ config: {}, aiService: { generateJson } })

    const { questions } = await service.generateQuestions(baseInput)
    expect(generateJson).toHaveBeenCalledTimes(2)
    expect(questions.length).toBeGreaterThan(0)
  })

  it('propagates a provider failure when both attempts fail', async () => {
    const generateJson = vi.fn().mockRejectedValue(new Error('provider down'))
    const service = createInterviewService({ config: {}, aiService: { generateJson } })

    await expect(service.generateQuestions(baseInput)).rejects.toThrow('provider down')
    expect(generateJson).toHaveBeenCalledTimes(2)
  })

  it('phrases missing skills as gaps, never as assumed experience', async () => {
    // Demo mode is deterministic and grounded — a good anti-fabrication check.
    const service = createInterviewService({ config: { aiMode: 'demo' } })
    const { questions } = await service.generateQuestions(baseInput)

    const gap = questions.find((q) => q.category === 'gap')
    expect(gap).toBeTruthy()
    expect(gap.question).toMatch(/does not provide direct Kubernetes evidence|Kubernetes/i)
    expect(gap.question).not.toMatch(/Tell me about the Kubernetes .* you (managed|built|led)/i)
  })

  it('works in demo mode with no AI provider configured (no cloud call)', async () => {
    const aiService = { generateJson: vi.fn() }
    const service = createInterviewService({ config: { aiMode: 'demo' }, aiService })
    const { questions } = await service.generateQuestions({ ...baseInput, count: 5 })

    expect(questions.length).toBe(5)
    expect(aiService.generateJson).not.toHaveBeenCalled()
    // Demo evidence ids only reference provided evidence.
    const evidenceIds = questions.flatMap((q) => q.evidenceIds)
    evidenceIds.forEach((id) => expect(['ev-001', 'ev-002']).toContain(id))
  })
})

describe('POST /api/interview/questions route', () => {
  it('rejects an invalid request (missing job description) with 400', async () => {
    const response = await request(createApp()).post('/api/interview/questions').send({ count: 5 })
    expect(response.status).toBe(400)
  })

  it('returns questions in demo mode', async () => {
    const response = await request(createApp({ aiMode: 'demo' }))
      .post('/api/interview/questions')
      .send(baseInput)

    expect(response.status).toBe(200)
    expect(Array.isArray(response.body.questions)).toBe(true)
    expect(response.body.questions.length).toBe(5)
    expect(response.body.questions[0]).toMatchObject({ id: 'iq-001', difficulty: 'standard' })
  })

  it('normalizes a provider failure to a 502 with a friendly message', async () => {
    const failingService = { generateQuestions: vi.fn(async () => { throw new Error('boom') }) }
    const response = await request(createApp({}, { interviewService: failingService }))
      .post('/api/interview/questions')
      .send(baseInput)

    expect(response.status).toBe(502)
    expect(response.body.message).toMatch(/could not be generated/i)
  })
})
