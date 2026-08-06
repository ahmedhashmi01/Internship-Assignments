import { describe, expect, it } from 'vitest'
import {
  extractPrimarySkill,
  extractPrimaryKeyword,
  pickMostRelevantEvidence,
  buildEvidenceSummary,
  extractRequirements,
  extractKeywords,
  pickTopEvidenceItems,
  matchKeywordsToEvidence,
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
// extractRequirements
// ---------------------------------------------------------------------------

describe('extractRequirements', () => {
  it('returns at most 10 requirements', () => {
    const longJob = 'Need React, Angular, Vue.js, TypeScript, JavaScript, Python, Java, C++, C#, Go, Rust, Swift experience.'
    const result = extractRequirements(longJob, 10)
    expect(result.length).toBeLessThanOrEqual(10)
  })

  it('classifies each requirement as mandatory, preferred, or contextual', () => {
    const job = 'React is required. TypeScript is preferred. GraphQL is a bonus.'
    const result = extractRequirements(job)
    result.forEach((item) => {
      expect(['mandatory', 'preferred', 'contextual']).toContain(item.requirementType)
    })
  })

  it('deduplicates case-insensitively', () => {
    const job = 'We need React and react and REACT experience.'
    const result = extractRequirements(job)
    const keys = result.map((item) => item.skill.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('returns different requirements for two different job descriptions', () => {
    expect(extractRequirements(reactJob)).not.toEqual(extractRequirements(pythonJob))
  })
})

// ---------------------------------------------------------------------------
// extractKeywords
// ---------------------------------------------------------------------------

describe('extractKeywords', () => {
  it('returns at most 15 keywords', () => {
    const longJob = 'React, Angular, Vue.js, TypeScript, JavaScript, Python, Java, C++, C#, Go, Rust, Swift, Kotlin, Ruby, PHP, Scala.'
    const result = extractKeywords(longJob, 15)
    expect(result.length).toBeLessThanOrEqual(15)
  })

  it('deduplicates case-insensitively', () => {
    const job = 'Python, python, PYTHON, and more Python experience.'
    const result = extractKeywords(job)
    const lower = result.map((keyword) => keyword.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
  })

  it('returns different keywords for two different job descriptions', () => {
    expect(extractKeywords(reactJob)).not.toEqual(extractKeywords(pythonJob))
  })
})

// ---------------------------------------------------------------------------
// matchKeywordsToEvidence (deterministic ATS matching — no LLM call)
// ---------------------------------------------------------------------------

describe('matchKeywordsToEvidence', () => {
  it('matches a keyword that appears in resume evidence', () => {
    const result = matchKeywordsToEvidence(['React'], mixedEvidence)
    expect(result[0].status).toBe('matched')
    expect(result[0].evidenceId).toBe('ev-001')
  })

  it('marks a keyword as missing when it does not appear in any evidence', () => {
    const result = matchKeywordsToEvidence(['Kubernetes'], mixedEvidence)
    expect(result[0].status).toBe('missing')
    expect(result[0].evidenceId).toBeUndefined()
  })

  it('matches case-insensitively and ignores extra whitespace', () => {
    const result = matchKeywordsToEvidence(['  react  '], mixedEvidence)
    expect(result[0].status).toBe('matched')
  })

  it('returns one item per input keyword, preserving order', () => {
    const result = matchKeywordsToEvidence(['React', 'Kubernetes', 'Python'], mixedEvidence)
    expect(result.map((item) => item.keyword)).toEqual(['React', 'Kubernetes', 'Python'])
    expect(result.map((item) => item.status)).toEqual(['matched', 'missing', 'matched'])
  })

  it('falls back to a single placeholder item when no keywords are provided', () => {
    const result = matchKeywordsToEvidence([], mixedEvidence)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('missing')
  })

  it('is deterministic across repeated calls', () => {
    const first = matchKeywordsToEvidence(['React', 'Python'], mixedEvidence)
    const second = matchKeywordsToEvidence(['React', 'Python'], mixedEvidence)
    expect(second).toEqual(first)
  })

  it('assigns confidence values within the valid 0-1 range', () => {
    const result = matchKeywordsToEvidence(['React', 'Kubernetes'], mixedEvidence)
    result.forEach((item) => {
      expect(item.confidence).toBeGreaterThanOrEqual(0)
      expect(item.confidence).toBeLessThanOrEqual(1)
    })
  })
})

// ---------------------------------------------------------------------------
// pickTopEvidenceItems
// ---------------------------------------------------------------------------

describe('pickTopEvidenceItems', () => {
  it('returns at most 5 items with valid evidence IDs', () => {
    const result = pickTopEvidenceItems(reactJob, mixedEvidence, 5)
    expect(result.length).toBeLessThanOrEqual(5)
    result.forEach((item) => expect(item.id).toMatch(/^ev-\d{3}$/))
  })

  it('returns different evidence sets for two different job descriptions', () => {
    const reactResult = pickTopEvidenceItems(reactJob, mixedEvidence, 5)
    const pythonResult = pickTopEvidenceItems(pythonJob, mixedEvidence, 5)
    expect(reactResult.map((item) => item.id)).not.toEqual(pythonResult.map((item) => item.id))
  })

  it('returns an empty array for empty evidence', () => {
    expect(pickTopEvidenceItems(reactJob, [], 5)).toEqual([])
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
