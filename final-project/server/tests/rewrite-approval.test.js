import { describe, expect, it } from 'vitest'
import { computeNeedsReview } from '../src/services/rewriteApproval.js'
import { validateRewriteIntegrity } from '../src/services/antiFabricationValidation.js'

describe('computeNeedsReview', () => {
  it('blocks default approval when invented-metric is present', () => {
    expect(computeNeedsReview(['invented-metric'])).toBe(true)
  })

  it('blocks default approval when unsupported-skill-or-tool is present', () => {
    expect(computeNeedsReview(['unsupported-skill-or-tool'])).toBe(true)
  })

  it('does not block approval for other risk flags', () => {
    expect(computeNeedsReview(['invalid-evidence-id'])).toBe(false)
    expect(computeNeedsReview(['unsupported-leadership-claim'])).toBe(false)
    expect(computeNeedsReview(['invented-date-or-year'])).toBe(false)
    expect(computeNeedsReview(['invented-currency'])).toBe(false)
  })

  it('does not block approval when there are no flags', () => {
    expect(computeNeedsReview([])).toBe(false)
    expect(computeNeedsReview()).toBe(false)
  })

  it('blocks approval when a high-risk flag appears alongside other flags', () => {
    expect(computeNeedsReview(['unsupported-leadership-claim', 'invented-metric'])).toBe(true)
  })

  it('matches the flags actually produced by validateRewriteIntegrity for a fabricated metric', () => {
    const result = validateRewriteIntegrity({
      originalText: 'Built responsive React interfaces for internal tools.',
      rewrittenText: 'Improved adoption by 40% across the platform.',
      evidenceId: 'ev-001',
    }, [{ id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' }])

    expect(computeNeedsReview(result.flags)).toBe(true)
  })

  it('matches the flags actually produced by validateRewriteIntegrity for an unsupported skill', () => {
    const result = validateRewriteIntegrity({
      originalText: 'Built responsive React interfaces for internal tools.',
      rewrittenText: 'Built responsive AWS infrastructure for internal tools.',
      evidenceId: 'ev-001',
    }, [{ id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' }])

    expect(computeNeedsReview(result.flags)).toBe(true)
  })

  it('does not block a safe, evidence-grounded rewrite', () => {
    const result = validateRewriteIntegrity({
      originalText: 'Built responsive React interfaces for internal tools.',
      rewrittenText: 'Built responsive React interfaces for internal tools.',
      evidenceId: 'ev-001',
    }, [{ id: 'ev-001', text: 'Built responsive React interfaces for internal tools.' }])

    expect(computeNeedsReview(result.flags)).toBe(false)
  })
})
