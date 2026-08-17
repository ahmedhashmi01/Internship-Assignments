import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildApplicationReadiness, buildPriorityActions, READINESS_STATUS } from '../src/services/scoringService.js'
import { createApp } from '../src/server.js'

const baseExplanation = (overrides = {}) => ({
  summary: '',
  components: {
    mandatory: { coverage: 100, count: 3 },
    preferred: { coverage: 100, count: 2 },
    contextual: { coverage: 100, count: 1 },
    ats: { coverage: 100, count: 5 },
  },
  strongMatches: [],
  deductions: [],
  capsApplied: [],
  requirements: [],
  atsKeywords: [],
  ...overrides,
})

describe('buildApplicationReadiness', () => {
  it('strong candidate (strong fit, no critical gaps) → Ready to Apply', () => {
    const readiness = buildApplicationReadiness({
      score: 92,
      recommendationLabel: 'strong fit',
      scoreExplanation: baseExplanation({
        requirements: [{ requirement: 'React', requirementType: 'mandatory', status: 'matched', evidenceIds: ['ev-001'] }],
      }),
    })
    expect(readiness.status).toBe(READINESS_STATUS.ready)
    expect(readiness.label).toBe('Ready to Apply')
    expect(readiness.metrics.criticalGapCount).toBe(0)
    expect(readiness.metrics.matchScore).toBe(92)
  })

  it('good candidate with one addressable gap → Ready With Improvements', () => {
    const readiness = buildApplicationReadiness({
      score: 76,
      recommendationLabel: 'good fit',
      scoreExplanation: baseExplanation({
        requirements: [{ requirement: 'AWS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] }],
      }),
    })
    expect(readiness.status).toBe(READINESS_STATUS.readyWithImprovements)
    expect(readiness.label).toBe('Ready With Improvements')
    expect(readiness.metrics.criticalGapCount).toBe(1)
    expect(readiness.summary).toMatch(/one critical mandatory gap/i)
  })

  it('a strong-fit score with exactly one critical gap is Ready With Improvements, not Ready to Apply', () => {
    const readiness = buildApplicationReadiness({
      score: 88,
      recommendationLabel: 'strong fit',
      scoreExplanation: baseExplanation({
        requirements: [{ requirement: 'AWS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] }],
      }),
    })
    expect(readiness.status).toBe(READINESS_STATUS.readyWithImprovements)
  })

  it('multiple mandatory gaps → Significant Gaps', () => {
    const readiness = buildApplicationReadiness({
      score: 72,
      recommendationLabel: 'good fit',
      scoreExplanation: baseExplanation({
        requirements: [
          { requirement: 'AWS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
          { requirement: 'Kubernetes', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
        ],
      }),
    })
    expect(readiness.status).toBe(READINESS_STATUS.significantGaps)
    expect(readiness.label).toBe('Significant Gaps')
  })

  it('a moderate score alone (even with zero gaps) → Significant Gaps', () => {
    const readiness = buildApplicationReadiness({ score: 55, recommendationLabel: 'moderate fit', scoreExplanation: baseExplanation() })
    expect(readiness.status).toBe(READINESS_STATUS.significantGaps)
  })

  it('weak candidate (low fit) → Low Fit', () => {
    const readiness = buildApplicationReadiness({
      score: 30,
      recommendationLabel: 'low fit',
      scoreExplanation: baseExplanation({
        requirements: [
          { requirement: 'AWS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
          { requirement: 'Kubernetes', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
          { requirement: 'Docker', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
        ],
      }),
    })
    expect(readiness.status).toBe(READINESS_STATUS.lowFit)
    expect(readiness.label).toBe('Low Fit')
  })

  it('reuses the existing severe score-cap codes — a below-50% mandatory-coverage cap forces Low Fit', () => {
    const readiness = buildApplicationReadiness({
      score: 59,
      recommendationLabel: 'moderate fit',
      scoreExplanation: baseExplanation({
        capsApplied: [{ code: 'MANDATORY_COVERAGE_BELOW_50', description: 'Because fewer than half...' }],
      }),
    })
    expect(readiness.status).toBe(READINESS_STATUS.lowFit)
  })

  it('is deterministic — identical input always produces identical output', () => {
    const input = {
      score: 76,
      recommendationLabel: 'good fit',
      scoreExplanation: baseExplanation({
        requirements: [{ requirement: 'AWS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] }],
      }),
    }
    expect(buildApplicationReadiness(input)).toEqual(buildApplicationReadiness(input))
  })

  it('never invents a coverage percentage for a category with no requirements (null, not a fake 0%)', () => {
    const readiness = buildApplicationReadiness({
      score: 80,
      recommendationLabel: 'good fit',
      scoreExplanation: baseExplanation({
        components: {
          mandatory: { coverage: 90, count: 2 },
          preferred: { coverage: 0, count: 0 },
          contextual: { coverage: 0, count: 0 },
          ats: { coverage: 0, count: 0 },
        },
      }),
    })
    expect(readiness.metrics.preferredCoverage).toBeNull()
    expect(readiness.metrics.atsCoverage).toBeNull()
    expect(readiness.metrics.mandatoryCoverage).toBe(90)
  })
})

describe('buildPriorityActions', () => {
  it('orders a missing mandatory requirement before a missing preferred requirement', () => {
    const scoreExplanation = baseExplanation({
      requirements: [
        { requirement: 'Figma', requirementType: 'preferred', status: 'missing', evidenceIds: [] },
        { requirement: 'AWS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
      ],
    })
    const actions = buildPriorityActions({ scoreExplanation })
    expect(actions[0]).toMatchObject({ type: 'critical_gap', title: 'AWS' })
    const awsIndex = actions.findIndex((a) => a.title === 'AWS')
    const figmaIndex = actions.findIndex((a) => a.title === 'Figma')
    expect(awsIndex).toBeLessThan(figmaIndex)
  })

  it('a partial mandatory requirement creates a strengthen-evidence action carrying its evidence id', () => {
    const scoreExplanation = baseExplanation({
      requirements: [{ requirement: 'TypeScript', requirementType: 'mandatory', status: 'partial', evidenceIds: ['ev-014'] }],
    })
    const [action] = buildPriorityActions({ scoreExplanation })
    expect(action.type).toBe('strengthen_evidence')
    expect(action.severity).toBe('medium')
    expect(action.evidenceIds).toEqual(['ev-014'])
    expect(action.reason).toMatch(/partial/i)
    expect(action.action).toMatch(/strengthen the existing bullet/i)
  })

  it('preserves evidence ids end to end for uncertain/partial items', () => {
    const scoreExplanation = baseExplanation({
      requirements: [{ requirement: 'GraphQL', requirementType: 'preferred', status: 'uncertain', evidenceIds: ['ev-007'] }],
    })
    const [action] = buildPriorityActions({ scoreExplanation })
    expect(action.evidenceIds).toEqual(['ev-007'])
  })

  it('never recommends adding unsupported experience — missing requirements are phrased as "do not claim", never "add"', () => {
    const scoreExplanation = baseExplanation({
      requirements: [
        { requirement: 'AWS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
        { requirement: 'Kubernetes', requirementType: 'preferred', status: 'missing', evidenceIds: [] },
      ],
    })
    const actions = buildPriorityActions({ scoreExplanation })
    actions.forEach((action) => {
      expect(action.action).not.toMatch(/^add /i)
      expect(action.action).not.toMatch(/add (aws|kubernetes) experience/i)
      expect(action.evidenceIds).toEqual([]) // a missing requirement can never cite evidence
    })
    expect(actions.find((a) => a.title === 'AWS').action).toMatch(/do not claim aws/i)
    expect(actions.find((a) => a.title === 'Kubernetes').action).toMatch(/do not claim kubernetes/i)
  })

  it('only surfaces an ATS keyword opportunity when backed by matched evidence elsewhere, and skips it otherwise', () => {
    const backed = baseExplanation({
      requirements: [{ requirement: 'CI/CD', requirementType: 'mandatory', status: 'matched', evidenceIds: ['ev-003'] }],
      atsKeywords: [{ keyword: 'CI/CD', status: 'missing', evidenceIds: [] }],
    })
    const [action] = buildPriorityActions({ scoreExplanation: backed })
    expect(action).toMatchObject({ type: 'keyword_opportunity', severity: 'opportunity', evidenceIds: ['ev-003'] })

    const unbacked = baseExplanation({ requirements: [], atsKeywords: [{ keyword: 'Rust', status: 'missing', evidenceIds: [] }] })
    expect(buildPriorityActions({ scoreExplanation: unbacked })).toEqual([])
  })

  it('caps the action list at the default maximum of 5', () => {
    const requirements = Array.from({ length: 8 }, (_, i) => ({
      requirement: `Skill${i}`,
      requirementType: 'mandatory',
      status: 'missing',
      evidenceIds: [],
    }))
    const actions = buildPriorityActions({ scoreExplanation: baseExplanation({ requirements }) })
    expect(actions).toHaveLength(5)
    expect(actions.map((a) => a.priority)).toEqual([1, 2, 3, 4, 5])
  })

  it('honors a custom maxActions', () => {
    const requirements = Array.from({ length: 8 }, (_, i) => ({
      requirement: `Skill${i}`,
      requirementType: 'mandatory',
      status: 'missing',
      evidenceIds: [],
    }))
    expect(buildPriorityActions({ scoreExplanation: baseExplanation({ requirements }), maxActions: 3 })).toHaveLength(3)
  })

  it('uses only the three documented severities', () => {
    const scoreExplanation = baseExplanation({
      requirements: [
        { requirement: 'AWS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
        { requirement: 'TypeScript', requirementType: 'mandatory', status: 'partial', evidenceIds: ['ev-014'] },
        { requirement: 'CI/CD', requirementType: 'mandatory', status: 'matched', evidenceIds: ['ev-003'] },
      ],
      atsKeywords: [{ keyword: 'CI/CD', status: 'missing', evidenceIds: [] }],
    })
    const actions = buildPriorityActions({ scoreExplanation })
    expect(actions.length).toBeGreaterThan(0)
    actions.forEach((action) => expect(['high', 'medium', 'opportunity']).toContain(action.severity))
  })
})

describe('POST /api/analysis/run exposes readiness + priorityActions (mock provider)', () => {
  const normalizedResume = {
    originalText: 'Senior Frontend Engineer with React, TypeScript, Docker, REST APIs, testing, performance.',
    evidence: [
      { id: 'ev-001', text: 'Built scalable React and TypeScript applications.' },
      { id: 'ev-002', text: 'Containerized services with Docker and designed REST APIs.' },
    ],
  }

  it('returns a readiness status and a bounded priorityActions list per ranked job', async () => {
    const response = await request(createApp({ aiProvider: 'mock' }))
      .post('/api/analysis/run')
      .send({ normalizedResume, jobs: [{ title: 'Web Frontend Engineer', description: 'JS, CSS, React, Flutter required.' }] })

    expect(response.status).toBe(200)
    const job = response.body.rankedJobs[0]
    expect(['ready', 'ready_with_improvements', 'significant_gaps', 'low_fit']).toContain(job.readiness.status)
    expect(job.readiness.metrics.matchScore).toBe(Math.round(job.score))
    expect(Array.isArray(job.priorityActions)).toBe(true)
    expect(job.priorityActions.length).toBeLessThanOrEqual(5)
    // Every action's evidence ids (if any) must be real resume evidence ids.
    const validIds = new Set(normalizedResume.evidence.map((item) => item.id))
    job.priorityActions.forEach((action) => action.evidenceIds.forEach((id) => expect(validIds.has(id)).toBe(true)))
  })
})
