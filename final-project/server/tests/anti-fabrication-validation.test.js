import { describe, expect, it } from 'vitest'
import { validateEvidenceId, validateRewriteIntegrity } from '../src/services/antiFabricationValidation.js'

describe('anti-fabrication validation', () => {
  it('accepts a safe rewrite', () => {
    const result = validateRewriteIntegrity({
      originalText: 'Built responsive React interfaces for internal tools.',
      rewrittenText: 'Built responsive React interfaces for internal tools.',
      evidenceId: 'ev-001',
    }, [{ id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' }])

    expect(result.valid).toBe(true)
    expect(result.flags).toEqual([])
    expect(result.riskStatus).toBe('low')
  })

  it('flags invented metrics', () => {
    const result = validateRewriteIntegrity({
      originalText: 'Built responsive React interfaces for internal tools.',
      rewrittenText: 'Improved adoption by 40% across the platform.',
      evidenceId: 'ev-001',
    }, [{ id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' }])

    expect(result.valid).toBe(false)
    expect(result.flags).toContain('invented-metric')
    expect(result.riskStatus).toBe('high')
  })

  it('flags a new skill', () => {
    const result = validateRewriteIntegrity({
      originalText: 'Built responsive React interfaces for internal tools.',
      rewrittenText: 'Built responsive AWS infrastructure for internal tools.',
      evidenceId: 'ev-001',
    }, [{ id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' }])

    expect(result.valid).toBe(false)
    expect(result.flags).toContain('unsupported-skill-or-tool')
  })

  it('flags a changed date', () => {
    const result = validateRewriteIntegrity({
      originalText: 'Delivered the migration in 2023.',
      rewrittenText: 'Delivered the migration in 2024.',
      evidenceId: 'ev-001',
    }, [{ id: 'ev-001', text: 'Delivered the migration in 2023.' }])

    expect(result.valid).toBe(false)
    expect(result.flags).toContain('invented-date-or-year')
  })

  it('flags unsupported leadership claims', () => {
    const result = validateRewriteIntegrity({
      originalText: 'Built responsive React interfaces for internal tools.',
      rewrittenText: 'Led the migration and owned the delivery of the platform.',
      evidenceId: 'ev-001',
    }, [{ id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' }])

    expect(result.valid).toBe(false)
    expect(result.flags).toContain('unsupported-leadership-claim')
  })

  it('flags invalid evidence IDs', () => {
    const result = validateEvidenceId('ev-999', new Set(['ev-001']))

    expect(result.valid).toBe(false)
    expect(result.flags).toContain('invalid-evidence-id')
    expect(result.riskStatus).toBe('high')
  })
})
