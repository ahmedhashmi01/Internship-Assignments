import { describe, expect, it } from 'vitest'
import { multiJobAnalysisResponseSchema } from '../src/schemas/analysisSchemas.js'

const baseRankedJob = {
  jobId: 'job-01',
  jobTitle: 'Frontend Engineer',
  jobDescription: 'Build React apps.',
  score: 72,
  scoreDrivers: ['React matched'],
  recommendationLabel: 'good fit',
  mandatoryGaps: [],
  rank: 1,
}

const baseResponse = (rankedJobStatus) => ({
  jobs: [{ ...baseRankedJob, status: rankedJobStatus }],
  rankedJobs: [{ ...baseRankedJob, status: rankedJobStatus, result: { partial: rankedJobStatus === 'partial' } }],
  recommendations: [],
  failedJobs: [],
  recurringGaps: [],
  partial: rankedJobStatus === 'partial',
  overallStatus: rankedJobStatus === 'partial' ? 'partial' : 'complete',
  totalDurationMs: 100,
  providerValidation: { ok: true, provider: 'mock', model: 'mock' },
})

describe('multiJobAnalysisResponseSchema — ranked job status', () => {
  it('accepts a fully succeeded ranked job', () => {
    expect(multiJobAnalysisResponseSchema.safeParse(baseResponse('succeeded')).success).toBe(true)
  })

  it('accepts a partial ranked job (a worker failed but the job still produced a result)', () => {
    const result = multiJobAnalysisResponseSchema.safeParse(baseResponse('partial'))
    expect(result.success).toBe(true)
  })

  it('rejects an unsupported status value', () => {
    for (const badStatus of ['in-progress', 'unknown', 'done', 'pending', '']) {
      const result = multiJobAnalysisResponseSchema.safeParse(baseResponse(badStatus))
      expect(result.success).toBe(false)
    }
  })

  it('still rejects a "failed" status on a ranked job (that belongs to failedJobs, not rankedJobs)', () => {
    const result = multiJobAnalysisResponseSchema.safeParse(baseResponse('failed'))
    expect(result.success).toBe(false)
  })

  it('still requires failedJobs entries to use status "failed"', () => {
    const response = {
      ...baseResponse('succeeded'),
      failedJobs: [{ jobId: 'job-02', jobTitle: 'Backend Engineer', jobDescription: 'desc', status: 'partial', errorMessage: 'boom' }],
    }
    expect(multiJobAnalysisResponseSchema.safeParse(response).success).toBe(false)
  })
})
