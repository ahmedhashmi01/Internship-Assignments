import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
              { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [{ skill: 'React' }] } },
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
})
