import { z } from 'zod'

const structureBlockSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'listItem', 'tableCell']),
  level: z.number().int().min(1).max(6).optional(),
  text: z.string(),
  evidenceId: z.string().optional(),
})

export const docxExportRequestSchema = z.object({
  // Ordered structural blocks captured at DOCX upload time.
  structure: z.array(structureBlockSchema).min(1, 'Resume structure is required'),
  // Accepted rewrites keyed by evidenceId — only these paragraphs are replaced.
  replacements: z.record(z.string(), z.string()).optional().default({}),
  candidateName: z.string().max(120).optional(),
})
