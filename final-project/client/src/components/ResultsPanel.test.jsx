import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ResultsPanel from './ResultsPanel.jsx'
import { exportResumeDocx, generateInterviewQuestions } from '../services/api.js'

// ResultsPanel imports these from the api module; mock them so export + interview
// tests never hit the network.
vi.mock('../services/api.js', () => ({ exportResumeDocx: vi.fn(), generateInterviewQuestions: vi.fn() }))

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

  it('lays out the New Analysis / Compare Jobs header responsively (stacks + wraps, never clipped)', () => {
    const result = {
      overallStatus: 'complete',
      totalDurationMs: 1200,
      partial: false,
      recommendations: [],
      recurringGaps: [],
      rankedJobs: [
        { jobId: 'job-01', jobTitle: 'Frontend Engineer', jobDescription: 'd', rank: 1, score: 90, recommendationLabel: 'strong fit', mandatoryGaps: [], status: 'succeeded', result: { workers: [] } },
        { jobId: 'job-02', jobTitle: 'Backend Engineer', jobDescription: 'd', rank: 2, score: 70, recommendationLabel: 'good fit', mandatoryGaps: [], status: 'succeeded', result: { workers: [] } },
      ],
    }

    render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

    const newAnalysisButton = screen.getByRole('button', { name: /new analysis/i })
    const compareButton = screen.getByRole('button', { name: /compare jobs/i })
    // Both stay reachable — not just present but not display:none/hidden.
    expect(newAnalysisButton).toBeVisible()
    expect(compareButton).toBeVisible()

    // The header stacks on narrow screens and its action row wraps instead of
    // clipping — never a fixed-width row that forces horizontal overflow.
    const header = newAnalysisButton.closest('header')
    expect(header.className).toMatch(/flex-col/)
    expect(header.className).toMatch(/sm:flex-row/)
    const actionRow = newAnalysisButton.parentElement
    expect(actionRow.className).toMatch(/flex-wrap/)
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
      fireEvent.click(screen.getByRole('button', { name: /^json$/i }))

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

  describe('Enhanced DOCX export', () => {
    const safeRewrite = {
      originalText: 'Built responsive React interfaces.',
      rewrittenText: 'Built responsive React interfaces for internal tools.',
      evidenceId: 'ev-001',
      validation: { valid: true, flags: [], riskStatus: 'low', needsReview: false },
    }

    const docxStructure = [
      { type: 'heading', level: 1, text: 'Jane Doe', evidenceId: 'ev-000' },
      { type: 'listItem', text: 'Built responsive React interfaces.', evidenceId: 'ev-001' },
    ]

    const resultWith = (rewrites) => ({
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
          score: 80,
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

    beforeEach(() => {
      exportResumeDocx.mockReset()
    })

    it('does not show the Download DOCX button without a DOCX structure', () => {
      render(<ResultsPanel result={resultWith([safeRewrite])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.queryByRole('button', { name: /download docx/i })).not.toBeInTheDocument()
    })

    it('keeps the Download DOCX button disabled until a rewrite is accepted', () => {
      render(
        <ResultsPanel
          result={resultWith([safeRewrite])}
          resumeStructure={docxStructure}
          candidateName="resume.docx"
          isLoading={false}
          error=""
          onStartOver={() => {}}
        />,
      )

      expect(screen.getByRole('button', { name: /download docx/i })).toBeDisabled()
      fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
      expect(screen.getByRole('button', { name: /download docx/i })).not.toBeDisabled()
    })

    it('shows the button for a DOCX source and downloads with accepted rewrites applied by evidenceId', async () => {
      const originalCreateObjectURL = window.URL.createObjectURL
      const originalRevokeObjectURL = window.URL.revokeObjectURL
      window.URL.createObjectURL = () => 'blob:mock-url'
      window.URL.revokeObjectURL = () => {}
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      exportResumeDocx.mockResolvedValue(new Blob(['docx'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))

      render(
        <ResultsPanel
          result={resultWith([safeRewrite])}
          resumeStructure={docxStructure}
          candidateName="resume.docx"
          isLoading={false}
          error=""
          onStartOver={() => {}}
        />,
      )

      // Accept the rewrite so it becomes a replacement.
      fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

      const downloadButton = screen.getByRole('button', { name: /download docx/i })
      fireEvent.click(downloadButton)

      await waitFor(() => expect(screen.getByText(/Enhanced DOCX downloaded\./i)).toBeInTheDocument())

      expect(exportResumeDocx).toHaveBeenCalledTimes(1)
      const callArg = exportResumeDocx.mock.calls[0][0]
      expect(callArg.structure).toEqual(docxStructure)
      // Only the accepted evidenceId maps to a replacement — never the heading.
      expect(callArg.replacements).toEqual({ 'ev-001': safeRewrite.rewrittenText })
      expect(clickSpy).toHaveBeenCalled()

      clickSpy.mockRestore()
      window.URL.createObjectURL = originalCreateObjectURL
      window.URL.revokeObjectURL = originalRevokeObjectURL
    })

    it('shows a generating state and disables the button while a download is in flight', async () => {
      let resolveExport
      exportResumeDocx.mockReturnValue(new Promise((resolve) => { resolveExport = resolve }))

      render(
        <ResultsPanel
          result={resultWith([safeRewrite])}
          resumeStructure={docxStructure}
          candidateName="resume.docx"
          isLoading={false}
          error=""
          onStartOver={() => {}}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
      fireEvent.click(screen.getByRole('button', { name: /download docx/i }))

      const generatingButton = screen.getByRole('button', { name: /generating/i })
      expect(generatingButton).toBeDisabled()
      expect(generatingButton).toHaveAttribute('aria-busy', 'true')

      // A duplicate click while generating must not trigger a second request.
      fireEvent.click(generatingButton)
      expect(exportResumeDocx).toHaveBeenCalledTimes(1)

      resolveExport(new Blob(['docx']))
    })

    it('shows an error message when the export request fails', async () => {
      exportResumeDocx.mockRejectedValue(new Error('Server exploded'))

      render(
        <ResultsPanel
          result={resultWith([safeRewrite])}
          resumeStructure={docxStructure}
          candidateName="resume.docx"
          isLoading={false}
          error=""
          onStartOver={() => {}}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
      fireEvent.click(screen.getByRole('button', { name: /download docx/i }))

      await waitFor(() => expect(screen.getByText('Server exploded')).toBeInTheDocument())
    })
  })

  describe('Interview Preparation', () => {
    const safeRewrite = {
      originalText: 'Built responsive React interfaces.',
      rewrittenText: 'Built responsive React interfaces for internal tools.',
      evidenceId: 'ev-001',
      validation: { valid: true, flags: [], riskStatus: 'low', needsReview: false },
    }

    const resultWith = (rewrites) => ({
      overallStatus: 'complete',
      totalDurationMs: 1200,
      partial: false,
      recommendations: [],
      recurringGaps: [],
      rankedJobs: [
        {
          jobId: 'job-01',
          jobTitle: 'Frontend Engineer',
          jobDescription: 'Build React apps. Kubernetes required.',
          rank: 1,
          score: 80,
          recommendationLabel: 'strong fit',
          mandatoryGaps: ['Kubernetes'],
          status: 'succeeded',
          result: {
            partial: false,
            workers: [
              { name: 'supervisor', status: 'succeeded', output: {} },
              { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [{ skill: 'React', status: 'matched' }] } },
              { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [{ keyword: 'TypeScript' }] } },
              { name: 'bulletRewrite', status: 'succeeded', output: { rewrites } },
            ],
          },
        },
      ],
    })

    const normalizedResume = { originalText: 'x', evidence: [{ id: 'ev-001', text: 'Built responsive React interfaces.' }] }

    const sampleQuestions = {
      questions: [
        { id: 'iq-001', category: 'resume', difficulty: 'standard', question: 'Tell me about your React work.', whyThisQuestion: 'Grounded in your resume evidence.', evidenceIds: ['ev-001'] },
        { id: 'iq-002', category: 'gap', difficulty: 'standard', question: 'How would you approach Kubernetes?', whyThisQuestion: 'Kubernetes is a mandatory gap.', evidenceIds: [], relatedRequirement: 'Kubernetes' },
      ],
    }

    beforeEach(() => {
      generateInterviewQuestions.mockReset()
    })

    const renderPanel = () =>
      render(<ResultsPanel result={resultWith([safeRewrite])} normalizedResume={normalizedResume} isLoading={false} error="" onStartOver={() => {}} />)

    it('shows the Generate button after analysis and makes NO API call before click', () => {
      renderPanel()
      expect(screen.getByRole('button', { name: /generate interview questions/i })).toBeInTheDocument()
      expect(generateInterviewQuestions).not.toHaveBeenCalled()
    })

    it('honors the 5/10 count and difficulty selectors in the request payload', async () => {
      generateInterviewQuestions.mockResolvedValue(sampleQuestions)
      renderPanel()

      fireEvent.change(screen.getByLabelText('Question count'), { target: { value: '10' } })
      fireEvent.change(screen.getByLabelText('Difficulty'), { target: { value: 'challenging' } })
      fireEvent.click(screen.getByRole('button', { name: /generate interview questions/i }))

      await waitFor(() => expect(generateInterviewQuestions).toHaveBeenCalledTimes(1))
      const payload = generateInterviewQuestions.mock.calls[0][0]
      expect(payload.count).toBe(10)
      expect(payload.difficulty).toBe('challenging')
      expect(payload.job.title).toBe('Frontend Engineer')
      expect(payload.analysis.mandatoryGaps).toContain('Kubernetes')
      expect(payload.resumeEvidence).toEqual([{ id: 'ev-001', text: 'Built responsive React interfaces.' }])
    })

    it('renders returned questions and expands "Why this question?" on click', async () => {
      generateInterviewQuestions.mockResolvedValue(sampleQuestions)
      renderPanel()

      fireEvent.click(screen.getByRole('button', { name: /generate interview questions/i }))
      await waitFor(() => expect(screen.getByText('Tell me about your React work.')).toBeInTheDocument())

      // Collapsed by default (content stays mounted for the animation, so we
      // assert the accessible expanded state rather than presence).
      const whyBtn = screen.getAllByRole('button', { name: /why this question/i })[0]
      expect(whyBtn).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(whyBtn)
      expect(whyBtn).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Grounded in your resume evidence.')).toBeInTheDocument()
    })

    it('shows a deterministic STAR answer framework on demand', async () => {
      generateInterviewQuestions.mockResolvedValue(sampleQuestions)
      renderPanel()
      fireEvent.click(screen.getByRole('button', { name: /generate interview questions/i }))
      await waitFor(() => expect(screen.getByText('Tell me about your React work.')).toBeInTheDocument())

      const fwBtn = screen.getAllByRole('button', { name: /show answer framework/i })[0]
      expect(fwBtn).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(fwBtn)
      expect(fwBtn).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Use the project referenced by evidence ev-001.')).toBeInTheDocument()
    })

    it('shows a busy loading state and disables duplicate clicks while generating', async () => {
      let resolve
      generateInterviewQuestions.mockReturnValue(new Promise((r) => { resolve = r }))
      renderPanel()

      fireEvent.click(screen.getByRole('button', { name: /generate interview questions/i }))
      const generating = screen.getByRole('button', { name: /preparing/i })
      expect(generating).toBeDisabled()
      // A live, busy region reassures the user work is happening (not stuck).
      const liveRegion = screen.getByRole('status', { busy: true })
      expect(liveRegion).toHaveAttribute('aria-live', 'polite')
      expect(liveRegion).toHaveTextContent(/reviewing the job requirements/i)
      // The option selects are disabled too, so the whole card reads as busy.
      expect(screen.getByLabelText('Question count')).toBeDisabled()
      expect(screen.getByLabelText('Difficulty')).toBeDisabled()

      fireEvent.click(generating)
      expect(generateInterviewQuestions).toHaveBeenCalledTimes(1)
      resolve(sampleQuestions)
    })

    it('shows skeleton placeholders (matching the requested count, capped) while generating', async () => {
      generateInterviewQuestions.mockReturnValue(new Promise(() => {})) // never resolves
      renderPanel()
      fireEvent.click(screen.getByRole('button', { name: /generate interview questions/i }))

      const liveRegion = screen.getByRole('status', { busy: true })
      // 3 skeleton placeholder cards (capped) rendered inside the busy region.
      expect(liveRegion.querySelectorAll('.status-dot-pulse').length).toBeGreaterThanOrEqual(3)
    })

    it('cycles the loading message over time instead of a single static string', async () => {
      vi.useFakeTimers()
      try {
        generateInterviewQuestions.mockReturnValue(new Promise(() => {})) // never resolves
        renderPanel()
        fireEvent.click(screen.getByRole('button', { name: /generate interview questions/i }))

        expect(screen.getByRole('status', { busy: true })).toHaveTextContent(/reviewing the job requirements/i)
        act(() => {
          vi.advanceTimersByTime(2000)
        })
        expect(screen.getByRole('status', { busy: true })).toHaveTextContent(/cross-referencing your resume evidence/i)
      } finally {
        vi.useRealTimers()
      }
    })

    it('shows an error message when generation fails', async () => {
      generateInterviewQuestions.mockRejectedValue(new Error('nope'))
      renderPanel()
      fireEvent.click(screen.getByRole('button', { name: /generate interview questions/i }))
      await waitFor(() => expect(screen.getByText(/could not be generated right now/i)).toBeInTheDocument())
    })
  })

  describe('Why this score? explanation', () => {
    const explanation = (overrides = {}) => ({
      summary: "Your resume strongly matches the role's React and TypeScript requirements. The score is mainly reduced by missing or weak evidence for CSS and Flutter.",
      components: {
        mandatory: { coverage: 48, count: 4 },
        preferred: { coverage: 62, count: 3 },
        contextual: { coverage: 55, count: 2 },
        ats: { coverage: 58, count: 10 },
      },
      strongMatches: [
        { requirement: 'React', evidenceIds: ['ev-001'] },
        { requirement: 'TypeScript', evidenceIds: ['ev-002'] },
      ],
      deductions: [
        { requirement: 'CSS', status: 'missing', requirementType: 'mandatory', reason: 'No supporting resume evidence' },
        { requirement: 'Flutter', status: 'missing', requirementType: 'preferred', reason: 'No supporting resume evidence' },
      ],
      capsApplied: [
        { code: 'MANDATORY_COVERAGE_BELOW_50', description: 'Because fewer than half of the mandatory requirements were supported by resume evidence, the score was capped at 59.' },
      ],
      requirements: [
        { requirement: 'React', requirementType: 'mandatory', status: 'matched', evidenceIds: ['ev-001'] },
        { requirement: 'CSS', requirementType: 'mandatory', status: 'missing', evidenceIds: [] },
        { requirement: 'Flutter', requirementType: 'preferred', status: 'missing', evidenceIds: [] },
      ],
      ...overrides,
    })

    const jobWith = ({ jobId = 'job-01', jobTitle = 'Frontend Engineer', score = 40, mandatoryGaps = ['CSS'], scoreExplanation }) => ({
      jobId,
      jobTitle,
      jobDescription: 'Build UI.',
      rank: 1,
      score,
      recommendationLabel: 'low fit',
      mandatoryGaps,
      scoreExplanation,
      status: 'succeeded',
      result: {
        workers: [
          { name: 'supervisor', status: 'succeeded', output: {} },
          { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
          { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
          { name: 'bulletRewrite', status: 'succeeded', output: { rewrites: [] } },
        ],
      },
    })

    const resultOf = (jobs) => ({
      overallStatus: 'complete',
      totalDurationMs: 1000,
      partial: false,
      recommendations: [],
      recurringGaps: [],
      rankedJobs: jobs,
    })

    it('renders the "Why this score?" disclosure with aria-expanded', () => {
      render(<ResultsPanel result={resultOf([jobWith({ scoreExplanation: explanation() })])} isLoading={false} error="" onStartOver={() => {}} />)
      const disclosure = screen.getByRole('button', { name: /why this score/i })
      expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(disclosure)
      expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    })

    it('shows the deterministic summary and correct component values', () => {
      render(<ResultsPanel result={resultOf([jobWith({ scoreExplanation: explanation() })])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.getByText(/strongly matches the role's React and TypeScript/i)).toBeInTheDocument()
      expect(screen.getByText('Mandatory requirements')).toBeInTheDocument()
      expect(screen.getByText('48%')).toBeInTheDocument()
      expect(screen.getByText('62%')).toBeInTheDocument()
      expect(screen.getByText('58%')).toBeInTheDocument()
    })

    it('shows deductions and the cap explanation when a cap applied', () => {
      render(<ResultsPanel result={resultOf([jobWith({ scoreExplanation: explanation() })])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.getByText('Score deductions')).toBeInTheDocument()
      expect(screen.getAllByText('CSS').length).toBeGreaterThan(0)
      expect(screen.getByText(/capped at 59/i)).toBeInTheDocument()
    })

    it('shows no cap section when no cap was applied', () => {
      render(<ResultsPanel result={resultOf([jobWith({ score: 82, scoreExplanation: explanation({ capsApplied: [] }) })])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.queryByText(/capped at/i)).not.toBeInTheDocument()
      expect(screen.queryByText('Score cap')).not.toBeInTheDocument()
    })

    it('mandatory gaps are consistent with the explanation (each gap appears in requirements)', () => {
      render(<ResultsPanel result={resultOf([jobWith({ mandatoryGaps: ['CSS'], scoreExplanation: explanation() })])} isLoading={false} error="" onStartOver={() => {}} />)
      // Expand "Why this score?" (its panel is aria-hidden until opened), then
      // the full requirements list.
      fireEvent.click(screen.getByRole('button', { name: /why this score/i }))
      fireEvent.click(screen.getByRole('button', { name: /view all requirements/i }))
      // 'CSS' (the mandatory gap) is present in the requirements breakdown.
      expect(screen.getAllByText('CSS').length).toBeGreaterThan(0)
    })

    it('updates the explanation when switching selected jobs', () => {
      const job1 = jobWith({ jobId: 'job-01', jobTitle: 'Frontend Engineer', scoreExplanation: explanation() })
      const job2 = jobWith({
        jobId: 'job-02',
        jobTitle: 'Backend Engineer',
        rank: 2,
        mandatoryGaps: ['Go'],
        scoreExplanation: explanation({
          components: {
            mandatory: { coverage: 12, count: 3 },
            preferred: { coverage: 20, count: 2 },
            contextual: { coverage: 0, count: 0 },
            ats: { coverage: 25, count: 5 },
          },
          capsApplied: [],
        }),
      })
      render(<ResultsPanel result={resultOf([job1, job2])} isLoading={false} error="" onStartOver={() => {}} />)

      // job-01 selected by default.
      expect(screen.getByText('48%')).toBeInTheDocument()
      // Switch to job-02 → its distinct component value appears, stale one gone.
      fireEvent.click(screen.getByRole('button', { name: /backend engineer/i }))
      expect(screen.getByText('12%')).toBeInTheDocument()
      expect(screen.queryByText('48%')).not.toBeInTheDocument()
    })
  })

  describe('Application Readiness & Priority Actions', () => {
    const readinessOf = (overrides = {}) => ({
      status: 'ready_with_improvements',
      label: 'Ready With Improvements',
      summary: 'Strong core alignment, but one critical mandatory gap should be addressed before applying.',
      metrics: { matchScore: 76, mandatoryCoverage: 82, preferredCoverage: 70, atsCoverage: 74, criticalGapCount: 1 },
      ...overrides,
    })

    const actionsOf = (overrides) =>
      overrides || [
        { priority: 1, type: 'critical_gap', title: 'AWS', severity: 'high', reason: 'Mandatory requirement with no supporting resume evidence.', evidenceIds: [], action: 'Do not claim AWS unless you genuinely have that experience. If you have related experience, surface it more clearly in your resume.' },
        { priority: 2, type: 'strengthen_evidence', title: 'TypeScript', severity: 'medium', reason: 'Some supporting evidence exists, but coverage is partial.', evidenceIds: ['ev-014'], action: 'Strengthen the existing bullet instead of adding unsupported experience.' },
        { priority: 3, type: 'keyword_opportunity', title: 'CI/CD', severity: 'opportunity', reason: 'Your resume contains related evidence but does not clearly use terminology from the job posting.', evidenceIds: ['ev-003'], action: 'Consider incorporating "CI/CD" into an existing evidence-supported bullet.' },
      ]

    const jobWith = ({ jobId = 'job-01', jobTitle = 'Frontend Engineer', score = 76, readiness, priorityActions }) => ({
      jobId,
      jobTitle,
      jobDescription: 'Build UI.',
      rank: 1,
      score,
      recommendationLabel: 'good fit',
      mandatoryGaps: ['AWS'],
      readiness,
      priorityActions,
      status: 'succeeded',
      result: {
        workers: [
          { name: 'supervisor', status: 'succeeded', output: {} },
          { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
          { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
          { name: 'bulletRewrite', status: 'succeeded', output: { rewrites: [] } },
        ],
      },
    })

    const resultOf = (jobs) => ({ overallStatus: 'complete', totalDurationMs: 1000, partial: false, recommendations: [], recurringGaps: [], rankedJobs: jobs })

    it('renders the Application Readiness card with its status label and metrics', () => {
      render(<ResultsPanel result={resultOf([jobWith({ readiness: readinessOf(), priorityActions: actionsOf() })])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.getByText('Application Readiness')).toBeInTheDocument()
      expect(screen.getByText('Ready With Improvements')).toBeInTheDocument()
      expect(screen.getByText('82%')).toBeInTheDocument() // mandatory coverage
      expect(screen.getByText('74%')).toBeInTheDocument() // ATS coverage
      expect(screen.getByText(/one critical mandatory gap should be addressed/i)).toBeInTheDocument()
    })

    it('renders Priority Actions, showing the first 3 by default with a "View all actions" control', () => {
      const actions = [
        ...actionsOf(),
        { priority: 4, type: 'preferred_gap', title: 'Figma', severity: 'medium', reason: 'Preferred requirement with no supporting resume evidence.', evidenceIds: [], action: 'Do not claim Figma unless you genuinely have that experience. Highlight related experience if you have it.' },
      ]
      render(<ResultsPanel result={resultOf([jobWith({ readiness: readinessOf(), priorityActions: actions })])} isLoading={false} error="" onStartOver={() => {}} />)

      expect(screen.getByText('Priority Actions Before Applying')).toBeInTheDocument()
      expect(screen.getByText(/1\. AWS/)).toBeInTheDocument()
      expect(screen.getByText(/2\. TypeScript/)).toBeInTheDocument()
      expect(screen.getByText(/3\. CI\/CD/)).toBeInTheDocument()
      expect(screen.queryByText(/4\. Figma/)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /view all actions/i }))
      expect(screen.getByText(/4\. Figma/)).toBeInTheDocument()
    })

    it('shows severity badges (High / Medium / Opportunity) and evidence ids where present', () => {
      render(<ResultsPanel result={resultOf([jobWith({ readiness: readinessOf(), priorityActions: actionsOf() })])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Medium')).toBeInTheDocument()
      expect(screen.getByText('Opportunity')).toBeInTheDocument()
      expect(screen.getByText(/Evidence: ev-014/)).toBeInTheDocument()
    })

    it('never renders "add" as a recommended action for an unsupported requirement', () => {
      render(<ResultsPanel result={resultOf([jobWith({ readiness: readinessOf(), priorityActions: actionsOf() })])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.getByText(/Do not claim AWS unless you genuinely have that experience/i)).toBeInTheDocument()
      expect(screen.queryByText(/^add aws/i)).not.toBeInTheDocument()
    })

    it('renders nothing for readiness/actions when the job has none (older/partial data)', () => {
      render(<ResultsPanel result={resultOf([jobWith({ readiness: undefined, priorityActions: undefined })])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.queryByText('Application Readiness')).not.toBeInTheDocument()
      expect(screen.queryByText('Priority Actions Before Applying')).not.toBeInTheDocument()
    })

    it('uses responsive, non-fixed-width layout classes (mobile-safe)', () => {
      const { container } = render(<ResultsPanel result={resultOf([jobWith({ readiness: readinessOf(), priorityActions: actionsOf() })])} isLoading={false} error="" onStartOver={() => {}} />)
      // The metrics grid stacks 2-up on mobile and 4-up from `sm:` — never a
      // fixed pixel width that could force horizontal overflow.
      const metricsGrid = Array.from(container.querySelectorAll('.grid')).find((el) => el.className.includes('sm:grid-cols-4'))
      expect(metricsGrid).toBeTruthy()
      expect(metricsGrid.className).not.toMatch(/w-\[\d/)
    })
  })

  describe('Job Comparison view', () => {
    const explanationFor = ({ mandatory, preferred, contextual, ats, strong = [], deductions = [] }) => ({
      summary: 'summary',
      components: {
        mandatory: { coverage: mandatory, count: mandatory === null ? 0 : 3 },
        preferred: { coverage: preferred, count: preferred === null ? 0 : 2 },
        contextual: { coverage: contextual, count: contextual === null ? 0 : 2 },
        ats: { coverage: ats, count: ats === null ? 0 : 5 },
      },
      strongMatches: strong.map((requirement) => ({ requirement, evidenceIds: [] })),
      deductions: deductions.map((requirement) => ({ requirement, status: 'missing', requirementType: 'preferred', reason: 'No supporting resume evidence' })),
      capsApplied: [],
      requirements: [...strong.map((r) => ({ requirement: r, requirementType: 'mandatory', status: 'matched', evidenceIds: [] }))],
    })

    const makeJob = ({ jobId, jobTitle, rank, score, mandatoryGaps = [], scoreExplanation, rewrites = [] }) => ({
      jobId,
      jobTitle,
      jobDescription: 'Build things.',
      rank,
      score,
      recommendationLabel: score >= 85 ? 'strong fit' : score >= 50 ? 'moderate fit' : 'low fit',
      mandatoryGaps,
      scoreExplanation,
      status: 'succeeded',
      result: {
        workers: [
          { name: 'supervisor', status: 'succeeded', output: {} },
          { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
          { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
          { name: 'bulletRewrite', status: 'succeeded', output: { rewrites } },
        ],
      },
    })

    const resultOf = (jobs) => ({
      overallStatus: 'complete',
      totalDurationMs: 1000,
      partial: false,
      recommendations: [],
      recurringGaps: [],
      rankedJobs: jobs,
    })

    const jobA = () =>
      makeJob({
        jobId: 'job-01',
        jobTitle: 'Frontend Engineer',
        rank: 1,
        score: 91,
        scoreExplanation: explanationFor({ mandatory: 95, preferred: 80, contextual: 70, ats: 88, strong: ['React', 'TypeScript'], deductions: ['Flutter'] }),
      })
    const jobB = () =>
      makeJob({
        jobId: 'job-02',
        jobTitle: 'Backend Engineer',
        rank: 2,
        score: 76,
        scoreExplanation: explanationFor({ mandatory: 75, preferred: 62, contextual: 55, ats: 71, strong: ['Node'], deductions: ['Kubernetes'] }),
      })
    const jobC = () =>
      makeJob({
        jobId: 'job-03',
        jobTitle: 'Platform Engineer',
        rank: 3,
        score: 58,
        scoreExplanation: explanationFor({ mandatory: 48, preferred: 55, contextual: null, ats: 64, strong: [], deductions: ['Terraform'] }),
      })

    beforeEach(() => {
      generateInterviewQuestions.mockReset()
      exportResumeDocx.mockReset()
    })

    const openCompare = (jobs) => {
      render(<ResultsPanel result={resultOf(jobs)} normalizedResume={{ originalText: 'x', evidence: [] }} isLoading={false} error="" onStartOver={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: /compare jobs/i }))
    }

    it('hides the comparison control when there is only 1 job', () => {
      render(<ResultsPanel result={resultOf([jobA()])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.queryByRole('button', { name: /compare jobs/i })).not.toBeInTheDocument()
    })

    it('shows the comparison control with 2+ jobs', () => {
      render(<ResultsPanel result={resultOf([jobA(), jobB()])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.getByRole('button', { name: /compare jobs/i })).toBeInTheDocument()
    })

    it('renders the correct jobs and scores using the existing scoreExplanation values', () => {
      openCompare([jobA(), jobB()])
      // Column headers (buttons) for each job.
      expect(screen.getByRole('button', { name: 'Frontend Engineer' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Backend Engineer' })).toBeInTheDocument()
      // Scores + coverage values come straight from scoreExplanation.
      expect(screen.getAllByText(/91 \/ 100/).length).toBeGreaterThan(0)
      expect(screen.getByText('95%')).toBeInTheDocument() // jobA mandatory
      expect(screen.getByText('80%')).toBeInTheDocument() // jobA preferred
      expect(screen.getByText('88%')).toBeInTheDocument() // jobA ats
      expect(screen.getByText('75%')).toBeInTheDocument() // jobB mandatory
    })

    it('marks exactly one Best Fit, following the existing ranking (first ranked job)', () => {
      openCompare([jobA(), jobB()])
      // Best Fit appears in the table header column, the job card, and the
      // "Why This Job Wins" card = 3 nodes, for the single top-ranked job only.
      expect(screen.getAllByText('Best Fit')).toHaveLength(3)
      // The best-fit job is the first ranked one.
      expect(screen.getByRole('button', { name: 'Frontend Engineer' })).toBeInTheDocument()
    })

    it('works with 3 jobs and handles a missing contextual category gracefully', () => {
      openCompare([jobA(), jobB(), jobC()])
      expect(screen.getByRole('button', { name: 'Platform Engineer' })).toBeInTheDocument()
      // jobC has no contextual requirements → rendered as an em dash, not 0%/NaN.
      expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    })

    it('does not make any AI/API call when opening the comparison view', () => {
      openCompare([jobA(), jobB()])
      expect(generateInterviewQuestions).not.toHaveBeenCalled()
      expect(exportResumeDocx).not.toHaveBeenCalled()
    })

    it('lets the user jump from comparison to a job\'s detailed result', () => {
      openCompare([jobA(), jobB()])
      // Jump to Backend Engineer detail via its card button.
      fireEvent.click(screen.getAllByRole('button', { name: /view detailed result/i })[1])
      // Back in individual mode: the comparison toggle resets and the detail heading shows the job.
      expect(screen.getByRole('button', { name: /compare jobs/i })).toBeInTheDocument()
      expect(screen.getAllByText('Backend Engineer').length).toBeGreaterThan(0)
    })

    it('does not clear rewrite decisions when toggling comparison', () => {
      const safeRewrite = {
        originalText: 'Built responsive React interfaces.',
        rewrittenText: 'Built responsive React interfaces for internal tools.',
        evidenceId: 'ev-001',
        validation: { valid: true, flags: [], riskStatus: 'low', needsReview: false },
      }
      const jobs = [jobA(), jobB()]
      jobs[0].result.workers.find((w) => w.name === 'bulletRewrite').output.rewrites = [safeRewrite]

      render(<ResultsPanel result={resultOf(jobs)} normalizedResume={{ originalText: 'x', evidence: [{ id: 'ev-001', text: 'Built responsive React interfaces.' }] }} isLoading={false} error="" onStartOver={() => {}} />)

      // Accept the rewrite in the individual view.
      fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
      expect(screen.getByText('Accepted')).toBeInTheDocument()

      // Toggle to comparison and back — decision must survive.
      fireEvent.click(screen.getByRole('button', { name: /compare jobs/i }))
      fireEvent.click(screen.getByRole('button', { name: /individual results/i }))
      expect(screen.getByText('Accepted')).toBeInTheDocument()
    })

    it('renders "Why This Job Wins" for the best-fit job with a comparison against the next-best role', () => {
      openCompare([jobA(), jobB()])
      expect(screen.getByText('Why this role wins')).toBeInTheDocument()
      expect(screen.getByText('Best fit among the analyzed roles')).toBeInTheDocument()
      expect(screen.getByText(/Compared with Backend Engineer/i)).toBeInTheDocument()
      // Never a "most likely to get hired"-style claim.
      expect(screen.queryByText(/most likely to get hired/i)).not.toBeInTheDocument()
    })

    it('does not render a comparison explanation with only 1 job', () => {
      render(<ResultsPanel result={resultOf([jobA()])} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.queryByText('Why this role wins')).not.toBeInTheDocument()
    })
  })

  describe('Toast notifications (partial results / worker failures)', () => {
    it('shows a partial-results toast instead of a permanent inline banner', () => {
      const result = buildResult({ score: 70, jobDescription: 'Short description.', workers: [] })
      result.partial = true

      render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

      const toast = screen.getByRole('status')
      expect(screen.getByText(/Partial results available/i)).toBeInTheDocument()
      expect(toast).toHaveTextContent(/Some workers reported warnings/i)
    })

    it('shows a worker-failure toast (role=alert) instead of the old permanent diagnostics section', () => {
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

      // Two role="alert" elements now exist — the pre-existing "Bullet rewrite
      // generation failed" banner (unrelated, left untouched) and the new
      // worker-diagnostics toast. Isolate the toast by its worker-name format.
      const alerts = screen.getAllByRole('alert')
      const toast = alerts.find((el) => el.textContent.includes('bulletRewrite:'))
      expect(toast).toBeTruthy()
      expect(toast).toHaveTextContent('Ollama request timed out')

      // The old permanent section/heading is gone.
      expect(screen.queryByText('Worker Failures & Diagnostics')).not.toBeInTheDocument()
      expect(screen.queryByText(/All analysis workers completed successfully/i)).not.toBeInTheDocument()
    })

    it('does not show any toast when the result is complete with no worker failures', () => {
      const result = buildResult({
        score: 90,
        jobDescription: 'Short description.',
        workers: [
          { name: 'supervisor', status: 'succeeded', output: {} },
          { name: 'skillMatch', status: 'succeeded', output: { matchedSkills: [] } },
          { name: 'atsKeyword', status: 'succeeded', output: { keywordMatches: [] } },
          { name: 'bulletRewrite', status: 'succeeded', output: { rewrites: [] } },
        ],
      })

      render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('dismisses a toast when its close button is clicked', () => {
      const result = buildResult({ score: 70, jobDescription: 'Short description.', workers: [] })
      result.partial = true

      render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)
      expect(screen.getByText(/Partial results available/i)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /dismiss notification/i }))
      // The exit animation plays for a moment, then the toast unmounts.
      return waitFor(() => expect(screen.queryByText(/Partial results available/i)).not.toBeInTheDocument())
    })

    it('auto-dismisses a toast after its duration elapses', async () => {
      vi.useFakeTimers()
      try {
        const result = buildResult({ score: 70, jobDescription: 'Short description.', workers: [] })
        result.partial = true

        render(<ResultsPanel result={result} isLoading={false} error="" onStartOver={() => {}} />)
        expect(screen.getByText(/Partial results available/i)).toBeInTheDocument()

        act(() => {
          vi.advanceTimersByTime(7000) // past the 6.5s default duration
        })
        act(() => {
          vi.advanceTimersByTime(300) // past the exit-animation delay
        })
        expect(screen.queryByText(/Partial results available/i)).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
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
