import { z } from 'zod'

const SENIORITY_ENUM = z.enum(['junior', 'mid', 'senior', 'lead'])
const WORK_TYPE_ENUM = z.enum(['remote', 'hybrid', 'onsite'])

export const jobDiscoveryPreferencesSchema = z
  .object({
    country: z.string().trim().max(5).optional(),
    location: z.string().trim().max(200).optional(),
    workTypes: z.array(WORK_TYPE_ENUM).max(3).optional(),
    roleFamily: z.string().trim().max(100).optional(),
    seniority: SENIORITY_ENUM.optional(),
    minimumDiscoveryScore: z.number().min(0).max(100).optional(),
  })
  .optional()
  .default({})

export const candidateProfileSchema = z.object({
  primaryRoleFamilies: z.array(z.string()),
  adjacentRoleFamilies: z.array(z.string()),
  skills: z.array(z.string()),
  seniority: SENIORITY_ENUM.nullable(),
})

const evidenceItemSchema = z.object({ id: z.string(), text: z.string() })

export const jobDiscoveryRequestSchema = z
  .object({
    resume: z
      .object({ evidence: z.array(evidenceItemSchema).optional().default([]) })
      .optional(),
    // Reusing a previously returned candidateProfile skips regeneration
    // entirely (deterministic AND the optional AI call) — how changing only
    // preferences avoids a second AI call for the same resume.
    candidateProfile: candidateProfileSchema.optional(),
    preferences: jobDiscoveryPreferencesSchema,
  })
  .refine((data) => (data.resume?.evidence?.length || 0) > 0 || data.candidateProfile, {
    message: 'Provide resume evidence or a previously returned candidateProfile',
  })

export const discoveredJobSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceJobId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
  workType: WORK_TYPE_ENUM.nullable(),
  seniority: SENIORITY_ENUM.nullable(),
  postedAt: z.string().nullable(),
  salary: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    currency: z.string().nullable(),
  }),
  discoveryScore: z.number().min(0).max(100),
  components: z.object({
    skillOverlap: z.number().min(0).max(100),
    roleAlignment: z.number().min(0).max(100),
    seniorityAlignment: z.number().min(0).max(100),
    preferenceAlignment: z.number().min(0).max(100),
  }),
  highlights: z.object({
    matchedSkills: z.array(z.string()),
    gapSkills: z.array(z.string()),
  }),
})

export const jobDiscoveryResponseSchema = z.object({
  // 'live' = at least one provider call succeeded (even if 0 jobs matched).
  // 'demo' = live search intentionally disabled by config.
  // 'demo-fallback' = live was attempted but every provider call failed.
  mode: z.enum(['live', 'demo', 'demo-fallback']),
  candidateProfile: candidateProfileSchema,
  searchQueries: z.array(z.string()).max(3),
  totalRetrieved: z.number().int().min(0),
  totalDisplayed: z.number().int().min(0),
  sources: z.array(z.string()),
  results: z.array(discoveredJobSchema),
})

// What the OPTIONAL single AI call may refine on the deterministic profile —
// best-effort only; never required for discovery to work.
export const candidateProfileEnrichmentSchema = z.object({
  primaryRoleFamilies: z.array(z.string()).max(3).optional(),
  adjacentRoleFamilies: z.array(z.string()).max(3).optional(),
  seniority: SENIORITY_ENUM.optional(),
  skills: z.array(z.string()).max(25).optional(),
})
