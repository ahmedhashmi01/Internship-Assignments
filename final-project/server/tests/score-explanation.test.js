import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { scoreSingleJob } from '../src/services/scoringService.js'
import { createApp } from '../src/server.js'

const withConfidence = (items) => items.map((item) => ({ confidence: 0.9, ...item }))

describe('scoreSingleJob → scoreExplanation', () => {
  it('reports component coverage that matches the scoring inputs', () => {
    const skillMatches = withConfidence([
      { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001' },
      { skill: 'CSS', requirementType: 'mandatory', status: 'missing' },
      { skill: 'Flutter', requirementType: 'preferred', status: 'missing' },
    ])
    const keywordMatches = withConfidence([
      { keyword: 'React', status: 'matched', evidenceId: 'ev-001' },
      { keyword: 'TypeScript', status: 'missing' },
    ])

    const { scoreExplanation } = scoreSingleJob({ skillMatches, keywordMatches, workers: [], jobTitle: 'X' })

    expect(scoreExplanation.components.mandatory).toEqual({ coverage: 50, count: 2 })
    expect(scoreExplanation.components.preferred).toEqual({ coverage: 0, count: 1 })
    expect(scoreExplanation.components.contextual).toEqual({ coverage: 0, count: 0 })
    expect(scoreExplanation.components.ats).toEqual({ coverage: 50, count: 2 })
  })

  it('lists strong matches with valid evidence ids', () => {
    const skillMatches = withConfidence([
      { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001' },
      { skill: 'TypeScript', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-002' },
      { skill: 'CSS', requirementType: 'mandatory', status: 'missing' },
    ])

    const { scoreExplanation } = scoreSingleJob({ skillMatches, keywordMatches: [], workers: [], jobTitle: 'X' })

    const providedIds = new Set(['ev-001', 'ev-002'])
    expect(scoreExplanation.strongMatches.map((m) => m.requirement)).toEqual(['React', 'TypeScript'])
    scoreExplanation.strongMatches.forEach((m) => {
      expect(m.evidenceIds.length).toBeGreaterThan(0)
      m.evidenceIds.forEach((id) => expect(providedIds.has(id)).toBe(true))
    })
  })

  it('surfaces every non-matched requirement as a deduction (not only missing-mandatory)', () => {
    const skillMatches = withConfidence([
      { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001' },
      { skill: 'CSS', requirementType: 'mandatory', status: 'missing' },
      { skill: 'Accessibility', requirementType: 'preferred', status: 'partial', evidenceId: 'ev-002' },
      { skill: 'Flutter', requirementType: 'preferred', status: 'missing' },
      { skill: 'Kubernetes', requirementType: 'contextual', status: 'uncertain' },
    ])

    const { scoreExplanation } = scoreSingleJob({ skillMatches, keywordMatches: [], workers: [], jobTitle: 'X' })

    const deductionNames = scoreExplanation.deductions.map((d) => d.requirement)
    expect(deductionNames).toEqual(expect.arrayContaining(['CSS', 'Accessibility', 'Flutter', 'Kubernetes']))
    // missing-mandatory ranks first
    expect(scoreExplanation.deductions[0].requirement).toBe('CSS')
    expect(scoreExplanation.deductions.find((d) => d.requirement === 'CSS').reason).toMatch(/no supporting resume evidence/i)
    expect(scoreExplanation.deductions.find((d) => d.requirement === 'Accessibility').reason).toMatch(/weak or partial/i)
  })

  it('exposes a material cap with a friendly description and the actual cap value', () => {
    const skillMatches = withConfidence([
      { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001' },
      { skill: 'TypeScript', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-002' },
      { skill: 'CSS', requirementType: 'mandatory', status: 'missing' },
      { skill: 'Flutter', requirementType: 'mandatory', status: 'missing' },
      { skill: 'Angular', requirementType: 'mandatory', status: 'missing' },
      { skill: 'Docker', requirementType: 'preferred', status: 'matched', evidenceId: 'ev-003' },
      { skill: 'Leadership', requirementType: 'contextual', status: 'matched', evidenceId: 'ev-004' },
    ])
    const keywordMatches = withConfidence([{ keyword: 'React', status: 'matched', evidenceId: 'ev-001' }])

    const result = scoreSingleJob({ skillMatches, keywordMatches, workers: [], jobTitle: 'X' })

    // mandatory coverage = 2/5 = 40% (< 50%) → capped at 59
    expect(result.score).toBe(59)
    const codes = result.scoreExplanation.capsApplied.map((c) => c.code)
    expect(codes).toContain('MANDATORY_COVERAGE_BELOW_50')
    const cap = result.scoreExplanation.capsApplied.find((c) => c.code === 'MANDATORY_COVERAGE_BELOW_50')
    expect(cap.description).toMatch(/capped at 59/i)
    // The internal constant name is never in the human description.
    expect(cap.description).not.toMatch(/MANDATORY_COVERAGE_BELOW_50/)
  })

  it('applies no cap when the result was not materially capped', () => {
    const skillMatches = withConfidence([
      { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001' },
      { skill: 'CSS', requirementType: 'mandatory', status: 'missing' },
    ])

    const { scoreExplanation } = scoreSingleJob({ skillMatches, keywordMatches: [], workers: [], jobTitle: 'X' })
    // Uncapped score (~33) is already below every cap threshold → nothing material.
    expect(scoreExplanation.capsApplied).toEqual([])
  })

  it('builds a deterministic human summary from matches and deductions', () => {
    const skillMatches = withConfidence([
      { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001' },
      { skill: 'TypeScript', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-002' },
      { skill: 'CSS', requirementType: 'mandatory', status: 'missing' },
    ])

    const { scoreExplanation } = scoreSingleJob({ skillMatches, keywordMatches: [], workers: [], jobTitle: 'X' })
    expect(scoreExplanation.summary).toMatch(/strongly matches/i)
    expect(scoreExplanation.summary).toContain('React')
    expect(scoreExplanation.summary).toMatch(/reduced by missing or weak evidence for CSS/i)
  })
})

describe('POST /api/analysis/run exposes scoreExplanation (mock provider)', () => {
  const normalizedResume = {
    originalText: 'Senior Frontend Engineer with React, TypeScript, Docker, REST APIs, testing, performance.',
    evidence: [
      { id: 'ev-001', text: 'Built scalable React and TypeScript applications.' },
      { id: 'ev-002', text: 'Containerized services with Docker and designed REST APIs.' },
    ],
  }

  it('returns a scoreExplanation per ranked job, and every mandatory gap also appears in the explanation', async () => {
    const response = await request(createApp({ aiProvider: 'mock' }))
      .post('/api/analysis/run')
      .send({
        normalizedResume,
        jobs: [{ title: 'Web Frontend Engineer', description: 'JS, CSS, React, Flutter required.' }],
      })

    expect(response.status).toBe(200)
    const job = response.body.rankedJobs[0]
    expect(job.scoreExplanation).toBeTruthy()
    expect(job.scoreExplanation.components.mandatory).toHaveProperty('coverage')
    expect(Array.isArray(job.scoreExplanation.requirements)).toBe(true)

    // Consistency: any mandatory gap shown in the UI must also be present in the
    // explanation (as a missing requirement) — never a gap the score ignores.
    const explanationReqs = new Set(job.scoreExplanation.requirements.map((r) => r.requirement.toLowerCase()))
    job.mandatoryGaps.forEach((gap) => expect(explanationReqs.has(gap.toLowerCase())).toBe(true))
  })
})
