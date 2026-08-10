import { useMemo, useState } from 'react'
import { validateRewriteIntegrity, computeNeedsReview } from '../utils/antiFabricationValidation.js'
import { explainFlags, humanizeFlag, shortLabelForFlag } from '../utils/rewriteExplanations.js'
import { splitAdditions } from '../utils/textDiff.js'
//full code
// Returns a semantic "tone" class (defined in index.css) that sets only
// background/color/border-color, so it composes with the badge's Tailwind
// sizing utilities and swaps automatically in dark mode.
function getRecommendationClass(label = '') {
  const normalized = label.toLowerCase()
  if (normalized.includes('strong')) return 'tone-strong'
  if (normalized.includes('good')) return 'tone-good'
  if (normalized.includes('moderate') || normalized.includes('stretch')) return 'tone-moderate'
  return 'tone-low'
}

// Guards against raw floating-point artifacts (e.g. 7.075000000000003)
// ever reaching the screen, regardless of how the score was computed.
function formatScore(score) {
  const numeric = Number(score)
  if (!Number.isFinite(numeric)) return '0'
  return (Math.round(numeric * 10) / 10).toString()
}

function formatDuration(ms) {
  const numeric = Number(ms)
  if (!Number.isFinite(numeric) || numeric < 0) return '0s'
  if (numeric < 1000) return `${Math.round(numeric)}ms`

  const totalSeconds = numeric / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)
  return `${minutes}m ${seconds}s`
}

function truncateText(text = '', maxLength = 140) {
  if (typeof text !== 'string' || text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}

const WORKER_STATUS_CARD_ITEMS = [
  { name: 'supervisor', label: 'Supervisor Strategic' },
  { name: 'skillMatch', label: 'Skill Alignment Engine' },
  { name: 'atsKeyword', label: 'ATS Density Analyzer' },
  { name: 'bulletRewrite', label: 'Anti-Fabrication Guard' },
]

function getWorkerStatusLabel(worker) {
  if (!worker) return 'Unknown'
  if (worker.status === 'succeeded') return 'Completed'
  if (worker.status === 'failed') return 'Failed'
  return 'Partial'
}

// A rewrite is keyed by its (required) evidenceId, falling back to its
// original text only in the pathological case where evidenceId is missing —
// never by array index, so approvals stay attached to the right rewrite
// regardless of list order.
function getEvidenceKey(rewrite, index) {
  return rewrite.evidenceId || rewrite.originalText || `rewrite-${index}`
}

function ResultsPanel({ result, normalizedResume, isLoading, error, onStartOver }) {
  const [selectedJobId, setSelectedJobId] = useState(null)
  // rewriteDecisions[jobId][evidenceKey] = { status, text, editing, draftText, needsReview, flags }
  // Namespaced by jobId so switching between ranked jobs never mixes or
  // erases another job's approvals.
  const [rewriteDecisions, setRewriteDecisions] = useState({})
  const [copyMessage, setCopyMessage] = useState('')

  const rankedJobs = useMemo(() => {
    const jobs = result?.rankedJobs || result?.jobs || []
    return jobs.slice().sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
  }, [result])

  const resolvedSelectedJobId = selectedJobId || rankedJobs[0]?.jobId || null

  if (isLoading) {
    return (
      <section className="space-y-xl pb-xl" aria-live="polite">
        <div className="bg-surface-container-lowest border border-outline-variant p-xl rounded-xl custom-shadow text-center space-y-lg">
          <div className="w-16 h-16 bg-primary/10 text-primary mx-auto rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px] status-dot-pulse">auto_awesome</span>
          </div>
          <div>
            <h2 className="font-display text-display text-on-surface">Executing Career Intelligence Analysis</h2>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-xl mx-auto mt-xs">
              Orchestrating multi-worker scoring, ATS keyword extraction, evidence verification, and anti-fabrication validated rewrites...
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-md max-w-4xl mx-auto text-left mt-xl">
            <div className="p-md bg-surface border border-outline-variant rounded-lg">
              <span className="material-symbols-outlined text-primary mb-xs">psychology</span>
              <p className="font-label-md text-label-md font-bold">Supervisor Agent</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Evaluating strategy &amp; fit</p>
            </div>
            <div className="p-md bg-surface border border-outline-variant rounded-lg">
              <span className="material-symbols-outlined text-emerald-600 mb-xs">check_circle</span>
              <p className="font-label-md text-label-md font-bold">Skill Match Agent</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Aligning core competencies</p>
            </div>
            <div className="p-md bg-surface border border-outline-variant rounded-lg">
              <span className="material-symbols-outlined text-blue-600 mb-xs">key</span>
              <p className="font-label-md text-label-md font-bold">ATS Keyword Agent</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Scanning density metrics</p>
            </div>
            <div className="p-md bg-surface border border-outline-variant rounded-lg">
              <span className="material-symbols-outlined text-amber-600 mb-xs">edit_note</span>
              <p className="font-label-md text-label-md font-bold">Bullet Rewrite Agent</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Validating non-fabrication</p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="space-y-xl pb-xl">
        <div className="bg-surface-container-lowest border border-error p-xl rounded-xl custom-shadow space-y-md">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-headline-lg font-bold text-error flex items-center gap-md">
              <span className="material-symbols-outlined text-[32px]">error</span>
              Analysis Unavailable
            </h2>
            <button
              type="button"
              className="px-lg py-sm border border-outline-variant text-on-surface font-label-md text-label-md rounded hover:bg-surface-container transition-colors font-bold uppercase flex items-center gap-xs"
              onClick={onStartOver}
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              Start New Analysis
            </button>
          </div>
          <div className="p-md bg-error-container text-on-error-container rounded font-body-md text-body-md" role="alert">
            {error}
          </div>
        </div>
      </section>
    )
  }

  if (!result || rankedJobs.length === 0) {
    return (
      <section className="space-y-xl pb-xl">
        <div className="bg-surface-container-lowest border border-outline-variant p-xl rounded-xl custom-shadow text-center">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-md">analytics</span>
          <h2 className="font-display text-headline-lg font-bold text-on-surface">No Analysis Generated</h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto mt-xs">
            Submit a resume and at least one target job to view the ranked intelligence dashboard.
          </p>
        </div>
      </section>
    )
  }

  const selectedJob = rankedJobs.find((job) => job.jobId === resolvedSelectedJobId) || rankedJobs[0]
  const workerFailures = selectedJob?.result?.workers?.filter((worker) => worker.status === 'failed') || []
  const skillWorker = selectedJob?.result?.workers?.find((worker) => worker.name === 'skillMatch')
  // skillWorker.output.matchedSkills holds every reconciled requirement (any
  // status) for scoring — only "matched" items belong in this display list,
  // otherwise a mandatory gap would show as both matched and missing.
  const displayedMatchedSkills = (skillWorker?.output?.matchedSkills || []).filter((item) => item.status === 'matched')
  const atsWorker = selectedJob?.result?.workers?.find((worker) => worker.name === 'atsKeyword')
  const rewriteWorker = selectedJob?.result?.workers?.find((worker) => worker.name === 'bulletRewrite')
  const rewriteItems = rewriteWorker?.output?.rewrites || []
  const antiFabricationFlags = rewriteWorker?.output?.antiFabricationValidation?.flags || []
  const evidenceEntries = normalizedResume?.evidence || []

  // Default decision for a rewrite that hasn't been touched yet — sourced
  // from the backend-computed validation, never mutated in place.
  const getDefaultDecision = (rewrite) => ({
    status: 'pending',
    text: rewrite.rewrittenText || '',
    editing: false,
    draftText: rewrite.rewrittenText || '',
    needsReview: Boolean(rewrite.validation?.needsReview),
    flags: rewrite.validation?.flags || [],
    // Set only after a user edit re-validates cleanly, to show "Validation passed".
    validationPassed: false,
    // Safe but not a meaningful improvement over the original (agent could not
    // produce a materially better rewrite). Accept stays disabled until edited.
    noMeaningfulImprovement: rewrite.rewriteQualityStatus === 'no-meaningful-improvement',
  })

  const getDecision = (jobId, key, rewrite) => rewriteDecisions[jobId]?.[key] || getDefaultDecision(rewrite)

  const setDecision = (jobId, key, nextDecision) => {
    setRewriteDecisions((current) => ({
      ...current,
      [jobId]: { ...current[jobId], [key]: nextDecision },
    }))
  }

  const rewriteEntries = rewriteItems.map((rewrite, index) => {
    const key = getEvidenceKey(rewrite, index)
    return { rewrite, key, decision: getDecision(selectedJob.jobId, key, rewrite) }
  })

  const acceptedEntries = rewriteEntries.filter((entry) => entry.decision.status === 'accepted')
  const approvedContent = acceptedEntries
    .map((entry) => entry.decision.text)
    .filter(Boolean)
    .join('\n\n')

  const handleAccept = (key, rewrite) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    // Accept is disabled in the UI for these — defense in depth for both the
    // fabrication (needsReview) and the unchanged-rewrite (no-improvement) cases.
    if (decision.needsReview || decision.noMeaningfulImprovement) return
    setDecision(selectedJob.jobId, key, { ...decision, status: 'accepted' })
  }

  const handleReject = (key, rewrite) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    setDecision(selectedJob.jobId, key, { ...decision, status: 'rejected' })
  }

  const handleEditOpen = (key, rewrite) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    setDecision(selectedJob.jobId, key, { ...decision, editing: true, draftText: decision.text, validationPassed: false })
  }

  const handleDraftChange = (key, rewrite, value) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    setDecision(selectedJob.jobId, key, { ...decision, draftText: value })
  }

  const handleCancelEdit = (key, rewrite) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    setDecision(selectedJob.jobId, key, {
      ...decision,
      text: rewrite.rewrittenText || '',
      editing: false,
      draftText: rewrite.rewrittenText || '',
      needsReview: Boolean(rewrite.validation?.needsReview),
      flags: rewrite.validation?.flags || [],
      validationPassed: false,
      noMeaningfulImprovement: rewrite.rewriteQualityStatus === 'no-meaningful-improvement',
    })
  }

  const handleSaveEdit = (key, rewrite) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    // Re-run the SAME anti-fabrication validation on the edited text.
    const validation = validateRewriteIntegrity({ originalText: rewrite.originalText, rewrittenText: decision.draftText }, evidenceEntries)
    const needsReview = computeNeedsReview(validation.flags)

    setDecision(selectedJob.jobId, key, {
      ...decision,
      text: decision.draftText,
      editing: false,
      needsReview,
      flags: validation.flags,
      validationPassed: !needsReview,
      // The user supplied their own text — the agent's no-improvement flag no
      // longer applies, so Accept is governed by anti-fabrication alone.
      noMeaningfulImprovement: false,
    })
  }

  const handleCopyApproved = async () => {
    if (!approvedContent.trim()) {
      setCopyMessage('Approve at least one rewrite before copying.')
      return
    }

    try {
      await navigator.clipboard.writeText(approvedContent)
      setCopyMessage('Approved content copied to clipboard!')
    } catch {
      setCopyMessage('Copying is not available in this browser.')
    }
  }

  const handleExportJson = () => {
    const approvals = Object.fromEntries(
      rewriteEntries.map((entry) => [entry.key, { status: entry.decision.status, text: entry.decision.text }]),
    )
    const payload = {
      job: selectedJob,
      approvedContent,
      approvals,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(selectedJob.jobTitle || 'analysis').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'analysis'}.json`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-xl pb-xl animate-enter" aria-labelledby="results-heading">
      {/* Progress Indicator */}
      <div className="mb-xl">
        <div className="flex items-center justify-between mb-md">
          <div className="flex items-center gap-sm">
            <span className="font-label-md text-label-md bg-on-surface text-white px-3 py-1">PHASE 03</span>
            <span className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight uppercase" id="results-heading">
              Ranked Intelligence Dashboard
            </span>
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant font-bold">100% COMPLETE</span>
        </div>
        <div className="w-full h-1 bg-surface-container-high overflow-hidden">
          <div className="w-full h-full bg-on-surface transition-all duration-700" />
        </div>
      </div>

      {/* Dashboard Header */}
      <header className="flex justify-between items-end mb-lg">
        <div>
          <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest font-bold">Analysis Engine</span>
          <h1 className="font-display text-display text-on-surface">Recruitment Intelligence</h1>
        </div>
        <div className="flex items-center gap-md">
          <div className="flex items-center gap-sm bg-surface-container-highest px-md py-xs rounded-full">
            <span className="w-2 h-2 flex-none bg-success rounded-full status-dot-pulse" />
            <span className="font-label-md text-label-md text-on-surface">System Status: All systems operational.</span>
          </div>
          <button
            type="button"
            className="px-lg py-sm border border-outline-variant text-on-surface font-label-md text-label-md rounded hover:bg-surface-container transition-colors font-bold uppercase flex items-center gap-xs"
            onClick={onStartOver}
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            New Analysis
          </button>
        </div>
      </header>

      {result.partial ? (
        <div className="p-md border tone-partial rounded font-label-md text-label-md flex items-center gap-md" role="status">
          <span className="material-symbols-outlined">warning</span>
          Partial results available. Some workers reported warnings, but successful outputs are ranked below.
        </div>
      ) : null}

      {/* Dashboard metrics + execution pipeline */}
      <div className="grid grid-cols-12 gap-lg mb-xl">
        {/* Metric tiles — the most important numbers, visually dominant */}
        <div className="col-span-12 lg:col-span-8 grid grid-cols-2 gap-md animate-stagger">
          <div className="metric-card">
            <div className="flex items-center justify-between gap-sm">
              <span className="metric-label">Top Score</span>
              <span className="material-symbols-outlined text-primary text-[18px]" aria-hidden="true">trending_up</span>
            </div>
            <span className="metric-value text-primary">
              {formatScore(selectedJob?.score)}
              <span className="font-body-md text-body-md text-on-surface-variant font-semibold"> / 100</span>
            </span>
            <span className="font-body-md text-body-md text-on-surface-variant truncate">{selectedJob?.recommendationLabel}</span>
          </div>
          <div className="metric-card">
            <div className="flex items-center justify-between gap-sm">
              <span className="metric-label">Skills Matched</span>
              <span className="material-symbols-outlined text-success text-[18px]" aria-hidden="true">check_circle</span>
            </div>
            <span className="metric-value">{displayedMatchedSkills.length}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">evidence-backed</span>
          </div>
          <div className="metric-card">
            <div className="flex items-center justify-between gap-sm">
              <span className="metric-label">Mandatory Gaps</span>
              <span className="material-symbols-outlined text-warning text-[18px]" aria-hidden="true">warning</span>
            </div>
            <span className="metric-value">{selectedJob?.mandatoryGaps?.length || 0}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">unmet requirements</span>
          </div>
          <div className="metric-card">
            <div className="flex items-center justify-between gap-sm">
              <span className="metric-label">Processing Time</span>
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]" aria-hidden="true">schedule</span>
            </div>
            <span className="metric-value">{formatDuration(result.totalDurationMs)}</span>
            <span className="font-body-md text-body-md text-on-surface-variant">{rankedJobs.length} role(s) analyzed</span>
          </div>
        </div>

        {/* Execution pipeline — secondary, quiet surface (not a dominant card) */}
        <div className="col-span-12 lg:col-span-4 panel p-lg flex flex-col">
          <div className="flex items-center gap-sm mb-md">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">account_tree</span>
            <h3 className="font-headline-md text-headline-md font-bold text-on-surface">Execution Pipeline</h3>
          </div>
          <div className="space-y-xs">
            {WORKER_STATUS_CARD_ITEMS.map(({ name, label }) => {
              const worker = selectedJob?.result?.workers?.find((candidate) => candidate.name === name)
              const tone = worker?.status === 'failed' ? 'tone-failed' : worker?.status === 'succeeded' ? 'tone-completed' : 'tone-partial'
              return (
                <div key={name} className="flex items-center justify-between gap-sm py-xs border-b border-outline-variant last:border-b-0">
                  <span className="font-body-md text-body-md text-on-surface truncate">{label}</span>
                  <span className={`px-sm py-xs rounded border ${tone} font-label-sm text-label-sm font-bold uppercase flex-none`}>
                    {getWorkerStatusLabel(worker)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Ranked Job Cards Section */}
      <section className="space-y-md">
        <div className="flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface uppercase tracking-tight">
            Ranked Recommendations ({rankedJobs.length})
          </h2>
          <span className="px-md py-xs bg-surface-container border border-outline-variant rounded-lg font-label-md text-label-md font-bold">
            Sorted by Fit Score
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-md animate-stagger">
          {rankedJobs.map((job) => (
            <button
              key={job.jobId}
              type="button"
              aria-pressed={selectedJob?.jobId === job.jobId}
              className={`group min-w-0 border p-lg rounded-lg transition-all text-left flex flex-col justify-between hover:-translate-y-0.5 ${selectedJob?.jobId === job.jobId ? 'border-primary ring-2 ring-primary/20 bg-primary/5 shadow-md' : 'border-outline-variant bg-surface-elevated shadow-sm hover:border-primary hover:shadow-md'}`}
              onClick={() => {
                setSelectedJobId(job.jobId)
                setCopyMessage('')
              }}
            >
              <div className="min-w-0">
                <div className="flex justify-between items-start gap-sm mb-sm">
                  <span className="flex items-center gap-xs min-w-0">
                    <span className="font-label-sm text-label-sm flex-none bg-on-surface text-on-primary px-2 py-0.5 font-bold rounded">
                      RANK #{job.rank}
                    </span>
                    {selectedJob?.jobId === job.jobId ? (
                      <span className="material-symbols-outlined text-primary text-[18px] flex-none" aria-hidden="true">check_circle</span>
                    ) : null}
                  </span>
                  <span className={`px-sm py-xs border rounded font-label-sm text-label-sm font-bold text-right ${getRecommendationClass(job.recommendationLabel)}`}>
                    {job.recommendationLabel}
                  </span>
                </div>
                <h4 className="font-display text-headline-md text-base font-bold text-on-surface mb-xs break-words">{job.jobTitle}</h4>
                <p className="font-body-md text-body-md text-on-surface-variant line-clamp-2 mb-md" title={job.jobDescription}>
                  {truncateText(job.jobDescription)}
                </p>
              </div>

              <div className="pt-md border-t border-outline-variant flex justify-between items-center gap-sm">
                <span className="font-display text-headline-md font-extrabold text-primary whitespace-nowrap">{formatScore(job.score)}<span className="text-body-md text-on-surface-variant font-semibold"> / 100</span></span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase truncate">{job.status}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Selected Job Technical Matrix & Details */}
      <div className="bg-surface-container-lowest border border-outline-variant p-xl rounded-xl custom-shadow space-y-xl mt-xl">
        <div className="flex justify-between items-start border-b border-outline-variant pb-lg">
          <div>
            <span className="font-label-sm text-label-sm text-primary uppercase font-bold tracking-widest">Target Objective Detail</span>
            <h3 className="font-display text-display text-on-surface mt-xs">{selectedJob?.jobTitle}</h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl mt-xs">{selectedJob?.jobDescription}</p>
          </div>
          <div className="flex items-center gap-md">
            <span className="font-display text-display font-extrabold text-primary">{formatScore(selectedJob?.score)}</span>
            <span className={`px-md py-sm border rounded-lg font-label-md text-label-md font-bold uppercase ${getRecommendationClass(selectedJob?.recommendationLabel)}`}>
              {selectedJob?.recommendationLabel}
            </span>
          </div>
        </div>

        {/* 4-Quadrant Evaluation Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
          {/* Quadrant 1: Skills Matched */}
          <div className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md">
            <h4 className="font-label-md text-label-md font-extrabold text-success uppercase tracking-wider flex items-center gap-sm">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span>
              Skills Matched
            </h4>
            {displayedMatchedSkills.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {displayedMatchedSkills.map((item) => (
                  <span key={item.evidenceId || item.skill} className="chip tone-strong">
                    {item.skill || item.text}
                  </span>
                ))}
              </div>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant">No explicit skill matches surfaced.</p>
            )}
          </div>

          {/* Quadrant 2: ATS Keywords */}
          <div className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md">
            <h4 className="font-label-md text-label-md font-extrabold text-info uppercase tracking-wider flex items-center gap-sm">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">key</span>
              ATS Keywords
            </h4>
            {atsWorker?.output?.keywordMatches?.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {atsWorker.output.keywordMatches.map((item) => (
                  <span key={item.evidenceId || item.keyword} className="chip tone-info">
                    {item.keyword || item.text}
                  </span>
                ))}
              </div>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant">No ATS keyword matches surfaced.</p>
            )}
          </div>

          {/* Quadrant 3: Mandatory Gaps */}
          <div className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md">
            <h4 className="font-label-md text-label-md font-extrabold text-warning uppercase tracking-wider flex items-center gap-sm">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">warning</span>
              Mandatory Gaps
            </h4>
            {selectedJob?.mandatoryGaps?.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {selectedJob.mandatoryGaps.map((gap) => (
                  <span key={gap} className="chip tone-moderate">{gap}</span>
                ))}
              </div>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant">No mandatory gaps identified.</p>
            )}
          </div>

          {/* Quadrant 4: Anti-Fabrication Verification */}
          <div className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md">
            <h4 className="font-label-md text-label-md font-extrabold text-primary uppercase tracking-wider flex items-center gap-sm">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">shield</span>
              Anti-Fabrication Verification
            </h4>
            {antiFabricationFlags.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {antiFabricationFlags.map((flag) => (
                  <span key={flag} className="chip tone-moderate" title={humanizeFlag(flag)}>
                    {shortLabelForFlag(flag)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-xs">
                <span className="material-symbols-outlined text-success text-[18px]" aria-hidden="true">verified</span>
                All rewrites verified against original source evidence.
              </p>
            )}
          </div>
        </div>

        {/* Executive Bullet Rewrites & Decision Toolbar */}
        <section className="space-y-lg pt-lg border-t border-outline-variant">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-display text-headline-md font-bold text-on-surface flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">edit_note</span>
                Executive Bullet Rewrites
              </h4>
              <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
                Review and approve evidence-grounded bullet statements tailored for {selectedJob?.jobTitle}.
              </p>
            </div>
            <div className="flex flex-wrap gap-sm">
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyApproved}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span>
                Copy Approved
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleExportJson}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
                Export JSON
              </button>
            </div>
          </div>

          {copyMessage ? <p className="font-label-md text-label-md text-success font-bold" role="status">{copyMessage}</p> : null}

          {rewriteWorker?.status === 'failed' ? (
            <div className="p-md bg-error-container text-on-error-container rounded font-body-md text-body-md flex items-center gap-md" role="alert">
              <span className="material-symbols-outlined">error</span>
              Bullet rewrite generation failed: {rewriteWorker.errorMessage || 'Unknown error'}
            </div>
          ) : null}

          {rewriteEntries.length > 0 ? (
            <div className="space-y-md animate-stagger">
              {rewriteEntries.map(({ rewrite, key, decision }) => {
                const { status, editing, draftText, text, needsReview, flags, validationPassed, noMeaningfulImprovement } = decision
                const isAccepted = status === 'accepted'
                const isRejected = status === 'rejected'
                const cardClass = isAccepted
                  ? 'tone-strong-surface'
                  : isRejected
                    ? 'tone-failed-surface'
                    : 'bg-surface border-outline-variant'

                const reviewNoteId = `review-note-${selectedJob.jobId}-${key}`
                const noImprovementNoteId = `no-improvement-${selectedJob.jobId}-${key}`
                // Accept is blocked both for fabricated content and for an
                // unchanged/non-meaningful rewrite (until the user edits it).
                const acceptBlocked = needsReview || noMeaningfulImprovement
                const acceptTitle = needsReview
                  ? 'Edit this rewrite to resolve validation issues before accepting.'
                  : noMeaningfulImprovement
                    ? 'This rewrite is not a meaningful improvement — edit it before accepting.'
                    : undefined
                // Human-readable explanations (+ specific term/metric when the
                // validator exposes it) for the raw flags. Raw codes are never
                // shown in the primary UI — only inside "Technical details".
                const explanations = explainFlags(flags, { originalText: rewrite.originalText, rewrittenText: text, evidenceEntries })
                const segments = !editing && rewrite.originalText ? splitAdditions(rewrite.originalText, text) : null
                const hasHighlight = Boolean(segments && segments.some((segment) => segment.added))
                const showValidationPassed = validationPassed && !needsReview && !editing && status === 'pending'

                return (
                  <article key={key} className={`p-lg border rounded-lg space-y-md transition-all ${cardClass} ${editing ? 'ring-2 ring-primary/20 shadow-md' : ''}`}>
                    {/* Header: evidence id + one status badge + actions */}
                    <div className="flex justify-between items-center gap-sm flex-wrap">
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase flex items-center gap-xs flex-wrap">
                        Evidence ID: {rewrite.evidenceId || 'N/A'}
                        {needsReview ? (
                          <span className="px-sm py-xs rounded border tone-needs-review font-label-sm text-label-sm font-bold uppercase inline-flex items-center gap-xs">
                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">warning</span>
                            Needs review
                          </span>
                        ) : null}
                        {noMeaningfulImprovement && !needsReview ? (
                          <span className="px-sm py-xs rounded border tone-moderate font-label-sm text-label-sm font-bold uppercase inline-flex items-center gap-xs">
                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">info</span>
                            No improvement
                          </span>
                        ) : null}
                        {isAccepted ? (
                          <span className="px-sm py-xs rounded border tone-accepted font-label-sm text-label-sm font-bold uppercase" role="status">
                            Accepted
                          </span>
                        ) : null}
                        {isRejected ? (
                          <span className="px-sm py-xs rounded border tone-rejected font-label-sm text-label-sm font-bold uppercase" role="status">
                            Rejected
                          </span>
                        ) : null}
                      </span>
                      <div className="flex flex-wrap gap-xs flex-none">
                        <button
                          type="button"
                          disabled={acceptBlocked}
                          aria-disabled={acceptBlocked}
                          aria-describedby={needsReview ? reviewNoteId : noMeaningfulImprovement ? noImprovementNoteId : undefined}
                          title={acceptTitle}
                          className={`btn btn-sm relative z-10 ${isAccepted ? 'btn-success' : 'btn-secondary'}`}
                          onClick={() => handleAccept(key, rewrite)}
                        >
                          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">check</span>
                          Accept
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm relative z-10 ${isRejected ? 'btn-destructive' : 'btn-secondary'}`}
                          onClick={() => handleReject(key, rewrite)}
                        >
                          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                          Reject
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm relative z-10 ${editing ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => handleEditOpen(key, rewrite)}
                        >
                          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span>
                          Edit
                        </button>
                      </div>
                    </div>

                    {/* One clear "why Accept is disabled" explanation block */}
                    {needsReview ? (
                      <div id={reviewNoteId} role="alert" className="rewrite-review-note p-md space-y-xs">
                        <p className="font-label-md text-label-md font-bold flex items-center gap-xs m-0">
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">error</span>
                          Review required before approval
                        </p>
                        <p className="font-body-md text-body-md m-0">
                          This rewrite contains unsupported or modified information. Edit the sentence to resolve the issues before accepting it.
                        </p>
                      </div>
                    ) : null}

                    {/* Human-readable validation issues (+ specifics), raw codes only in a disclosure */}
                    {flags.length > 0 ? (
                      <div className="space-y-xs">
                        <ul className="space-y-xs m-0 p-0 list-none" aria-label="Validation issues">
                          {explanations.map(({ code, message, detail }) => (
                            <li key={code} className="flex items-start gap-xs font-body-md text-body-md text-on-surface">
                              <span className="material-symbols-outlined text-warning text-[18px] flex-none" aria-hidden="true">info</span>
                              <span>
                                {message}
                                {detail ? (
                                  <span className="block font-label-sm text-label-sm text-on-surface-variant mt-0.5">{detail}</span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <details className="text-on-surface-variant">
                          <summary className="font-label-sm text-label-sm cursor-pointer select-none">Technical details</summary>
                          <code className="block mt-xs font-label-sm text-label-sm">{flags.join(', ')}</code>
                        </details>
                      </div>
                    ) : null}

                    {/* Validation passed — after an edit re-validates cleanly */}
                    {showValidationPassed ? (
                      <p className="font-label-md text-label-md text-success font-bold flex items-center gap-xs m-0" role="status">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span>
                        Validation passed
                      </p>
                    ) : null}

                    {/* ORIGINAL — quiet neutral surface, always labeled and read-only */}
                    {rewrite.originalText ? (
                      <div className="rewrite-original p-md">
                        <p className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface-variant m-0 mb-xs">Original</p>
                        <p className="font-body-md text-body-md m-0">{rewrite.originalText}</p>
                      </div>
                    ) : null}

                    {/* SUGGESTED REWRITE — prominent elevated surface; editable in place */}
                    <div className="rewrite-suggested p-md">
                      <p className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary m-0 mb-xs flex items-center gap-xs">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">auto_awesome</span>
                        Suggested Rewrite
                      </p>
                      {editing ? (
                        <div className="space-y-sm">
                          <textarea
                            className="w-full p-md bg-surface-elevated border border-outline-variant rounded-md font-body-md text-body-md focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                            value={draftText}
                            aria-label={`Edit suggested rewrite for evidence ${rewrite.evidenceId || 'item'}`}
                            onChange={(event) => handleDraftChange(key, rewrite, event.target.value)}
                            rows={3}
                          />
                          <div className="flex flex-wrap gap-xs">
                            <button type="button" className="btn btn-sm btn-primary" onClick={() => handleSaveEdit(key, rewrite)}>
                              Save Edit
                            </button>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleCancelEdit(key, rewrite)}>
                              Cancel Edit
                            </button>
                          </div>
                        </div>
                      ) : noMeaningfulImprovement ? (
                        // Not shown as a normal suggestion — it is not a meaningful
                        // improvement. The user can Edit or Reject.
                        <p id={noImprovementNoteId} className="font-body-md text-body-md text-on-surface-variant italic m-0 flex items-center gap-xs" role="status">
                          <span className="material-symbols-outlined text-[18px] flex-none" aria-hidden="true">info</span>
                          No meaningful rewrite could be generated safely.
                        </p>
                      ) : (
                        <p className="font-body-lg text-body-lg text-on-surface leading-relaxed m-0">
                          {hasHighlight
                            ? segments.map((segment, index) =>
                                segment.added ? (
                                  <mark key={index} className="rewrite-addition">{segment.text}</mark>
                                ) : (
                                  <span key={index}>{segment.text}</span>
                                ),
                              )
                            : text}
                        </p>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant">No rewrites were generated for this target role.</p>
          )}
        </section>

        {/* Approved Content Preview — the final output panel */}
        <section className="space-y-md pt-lg border-t border-outline-variant">
          <div className="flex items-center justify-between gap-sm flex-wrap">
            <h4 className="font-label-md text-label-md font-extrabold text-on-surface uppercase tracking-widest flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">preview</span>
              Approved Content Preview
            </h4>
            {acceptedEntries.length > 0 ? (
              <span className="chip tone-strong">{acceptedEntries.length} accepted</span>
            ) : null}
          </div>
          {approvedContent ? (
            <pre className="resume-preview">{approvedContent}</pre>
          ) : (
            <div className="flex flex-col items-center justify-center text-center gap-xs py-xl px-lg rounded-lg border border-dashed border-outline-variant bg-surface">
              <span className="material-symbols-outlined text-on-surface-variant text-[32px]" aria-hidden="true">inbox</span>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Accept one or more rewrites above to build your approved content preview.
              </p>
            </div>
          )}
        </section>

        {/* Worker Status & Failures */}
        <section className="space-y-md pt-lg border-t border-outline-variant">
          <h4 className="font-label-md text-label-md font-extrabold text-on-surface uppercase tracking-widest flex items-center gap-sm">
            <span className="material-symbols-outlined">report_problem</span>
            Worker Failures &amp; Diagnostics
          </h4>
          {workerFailures.length > 0 ? (
            <ul className="list-disc pl-md font-body-md text-body-md text-error">
              {workerFailures.map((worker) => (
                <li key={worker.name}>
                  {worker.name}: {worker.errorMessage}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant">All analysis workers completed successfully without failures.</p>
          )}
        </section>
      </div>
    </section>
  )
}

export default ResultsPanel
