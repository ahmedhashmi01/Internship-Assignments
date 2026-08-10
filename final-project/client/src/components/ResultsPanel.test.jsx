import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('shows the animated processing panel while analysis is loading', () => {
    render(<ResultsPanel result={null} isLoading error="" onStartOver={() => {}} />)
    expect(screen.getByText('Analyzing your resume')).toBeInTheDocument()
    expect(screen.getByText(/Preparing resume evidence|Understanding job requirements/i)).toBeInTheDocument()
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

    // A high-risk rewrite is flagged for review but Accept is a warning, not a blocker.
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    const acceptButton = screen.getByRole('button', { name: 'Accept' })
    expect(acceptButton).not.toBeDisabled()

    // Clicking Accept opens a confirmation instead of accepting silently.
    fireEvent.click(acceptButton)
    expect(screen.getByText(/Accept anyway\?/i)).toBeInTheDocument()
    expect(screen.queryByText('Accepted')).not.toBeInTheDocument()
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

  describe('Accept/Reject/Edit interaction (rewrite approvals)', () => {
    const riskyRewrite = {
      originalText: 'Built responsive React interfaces.',
      rewrittenText: 'Improved adoption by 40% across the platform.',
      evidenceId: 'ev-001',
      validation: { valid: false, flags: ['invented-metric'], riskStatus: 'high', needsReview: true },
    }
    const safeRewrite = {
      originalText: 'Built responsive React interfaces.',
      rewrittenText: 'Built responsive React interfaces.',
      evidenceId: 'ev-002',
      validation: { valid: true, flags: [], riskStatus: 'low', needsReview: false },
    }

    const buildRewriteResult = (rewrites, { jobId = 'job-01', jobTitle = 'SAP Controlling Analyst', score = 60 } = {}) => ({
      overallStatus: 'complete',
      totalDurationMs: 1200,
      partial: false,
      recommendations: [{ jobId, jobTitle, recommendationLabel: 'strong fit', score }],
      recurringGaps: [],
      rankedJobs: [
        {
          jobId,
          jobTitle,
          jobDescription: 'Short description.',
          rank: 1,
          score,
          recommendationLabel: 'strong fit',
          mandatoryGaps: [],
          status: 'succeeded',
          result: {
            partial: false,
            workers: [
              { name: 'supervisor', status: 'succeeded', output: {} },
              { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
              { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
              { name: 'bulletRewrite', status: 'succeeded', output: { rewrites } },
            ],
          },
        },
      ],
    })

    it('a review rewrite keeps Accept enabled and opens a confirmation on click', () => {
      render(<ResultsPanel result={buildRewriteResult([riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      const acceptButton = screen.getByRole('button', { name: 'Accept' })
      expect(acceptButton).not.toBeDisabled()

      fireEvent.click(acceptButton)
      expect(screen.getByRole('button', { name: /accept anyway/i })).toBeInTheDocument()
      expect(screen.getByText(/Accept anyway\?/i)).toBeInTheDocument()
      expect(screen.queryByText('Accepted')).not.toBeInTheDocument()
    })

    it('Cancel on the confirmation does not accept the rewrite', () => {
      render(<ResultsPanel result={buildRewriteResult([riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

      expect(screen.queryByText('Accepted')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    })

    it('Accept anyway accepts the current text and adds it to the preview', () => {
      render(<ResultsPanel result={buildRewriteResult([riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
      fireEvent.click(screen.getByRole('button', { name: /accept anyway/i }))

      expect(screen.getByText('Accepted')).toBeInTheDocument()
      expect(screen.getByText(riskyRewrite.rewrittenText, { selector: 'pre' })).toBeInTheDocument()
    })

    it('Reject is always clickable for a risky rewrite and updates the card immediately', () => {
      render(<ResultsPanel result={buildRewriteResult([riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      const rejectButton = screen.getByRole('button', { name: /reject/i })
      expect(rejectButton).not.toBeDisabled()

      fireEvent.click(rejectButton)

      expect(screen.getByText('Rejected')).toBeInTheDocument()
      // Rejecting again is idempotent — still exactly one "Rejected" badge.
      fireEvent.click(rejectButton)
      expect(screen.getAllByText('Rejected')).toHaveLength(1)
    })

    it('rejected content never appears in the Approved Content Preview', () => {
      render(<ResultsPanel result={buildRewriteResult([riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: /reject/i }))

      expect(screen.getByText(/Accept one or more rewrites above/i)).toBeInTheDocument()
      // The rewrite's text still legitimately appears in its own card — only
      // the Approved Content Preview (a <pre>) must never contain it.
      expect(screen.queryByText(riskyRewrite.rewrittenText, { selector: 'pre' })).not.toBeInTheDocument()
    })

    it('a safe rewrite (needsReview=false) has both Accept and Reject enabled, and Accept works', () => {
      render(<ResultsPanel result={buildRewriteResult([safeRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      const acceptButton = screen.getByRole('button', { name: /accept/i })
      const rejectButton = screen.getByRole('button', { name: /reject/i })
      expect(acceptButton).not.toBeDisabled()
      expect(rejectButton).not.toBeDisabled()

      fireEvent.click(acceptButton)
      expect(screen.getByText('Accepted')).toBeInTheDocument()
    })

    it('accepted text appears in the Approved Content Preview', () => {
      render(<ResultsPanel result={buildRewriteResult([safeRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: /accept/i }))

      expect(screen.getByText(safeRewrite.rewrittenText, { selector: 'pre' })).toBeInTheDocument()
    })

    it('editing a risky rewrite to a safe one shows "Review updated" and clears Needs review', async () => {
      render(<ResultsPanel result={buildRewriteResult([riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Built responsive React interfaces for internal tools.' } })
      fireEvent.click(screen.getByRole('button', { name: /save edit/i }))

      // Visible revalidation feedback after the edit.
      await waitFor(() => expect(screen.getByText('Review updated')).toBeInTheDocument())
      expect(screen.queryByText('Needs review')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled()
    })

    it('editing a risky rewrite that stays risky shows "Review recommended" and keeps Accept enabled (warning, not blocker)', async () => {
      render(<ResultsPanel result={buildRewriteResult([riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Built responsive React interfaces, boosting performance by 25%.' } })
      fireEvent.click(screen.getByRole('button', { name: /save edit/i }))

      await waitFor(() => expect(screen.getByText('Review recommended')).toBeInTheDocument())
      expect(screen.getByText('Needs review')).toBeInTheDocument()
      // The validator warns but never blocks acceptance.
      expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled()
    })

    it('accepts the EDITED text, not the original generated rewrite', async () => {
      render(<ResultsPanel result={buildRewriteResult([riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Built responsive React interfaces for internal tools.' } })
      fireEvent.click(screen.getByRole('button', { name: /save edit/i }))
      await waitFor(() => expect(screen.getByText('Review updated')).toBeInTheDocument())

      // Edited text is now safe → Accept adds it directly (no confirmation).
      fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
      expect(screen.getByText('Built responsive React interfaces for internal tools.', { selector: 'pre' })).toBeInTheDocument()
      expect(screen.queryByText(riskyRewrite.rewrittenText, { selector: 'pre' })).not.toBeInTheDocument()
    })

    it('Cancel Edit restores the original generated rewrite text', () => {
      render(<ResultsPanel result={buildRewriteResult([safeRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Something totally different.' } })
      fireEvent.click(screen.getByRole('button', { name: /cancel edit/i }))

      // The text now appears in both the Original and Suggested Rewrite sections.
      expect(screen.getAllByText(safeRewrite.rewrittenText).length).toBeGreaterThan(0)
      expect(screen.queryByText('Something totally different.')).not.toBeInTheDocument()
    })

    it('approval state is kept separate per job — accepting in one job does not affect another', () => {
      const jobOneRewrite = { ...safeRewrite, evidenceId: 'ev-001' }
      const jobTwoRewrite = { ...safeRewrite, evidenceId: 'ev-001', rewrittenText: 'Developed Node.js APIs.' }

      const result = {
        overallStatus: 'complete',
        totalDurationMs: 1200,
        partial: false,
        recommendations: [],
        recurringGaps: [],
        rankedJobs: [
          buildRewriteResult([jobOneRewrite], { jobId: 'job-01', jobTitle: 'Frontend Role' }).rankedJobs[0],
          { ...buildRewriteResult([jobTwoRewrite], { jobId: 'job-02', jobTitle: 'Backend Role' }).rankedJobs[0], rank: 2 },
        ],
      }

      render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getByRole('button', { name: /accept/i }))
      expect(screen.getByText('Accepted')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /backend role/i }))
      expect(screen.queryByText('Accepted')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /frontend role/i }))
      expect(screen.getByText('Accepted')).toBeInTheDocument()
    })

    it('exported JSON contains the approval decisions keyed by evidenceId, never by array index', async () => {
      let capturedBlob = null
      const originalCreateObjectURL = window.URL.createObjectURL
      const originalRevokeObjectURL = window.URL.revokeObjectURL
      window.URL.createObjectURL = (blob) => {
        capturedBlob = blob
        return 'blob:mock-url'
      }
      window.URL.revokeObjectURL = () => {}
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

      render(<ResultsPanel result={buildRewriteResult([safeRewrite, riskyRewrite])} isLoading={false} error="" onStartOver={() => {}} />)

      fireEvent.click(screen.getAllByRole('button', { name: /accept/i })[0])
      fireEvent.click(screen.getAllByRole('button', { name: /reject/i })[1])
      fireEvent.click(screen.getByRole('button', { name: /export json/i }))

      expect(capturedBlob).not.toBeNull()
      const payload = JSON.parse(await capturedBlob.text())

      expect(Object.keys(payload.approvals).sort()).toEqual(['ev-001', 'ev-002'])
      expect(payload.approvals['ev-002']).toEqual({ status: 'accepted', text: safeRewrite.rewrittenText })
      expect(payload.approvals['ev-001']).toEqual({ status: 'rejected', text: riskyRewrite.rewrittenText })
      // No array-index keys ('0', '1', ...) anywhere in the approvals map.
      Object.keys(payload.approvals).forEach((key) => expect(key).not.toMatch(/^\d+$/))

      clickSpy.mockRestore()
      window.URL.createObjectURL = originalCreateObjectURL
      window.URL.revokeObjectURL = originalRevokeObjectURL
    })

    it('shows the existing empty-state message when nothing has been accepted', () => {
      render(<ResultsPanel result={buildRewriteResult([safeRewrite])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.getByText(/Accept one or more rewrites above to build your approved content preview\./i)).toBeInTheDocument()
    })
  })

  describe('Rewrite review clarity (labels, explanations, edit)', () => {
    const withRewrites = (rewrites) => ({
      overallStatus: 'complete',
      totalDurationMs: 1200,
      partial: false,
      recommendations: [],
      recurringGaps: [],
      rankedJobs: [
        {
          jobId: 'job-01',
          jobTitle: 'Frontend Engineer',
          jobDescription: 'Short description.',
          rank: 1,
          score: 70,
          recommendationLabel: 'good fit',
          mandatoryGaps: [],
          status: 'succeeded',
          result: {
            partial: false,
            workers: [
              { name: 'supervisor', status: 'succeeded', output: {} },
              { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
              { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
              { name: 'bulletRewrite', status: 'succeeded', output: { rewrites } },
            ],
          },
        },
      ],
    })

    const safeR = {
      originalText: 'Built responsive React interfaces.',
      rewrittenText: 'Built responsive React interfaces.',
      evidenceId: 'ev-safe',
      validation: { valid: true, flags: [], riskStatus: 'low', needsReview: false },
    }
    const metricR = {
      originalText: 'Built responsive React interfaces.',
      rewrittenText: 'Improved adoption by 40% across the platform.',
      evidenceId: 'ev-metric',
      validation: { valid: false, flags: ['invented-metric'], riskStatus: 'high', needsReview: true },
    }
    const skillR = {
      originalText: 'Built React interfaces.',
      rewrittenText: 'Built React interfaces using TypeScript.',
      evidenceId: 'ev-skill',
      validation: { valid: false, flags: ['unsupported-skill-or-tool'], riskStatus: 'medium', needsReview: true },
    }
    // Safe (needsReview=false) but flagged as not a meaningful improvement.
    const noImprovementR = {
      originalText: 'Built responsive React interfaces.',
      rewrittenText: 'Built responsive React interfaces.',
      evidenceId: 'ev-noimp',
      validation: { valid: true, flags: [], riskStatus: 'low', needsReview: false },
      rewriteQualityStatus: 'no-meaningful-improvement',
    }

    const renderPanel = (rewrites) =>
      render(<ResultsPanel result={withRewrites(rewrites)} isLoading={false} error="" onStartOver={() => {}} />)

    it('renders the Original and Suggested Rewrite labels', () => {
      renderPanel([safeR])
      expect(screen.getByText('Original')).toBeInTheDocument()
      expect(screen.getByText('Suggested Rewrite')).toBeInTheDocument()
    })

    it('shows one review card (not verbose paragraphs); raw code + message live in collapsed Validation details', () => {
      renderPanel([skillR]) // invented tool "TypeScript" → high risk
      expect(screen.getByText('Review required')).toBeInTheDocument()
      // The detailed human message is inside the collapsed disclosure, not the primary card body.
      expect(screen.getByText(/Added skill or tool is not supported/i).closest('details')).not.toBeNull()
      // The raw code is only inside the disclosure.
      expect(screen.getByText('unsupported-skill-or-tool').closest('details')).not.toBeNull()
      // No verbose "Unsupported addition: ..." in the primary UI.
      expect(screen.queryByText(/Unsupported addition:/i)).not.toBeInTheDocument()
    })

    it('shows the review card for an invented metric with the raw code hidden in details', () => {
      renderPanel([metricR])
      expect(screen.getByText('Review required')).toBeInTheDocument()
      expect(screen.getByText('invented-metric').closest('details')).not.toBeNull()
      expect(screen.getByText(/introduces or changes a metric/i).closest('details')).not.toBeNull()
    })

    it('does not show raw validation codes in the primary UI', () => {
      renderPanel([metricR])
      // No visible list item or badge equal to the raw code outside <details>.
      const codeNodes = screen.getAllByText('invented-metric')
      codeNodes.forEach((node) => expect(node.closest('details')).not.toBeNull())
    })

    it('shows the review card but keeps Accept enabled (warning, not blocker)', () => {
      renderPanel([metricR])
      expect(screen.getByText('Review required')).toBeInTheDocument()
      const accept = screen.getByRole('button', { name: 'Accept' })
      expect(accept).not.toBeDisabled()
    })

    it('keeps the Original text unchanged and visible while editing the suggested rewrite', () => {
      renderPanel([metricR])
      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
      // Original still shown, read-only (not a textbox).
      expect(screen.getByText(metricR.originalText)).toBeInTheDocument()
      // The editable field holds the suggested rewrite, not the original.
      expect(screen.getByRole('textbox')).toHaveValue(metricR.rewrittenText)
    })

    it('editing to resolve the issue shows "Review updated" and clears Needs review', async () => {
      renderPanel([metricR])
      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Built responsive React interfaces for internal tools.' } })
      fireEvent.click(screen.getByRole('button', { name: /save edit/i }))

      await waitFor(() => expect(screen.getByText('Review updated')).toBeInTheDocument())
      expect(screen.queryByText('Needs review')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled()
    })

    it('updates the validation details after an edit changes the failure type', async () => {
      renderPanel([metricR])
      expect(screen.getByText(/introduces or changes a metric/i)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Built React interfaces using TypeScript.' } })
      fireEvent.click(screen.getByRole('button', { name: /save edit/i }))

      // Wait for the post-save state, then confirm the details reflect the new failure type.
      await waitFor(() => expect(screen.getByText(/Added skill or tool is not supported/i)).toBeInTheDocument())
      expect(screen.queryByText(/introduces or changes a metric/i)).not.toBeInTheDocument()
    })

    it('a safe rewrite shows Accept enabled and no review card', () => {
      renderPanel([safeR])
      expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled()
      expect(screen.queryByText('Review required')).not.toBeInTheDocument()
      expect(screen.queryByText('Review recommended')).not.toBeInTheDocument()
    })

    it('shows the no-meaningful-improvement message and disables Accept (Edit/Reject stay enabled)', () => {
      renderPanel([noImprovementR])

      expect(screen.getByText('No meaningful rewrite could be generated safely.')).toBeInTheDocument()
      const accept = screen.getByRole('button', { name: /accept/i })
      expect(accept).toBeDisabled()
      expect(accept).toHaveAttribute('aria-disabled', 'true')
      expect(accept).toHaveAttribute('title', 'This rewrite is not a meaningful improvement — edit it before accepting.')
      // Edit and Reject remain available.
      expect(screen.getByRole('button', { name: /reject/i })).not.toBeDisabled()
      expect(screen.getByRole('button', { name: /edit/i })).not.toBeDisabled()
    })

    it('lets the user edit a no-improvement rewrite to enable Accept', async () => {
      renderPanel([noImprovementR])
      fireEvent.click(screen.getByRole('button', { name: /edit/i }))
      // Edit to a safe (generic-word) sentence so anti-fabrication passes.
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Built responsive React interfaces for internal tools.' } })
      fireEvent.click(screen.getByRole('button', { name: /save edit/i }))

      // After save completes, Accept is enabled and the no-improvement note is gone.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled())
      expect(screen.queryByText('No meaningful rewrite could be generated safely.')).not.toBeInTheDocument()
    })

    it('does not let Accept fire for an unchanged (no-improvement) rewrite', () => {
      renderPanel([noImprovementR])
      fireEvent.click(screen.getByRole('button', { name: /accept/i }))
      // Disabled Accept never registers → nothing gets added to Approved Content.
      expect(screen.getByText(/Accept one or more rewrites above/i)).toBeInTheDocument()
    })
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
