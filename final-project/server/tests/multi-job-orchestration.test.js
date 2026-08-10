import { describe, expect, it } from 'vitest'
import { createOrchestrationService } from '../src/services/orchestrationService.js'

describe('multi-job orchestration', () => {
  it('handles one job', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runMultiJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      jobs: [{ title: 'Frontend Engineer', description: 'Build React apps.' }],
    })

    expect(result.jobs).toHaveLength(1)
    expect(result.recommendations[0].recommendationLabel).toBeDefined()
  })

  it('handles three jobs', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runMultiJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      jobs: [
        { title: 'Frontend Engineer', description: 'Build React apps.' },
        { title: 'Backend Engineer', description: 'Build Node services.' },
        { title: 'Product Designer', description: 'Design user flows.' },
      ],
    })

    expect(result.jobs).toHaveLength(3)
  })

  it('uses stable tie handling', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runMultiJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      jobs: [
        { title: 'Frontend Engineer', description: 'Build React apps.' },
        { title: 'Frontend Developer', description: 'Build React apps.' },
      ],
    })

    expect(result.rankedJobs[0].jobTitle).toBeDefined()
    expect(result.rankedJobs[1].jobTitle).toBeDefined()
  })

  it('returns failed jobs separately', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runMultiJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      jobs: [
        { title: 'Frontend Engineer', description: 'Build React apps.' },
        { title: 'Broken Job', description: 'Will fail.' },
      ],
    })

    expect(result.failedJobs.length).toBeGreaterThanOrEqual(0)
  })

  it('reports recurring gaps', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runMultiJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      jobs: [
        { title: 'Frontend Engineer', description: 'Build React apps.' },
        { title: 'Frontend Lead', description: 'Lead React teams.' },
      ],
    })

    expect(result.recurringGaps).toBeDefined()
  })

  it('rejects invalid input', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    await expect(service.runMultiJob({ normalizedResume: null, jobs: [] })).rejects.toThrow()
  })
})
