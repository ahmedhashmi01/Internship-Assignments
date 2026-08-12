import { z } from 'zod'

const CATEGORIES = ['resume', 'role', 'gap', 'behavioral']
const DIFFICULTIES = ['standard', 'challenging']

export const interviewRequestSchema = z.object({
  job: z.object({
    title: z.string().max(300).optional(),
    description: z.string().min(1, 'Job description is required').max(20000),
  }),
  // Only the compact, relevant analysis facets — never the full analysis payload.
  analysis: z
    .object({
      matchedSkills: z.array(z.string()).optional().default([]),
      mandatoryGaps: z.array(z.string()).optional().default([]),
      atsKeywords: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({}),
  resumeEvidence: z
    .array(z.object({ id: z.string(), text: z.string() }))
    .optional()
    .default([]),
  count: z.number().int().min(1).max(10).optional().default(5),
  difficulty: z.enum(DIFFICULTIES).optional().default('standard'),
})

// What the model is asked to return — id/difficulty are assigned server-side.
export const interviewAiOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        question: z.string().min(1),
        whyThisQuestion: z.string().min(1),
        evidenceIds: z.array(z.string()).optional().default([]),
        relatedRequirement: z.string().optional(),
      }),
    )
    .min(1),
})

// The normalized shape returned to the client.
export const interviewQuestionSchema = z.object({
  id: z.string(),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  question: z.string().min(1),
  whyThisQuestion: z.string().min(1),
  evidenceIds: z.array(z.string()).default([]),
  relatedRequirement: z.string().optional(),
})

export const interviewResponseSchema = z.object({
  questions: z.array(interviewQuestionSchema),
})
