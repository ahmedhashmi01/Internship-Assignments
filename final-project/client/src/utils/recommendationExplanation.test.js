import { describe, expect, it } from 'vitest'
import { buildRecommendationExplanation } from './recommendationExplanation.js'

const job = ({ jobId, jobTitle, score, mandatoryGaps = [], mandatory, preferred, ats, strongMatches = [] }) => ({
  jobId,
  jobTitle,
  score,
  mandatoryGaps,
  scoreExplanation: {
    components: {
      mandatory: { coverage: mandatory, count: mandatory === null ? 0 : 3 },
      preferred: { coverage: preferred ?? 0, count: preferred == null ? 0 : 2 },
      contextual: { coverage: 0, count: 0 },
      ats: { coverage: ats, count: ats === null ? 0 : 5 },
    },
    strongMatches: strongMatches.map((requirement) => ({ requirement, evidenceIds: [] })),
  },
})

describe('buildRecommendationExplanation', () => {
  it('returns null with fewer than 2 jobs (no comparison explanation with only 1 job)', () => {
    expect(buildRecommendationExplanation([])).toBeNull()
    expect(buildRecommendationExplanation([job({ jobId: 'j1', jobTitle: 'Solo Role', score: 90, mandatory: 100, ats: 100 })])).toBeNull()
  })

  it('always uses rankedJobs[0] as the best fit and never reorders the input', () => {
    const jobs = [
      job({ jobId: 'j1', jobTitle: 'Frontend Engineer', score: 91, mandatory: 84, ats: 78, strongMatches: ['React', 'TypeScript'] }),
      job({ jobId: 'j2', jobTitle: 'Full Stack Engineer', score: 76, mandatory: 61, ats: 67 }),
    ]
    const snapshot = jobs.map((j) => j.jobId)

    const explanation = buildRecommendationExplanation(jobs)

    expect(explanation.jobId).toBe('j1')
    expect(explanation.jobTitle).toBe('Frontend Engineer')
    // Input array order/identity is untouched — the function never re-ranks.
    expect(jobs.map((j) => j.jobId)).toEqual(snapshot)
  })

  it('uses rankedJobs[0] even when it is not alphabetically or numerically "first" by title', () => {
    // A backend tie-break can legitimately put a "Z..." title ahead of an "A..." one.
    const jobs = [
      job({ jobId: 'j1', jobTitle: 'Zookeeper Engineer', score: 80, mandatory: 90, ats: 80 }),
      job({ jobId: 'j2', jobTitle: 'Apex Engineer', score: 60, mandatory: 40, ats: 30 }),
    ]
    const explanation = buildRecommendationExplanation(jobs)
    expect(explanation.jobTitle).toBe('Zookeeper Engineer')
  })

  it('compares the correct metrics between the best job and the next-best job', () => {
    const jobs = [
      job({ jobId: 'j1', jobTitle: 'Frontend Engineer', score: 91, mandatory: 84, ats: 78, mandatoryGaps: ['CSS'] }),
      job({ jobId: 'j2', jobTitle: 'Full Stack Engineer', score: 76, mandatory: 61, ats: 67, mandatoryGaps: ['Go', 'Docker', 'Kubernetes'] }),
    ]
    const explanation = buildRecommendationExplanation(jobs)
    const [comparison] = explanation.comparison

    expect(comparison.jobId).toBe('j2')
    expect(comparison.jobTitle).toBe('Full Stack Engineer')
    expect(comparison.differences).toEqual(
      expect.arrayContaining([
        'Higher mandatory coverage: 84% vs 61%',
        'Better ATS alignment: 78% vs 67%',
        'Fewer critical gaps: 1 vs 3',
        'Higher match score: 91 vs 76',
      ]),
    )
  })

  it('handles exactly 2 jobs', () => {
    const jobs = [
      job({ jobId: 'j1', jobTitle: 'A', score: 90, mandatory: 90, ats: 90 }),
      job({ jobId: 'j2', jobTitle: 'B', score: 70, mandatory: 60, ats: 60 }),
    ]
    const explanation = buildRecommendationExplanation(jobs)
    expect(explanation.comparison).toHaveLength(1)
    expect(explanation.comparison[0].jobId).toBe('j2')
  })

  it('handles 3 jobs — compares against the immediate next-best only, not the third', () => {
    const jobs = [
      job({ jobId: 'j1', jobTitle: 'Best', score: 90, mandatory: 90, ats: 90 }),
      job({ jobId: 'j2', jobTitle: 'Middle', score: 70, mandatory: 60, ats: 60 }),
      job({ jobId: 'j3', jobTitle: 'Worst', score: 40, mandatory: 20, ats: 20 }),
    ]
    const explanation = buildRecommendationExplanation(jobs)
    expect(explanation.comparison).toHaveLength(1)
    expect(explanation.comparison[0].jobId).toBe('j2')
    expect(explanation.comparison[0].jobTitle).toBe('Middle')
  })

  it('handles ties without any misleading "higher/fewer/better" claim', () => {
    const jobs = [
      job({ jobId: 'j1', jobTitle: 'Tied A', score: 80, mandatory: 70, ats: 70, mandatoryGaps: ['X'] }),
      job({ jobId: 'j2', jobTitle: 'Tied B', score: 80, mandatory: 70, ats: 70, mandatoryGaps: ['X'] }),
    ]
    const explanation = buildRecommendationExplanation(jobs)
    const { differences } = explanation.comparison[0]

    expect(differences.some((line) => /higher|lower|better|fewer|more/i.test(line))).toBe(false)
    // Still says something honest rather than nothing.
    expect(differences.length).toBeGreaterThan(0)
  })

  it('never claims "highest mandatory coverage" when every job is tied on it', () => {
    const jobs = [
      job({ jobId: 'j1', jobTitle: 'A', score: 80, mandatory: 70, ats: 90 }),
      job({ jobId: 'j2', jobTitle: 'B', score: 60, mandatory: 70, ats: 40 }),
    ]
    const explanation = buildRecommendationExplanation(jobs)
    expect(explanation.strengths.some((s) => s.label === 'Highest mandatory requirement coverage')).toBe(false)
    // ATS is not tied, so that strength is still legitimate to claim.
    expect(explanation.strengths.some((s) => s.label === 'Best ATS alignment among analyzed roles')).toBe(true)
  })

  it('reports zero critical gaps honestly', () => {
    const jobs = [
      job({ jobId: 'j1', jobTitle: 'A', score: 95, mandatory: 100, ats: 90, mandatoryGaps: [] }),
      job({ jobId: 'j2', jobTitle: 'B', score: 70, mandatory: 60, ats: 60, mandatoryGaps: ['X'] }),
    ]
    const explanation = buildRecommendationExplanation(jobs)
    expect(explanation.strengths.some((s) => s.label === 'No critical mandatory requirement gaps')).toBe(true)
  })
})
