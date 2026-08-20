import { z } from 'zod'

export const resumeParseRequestSchema = z.object({
  resumeText: z.string().trim().optional(),
})

export const docxStructureBlockSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'listItem', 'tableCell']),
  level: z.number().int().min(1).max(6).optional(),
  text: z.string(),
  evidenceId: z.string(),
})

export const resumeParseResponseSchema = z.object({
  sourceType: z.enum(['pasted-text', 'uploaded-pdf', 'uploaded-docx']),
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
  // Present only for DOCX uploads.
  structure: z.array(docxStructureBlockSchema).optional(),
  warning: z.string().optional(),
})
