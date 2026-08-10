import { describe, expect, it } from 'vitest'
import { reconcileSkillMatches } from '../src/services/skillReconciliation.js'

describe('reconcileSkillMatches', () => {
  it('deduplicates case-insensitively', () => {
    const items = [
      { skill: 'SAP CO', requirementType: 'mandatory', status: 'matched', confidence: 0.9, evidenceId: 'ev-001' },
      { skill: 'sap co', requirementType: 'mandatory', status: 'matched', confidence: 0.9, evidenceId: 'ev-001' },
      { skill: '  Sap Co  ', requirementType: 'mandatory', status: 'matched', confidence: 0.9, evidenceId: 'ev-001' },
    ]

    const reconciled = reconcileSkillMatches(items)
    expect(reconciled).toHaveLength(1)
  })

  it('lets matched override missing/partial/uncertain for the same requirement', () => {
    const items = [
      { skill: 'SAP CO', requirementType: 'mandatory', status: 'missing', confidence: 0.2 },
      { skill: 'SAP CO', requirementType: 'mandatory', status: 'matched', confidence: 0.9, evidenceId: 'ev-001' },
    ]

    const reconciled = reconcileSkillMatches(items)
    expect(reconciled).toHaveLength(1)
    expect(reconciled[0].status).toBe('matched')
    expect(reconciled[0].evidenceId).toBe('ev-001')
  })

  it('never leaves the same skill both matched and missing after reconciliation', () => {
    const items = [
      { skill: 'SAP CO', requirementType: 'mandatory', status: 'matched', confidence: 0.9, evidenceId: 'ev-001' },
      { skill: 'sap co', requirementType: 'mandatory', status: 'missing', confidence: 0.2 },
      { skill: 'React', requirementType: 'preferred', status: 'missing', confidence: 0.1 },
    ]

    const reconciled = reconcileSkillMatches(items)
    const matchedKeys = new Set(reconciled.filter((item) => item.status === 'matched').map((item) => item.skill.toLowerCase()))
    const missingKeys = new Set(reconciled.filter((item) => item.status === 'missing').map((item) => item.skill.toLowerCase()))
    const overlap = [...matchedKeys].filter((key) => missingKeys.has(key))

    expect(overlap).toHaveLength(0)
    expect(reconciled).toHaveLength(2)
  })

  it('keeps partial over uncertain and missing, but not over matched', () => {
    const items = [
      { skill: 'Docker', requirementType: 'preferred', status: 'uncertain', confidence: 0.4 },
      { skill: 'Docker', requirementType: 'preferred', status: 'partial', confidence: 0.6 },
    ]

    expect(reconcileSkillMatches(items)[0].status).toBe('partial')
  })

  it('preserves distinct requirements untouched', () => {
    const items = [
      { skill: 'SAP CO', requirementType: 'mandatory', status: 'matched', confidence: 0.9 },
      { skill: 'SAP FI', requirementType: 'preferred', status: 'missing', confidence: 0.2 },
    ]

    const reconciled = reconcileSkillMatches(items)
    expect(reconciled).toHaveLength(2)
    expect(reconciled.map((item) => item.skill)).toEqual(['SAP CO', 'SAP FI'])
  })

  it('returns an empty array for empty input', () => {
    expect(reconcileSkillMatches([])).toEqual([])
  })
})
