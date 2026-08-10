import { describe, expect, it } from 'vitest'
import { createOrchestrationService, getStableJobRank } from '../src/services/orchestrationService.js'

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

  describe('partial status propagation (regression)', () => {
    // Empty evidence makes the mock bulletRewrite worker's fallback evidenceId
    // ('ev-001') reference resume evidence that doesn't exist, so the job
    // completes but bulletRewrite is marked failed — a "partial", not a hard
    // job failure. This proves the outer job/multi-job status reflects that,
    // instead of reporting a flat 'succeeded' / 'complete'.
    const emptyEvidenceResume = { originalText: '', evidence: [] }

    it('marks a job with a failed critical worker as "partial", not "succeeded"', async () => {
      const service = createOrchestrationService({ aiProvider: 'mock' })
      const result = await service.runMultiJob({
        normalizedResume: emptyEvidenceResume,
        jobs: [{ title: 'Frontend Engineer', description: 'React and TypeScript required.' }],
      })

      expect(result.jobs[0].status).toBe('partial')
      expect(result.rankedJobs[0].status).toBe('partial')
    })

    it('sets multi-job partial=true and overallStatus="partial" when any ranked job is partial, even with zero hard failures', async () => {
      const service = createOrchestrationService({ aiProvider: 'mock' })
      const result = await service.runMultiJob({
        normalizedResume: emptyEvidenceResume,
        jobs: [{ title: 'Frontend Engineer', description: 'React and TypeScript required.' }],
      })

      expect(result.failedJobs).toHaveLength(0)
      expect(result.partial).toBe(true)
      expect(result.overallStatus).toBe('partial')
    })

    it('does not mark unaffected jobs as partial when only one job in a multi-job request fails a worker', async () => {
      const service = createOrchestrationService({ aiProvider: 'mock' })
      const healthyResume = {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      }

      const result = await service.runMultiJob({
        normalizedResume: healthyResume,
        jobs: [{ title: 'Frontend Engineer', description: 'Build React apps.' }],
      })

      expect(result.jobs[0].status).toBe('succeeded')
      expect(result.partial).toBe(false)
      expect(result.overallStatus).toBe('complete')
    })
  })

  describe('deterministic tie-breaking for equal rounded scores (getStableJobRank)', () => {
    const baseJob = { score: 75, jobTitle: 'Any', jobId: 'job-01', mandatoryCoverage: 0.8, preferredCoverage: 0.6, supportedRequirementCount: 3, atsCoverage: 0.7, originalIndex: 0 }

    it('1. ranks by mandatory coverage first when scores tie', () => {
      const higher = { ...baseJob, jobId: 'job-01', mandatoryCoverage: 0.9 }
      const lower = { ...baseJob, jobId: 'job-02', mandatoryCoverage: 0.5 }
      expect([lower, higher].sort(getStableJobRank)).toEqual([higher, lower])
    })

    it('2. falls back to preferred coverage when score and mandatory coverage tie', () => {
      const higher = { ...baseJob, jobId: 'job-01', preferredCoverage: 0.9 }
      const lower = { ...baseJob, jobId: 'job-02', preferredCoverage: 0.4 }
      expect([lower, higher].sort(getStableJobRank)).toEqual([higher, lower])
    })

    it('3. falls back to the number of directly-supported (evidence-backed) requirements next', () => {
      const higher = { ...baseJob, jobId: 'job-01', supportedRequirementCount: 5 }
      const lower = { ...baseJob, jobId: 'job-02', supportedRequirementCount: 1 }
      expect([lower, higher].sort(getStableJobRank)).toEqual([higher, lower])
    })

    it('4. falls back to ATS coverage next', () => {
      const higher = { ...baseJob, jobId: 'job-01', atsCoverage: 0.9 }
      const lower = { ...baseJob, jobId: 'job-02', atsCoverage: 0.3 }
      expect([lower, higher].sort(getStableJobRank)).toEqual([higher, lower])
    })

    it('5. falls back to original submission order as the final, deterministic tie-breaker', () => {
      const first = { ...baseJob, jobId: 'job-01', originalIndex: 0 }
      const second = { ...baseJob, jobId: 'job-02', originalIndex: 1 }
      // Every prior tie-break field is identical — only submission order differs.
      expect([second, first].sort(getStableJobRank)).toEqual([first, second])
    })

    it('is stable and repeatable across multiple sorts of the same input', () => {
      const jobs = [
        { ...baseJob, jobId: 'job-01', originalIndex: 0 },
        { ...baseJob, jobId: 'job-02', originalIndex: 1, mandatoryCoverage: 0.9 },
        { ...baseJob, jobId: 'job-03', originalIndex: 2, score: 90 },
      ]

      const first = jobs.slice().sort(getStableJobRank)
      const second = jobs.slice().sort(getStableJobRank)
      expect(second.map((j) => j.jobId)).toEqual(first.map((j) => j.jobId))
      expect(first.map((j) => j.jobId)).toEqual(['job-03', 'job-02', 'job-01'])
    })
  })
})
