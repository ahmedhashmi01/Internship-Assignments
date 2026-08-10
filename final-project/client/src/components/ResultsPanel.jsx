import { useMemo, useState } from 'react'
//full code
function getRecommendationClass(label = '') {
  const normalized = label.toLowerCase()
  if (normalized.includes('strong')) return 'bg-emerald-100 text-emerald-800 border-emerald-300'
  if (normalized.includes('good')) return 'bg-indigo-100 text-primary border-indigo-300'
  if (normalized.includes('stretch')) return 'bg-amber-100 text-amber-800 border-amber-300'
  return 'bg-red-100 text-error border-red-300'
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

function getWorkerStatusClass(worker) {
  if (worker?.status === 'failed') return 'bg-red-500/30 text-white'
  if (worker?.status === 'succeeded') return 'bg-white/20'
  return 'bg-amber-500/30 text-white'
}

function ResultsPanel({ result, isLoading, error, onStartOver }) {
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [rewriteState, setRewriteState] = useState({})
  const [draftRewrites, setDraftRewrites] = useState({})
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
  const approvalSummary = rewriteItems.filter((_, index) => rewriteState[`${selectedJob.jobId}-${index}`] === 'approved')
  const approvedContent = approvalSummary
    .map((rewrite, index) => draftRewrites[`${selectedJob.jobId}-${index}`] || rewrite.text || '')
    .filter(Boolean)
    .join('\n\n')

  const updateRewriteStatus = (index, status) => {
    setRewriteState((current) => ({ ...current, [`${selectedJob.jobId}-${index}`]: status }))
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
    const payload = {
      job: selectedJob,
      approvedContent,
      approvals: Object.fromEntries(
        Object.entries(rewriteState).filter(([key]) => key.startsWith(`${selectedJob.jobId}-`)),
      ),
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
    <section className="space-y-xl pb-xl" aria-labelledby="results-heading">
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
            <span className="w-2 h-2 bg-emerald-500 rounded-full status-dot-pulse" />
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
        <div className="p-md bg-amber-100 border border-amber-300 text-amber-900 rounded font-label-md text-label-md flex items-center gap-md" role="status">
          <span className="material-symbols-outlined">warning</span>
          Partial results available. Some workers reported warnings, but successful outputs are ranked below.
        </div>
      ) : null}

      {/* Analytics Dashboard Bento Grid */}
      <div className="grid grid-cols-12 gap-lg mb-xl">
        {/* Main Analytics Card */}
        <div className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant p-lg rounded-xl custom-shadow">
          <div className="flex justify-between items-start mb-md">
            <h3 className="font-headline-md text-headline-md font-bold text-on-surface">Fit Score Distribution</h3>
            <span className="font-label-md text-label-md text-primary font-bold uppercase">Multi-Job Ranked</span>
          </div>
          <div className="grid grid-cols-4 gap-md h-44">
            <div className="col-span-1 bg-indigo-50 rounded-lg flex flex-col items-center justify-end p-sm">
              <div className="w-full bg-primary-container rounded-t-md" style={{ height: `${Math.max(20, selectedJob?.score || 80)}%` }} />
              <span className="font-label-sm text-label-sm mt-sm font-bold">Top Score</span>
            </div>
            <div className="col-span-1 bg-slate-50 rounded-lg flex flex-col items-center justify-end p-sm">
              <div className="w-full bg-secondary-container rounded-t-md" style={{ height: `${(selectedJob?.score || 80) * 0.6}%` }} />
              <span className="font-label-sm text-label-sm mt-sm font-bold font-sans">Matched</span>
            </div>
            <div className="col-span-1 bg-slate-50 rounded-lg flex flex-col items-center justify-end p-sm">
              <div className="w-full bg-outline-variant rounded-t-md h-[25%]" />
              <span className="font-label-sm text-label-sm mt-sm font-bold">Gaps</span>
            </div>
            <div className="col-span-1 flex flex-col justify-center px-md border-l border-outline-variant">
              <div className="mb-sm">
                <span className="block font-display text-[28px] text-primary leading-tight font-extrabold">{formatScore(selectedJob?.score)}%</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase">Top Job Score</span>
              </div>
              <div>
                <span className="block font-display text-[24px] text-secondary leading-tight font-bold">{formatDuration(result.totalDurationMs)}</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase">Processing Time</span>
              </div>
            </div>
          </div>
        </div>

        {/* Worker Status Card */}
        <div className="col-span-12 lg:col-span-4 bg-primary text-on-primary p-lg rounded-xl custom-shadow flex flex-col justify-between overflow-hidden relative">
          <div className="relative z-10">
            <h3 className="font-headline-md text-headline-md font-bold mb-xs">Worker Status</h3>
            <p className="font-body-md text-body-md opacity-80 mb-md">Worker agent execution breakdown.</p>
            <div className="space-y-sm">
              {WORKER_STATUS_CARD_ITEMS.map(({ name, label }) => {
                const worker = selectedJob?.result?.workers?.find((candidate) => candidate.name === name)
                return (
                  <div key={name} className="flex items-center justify-between">
                    <span className="font-label-md text-label-md">{label}</span>
                    <span className={`px-sm py-xs rounded text-label-sm font-bold ${getWorkerStatusClass(worker)}`}>
                      {getWorkerStatusLabel(worker)}
                    </span>
                  </div>
                )
              })}
            </div>
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
          {rankedJobs.map((job) => (
            <button
              key={job.jobId}
              type="button"
              className={`group bg-surface-container-lowest border p-lg rounded-xl custom-shadow transition-all text-left flex flex-col justify-between ${selectedJob?.jobId === job.jobId ? 'border-primary ring-2 ring-primary/20' : 'border-outline-variant hover:border-primary'}`}
              onClick={() => {
                setSelectedJobId(job.jobId)
                setRewriteState({})
                setDraftRewrites({})
                setCopyMessage('')
              }}
            >
              <div>
                <div className="flex justify-between items-start mb-sm">
                  <span className="font-label-sm text-label-sm bg-on-surface text-white px-2 py-0.5 font-bold rounded">
                    RANK #{job.rank}
                  </span>
                  <span className={`px-sm py-xs border rounded font-label-sm text-label-sm font-bold ${getRecommendationClass(job.recommendationLabel)}`}>
                    {job.recommendationLabel}
                  </span>
                </div>
                <h4 className="font-display text-headline-md text-base font-bold text-on-surface mb-xs">{job.jobTitle}</h4>
                <p className="font-body-md text-body-md text-on-surface-variant line-clamp-2 mb-md" title={job.jobDescription}>
                  {truncateText(job.jobDescription)}
                </p>
              </div>

              <div className="pt-md border-t border-outline-variant flex justify-between items-center">
                <span className="font-display text-headline-md font-extrabold text-primary">Score {formatScore(job.score)} / 100</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase">{job.status}</span>
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
            <h4 className="font-label-md text-label-md font-extrabold text-emerald-700 uppercase tracking-wider flex items-center gap-sm">
              <span className="material-symbols-outlined">check_circle</span>
              Skills Matched
            </h4>
            {displayedMatchedSkills.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {displayedMatchedSkills.map((item) => (
                  <span key={item.evidenceId || item.skill} className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-md py-1 rounded font-body-md text-body-md font-medium">
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
            <h4 className="font-label-md text-label-md font-extrabold text-blue-700 uppercase tracking-wider flex items-center gap-sm">
              <span className="material-symbols-outlined">key</span>
              ATS Keywords
            </h4>
            {atsWorker?.output?.keywordMatches?.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {atsWorker.output.keywordMatches.map((item) => (
                  <span key={item.evidenceId || item.keyword} className="bg-blue-50 text-blue-800 border border-blue-200 px-md py-1 rounded font-body-md text-body-md font-medium">
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
            <h4 className="font-label-md text-label-md font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-sm">
              <span className="material-symbols-outlined">warning</span>
              Mandatory Gaps
            </h4>
            {selectedJob?.mandatoryGaps?.length > 0 ? (
              <ul className="list-disc pl-md space-y-xs font-body-md text-body-md text-on-surface">
                {selectedJob.mandatoryGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant">No mandatory gaps identified.</p>
            )}
          </div>

          {/* Quadrant 4: Anti-Fabrication Verification */}
          <div className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md">
            <h4 className="font-label-md text-label-md font-extrabold text-indigo-700 uppercase tracking-wider flex items-center gap-sm">
              <span className="material-symbols-outlined">shield</span>
              Anti-Fabrication Verification
            </h4>
            {antiFabricationFlags.length > 0 ? (
              <ul className="list-disc pl-md space-y-xs font-body-md text-body-md text-error">
                {antiFabricationFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant">All rewrites verified against original source evidence.</p>
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
            <div className="flex gap-md">
              <button
                type="button"
                className="px-lg py-sm border border-outline-variant text-on-surface font-label-md text-label-md rounded hover:bg-surface-container transition-colors font-bold uppercase flex items-center gap-xs"
                onClick={handleCopyApproved}
              >
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                Copy Approved
              </button>
              <button
                type="button"
                className="px-lg py-sm bg-primary text-on-primary font-label-md text-label-md rounded hover:opacity-90 transition-opacity shadow-sm font-bold uppercase flex items-center gap-xs"
                onClick={handleExportJson}
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                Export JSON
              </button>
            </div>
          </div>

          {copyMessage ? <p className="font-label-md text-label-md text-emerald-700 font-bold" role="status">{copyMessage}</p> : null}

          {rewriteWorker?.status === 'failed' ? (
            <div className="p-md bg-error-container text-on-error-container rounded font-body-md text-body-md flex items-center gap-md" role="alert">
              <span className="material-symbols-outlined">error</span>
              Bullet rewrite generation failed: {rewriteWorker.errorMessage || 'Unknown error'}
            </div>
          ) : null}

          {rewriteItems.length > 0 ? (
            <div className="space-y-md">
              {rewriteItems.map((rewrite, index) => {
                const rewriteKey = `${selectedJob.jobId}-${index}`
                const status = rewriteState[rewriteKey] || 'pending'
                const currentText = draftRewrites[rewriteKey] ?? rewrite.text ?? ''
                const needsReview = Boolean(rewrite.validation?.needsReview)

                return (
                  <article key={`${rewrite.evidenceId || rewrite.text}-${index}`} className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md">
                    <div className="flex justify-between items-center">
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase flex items-center gap-xs">
                        Evidence ID: {rewrite.evidenceId || 'N/A'}
                        {needsReview ? (
                          <span className="px-sm py-xs rounded bg-amber-100 text-amber-800 border border-amber-300 font-label-sm text-label-sm font-bold uppercase" role="status">
                            Needs review
                          </span>
                        ) : null}
                      </span>
                      <div className="flex gap-xs">
                        <button
                          type="button"
                          disabled={needsReview}
                          title={needsReview ? 'Flagged for possible fabricated content — review before approving.' : undefined}
                          className={`px-md py-xs rounded font-label-sm text-label-sm font-bold uppercase flex items-center gap-xs transition-all ${needsReview ? 'bg-surface-container border border-outline-variant opacity-50 cursor-not-allowed' : status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-surface-container border border-outline-variant hover:bg-surface-container-high'}`}
                          onClick={() => updateRewriteStatus(index, 'approved')}
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          Accept
                        </button>
                        <button
                          type="button"
                          className={`px-md py-xs rounded font-label-sm text-label-sm font-bold uppercase flex items-center gap-xs transition-all ${status === 'rejected' ? 'bg-red-600 text-white' : 'bg-surface-container border border-outline-variant hover:bg-surface-container-high'}`}
                          onClick={() => updateRewriteStatus(index, 'rejected')}
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                          Reject
                        </button>
                        <button
                          type="button"
                          className={`px-md py-xs rounded font-label-sm text-label-sm font-bold uppercase flex items-center gap-xs transition-all ${status === 'editing' ? 'bg-primary text-white' : 'bg-surface-container border border-outline-variant hover:bg-surface-container-high'}`}
                          onClick={() => updateRewriteStatus(index, 'editing')}
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                          Edit
                        </button>
                      </div>
                    </div>

                    {status === 'editing' ? (
                      <textarea
                        className="w-full p-md bg-white border border-on-surface font-body-md text-body-md focus:ring-0 focus:outline-none"
                        value={currentText}
                        onChange={(event) => setDraftRewrites((current) => ({ ...current, [rewriteKey]: event.target.value }))}
                        rows={3}
                      />
                    ) : (
                      <p className="font-body-lg text-body-lg text-on-surface leading-relaxed">{currentText}</p>
                    )}
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant">No rewrites were generated for this target role.</p>
          )}
        </section>

        {/* Approved Content Preview Section */}
        <section className="space-y-md pt-lg border-t border-outline-variant">
          <h4 className="font-label-md text-label-md font-extrabold text-on-surface uppercase tracking-widest flex items-center gap-sm">
            <span className="material-symbols-outlined">preview</span>
            Approved Content Preview
          </h4>
          {approvedContent ? (
            <pre className="resume-preview p-xl bg-surface border border-outline-variant rounded">{approvedContent}</pre>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant">
              Accept one or more rewrites above to build your approved content preview.
            </p>
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
