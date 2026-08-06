import { describe, expect, it } from 'vitest'
import { scoreSingleJob } from '../src/services/scoringService.js'
import { reconcileSkillMatches } from '../src/services/skillReconciliation.js'

describe('deterministic scoring service', () => {
  it('scores a full match', () => {
    const result = scoreSingleJob({
      skillMatches: [
        { skill: 'React', status: 'matched', isMandatory: true, confidence: 0.95 },
      ],
      keywordMatches: [
        { keyword: 'React', status: 'matched', confidence: 0.95 },
      ],
      workers: [],
    })

    expect(result.score).toBeGreaterThan(70)
  })

  it('scores a partial match lower', () => {
    const result = scoreSingleJob({
      skillMatches: [
        { skill: 'React', status: 'partial', isMandatory: true, confidence: 0.6 },
      ],
      keywordMatches: [
        { keyword: 'React', status: 'partial', confidence: 0.6 },
      ],
      workers: [],
    })

    expect(result.score).toBeLessThan(80)
  })

  it('applies mandatory missing penalties', () => {
    const result = scoreSingleJob({
      skillMatches: [
        { skill: 'React', status: 'missing', isMandatory: true, confidence: 0.2 },
      ],
      keywordMatches: [],
      workers: [],
    })

    expect(result.score).toBeLessThan(20)
  })

  it('reduces score for uncertain evidence', () => {
    const result = scoreSingleJob({
      skillMatches: [
        { skill: 'React', status: 'uncertain', isMandatory: true, confidence: 0.4 },
      ],
      keywordMatches: [],
      workers: [],
    })

    expect(result.score).toBeLessThan(40)
  })

  it('reduces score for failed workers', () => {
    const result = scoreSingleJob({
      skillMatches: [
        { skill: 'React', status: 'matched', isMandatory: true, confidence: 0.9 },
      ],
      keywordMatches: [],
      workers: [{ name: 'skillMatch', status: 'failed' }],
    })

    expect(result.score).toBeLessThan(100)
    expect(result.workerHealth).toBeLessThan(1)
  })

  it('applies an extra confidence penalty when skillMatch fails, beyond a generic worker failure', () => {
    const genericFailure = scoreSingleJob({
      skillMatches: [],
      keywordMatches: [{ keyword: 'React', status: 'matched', confidence: 0.9 }],
      workers: [{ name: 'atsKeyword', status: 'failed' }],
    })

    const skillMatchFailure = scoreSingleJob({
      skillMatches: [],
      keywordMatches: [{ keyword: 'React', status: 'matched', confidence: 0.9 }],
      workers: [{ name: 'skillMatch', status: 'failed' }],
    })

    // Same single-worker failure count, but skillMatch failing degrades
    // workerHealth (and therefore confidence in the result) more than an
    // equivalent failure of a different worker.
    expect(skillMatchFailure.workerHealth).toBeLessThan(genericFailure.workerHealth)
    expect(skillMatchFailure.score).toBeLessThan(genericFailure.score)
  })

  it('identifies in the score output that confidence was reduced because skillMatch failed', () => {
    const failed = scoreSingleJob({
      skillMatches: [],
      keywordMatches: [{ keyword: 'React', status: 'matched', confidence: 0.9 }],
      workers: [{ name: 'skillMatch', status: 'failed' }],
    })
    const succeeded = scoreSingleJob({
      skillMatches: [{ skill: 'React', requirementType: 'mandatory', status: 'matched', confidence: 0.9 }],
      keywordMatches: [],
      workers: [{ name: 'skillMatch', status: 'succeeded' }],
    })

    expect(failed.skillMatchFailed).toBe(true)
    expect(succeeded.skillMatchFailed).toBe(false)
  })

  it('does not apply the skillMatch failure penalty when skillMatch succeeds', () => {
    const result = scoreSingleJob({
      skillMatches: [{ skill: 'React', requirementType: 'mandatory', status: 'matched', confidence: 0.9 }],
      keywordMatches: [],
      workers: [{ name: 'skillMatch', status: 'succeeded' }, { name: 'bulletRewrite', status: 'failed' }],
    })

    // Only the generic failedWorkerPenalty (0.1) applies here, not the
    // additional skillMatch-specific penalty (0.15).
    expect(result.workerHealth).toBeCloseTo(0.9, 5)
  })

  it('caps scores to bounds', () => {
    const result = scoreSingleJob({
      skillMatches: [
        { skill: 'React', status: 'matched', isMandatory: true, confidence: 1 },
      ],
      keywordMatches: [
        { keyword: 'React', status: 'matched', confidence: 1 },
      ],
      workers: [],
    })

    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('never returns a negative score even with many mandatory gaps', () => {
    const result = scoreSingleJob({
      skillMatches: Array.from({ length: 8 }, (_, index) => ({
        skill: `Skill ${index}`,
        requirementType: 'mandatory',
        status: 'missing',
        confidence: 0.1,
      })),
      keywordMatches: [],
      workers: [],
    })

    expect(result.score).toBe(0)
  })

  describe('mandatory-gap penalty uses requirementType (regression)', () => {
    it('applies the mandatory-gap penalty when requirementType is "mandatory" and status is "missing"', () => {
      const mandatoryMissing = scoreSingleJob({
        skillMatches: [{ skill: 'React', requirementType: 'mandatory', status: 'missing', confidence: 0.2 }],
        keywordMatches: [],
        workers: [],
      })

      const preferredMissing = scoreSingleJob({
        skillMatches: [{ skill: 'React', requirementType: 'preferred', status: 'missing', confidence: 0.2 }],
        keywordMatches: [],
        workers: [],
      })

      // Mandatory-missing incurs the extra 20pt gap penalty on top of the
      // zero status score; preferred/contextual misses do not.
      expect(mandatoryMissing.score).toBeLessThan(preferredMissing.score)
      expect(mandatoryMissing.score).toBe(0)
    })

    it('does not apply the mandatory-gap penalty to preferred items', () => {
      const result = scoreSingleJob({
        skillMatches: [{ skill: 'Docker', requirementType: 'preferred', status: 'missing', confidence: 0.2 }],
        keywordMatches: [],
        workers: [],
      })

      expect(result.score).toBeGreaterThan(0)
    })

    it('does not apply the mandatory-gap penalty to contextual items', () => {
      const result = scoreSingleJob({
        skillMatches: [{ skill: 'Figma', requirementType: 'contextual', status: 'missing', confidence: 0.2 }],
        keywordMatches: [],
        workers: [],
      })

      expect(result.score).toBeGreaterThan(0)
    })

    it('weights mandatory > preferred > contextual for matched items', () => {
      const scoreFor = (requirementType) => scoreSingleJob({
        skillMatches: [{ skill: 'React', requirementType, status: 'matched', confidence: 0.9 }],
        keywordMatches: [],
        workers: [],
      }).categoryScores.skills

      expect(scoreFor('mandatory')).toBeGreaterThan(scoreFor('preferred'))
      expect(scoreFor('preferred')).toBeGreaterThan(scoreFor('contextual'))
    })

    it('still applies partial and uncertain penalties alongside requirementType-based scoring', () => {
      const partial = scoreSingleJob({
        skillMatches: [{ skill: 'React', requirementType: 'mandatory', status: 'partial', confidence: 0.6 }],
        keywordMatches: [],
        workers: [],
      })
      const uncertain = scoreSingleJob({
        skillMatches: [{ skill: 'React', requirementType: 'mandatory', status: 'uncertain', confidence: 0.4 }],
        keywordMatches: [],
        workers: [],
      })
      const matched = scoreSingleJob({
        skillMatches: [{ skill: 'React', requirementType: 'mandatory', status: 'matched', confidence: 0.9 }],
        keywordMatches: [],
        workers: [],
      })

      expect(partial.score).toBeLessThan(matched.score)
      expect(uncertain.score).toBeLessThan(partial.score)
    })

    it('remains deterministic across repeated calls with multi-item arrays', () => {
      const input = {
        skillMatches: [
          { skill: 'React', requirementType: 'mandatory', status: 'matched', confidence: 0.9 },
          { skill: 'TypeScript', requirementType: 'mandatory', status: 'missing', confidence: 0.2 },
          { skill: 'GraphQL', requirementType: 'preferred', status: 'partial', confidence: 0.6 },
          { skill: 'Figma', requirementType: 'contextual', status: 'uncertain', confidence: 0.4 },
        ],
        keywordMatches: [
          { keyword: 'React', status: 'matched', confidence: 0.9 },
          { keyword: 'Docker', status: 'missing', confidence: 0.1 },
        ],
        workers: [],
      }

      const first = scoreSingleJob(input)
      const second = scoreSingleJob(input)

      expect(second.score).toBe(first.score)
      expect(second.categoryScores).toEqual(first.categoryScores)
    })

    it('supports the legacy isMandatory flag as a fallback', () => {
      const result = scoreSingleJob({
        skillMatches: [{ skill: 'React', isMandatory: true, status: 'missing', confidence: 0.2 }],
        keywordMatches: [],
        workers: [],
      })

      expect(result.score).toBe(0)
    })
  })

  describe('result-consistency regressions', () => {
    it('rounds the final score to at most one decimal place', () => {
      const result = scoreSingleJob({
        skillMatches: [{ skill: 'SAP CO', requirementType: 'mandatory', status: 'partial', confidence: 0.33 }],
        keywordMatches: [{ keyword: 'Controlling', status: 'partial', confidence: 0.21 }],
        workers: [],
      })

      // A string with at most one digit after the decimal point rules out
      // IEEE754 artifacts like 7.075000000000003.
      expect(result.score.toString()).toMatch(/^\d+(\.\d)?$/)
    })

    it('scores a strongly matching SAP CO sample higher than a clearly unrelated sample', () => {
      const strongMatch = scoreSingleJob({
        skillMatches: [
          { skill: 'SAP CO', requirementType: 'mandatory', status: 'matched', confidence: 0.9, evidenceId: 'ev-001' },
          { skill: 'SAP FI', requirementType: 'preferred', status: 'matched', confidence: 0.85, evidenceId: 'ev-001' },
        ],
        keywordMatches: [
          { keyword: 'Controlling', status: 'matched', confidence: 0.9, evidenceId: 'ev-001' },
        ],
        workers: [],
      })

      const unrelated = scoreSingleJob({
        skillMatches: [
          { skill: 'SAP CO', requirementType: 'mandatory', status: 'missing', confidence: 0.1 },
          { skill: 'SAP FI', requirementType: 'preferred', status: 'missing', confidence: 0.1 },
        ],
        keywordMatches: [
          { keyword: 'Controlling', status: 'missing', confidence: 0.1 },
        ],
        workers: [],
      })

      expect(strongMatch.score).toBeGreaterThan(unrelated.score)
    })

    it('a duplicate contradictory "missing" entry for an already-matched mandatory skill no longer tanks the score once reconciled', () => {
      // Simulates a verbose model returning both a correct "matched" item and
      // a hallucinated duplicate "missing" item for the same requirement.
      const rawDuplicated = [
        { skill: 'SAP CO', requirementType: 'mandatory', status: 'matched', confidence: 0.9, evidenceId: 'ev-001' },
        { skill: 'sap co', requirementType: 'mandatory', status: 'missing', confidence: 0.2 },
      ]

      const scoredRaw = scoreSingleJob({ skillMatches: rawDuplicated, keywordMatches: [], workers: [] })
      const scoredReconciled = scoreSingleJob({ skillMatches: reconcileSkillMatches(rawDuplicated), keywordMatches: [], workers: [] })

      // Unreconciled: the phantom "missing" duplicate applies the mandatory-gap
      // penalty on top of the correct match, artificially tanking the score.
      expect(scoredRaw.score).toBeLessThan(scoredReconciled.score)
      expect(scoredRaw.score).toBeLessThan(40)
      expect(scoredReconciled.score).toBeGreaterThan(50)
    })
  })
})
