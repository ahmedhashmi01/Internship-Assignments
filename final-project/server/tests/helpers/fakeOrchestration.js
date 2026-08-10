import { vi } from 'vitest'

// A minimal, schema-valid multi-job response with one ranked job.
export const usableResult = (overrides = {}) => ({
  jobs: [
    {
      jobId: 'job-1',
      jobTitle: 'Frontend Engineer',
      jobDescription: 'Build React interfaces.',
      score: 82,
      scoreDrivers: ['React'],
      recommendationLabel: 'good fit',
      mandatoryGaps: [],
      status: 'succeeded',
      result: { workers: {} },
    },
  ],
  rankedJobs: [
    {
      jobId: 'job-1',
      jobTitle: 'Frontend Engineer',
      jobDescription: 'Build React interfaces.',
      score: 82,
      scoreDrivers: ['React'],
      recommendationLabel: 'good fit',
      mandatoryGaps: [],
      status: 'succeeded',
      rank: 1,
      result: { workers: {} },
    },
  ],
  failedJobs: [],
  recurringGaps: [],
  partial: false,
  overallStatus: 'complete',
  totalDurationMs: 12,
  providerValidation: null,
  ...overrides,
})

// A schema-valid response with NO ranked jobs — an unusable analysis.
export const unusableResult = () => ({
  jobs: [],
  rankedJobs: [],
  failedJobs: [
    {
      jobId: 'job-1',
      jobTitle: 'Frontend Engineer',
      jobDescription: 'Build React interfaces.',
      status: 'failed',
      errorMessage: 'providers unavailable',
    },
  ],
  recurringGaps: [],
  partial: true,
  overallStatus: 'partial',
  totalDurationMs: 5,
  providerValidation: null,
})

// Fake orchestration service whose runMultiJob is a spy. Pass a behavior:
//   'usable'   → resolves a usable result (default)
//   'unusable' → resolves a result with no ranked jobs
//   'throw'    → rejects (simulates a crash / providers-down)
// A minimal single-job result (shape is opaque to the route — any truthy
// resolved value counts as a usable single analysis).
export const singleJobResult = () => ({
  jobId: 'job-1',
  jobTitle: 'Frontend Engineer',
  score: 80,
  status: 'succeeded',
  workers: [],
})

export const makeFakeOrchestration = (behavior = 'usable') => {
  const runMultiJob = vi.fn(async () => {
    if (behavior === 'throw') throw new Error('AI providers unavailable')
    if (behavior === 'unusable') return unusableResult()
    return usableResult()
  })
  const runSingleJob = vi.fn(async () => {
    if (behavior === 'throw') throw new Error('AI providers unavailable')
    if (behavior === 'unusable') return null
    return singleJobResult()
  })
  return { orchestrationService: { runMultiJob, runSingleJob }, runMultiJob, runSingleJob }
}
