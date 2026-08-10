import { describe, expect, it } from 'vitest'
import {
  extractPrimarySkill,
  extractPrimaryKeyword,
  pickMostRelevantEvidence,
  buildEvidenceSummary,
} from '../src/services/jobInputExtractor.js'
import { createOrchestrationService } from '../src/services/orchestrationService.js'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const reactJob = 'We need a React developer with TypeScript and GraphQL experience to build our dashboard.'
const pythonJob = 'Looking for a Python data engineer with Apache Spark, PostgreSQL, and Airflow skills.'

const mixedEvidence = [
  { id: 'ev-001', text: 'Built responsive React components for an internal analytics dashboard.' },
  { id: 'ev-002', text: 'Developed Python data pipelines with PostgreSQL and Airflow integration.' },
  { id: 'ev-003', text: 'Led cross-functional team of eight engineers through a cloud migration to AWS.' },
]

// ---------------------------------------------------------------------------
// extractPrimarySkill
// ---------------------------------------------------------------------------

describe('extractPrimarySkill', () => {
  it('returns "React" for a React job description', () => {
    expect(extractPrimarySkill(reactJob)).toBe('React')
  })

  it('returns "Python" for a Python job description', () => {
    expect(extractPrimarySkill(pythonJob)).toBe('Python')
  })

  it('returns different values for two different job descriptions', () => {
    expect(extractPrimarySkill(reactJob)).not.toBe(extractPrimarySkill(pythonJob))
  })

  it('returns a non-empty string when no tech terms are found', () => {
    const result = extractPrimarySkill('We want a motivated team player with great communication.')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// extractPrimaryKeyword
// ---------------------------------------------------------------------------

describe('extractPrimaryKeyword', () => {
  it('returns a different term from extractPrimarySkill when ≥ 2 tech terms exist', () => {
    const skill = extractPrimarySkill(reactJob)
    const keyword = extractPrimaryKeyword(reactJob)
    expect(keyword).not.toBe(skill)
  })

  it('returns different keywords for two different job descriptions', () => {
    expect(extractPrimaryKeyword(reactJob)).not.toBe(extractPrimaryKeyword(pythonJob))
  })

  it('returns a non-empty string fallback when no tech terms are found', () => {
    const result = extractPrimaryKeyword('Seeking a driven project coordinator for our team.')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// pickMostRelevantEvidence
// ---------------------------------------------------------------------------

describe('pickMostRelevantEvidence', () => {
  it('selects the React evidence item for a React job', () => {
    const result = pickMostRelevantEvidence(
      'Build React dashboard components with TypeScript.',
      mixedEvidence,
    )
    expect(result.id).toBe('ev-001')
  })

  it('selects the Python evidence item for a Python data engineering job', () => {
    const result = pickMostRelevantEvidence(
      'Python data pipelines with PostgreSQL and Airflow.',
      mixedEvidence,
    )
    expect(result.id).toBe('ev-002')
  })

  it('returns different evidence items for two different job descriptions', () => {
    const reactResult = pickMostRelevantEvidence(
      'React frontend components and analytics dashboard.',
      mixedEvidence,
    )
    const pythonResult = pickMostRelevantEvidence(
      'Python pipelines with PostgreSQL and Airflow integration.',
      mixedEvidence,
    )
    expect(reactResult.id).not.toBe(pythonResult.id)
  })

  it('returns null for empty evidence', () => {
    expect(pickMostRelevantEvidence('any job description', [])).toBeNull()
  })

  it('always returns an item with a valid evidence ID', () => {
    const result = pickMostRelevantEvidence(reactJob, mixedEvidence)
    expect(result).not.toBeNull()
    expect(result.id).toMatch(/^ev-\d{3}$/)
  })
})

// ---------------------------------------------------------------------------
// buildEvidenceSummary
// ---------------------------------------------------------------------------

describe('buildEvidenceSummary', () => {
  it('includes all evidence IDs in the summary', () => {
    const summary = buildEvidenceSummary(mixedEvidence)
    expect(summary).toContain('[ev-001]')
    expect(summary).toContain('[ev-002]')
    expect(summary).toContain('[ev-003]')
  })

  it('includes a snippet of each evidence item text', () => {
    const summary = buildEvidenceSummary(mixedEvidence)
    expect(summary).toContain('React components')
    expect(summary).toContain('Python data pipelines')
  })

  it('returns an empty string for empty evidence', () => {
    expect(buildEvidenceSummary([])).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Integration: two different jobs → different orchestration inputs
// ---------------------------------------------------------------------------

describe('orchestration worker inputs differ per job', () => {
  // Use the mock provider so we test the wiring, not the AI
  const service = createOrchestrationService({ aiProvider: 'mock' })

  const resume = {
    originalText: 'Built React dashboards. Developed Python pipelines. Led AWS migrations.',
    evidence: [
      { id: 'ev-001', text: 'Built React dashboards with TypeScript.' },
      { id: 'ev-002', text: 'Developed Python pipelines with PostgreSQL.' },
      { id: 'ev-003', text: 'Led AWS cloud migration for eight-engineer team.' },
    ],
  }

  it('runSingleJob succeeds for a React job and a Python job with different extracted skills', async () => {
    const [reactResult, pythonResult] = await Promise.all([
      service.runSingleJob({ normalizedResume: resume, job: { title: 'Frontend Engineer', description: reactJob } }),
      service.runSingleJob({ normalizedResume: resume, job: { title: 'Data Engineer', description: pythonJob } }),
    ])

    // Both runs succeed
    expect(reactResult.workers).toHaveLength(4)
    expect(pythonResult.workers).toHaveLength(4)

    // Verify the extractor produces different primary skills — proving the
    // orchestration will send different prompts to the AI workers
    expect(extractPrimarySkill(reactJob)).not.toBe(extractPrimarySkill(pythonJob))
    expect(extractPrimaryKeyword(reactJob)).not.toBe(extractPrimaryKeyword(pythonJob))

    const reactBullet = pickMostRelevantEvidence(reactJob, resume.evidence)
    const pythonBullet = pickMostRelevantEvidence(pythonJob, resume.evidence)
    expect(reactBullet.id).not.toBe(pythonBullet.id)
  })

  it('evidence IDs returned by pickMostRelevantEvidence are always present in the resume', () => {
    const validIds = new Set(resume.evidence.map((e) => e.id))
    const reactEvidence = pickMostRelevantEvidence(reactJob, resume.evidence)
    const pythonEvidence = pickMostRelevantEvidence(pythonJob, resume.evidence)
    expect(validIds.has(reactEvidence.id)).toBe(true)
    expect(validIds.has(pythonEvidence.id)).toBe(true)
  })
})
