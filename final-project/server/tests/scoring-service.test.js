import { describe, expect, it } from 'vitest'
import { scoreSingleJob } from '../src/services/scoringService.js'

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
})
