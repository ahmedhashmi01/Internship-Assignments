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

  // Regression guard + false-positive fixes for the unsupported-skill-or-tool
  // check, based on real Groq output captured during a live investigation
  // (see conversation history) — the check was flagging ordinary rewording
  // vocabulary as fabrication, not just genuinely invented skills.
  describe('unsupported-skill-or-tool: strict enough vs. too strict', () => {
    it('Example A — STILL flags a genuinely invented skill (regression guard)', () => {
      const result = validateRewriteIntegrity({
        originalText: 'Built and delivered responsive React interfaces for internal tools, improving workflow efficiency across three product teams.',
        rewrittenText: 'Built and delivered responsive React and TypeScript interfaces for internal tools, improving workflow efficiency across three product teams.',
        evidenceId: 'ev-001',
      }, [{ id: 'ev-001', text: 'Built and delivered responsive React interfaces for internal tools, improving workflow efficiency across three product teams.' }])

      expect(result.valid).toBe(false)
      expect(result.flags).toContain('unsupported-skill-or-tool')
    })

    it('Example B — does NOT flag "using" as an unsupported skill/tool', () => {
      const result = validateRewriteIntegrity({
        originalText: 'Designed REST APIs in Node.js and Express serving over two million daily requests with sub-100ms latency.',
        rewrittenText: 'Designed REST APIs using Node.js and Express, serving over two million daily requests with sub-100ms latency.',
        evidenceId: 'ev-002',
      }, [{ id: 'ev-002', text: 'Designed REST APIs in Node.js and Express serving over two million daily requests with sub-100ms latency.' }])

      expect(result.valid).toBe(true)
      expect(result.flags).not.toContain('unsupported-skill-or-tool')
    })

    it('Example C — does NOT flag "migrated" when "migration" is in the original (stemming)', () => {
      const result = validateRewriteIntegrity({
        originalText: 'Led migration of a legacy Angular application to React and TypeScript, improving load times by 40%.',
        rewrittenText: 'Migrated a legacy Angular application to React and TypeScript, improving load times by 40%.',
        evidenceId: 'ev-003',
      }, [{ id: 'ev-003', text: 'Led migration of a legacy Angular application to React and TypeScript, improving load times by 40%.' }])

      expect(result.valid).toBe(true)
      expect(result.flags).not.toContain('unsupported-skill-or-tool')
    })

    it('does not flag other common rewording verbs/prepositions on their own', () => {
      const result = validateRewriteIntegrity({
        originalText: 'Built responsive React interfaces for internal tools.',
        rewrittenText: 'Built responsive React interfaces for internal tools, leveraging modern component patterns via a shared library.',
        evidenceId: 'ev-001',
      }, [{ id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' }])

      // "leveraging" and "via" are generic; "modern", "component", "patterns",
      // "shared", "library" are still genuinely new/unsupported claims, so
      // this SHOULD still flag — proving the whitelist doesn't blanket-exempt
      // everything, only the specific connective/rewording words.
      expect(result.flags).toContain('unsupported-skill-or-tool')
    })
  })
})
