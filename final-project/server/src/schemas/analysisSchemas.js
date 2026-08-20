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

// Deterministic, sanitized "why this score" payload — built from the same
// scoring inputs (see scoringService.buildScoreExplanation). No debug internals.
const requirementItemSchema = z.object({
  requirement: z.string(),
  requirementType: z.enum(['mandatory', 'preferred', 'contextual']),
  status: z.enum(['matched', 'partial', 'uncertain', 'missing']),
  evidenceIds: z.array(z.string()),
})

const componentCoverageSchema = z.object({
  coverage: z.number().min(0).max(100),
  count: z.number().int().min(0),
})

export const scoreExplanationSchema = z.object({
  summary: z.string(),
  components: z.object({
    mandatory: componentCoverageSchema,
    preferred: componentCoverageSchema,
    contextual: componentCoverageSchema,
    ats: componentCoverageSchema,
  }),
  strongMatches: z.array(z.object({ requirement: z.string(), evidenceIds: z.array(z.string()) })),
  deductions: z.array(
    z.object({
      requirement: z.string(),
      status: z.enum(['partial', 'uncertain', 'missing']),
      requirementType: z.enum(['mandatory', 'preferred', 'contextual']),
      reason: z.string(),
    }),
  ),
  capsApplied: z.array(z.object({ code: z.string(), description: z.string() })),
  requirements: z.array(requirementItemSchema),
  atsKeywords: z.array(z.object({ keyword: z.string(), status: z.enum(['matched', 'missing']), evidenceIds: z.array(z.string()) })),
})

// Application Readiness — deterministic status derived from the score
// explanation (see scoringService.buildApplicationReadiness). No new score.
export const applicationReadinessSchema = z.object({
  status: z.enum(['ready', 'ready_with_improvements', 'significant_gaps', 'low_fit']),
  label: z.string(),
  summary: z.string(),
  metrics: z.object({
    matchScore: z.number(),
    mandatoryCoverage: z.number().nullable(),
    preferredCoverage: z.number().nullable(),
    atsCoverage: z.number().nullable(),
    criticalGapCount: z.number().int().min(0),
  }),
})

// Priority Actions — deterministic gap-to-action list (see
// scoringService.buildPriorityActions). No AI call.
export const priorityActionSchema = z.object({
  priority: z.number().int().min(1),
  type: z.enum(['critical_gap', 'strengthen_evidence', 'keyword_opportunity', 'preferred_gap']),
  title: z.string(),
  severity: z.enum(['high', 'medium', 'opportunity']),
  reason: z.string(),
  evidenceIds: z.array(z.string()),
  action: z.string(),
})

const rankedJobResultSchema = z.object({
  jobId: z.string(),
  jobTitle: z.string(),
  jobDescription: z.string(),
  score: z.number().min(0).max(100),
  scoreDrivers: z.array(z.string()),
  recommendationLabel: z.enum(['strong fit', 'good fit', 'moderate fit', 'low fit']),
  mandatoryGaps: z.array(z.string()),
  scoreExplanation: scoreExplanationSchema.optional(),
  readiness: applicationReadinessSchema.optional(),
  priorityActions: z.array(priorityActionSchema).optional(),
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
