import { describe, expect, it } from 'vitest'
import { repairSkillMatchConfidence, isValidSkillMatchConfidence } from '../src/services/ai/repairSkillMatchConfidence.js'

describe('repairSkillMatchConfidence', () => {
  it('fills in the deterministic fallback confidence when the field is missing', () => {
    const result = repairSkillMatchConfidence({
      items: [
        { skill: 'React', requirementType: 'mandatory', status: 'matched' },
        { skill: 'SQL', requirementType: 'preferred', status: 'partial' },
        { skill: 'Go', requirementType: 'preferred', status: 'uncertain' },
        { skill: 'Rust', requirementType: 'preferred', status: 'missing' },
      ],
    })

    expect(result.items[0].confidence).toBe(0.9)
    expect(result.items[1].confidence).toBe(0.6)
    expect(result.items[2].confidence).toBe(0.35)
    expect(result.items[3].confidence).toBe(0)
  })

  it('preserves valid model-provided confidence untouched, even if it differs from the status fallback', () => {
    const result = repairSkillMatchConfidence({
      items: [
        { skill: 'React', requirementType: 'mandatory', status: 'matched', confidence: 0.42 },
        { skill: 'SQL', requirementType: 'preferred', status: 'missing', confidence: 0 },
        { skill: 'Go', requirementType: 'preferred', status: 'matched', confidence: 1 },
      ],
    })

    expect(result.items[0].confidence).toBe(0.42)
    expect(result.items[1].confidence).toBe(0)
    expect(result.items[2].confidence).toBe(1)
  })

  it('does not repair a present-but-invalid confidence — leaves it for normal validation to reject', () => {
    const result = repairSkillMatchConfidence({
      items: [
        { skill: 'React', requirementType: 'mandatory', status: 'matched', confidence: 5 },
        { skill: 'SQL', requirementType: 'preferred', status: 'matched', confidence: 'high' },
        { skill: 'Go', requirementType: 'preferred', status: 'matched', confidence: null },
        { skill: 'Rust', requirementType: 'preferred', status: 'matched', confidence: -0.1 },
      ],
    })

    expect(result.items[0].confidence).toBe(5)
    expect(result.items[1].confidence).toBe('high')
    expect(result.items[2].confidence).toBeNull()
    expect(result.items[3].confidence).toBe(-0.1)
  })

  it('leaves an item with an unrecognized status untouched (no fallback mapping available)', () => {
    const result = repairSkillMatchConfidence({
      items: [{ skill: 'React', requirementType: 'mandatory', status: 'done' }],
    })

    expect(result.items[0].confidence).toBeUndefined()
  })

  it('is a no-op for non-skill-match shaped input', () => {
    expect(repairSkillMatchConfidence(null)).toBeNull()
    expect(repairSkillMatchConfidence({ rewrites: [] })).toEqual({ rewrites: [] })
  })
})

describe('isValidSkillMatchConfidence', () => {
  it('accepts numbers within 0-1 inclusive', () => {
    expect(isValidSkillMatchConfidence(0)).toBe(true)
    expect(isValidSkillMatchConfidence(1)).toBe(true)
    expect(isValidSkillMatchConfidence(0.5)).toBe(true)
  })

  it('rejects out-of-range numbers, wrong types, and null', () => {
    expect(isValidSkillMatchConfidence(1.1)).toBe(false)
    expect(isValidSkillMatchConfidence(-0.01)).toBe(false)
    expect(isValidSkillMatchConfidence('0.5')).toBe(false)
    expect(isValidSkillMatchConfidence(null)).toBe(false)
    expect(isValidSkillMatchConfidence(undefined)).toBe(false)
  })
})
