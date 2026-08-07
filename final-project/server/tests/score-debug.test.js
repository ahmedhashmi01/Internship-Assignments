import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scoreSingleJob } from '../src/services/scoringService.js'

const parseLoggedJson = (calls, prefix) => {
  const call = calls.find((entry) => typeof entry[0] === 'string' && entry[0].startsWith(prefix))
  if (!call) return null
  return JSON.parse(call[0].slice(prefix.length).trim())
}

const mandatory = (skill, status, confidence, evidenceId = 'ev-001') => ({ skill, requirementType: 'mandatory', status, confidence, evidenceId })
const preferred = (skill, status, confidence, evidenceId = 'ev-001') => ({ skill, requirementType: 'preferred', status, confidence, evidenceId })
const keyword = (kw, status, confidence, evidenceId = 'ev-001') => ({ keyword: kw, status, confidence, evidenceId })

describe('scoreSingleJob debug trace (normalized formula)', () => {
  const originalFlag = process.env.DEBUG_AI_RESPONSES
  let logSpy

  beforeEach(() => {
    process.env.DEBUG_AI_RESPONSES = 'true'
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    if (originalFlag === undefined) delete process.env.DEBUG_AI_RESPONSES
    else process.env.DEBUG_AI_RESPONSES = originalFlag
  })

  it('[score-debug] breakdown reconstructs the final score', () => {
    const skillMatches = [mandatory('React', 'matched', 0.9), mandatory('TypeScript', 'missing', 0.2), preferred('Node.js', 'matched', 0.8)]
    const keywordMatches = [keyword('React', 'matched', 0.9)]

    const result = scoreSingleJob({ skillMatches, keywordMatches, workers: [], jobTitle: 'Backend Engineer' })
    const debug = parseLoggedJson(logSpy.mock.calls, '[score-debug]')

    expect(debug).not.toBeNull()
    expect(debug.mandatoryCoverage).toBeCloseTo(0.5, 6)
    expect(debug.preferredCoverage).toBe(1)

    const reconstructedBase = debug.componentContributions.mandatory + debug.componentContributions.preferred + debug.componentContributions.contextual + debug.componentContributions.ats
    expect(reconstructedBase).toBeCloseTo(debug.baseScore, 6)

    const reconstructedScoreBeforeCaps = debug.baseScore * debug.confidenceMultiplier * debug.workerHealth
    expect(reconstructedScoreBeforeCaps).toBeCloseTo(debug.scoreBeforeCaps, 6)

    expect(debug.finalScore).toBe(result.score)
  })

  it('reports capApplied/capReason for a mandatory-missing scenario', () => {
    scoreSingleJob({
      // 9 matched + 1 missing mandatory, no other category — coverage alone
      // would land around 90, so the cap is the binding constraint.
      skillMatches: [
        ...Array.from({ length: 9 }, (_, i) => mandatory(`Skill ${i}`, 'matched', 0.95)),
        mandatory('Missing Skill', 'missing', 0.2),
      ],
      keywordMatches: [],
      workers: [],
      jobTitle: 'Senior Frontend Engineer',
    })
    const debug = parseLoggedJson(logSpy.mock.calls, '[score-debug]')

    expect(debug.capApplied).toBe(true)
    expect(debug.capReason).toBe('mandatory-requirement-missing')
    expect(debug.finalScore).toBe(84)
  })

  it('reports capApplied=false and capReason="none" when no cap constrains the score', () => {
    scoreSingleJob({
      skillMatches: [mandatory('React', 'partial', 0.5)],
      keywordMatches: [],
      workers: [],
      jobTitle: 'X',
    })
    const debug = parseLoggedJson(logSpy.mock.calls, '[score-debug]')

    expect(debug.capApplied).toBe(false)
    expect(debug.capReason).toBe('none')
  })

  it('emits [score-warning] when finalScore is exactly 100, with mandatory requirements, evidence, and component contributions', () => {
    const result = scoreSingleJob({
      skillMatches: [mandatory('React', 'matched', 0.95), mandatory('TypeScript', 'matched', 0.95)],
      keywordMatches: [keyword('React', 'matched', 0.95)],
      workers: [],
      jobTitle: 'Senior Frontend Engineer',
    })
    expect(result.score).toBe(100)

    const warning = parseLoggedJson(logSpy.mock.calls, '[score-warning]')
    expect(warning).not.toBeNull()
    expect(warning.mandatoryRequirements).toEqual([
      { skill: 'React', status: 'matched', evidenceId: 'ev-001' },
      { skill: 'TypeScript', status: 'matched', evidenceId: 'ev-001' },
    ])
    expect(warning.eligibleFor100).toBe(true)
    expect(warning.baseScore).toBe(100)
  })

  it('does not emit [score-warning] when finalScore is below 100', () => {
    scoreSingleJob({ skillMatches: [mandatory('React', 'partial', 0.5)], keywordMatches: [], workers: [], jobTitle: 'X' })
    expect(parseLoggedJson(logSpy.mock.calls, '[score-warning]')).toBeNull()
  })

  it('emits nothing when DEBUG_AI_RESPONSES is disabled, even for a 100 score', () => {
    process.env.DEBUG_AI_RESPONSES = 'false'
    logSpy.mockClear()

    const result = scoreSingleJob({
      skillMatches: [mandatory('React', 'matched', 0.95), mandatory('TypeScript', 'matched', 0.95)],
      keywordMatches: [keyword('React', 'matched', 0.95)],
      workers: [],
      jobTitle: 'X',
    })

    expect(result.score).toBe(100)
    expect(logSpy).not.toHaveBeenCalled()
  })
})
