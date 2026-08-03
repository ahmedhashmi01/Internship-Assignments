import { z } from 'zod'

export const resumeParseRequestSchema = z.object({
  resumeText: z.string().trim().optional(),
})

export const resumeParseResponseSchema = z.object({
  sourceType: z.enum(['pasted-text', 'uploaded-pdf']),
  fileName: z.string().optional(),
  extractedText: z.string(),
  normalizedResume: z.object({
    originalText: z.string(),
    evidence: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
      }),
    ),
  }),
  warning: z.string().optional(),
})
