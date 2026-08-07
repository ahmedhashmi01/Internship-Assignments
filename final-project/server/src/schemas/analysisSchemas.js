import { z } from 'zod'

const textInputSchema = z
  .string()
  .trim()
  .min(1, 'Resume text is required')
  .max(20000, 'Resume text exceeds the maximum length')

const jobSchema = z.object({
  title: z.string().trim().min(1, 'Job title is required'),
  description: z.string().trim().min(1, 'Job description is required'),
})

export const resumeTextInputSchema = z.object({
  resumeText: textInputSchema,
  jobs: z.array(jobSchema).max(3, 'At most 3 jobs are allowed'),
})

export const normalizedResumeSchema = z.object({
  originalText: z.string(),
  evidence: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
    }),
  ),
})

export const analysisRequestSchema = z.object({
  resumeText: textInputSchema,
  jobs: z.array(jobSchema).min(1, 'At least one job is required').max(3, 'At most 3 jobs are allowed'),
})

export const multiJobAnalysisRequestSchema = z.object({
  normalizedResume: normalizedResumeSchema,
  jobs: z.array(jobSchema).min(1, 'At least one job is required').max(3, 'At most 3 jobs are allowed'),
})

const rankedJobResultSchema = z.object({
  jobId: z.string(),
  jobTitle: z.string(),
  jobDescription: z.string(),
  score: z.number().min(0).max(100),
  scoreDrivers: z.array(z.string()),
  recommendationLabel: z.enum(['strong fit', 'good fit', 'moderate fit', 'low fit']),
  mandatoryGaps: z.array(z.string()),
  // A ranked job ran to completion but may still have had an internal
  // worker fail (e.g. skillMatch, bulletRewrite) — that's 'partial', not
  // 'succeeded'. Only a job whose whole run() call rejected is 'failed'
  // (failedJobResultSchema, a separate branch, never appears here).
  status: z.enum(['succeeded', 'partial']),
  rank: z.number().int().min(1),
  result: z.any().optional(),
})

const failedJobResultSchema = z.object({
  jobId: z.string(),
  jobTitle: z.string(),
  jobDescription: z.string(),
  status: z.literal('failed'),
  errorMessage: z.string(),
})

export const multiJobAnalysisResponseSchema = z.object({
  jobs: z.array(rankedJobResultSchema.omit({ rank: true })),
  rankedJobs: z.array(rankedJobResultSchema),
  recommendations: z.array(
    z.object({
      jobId: z.string(),
      jobTitle: z.string(),
      recommendationLabel: z.string(),
      score: z.number(),
    }),
  ).optional(),
  failedJobs: z.array(failedJobResultSchema),
  recurringGaps: z.array(z.object({ gap: z.string(), count: z.number().int().min(1) })),
  partial: z.boolean(),
  overallStatus: z.enum(['complete', 'partial']),
  totalDurationMs: z.number().int().min(0),
  providerValidation: z.object({
    ok: z.boolean(),
    provider: z.string(),
    model: z.string().optional(),
    availableModels: z.array(z.string()).optional(),
    error: z.string().nullable().optional(),
  }).nullable(),
})
