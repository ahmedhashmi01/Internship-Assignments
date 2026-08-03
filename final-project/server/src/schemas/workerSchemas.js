import { z } from 'zod'

const evidenceIdSchema = z.string().regex(/^ev-\d{3}$/u, 'Evidence ID must use the format ev-001')
const statusSchema = z.enum(['matched', 'partial', 'missing', 'uncertain'])
const gapTypeSchema = z.enum(['wording', 'evidence', 'real-skill', 'uncertain'])
const riskStatusSchema = z.enum(['low', 'medium', 'high'])
const requirementTypeSchema = z.enum(['mandatory', 'preferred', 'contextual'])

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

export const supervisorPlanSchema = z.object({
  plan: z.array(z.string()),
  rationale: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Skill-match — single item (used internally and in existing schema tests)
// ---------------------------------------------------------------------------

export const skillMatchItemSchema = z.object({
  skill: z.string().min(1),
  requirementType: requirementTypeSchema,
  status: statusSchema,
  evidenceId: evidenceIdSchema.optional(),
  confidence: z.number().min(0).max(1),
  gapType: gapTypeSchema.optional(),
  notes: z.string().optional(),
})

/**
 * @deprecated Use skillMatchItemSchema. Kept for backward-compatibility with
 * existing tests that reference skillMatchOutputSchema by name.
 */
export const skillMatchOutputSchema = skillMatchItemSchema

// Batch wrapper: up to 10 requirements analysed in a single AI call
export const skillMatchBatchOutputSchema = z.object({
  items: z.array(skillMatchItemSchema).min(1).max(10),
})

// ---------------------------------------------------------------------------
// ATS keyword — single item
// ---------------------------------------------------------------------------

export const atsKeywordItemSchema = z.object({
  keyword: z.string().min(1),
  status: statusSchema,
  evidenceId: evidenceIdSchema.optional(),
  confidence: z.number().min(0).max(1),
  gapType: gapTypeSchema.optional(),
  notes: z.string().optional(),
})

/**
 * @deprecated Use atsKeywordItemSchema. Kept for backward-compatibility.
 */
export const atsKeywordOutputSchema = atsKeywordItemSchema

// Batch wrapper: up to 15 keywords analysed in a single AI call
export const atsKeywordBatchOutputSchema = z.object({
  items: z.array(atsKeywordItemSchema).min(1).max(15),
})

// ---------------------------------------------------------------------------
// Bullet rewrite — single item
// ---------------------------------------------------------------------------

export const bulletRewriteItemSchema = z.object({
  originalText: z.string().min(1),
  rewrittenText: z.string().min(1),
  evidenceId: evidenceIdSchema,
  changedKeywords: z.array(z.string().min(1)),
  riskStatus: riskStatusSchema,
})

/**
 * @deprecated Use bulletRewriteItemSchema. Kept for backward-compatibility.
 */
export const bulletRewriteOutputSchema = bulletRewriteItemSchema

// Batch wrapper: up to 5 rewrites in a single AI call
export const bulletRewriteBatchOutputSchema = z.object({
  rewrites: z.array(bulletRewriteItemSchema).min(1).max(5),
})

// ---------------------------------------------------------------------------
// Final per-job report (unchanged — used in analysis route validation)
// ---------------------------------------------------------------------------

export const finalPerJobReportSchema = z.object({
  jobTitle: z.string().min(1),
  summary: z.string().min(1),
  matchedSkills: z.array(skillMatchItemSchema),
  missingSkills: z.array(skillMatchItemSchema),
  keywordMatches: z.array(atsKeywordItemSchema),
  rewrites: z.array(bulletRewriteItemSchema),
  overallStatus: statusSchema,
})
