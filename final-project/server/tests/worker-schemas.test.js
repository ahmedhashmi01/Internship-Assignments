import { describe, expect, it } from 'vitest'
import {
  supervisorPlanSchema,
  skillMatchOutputSchema,
  atsKeywordOutputSchema,
  bulletRewriteOutputSchema,
  finalPerJobReportSchema,
} from '../src/schemas/workerSchemas.js'

describe('worker output schemas', () => {
  it('accepts valid supervisor output', () => {
    const result = supervisorPlanSchema.safeParse({
      plan: ['Review evidence', 'Assess keywords'],
      rationale: 'Use only evidence-backed statements.',
    })

    expect(result.success).toBe(true)
  })

  it('accepts valid skill and keyword matches with evidence IDs', () => {
    const skill = skillMatchOutputSchema.safeParse({
      skill: 'React',
      status: 'matched',
      evidenceId: 'ev-001',
      confidence: 0.92,
      gapType: 'wording',
      notes: 'Supported by evidence.',
    })

    const keyword = atsKeywordOutputSchema.safeParse({
      keyword: 'React',
      status: 'partial',
      evidenceId: 'ev-001',
      confidence: 0.75,
      gapType: 'evidence',
      notes: 'Needs stronger evidence.',
    })

    expect(skill.success).toBe(true)
    expect(keyword.success).toBe(true)
  })

  it('accepts a valid bullet rewrite', () => {
    const result = bulletRewriteOutputSchema.safeParse({
      originalText: 'Built interfaces',
      rewrittenText: 'Developed user interfaces',
      evidenceId: 'ev-001',
      changedKeywords: ['interfaces', 'developed'],
      riskStatus: 'low',
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid evidence IDs and invalid statuses', () => {
    const invalidSkill = skillMatchOutputSchema.safeParse({
      skill: 'React',
      status: 'done',
      evidenceId: 'bad-id',
      confidence: 1.2,
    })

    const invalidReport = finalPerJobReportSchema.safeParse({
      jobTitle: '',
      summary: '',
      matchedSkills: [],
      missingSkills: [],
      keywordMatches: [],
      rewrites: [],
      overallStatus: 'done',
    })

    expect(invalidSkill.success).toBe(false)
    expect(invalidReport.success).toBe(false)
  })
})
