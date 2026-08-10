import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { normalizeNullableOptionals } from '../src/services/ai/normalizeNullableOptionals.js'
import {
  skillMatchBatchOutputSchema,
  atsKeywordBatchOutputSchema,
  bulletRewriteBatchOutputSchema,
} from '../src/schemas/workerSchemas.js'

describe('normalizeNullableOptionals', () => {
  it('converts null to undefined for optional fields only', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    })

    const result = normalizeNullableOptionals({ required: 'x', optional: null }, schema)

    expect(result.required).toBe('x')
    expect('optional' in result).toBe(false)
  })

  it('leaves a null on a required field untouched (does not weaken required validation)', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    })

    const result = normalizeNullableOptionals({ required: null, optional: 'ok' }, schema)

    expect(result.required).toBeNull()
    expect(schema.safeParse(result).success).toBe(false)
  })

  it('does not change already-valid values (schema meaning unchanged)', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    })

    const valid = { required: 'x', optional: 'y' }
    const result = normalizeNullableOptionals(valid, schema)

    expect(result).toEqual(valid)
    expect(schema.safeParse(result).success).toBe(true)
  })

  it('normalizes gapType, evidenceId, and notes inside a skill-match batch response', () => {
    const raw = {
      items: [
        {
          skill: 'React',
          requirementType: 'mandatory',
          status: 'missing',
          evidenceId: null,
          confidence: 0.3,
          gapType: null,
          notes: null,
        },
      ],
    }

    const normalized = normalizeNullableOptionals(raw, skillMatchBatchOutputSchema)
    const parsed = skillMatchBatchOutputSchema.safeParse(normalized)

    expect(parsed.success).toBe(true)
    expect(parsed.data.items[0].evidenceId).toBeUndefined()
    expect(parsed.data.items[0].gapType).toBeUndefined()
    expect(parsed.data.items[0].notes).toBeUndefined()
  })

  it('normalizes gapType and evidenceId inside an ATS-keyword batch response', () => {
    const raw = {
      items: [
        { keyword: 'Docker', status: 'matched', evidenceId: 'ev-001', confidence: 0.9, gapType: null, notes: null },
      ],
    }

    const parsed = atsKeywordBatchOutputSchema.safeParse(normalizeNullableOptionals(raw, atsKeywordBatchOutputSchema))
    expect(parsed.success).toBe(true)
  })

  it('does NOT strip null evidenceId on bullet rewrites, where evidenceId is required', () => {
    const raw = {
      rewrites: [
        {
          originalText: 'Built dashboards.',
          rewrittenText: 'Built dashboards.',
          evidenceId: null,
          changedKeywords: [],
          riskStatus: 'low',
        },
      ],
    }

    const normalized = normalizeNullableOptionals(raw, bulletRewriteBatchOutputSchema)
    const parsed = bulletRewriteBatchOutputSchema.safeParse(normalized)

    // evidenceId is required on bulletRewriteItemSchema, so a null must still fail validation
    expect(normalized.rewrites[0].evidenceId).toBeNull()
    expect(parsed.success).toBe(false)
  })

  it('without normalization, a null optional field fails validation (proves the fix is needed)', () => {
    const raw = { items: [{ skill: 'React', requirementType: 'mandatory', status: 'missing', confidence: 0.3, gapType: null }] }
    expect(skillMatchBatchOutputSchema.safeParse(raw).success).toBe(false)
  })
})
