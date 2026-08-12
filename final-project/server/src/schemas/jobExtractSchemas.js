import { z } from 'zod'

// The URL is validated further (protocol, SSRF, DNS) inside jobUrlExtractor.
export const jobExtractRequestSchema = z.object({
  url: z.string().min(1, 'A job posting URL is required').max(2048),
})

export const jobExtractResponseSchema = z.object({
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  description: z.string(),
  sourceUrl: z.string(),
  extractionMethod: z.enum(['jsonld', 'meta', 'html', 'ai-cleanup']),
})
