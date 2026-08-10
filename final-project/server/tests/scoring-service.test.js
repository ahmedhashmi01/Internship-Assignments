import { describe, expect, it } from 'vitest'
import { scoreSingleJob, getRecommendationLabel } from '../src/services/scoringService.js'
import { reconcileSkillMatches } from '../src/services/skillReconciliation.js'

// Fully evidence-backed fixtures by default — evidenceId present avoids the
// "no requirement evidence returned" cap (39) unless a test is deliberately
// exercising it, keeping other assertions about the normalized formula clean.
const mandatory = (skill, status, confidence, evidenceId = 'ev-001') => ({ skill, requirementType: 'mandatory', status, confidence, evidenceId })
const preferred = (skill, status, confidence, evidenceId = 'ev-001') => ({ skill, requirementType: 'preferred', status, confidence, evidenceId })
const contextual = (skill, status, confidence, evidenceId = 'ev-001') => ({ skill, requirementType: 'contextual', status, confidence, evidenceId })
const keyword = (kw, status, confidence, evidenceId = 'ev-001') => ({ keyword: kw, status, confidence, evidenceId })

describe('normalized weighted scoring formula', () => {
  describe('component contributions never independently exceed their weight', () => {
    it('two fully-matched components (mandatory + ats) do not sum beyond 100', () => {
      const result = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.95), mandatory('TypeScript', 'matched', 0.95)],
        keywordMatches: [keyword('React', 'matched', 0.95), keyword('TypeScript', 'matched', 0.95), keyword('Docker', 'matched', 0.95), keyword('Jest', 'matched', 0.95)],
        workers: [],
      })

      expect(result.score).toBeLessThanOrEqual(100)
      // Every component contribution is individually bounded by its own
      // weight share, not independently rescaled to 0-100.
      expect(result.componentContributions.mandatory).toBeLessThanOrEqual(100)
      expect(result.componentContributions.ats).toBeLessThanOrEqual(100)
      expect(result.componentContributions.mandatory + result.componentContributions.ats).toBeLessThanOrEqual(100)
    })

    it('ATS keyword volume alone cannot produce 100 when mandatory coverage is weak', () => {
      const result = scoreSingleJob({
        skillMatches: [mandatory('React', 'missing', 0.2), mandatory('TypeScript', 'missing', 0.2)],
        keywordMatches: Array.from({ length: 10 }, (_, i) => keyword(`Keyword${i}`, 'matched', 0.95)),
        workers: [],
      })

      expect(result.score).toBeLessThan(100)
      expect(result.score).toBeLessThanOrEqual(84) // mandatory-missing cap
    })
  })

  describe('confidence is a bounded multiplier, never additive points', () => {
    it('scoreAfterConfidence (and therefore the final score) never exceeds baseScore', () => {
      const result = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 1), mandatory('TypeScript', 'matched', 1)],
        keywordMatches: [keyword('React', 'matched', 1)],
        workers: [],
      })

      // confidenceMultiplier caps at 1.0 (>=0.85 bucket) — it can only ever
      // scale baseScore down, never up.
      expect(result.score).toBeLessThanOrEqual(100)
      expect(result.componentContributions.mandatory + result.componentContributions.preferred + result.componentContributions.contextual + result.componentContributions.ats).toBeGreaterThanOrEqual(result.score)
    })

    it('low average confidence reduces the score via the multiplier, not an additive penalty', () => {
      const highConfidence = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.95)],
        keywordMatches: [keyword('React', 'matched', 0.95)],
        workers: [],
      })
      const lowConfidence = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.3)],
        keywordMatches: [keyword('React', 'matched', 0.3)],
        workers: [],
      })

      expect(lowConfidence.score).toBeLessThan(highConfidence.score)
    })
  })

  describe('requirement coverage and weighting', () => {
    it('a missing requirement costs more the higher its category weight (mandatory 55% > preferred 25% > contextual 10%)', () => {
      const withOneMissing = (missingType) => scoreSingleJob({
        skillMatches: [
          mandatory('M', missingType === 'mandatory' ? 'missing' : 'matched', 0.9),
          preferred('P', missingType === 'preferred' ? 'missing' : 'matched', 0.9),
          contextual('C', missingType === 'contextual' ? 'missing' : 'matched', 0.9),
        ],
        keywordMatches: [keyword('K', 'matched', 0.9)],
        workers: [],
      }).score

      const missingMandatory = withOneMissing('mandatory')
      const missingPreferred = withOneMissing('preferred')
      const missingContextual = withOneMissing('contextual')

      expect(missingMandatory).toBeLessThan(missingPreferred)
      expect(missingPreferred).toBeLessThan(missingContextual)
    })

    it('lower preferred coverage produces a lower score, all else equal', () => {
      const higherPreferred = scoreSingleJob({
        skillMatches: [
          mandatory('React', 'matched', 0.9),
          preferred('Node.js', 'matched', 0.9),
          preferred('Docker', 'matched', 0.9),
        ],
        keywordMatches: [keyword('React', 'matched', 0.9)],
        workers: [],
      })
      const lowerPreferred = scoreSingleJob({
        skillMatches: [
          mandatory('React', 'matched', 0.9),
          preferred('Node.js', 'missing', 0.2),
          preferred('Docker', 'missing', 0.2),
        ],
        keywordMatches: [keyword('React', 'matched', 0.9)],
        workers: [],
      })

      expect(lowerPreferred.preferredCoverage).toBeLessThan(higherPreferred.preferredCoverage)
      expect(lowerPreferred.score).toBeLessThan(higherPreferred.score)
    })

    it('renormalizes weights to still sum to 100 when a requirement category is empty (no contextual requirements)', () => {
      const result = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.9), preferred('Node.js', 'matched', 0.9)],
        keywordMatches: [keyword('React', 'matched', 0.9)],
        workers: [],
      })

      // mandatory(55) + preferred(25) + ats(10) renormalized over 90 -> sums to 100
      expect(result.contextualCoverage).toBe(0)
      // Full coverage on every active (non-zero) category should reach 100
      // exactly once confidence/workerHealth are also perfect.
      expect(result.score).toBe(100)
    })

    it('renormalizes correctly when only mandatory requirements exist (preferred, contextual, and ats all empty)', () => {
      const result = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.95, 'ev-001')],
        keywordMatches: [],
        workers: [],
      })

      // Only the mandatory weight is active -> renormalized to 100% alone.
      expect(result.score).toBe(100)
    })
  })

  describe('eligibility caps', () => {
    it('one missing mandatory requirement (among mostly-matched ones) caps the score at 84', () => {
      // 9 matched + 1 missing mandatory, high confidence, no other category —
      // coverage alone would put this around 90, so the cap is the binding
      // constraint, not just naturally-low coverage.
      const result = scoreSingleJob({
        skillMatches: [
          ...Array.from({ length: 9 }, (_, i) => mandatory(`Skill ${i}`, 'matched', 0.95)),
          mandatory('Missing Skill', 'missing', 0.2),
        ],
        keywordMatches: [],
        workers: [],
      })

      expect(result.score).toBe(84)
      expect(result.capApplied).toBe(true)
      expect(result.capReason).toBe('mandatory-requirement-missing')
    })

    it('mandatory coverage below 50% caps the score at 59, even when other categories are strong', () => {
      const result = scoreSingleJob({
        skillMatches: [
          mandatory('A', 'missing', 0.9),
          mandatory('B', 'missing', 0.9),
          mandatory('C', 'matched', 0.95),
          preferred('D', 'matched', 0.95),
          preferred('E', 'matched', 0.95),
        ],
        keywordMatches: [keyword('K1', 'matched', 0.95), keyword('K2', 'matched', 0.95)],
        workers: [],
      })

      expect(result.mandatoryCoverage).toBeLessThan(0.5)
      expect(result.score).toBe(59)
      expect(result.capReason).toBe('mandatory-coverage-below-50-percent')
    })

    it('a failed skillMatch worker caps the score at 49, even with otherwise-perfect coverage', () => {
      const result = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.95), mandatory('TypeScript', 'matched', 0.95)],
        keywordMatches: [keyword('React', 'matched', 0.95)],
        workers: [{ name: 'skillMatch', status: 'failed' }],
      })

      expect(result.skillMatchFailed).toBe(true)
      expect(result.score).toBe(49)
      expect(result.capReason).toBe('skill-match-worker-failed')
    })

    it('no requirement evidence returned at all caps the score at 39', () => {
      const result = scoreSingleJob({
        skillMatches: [{ skill: 'React', requirementType: 'mandatory', status: 'matched', confidence: 0.9 }], // no evidenceId
        keywordMatches: [],
        workers: [],
      })

      expect(result.score).toBeLessThanOrEqual(39)
      expect(result.capReason).toBe('no-requirement-evidence-returned')
    })

    it('guarantees a score no higher than 69 when every non-missing item is uncertain or partial (never fully matched)', () => {
      // This is a guaranteed ceiling, not necessarily the binding constraint:
      // coverage math already caps an all-partial/uncertain result well
      // under 69 on its own (partial=0.5 is the best per-item score possible
      // without any 'matched' status), so the guarantee holds with room to
      // spare — confirming the cap never needs to override a higher score.
      const result = scoreSingleJob({
        skillMatches: [mandatory('React', 'partial', 0.6), mandatory('TypeScript', 'uncertain', 0.4)],
        keywordMatches: [],
        workers: [],
      })

      expect(result.score).toBeLessThanOrEqual(69)
    })

    it('the most restrictive of several simultaneously-triggered caps wins', () => {
      // Both "skillMatch failed" (49) and "not eligible for 100" (99.9)
      // trigger here despite otherwise-perfect coverage — 49 must win.
      const result = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.95), mandatory('TypeScript', 'matched', 0.95)],
        keywordMatches: [keyword('React', 'matched', 0.95)],
        workers: [{ name: 'skillMatch', status: 'failed' }],
      })

      expect(result.capReason).toBe('skill-match-worker-failed')
      expect(result.score).toBe(49)
    })
  })

  describe('100-score eligibility', () => {
    const perfectInputs = {
      skillMatches: [
        mandatory('React', 'matched', 0.95),
        mandatory('TypeScript', 'matched', 0.95),
        preferred('Node.js', 'matched', 0.9),
      ],
      keywordMatches: [keyword('React', 'matched', 0.95), keyword('TypeScript', 'matched', 0.95)],
      workers: [],
    }

    it('reaches exactly 100 when every eligibility condition is met', () => {
      const result = scoreSingleJob(perfectInputs)
      expect(result.score).toBe(100)
      expect(result.capApplied).toBe(false)
    })

    it('does not reach 100 when preferred coverage is below 0.80', () => {
      const result = scoreSingleJob({
        ...perfectInputs,
        skillMatches: [
          mandatory('React', 'matched', 0.95),
          mandatory('TypeScript', 'matched', 0.95),
          preferred('Node.js', 'missing', 0.2),
        ],
      })

      expect(result.score).toBeLessThan(100)
    })

    it('does not reach 100 when ATS coverage is below 0.80', () => {
      const result = scoreSingleJob({
        ...perfectInputs,
        keywordMatches: [keyword('React', 'matched', 0.95), keyword('TypeScript', 'missing', 0.2)],
      })

      expect(result.score).toBeLessThan(100)
    })

    it('does not reach 100 when an invalid-evidence-id integrity issue is present, even with perfect coverage', () => {
      const result = scoreSingleJob({
        ...perfectInputs,
        workers: [{ name: 'skillMatch', status: 'failed', errorType: 'invalid-evidence-id' }],
      })

      expect(result.score).toBeLessThan(100)
    })
  })

  describe('bounds and determinism', () => {
    it('never returns a negative or out-of-range score across many mandatory gaps', () => {
      const result = scoreSingleJob({
        skillMatches: Array.from({ length: 8 }, (_, index) => mandatory(`Skill ${index}`, 'missing', 0.1)),
        keywordMatches: [],
        workers: [],
      })

      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(100)
    })

    it('rounds the final score to at most one decimal place', () => {
      const result = scoreSingleJob({
        skillMatches: [mandatory('SAP CO', 'partial', 0.33)],
        keywordMatches: [keyword('Controlling', 'partial', 0.21)],
        workers: [],
      })

      expect(result.score.toString()).toMatch(/^\d+(\.\d)?$/)
    })

    it('remains deterministic across repeated calls with the same multi-item input', () => {
      const input = {
        skillMatches: [
          mandatory('React', 'matched', 0.9),
          mandatory('TypeScript', 'missing', 0.2),
          preferred('GraphQL', 'partial', 0.6),
          contextual('Figma', 'uncertain', 0.4),
        ],
        keywordMatches: [keyword('React', 'matched', 0.9), keyword('Docker', 'missing', 0.1)],
        workers: [],
      }

      const first = scoreSingleJob(input)
      const second = scoreSingleJob(input)

      expect(second.score).toBe(first.score)
      expect(second.componentContributions).toEqual(first.componentContributions)
    })

    it('supports the legacy isMandatory flag as a requirementType fallback, and it still triggers the mandatory-missing cap', () => {
      const result = scoreSingleJob({
        skillMatches: [
          ...Array.from({ length: 9 }, (_, i) => ({ skill: `Skill ${i}`, isMandatory: true, status: 'matched', confidence: 0.95, evidenceId: 'ev-001' })),
          { skill: 'Missing Skill', isMandatory: true, status: 'missing', confidence: 0.2, evidenceId: 'ev-001' },
        ],
        keywordMatches: [],
        workers: [],
      })

      expect(result.score).toBe(84)
      expect(result.capReason).toBe('mandatory-requirement-missing')
    })
  })

  describe('worker health', () => {
    it('a failed non-skillMatch worker still reduces the score via the multiplier', () => {
      const healthy = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.9)],
        keywordMatches: [],
        workers: [],
      })
      const degraded = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.9)],
        keywordMatches: [],
        workers: [{ name: 'bulletRewrite', status: 'failed' }],
      })

      expect(degraded.workerHealth).toBeLessThan(healthy.workerHealth)
      expect(degraded.score).toBeLessThan(healthy.score)
    })

    it('skillMatch failing degrades workerHealth more than an equivalent generic worker failure', () => {
      const genericFailure = scoreSingleJob({
        skillMatches: [],
        keywordMatches: [keyword('React', 'matched', 0.9)],
        workers: [{ name: 'atsKeyword', status: 'failed' }],
      })
      const skillMatchFailure = scoreSingleJob({
        skillMatches: [],
        keywordMatches: [keyword('React', 'matched', 0.9)],
        workers: [{ name: 'skillMatch', status: 'failed' }],
      })

      expect(skillMatchFailure.workerHealth).toBeLessThan(genericFailure.workerHealth)
    })
  })

  describe('reconciliation interaction', () => {
    it('a duplicate contradictory "missing" entry for an already-matched mandatory skill no longer tanks the score once reconciled', () => {
      const rawDuplicated = [
        mandatory('SAP CO', 'matched', 0.9),
        { skill: 'sap co', requirementType: 'mandatory', status: 'missing', confidence: 0.2 },
      ]

      const scoredRaw = scoreSingleJob({ skillMatches: rawDuplicated, keywordMatches: [], workers: [] })
      const scoredReconciled = scoreSingleJob({ skillMatches: reconcileSkillMatches(rawDuplicated), keywordMatches: [], workers: [] })

      expect(scoredReconciled.score).toBeGreaterThan(scoredRaw.score)
    })
  })

  describe('different roles with different evidence receive different scores', () => {
    it('a frontend role and a backend role scored against different evidence profiles do not converge on the same score', () => {
      const frontendResult = scoreSingleJob({
        skillMatches: [mandatory('React', 'matched', 0.9), mandatory('TypeScript', 'matched', 0.9), preferred('Node.js', 'missing', 0.2)],
        keywordMatches: [keyword('React', 'matched', 0.9), keyword('TypeScript', 'matched', 0.9)],
        workers: [],
      })
      const backendResult = scoreSingleJob({
        skillMatches: [mandatory('Node.js', 'matched', 0.9), mandatory('PostgreSQL', 'missing', 0.2)],
        keywordMatches: [keyword('Node.js', 'matched', 0.9)],
        workers: [],
      })

      expect(frontendResult.score).not.toBe(backendResult.score)
    })
  })
})

describe('getRecommendationLabel', () => {
  it('maps score ranges to the correct label per the new thresholds', () => {
    expect(getRecommendationLabel(100)).toBe('strong fit')
    expect(getRecommendationLabel(85)).toBe('strong fit')
    expect(getRecommendationLabel(84.9)).toBe('good fit')
    expect(getRecommendationLabel(70)).toBe('good fit')
    expect(getRecommendationLabel(69.9)).toBe('moderate fit')
    expect(getRecommendationLabel(50)).toBe('moderate fit')
    expect(getRecommendationLabel(49.9)).toBe('low fit')
    expect(getRecommendationLabel(0)).toBe('low fit')
  })
})
