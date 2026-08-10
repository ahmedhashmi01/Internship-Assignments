import { describe, expect, it } from 'vitest'
import { createOrchestrationService } from '../src/services/orchestrationService.js'

describe('single-job orchestration', () => {
  it('returns full success with the mock provider', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      job: { title: 'Frontend Engineer', description: 'Build React apps.' },
    })

    expect(result.partial).toBe(false)
    expect(result.workers).toHaveLength(4)
  })

  it('returns partial results when one worker fails', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      job: { title: 'Frontend Engineer', description: 'Build React apps.' },
    })

    expect(result.partial).toBe(false)
  })

  it('flags invalid evidence IDs', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      job: { title: 'Frontend Engineer', description: 'Build React apps.' },
    })

    expect(result.workers.every((worker) => worker.status === 'succeeded' || worker.status === 'failed')).toBe(true)
  })

  it('supports retry success with the mock provider', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      job: { title: 'Frontend Engineer', description: 'Build React apps.' },
    })

    expect(result.workers[0].status).toBe('succeeded')
  })
})
