import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ResultsPanel from './ResultsPanel.jsx'

describe('ResultsPanel', () => {
  it('renders ranked jobs and result summary', () => {
    const result = {
      overallStatus: 'complete',
      totalDurationMs: 1200,
      partial: false,
      recommendations: [{ jobId: 'job-01', jobTitle: 'Frontend Engineer', recommendationLabel: 'strong fit', score: 92 }],
      recurringGaps: [{ gap: 'React', count: 2 }],
      rankedJobs: [
        {
          jobId: 'job-01',
          jobTitle: 'Frontend Engineer',
          jobDescription: 'Build UI',
          rank: 1,
          score: 92,
          recommendationLabel: 'strong fit',
          mandatoryGaps: ['React'],
          status: 'succeeded',
          result: {
            workers: [
              { name: 'supervisor', status: 'succeeded', output: { plan: ['Review'] } },
              { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [{ skill: 'React', status: 'matched' }] } },
              { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [{ keyword: 'React' }] } },
              { name: 'bulletRewrite', status: 'succeeded', output: { rewrites: [{ text: 'Built React interfaces', evidenceId: 'ev-001' }], antiFabricationValidation: { flags: [] } } },
            ],
          },
        },
      ],
    }

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    expect(screen.getAllByText(/Ranked Intelligence Dashboard|Recruitment Intelligence/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Frontend Engineer').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/92/i).length).toBeGreaterThan(0)
  })

  const buildResult = ({ score, workers, jobDescription, mandatoryGaps = [] }) => ({
    overallStatus: 'complete',
    totalDurationMs: 1200,
    partial: false,
    recommendations: [{ jobId: 'job-01', jobTitle: 'SAP Controlling Analyst', recommendationLabel: 'strong fit', score }],
    recurringGaps: [],
    rankedJobs: [
      {
        jobId: 'job-01',
        jobTitle: 'SAP Controlling Analyst',
        jobDescription,
        rank: 1,
        score,
        recommendationLabel: 'strong fit',
        mandatoryGaps,
        status: 'succeeded',
        result: { workers, partial: workers.some((worker) => worker.status === 'failed') },
      },
    ],
  })

  it('rounds a raw floating-point score instead of showing it verbatim', () => {
    const result = buildResult({
      score: 7.075000000000003,
      jobDescription: 'Short description.',
      workers: [
        { name: 'supervisor', status: 'succeeded', output: {} },
        { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
        { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
        { name: 'bulletRewrite', status: 'succeeded', output: { rewrites: [] } },
      ],
    })

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    expect(screen.queryByText(/7\.075/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/7\.1/).length).toBeGreaterThan(0)
  })

  it('shows Completed for succeeded workers and never shows the stale "Active" label', () => {
    const result = buildResult({
      score: 88,
      jobDescription: 'Short description.',
      workers: [
        { name: 'supervisor', status: 'succeeded', output: {} },
        { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
        { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
        { name: 'bulletRewrite', status: 'succeeded', output: { rewrites: [] } },
      ],
    })

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    expect(screen.queryByText('Active')).not.toBeInTheDocument()
    expect(screen.getAllByText('Completed').length).toBe(4)
  })

  it('reflects a failed bulletRewrite worker in the worker-status card and shows its failure explicitly', () => {
    const result = buildResult({
      score: 55,
      jobDescription: 'Short description.',
      workers: [
        { name: 'supervisor', status: 'succeeded', output: {} },
        { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
        { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
        { name: 'bulletRewrite', status: 'failed', errorMessage: 'Ollama request timed out', output: undefined },
      ],
    })

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Completed').length).toBe(3)
    expect(screen.getAllByText(/Bullet rewrite generation failed/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Ollama request timed out/).length).toBeGreaterThan(0)
  })

  it('never shows the same skill in both Skills Matched and Mandatory Gaps', () => {
    const result = buildResult({
      score: 60,
      jobDescription: 'Short description.',
      mandatoryGaps: ['SAP FI'],
      workers: [
        { name: 'supervisor', status: 'succeeded', output: {} },
        {
          name: 'skillMatch',
          status: 'succeeded',
          output: {
            // matchedSkills holds ALL reconciled items (any status) for scoring —
            // 'SAP FI' is missing and must not also render as "matched".
            matchedSkills: [
              { skill: 'SAP CO', status: 'matched', requirementType: 'mandatory' },
              { skill: 'SAP FI', status: 'missing', requirementType: 'mandatory' },
            ],
          },
        },
        { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
        { name: 'bulletRewrite', status: 'succeeded', output: { rewrites: [] } },
      ],
    })

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    // "SAP CO" only in Skills Matched, "SAP FI" only in Mandatory Gaps
    expect(screen.getAllByText('SAP CO')).toHaveLength(1)
    expect(screen.getAllByText('SAP FI')).toHaveLength(1)
  })

  it('blocks default approval and labels a high-risk rewrite "Needs review"', () => {
    const result = buildResult({
      score: 60,
      jobDescription: 'Short description.',
      workers: [
        { name: 'supervisor', status: 'succeeded', output: {} },
        { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
        { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
        {
          name: 'bulletRewrite',
          status: 'succeeded',
          output: {
            rewrites: [
              {
                originalText: 'Built responsive React interfaces.',
                rewrittenText: 'Improved adoption by 40% across the platform.',
                evidenceId: 'ev-001',
                validation: { valid: false, flags: ['invented-metric'], riskStatus: 'high', needsReview: true },
              },
            ],
          },
        },
      ],
    })

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    expect(screen.getByText('Needs review')).toBeInTheDocument()
    const acceptButton = screen.getByRole('button', { name: /accept/i })
    expect(acceptButton).toBeDisabled()

    fireEvent.click(acceptButton)
    // A disabled button must not register the click — status stays unapproved.
    expect(screen.queryByText('Approve at least one rewrite before copying.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /copy approved/i }))
    expect(screen.getByText('Approve at least one rewrite before copying.')).toBeInTheDocument()
  })

  it('does not block approval or show "Needs review" for a low-risk rewrite', () => {
    const result = buildResult({
      score: 80,
      jobDescription: 'Short description.',
      workers: [
        { name: 'supervisor', status: 'succeeded', output: {} },
        { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
        { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
        {
          name: 'bulletRewrite',
          status: 'succeeded',
          output: {
            rewrites: [
              {
                originalText: 'Built responsive React interfaces.',
                rewrittenText: 'Built responsive React interfaces.',
                evidenceId: 'ev-001',
                validation: { valid: true, flags: [], riskStatus: 'low', needsReview: false },
              },
            ],
          },
        },
      ],
    })

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    expect(screen.queryByText('Needs review')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept/i })).not.toBeDisabled()
  })

  it('truncates a long job description in the ranked card while the detail view keeps the full text', () => {
    const longDescription = `Required skills: ${'SAP Controlling module configuration, cost center accounting, and internal order management. '.repeat(6)}`.trim()
    const result = buildResult({ score: 70, jobDescription: longDescription, workers: [] })

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    // Full text appears exactly once (the detail view); the ranked card shows a shorter, ellipsized version.
    expect(screen.getAllByText(longDescription)).toHaveLength(1)
    expect(screen.getAllByText(/…$/).length).toBeGreaterThan(0)
  })
})
