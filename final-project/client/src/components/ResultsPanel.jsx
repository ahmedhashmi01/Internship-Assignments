import { useMemo, useState } from 'react'
import { exportResumeDocx, generateInterviewQuestions } from '../services/api.js'
import { validateRewriteIntegrity } from '../utils/antiFabricationValidation.js'
import { explainFlags, humanizeFlag, shortLabelForFlag, classifyRewriteSeverity, SEVERITY_COPY } from '../utils/rewriteExplanations.js'
import { splitAdditions } from '../utils/textDiff.js'
import { buildRecommendationExplanation } from '../utils/recommendationExplanation.js'
import ProcessingPanel from './ProcessingPanel.jsx'
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

// Turn a candidate name (or source filename) into a safe download filename,
// mirroring the server's Content-Disposition sanitization so both agree.
function docxDownloadName(candidateName) {
  const base = String(candidateName || '')
    .replace(/\.[^.]+$/, '') // drop any file extension
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return base ? `${base}-enhanced-resume.docx` : 'enhanced-resume.docx'
}

// "Why this score?" display maps. Status badges carry an icon + text label so
// meaning never depends on color alone (accessibility).
const SCORE_COMPONENT_LABEL = {
  mandatory: 'Mandatory requirements',
  preferred: 'Preferred requirements',
  contextual: 'Contextual fit',
  ats: 'ATS coverage',
}

const REQUIREMENT_STATUS_META = {
  matched: { label: 'Matched', tone: 'tone-strong', icon: 'check_circle' },
  partial: { label: 'Partial', tone: 'tone-moderate', icon: 'warning' },
  uncertain: { label: 'Uncertain', tone: 'tone-info', icon: 'help' },
  missing: { label: 'Missing', tone: 'tone-rejected', icon: 'cancel' },
}

// Application Readiness — status → tone/icon. Never color-only (icon + label).
const READINESS_META = {
  ready: { tone: 'tone-strong', icon: 'check_circle' },
  ready_with_improvements: { tone: 'tone-moderate', icon: 'info' },
  significant_gaps: { tone: 'tone-needs-review', icon: 'warning' },
  low_fit: { tone: 'tone-rejected', icon: 'cancel' },
}

// Priority Actions — severity → tone/icon/label (High / Medium / Opportunity).
const ACTION_SEVERITY_META = {
  high: { label: 'High', tone: 'tone-rejected', icon: 'priority_high' },
  medium: { label: 'Medium', tone: 'tone-moderate', icon: 'warning' },
  opportunity: { label: 'Opportunity', tone: 'tone-info', icon: 'lightbulb' },
}

const INTERVIEW_CATEGORY_LABEL = {
  resume: 'Resume-Based',
  role: 'Role-Specific',
  gap: 'Gap / Challenge',
  behavioral: 'Behavioral',
}

const INTERVIEW_CATEGORY_TONE = {
  resume: 'tone-strong',
  role: 'tone-info',
  gap: 'tone-moderate',
  behavioral: 'tone-info',
}

// Deterministic STAR scaffold — never fabricates a full answer or a metric.
// Prompts point at real resume evidence where the question references it.
function buildAnswerFramework(question) {
  const evidenceRef = question.evidenceIds?.length ? question.evidenceIds.join(', ') : null
  return [
    {
      label: 'Situation',
      prompt: evidenceRef
        ? `Use the project referenced by evidence ${evidenceRef}.`
        : 'Choose a concrete, relevant example from your own experience.',
    },
    { label: 'Task', prompt: 'Describe your specific responsibility or the problem you owned.' },
    { label: 'Action', prompt: 'Explain what you personally implemented and the key decisions you made.' },
    { label: 'Result', prompt: 'Use only a metric already present in your resume, if any — do not invent one.' },
  ]
}

// --- Job Comparison helpers (presentation only — no recompute, no AI) ---

const COMPARISON_ROWS = [
  { key: 'score', label: 'Match Score' },
  { key: 'mandatory', label: 'Mandatory' },
  { key: 'preferred', label: 'Preferred' },
  { key: 'contextual', label: 'Contextual' },
  { key: 'ats', label: 'ATS' },
]

const clampPct = (value) => Math.max(0, Math.min(100, Number(value) || 0))

// Compact labeled progress bar with accessible text (never color-only).
function MetricBar({ width, display, ariaLabel }) {
  return (
    <div className="space-y-xs min-w-[90px]">
      <span className="font-label-sm text-label-sm font-bold text-on-surface">{display}</span>
      <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden" role="img" aria-label={ariaLabel}>
        <div className="h-full bg-primary rounded-full" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function renderComparisonCell(row, job) {
  if (row.key === 'score') {
    return (
      <MetricBar
        width={clampPct(job.score)}
        display={`${formatScore(job.score)} / 100`}
        ariaLabel={`Match score ${formatScore(job.score)} out of 100`}
      />
    )
  }
  const component = job.components?.[row.key]
  if (!component || component.count === 0) {
    return (
      <span className="font-body-md text-body-md text-on-surface-variant" aria-label={`${row.label}: not applicable`}>
        —
      </span>
    )
  }
  return (
    <MetricBar
      width={clampPct(component.coverage)}
      display={`${component.coverage}%`}
      ariaLabel={`${row.label} coverage ${component.coverage} percent`}
    />
  )
}

// Deterministic 1–2 sentence summary from the existing ranking + coverage. The
// first ranked job is the best fit (existing tie-break order is authoritative).
function buildComparisonSummary(jobs) {
  if (jobs.length === 0) return ''
  const best = jobs[0]
  const bestCoverage = (key) => (best.components?.[key]?.count > 0 ? best.components[key].coverage : -1)
  const maxCoverage = (key) => Math.max(...jobs.map((job) => (job.components?.[key]?.count > 0 ? job.components[key].coverage : -1)))

  const leads = []
  if (bestCoverage('mandatory') >= 0 && bestCoverage('mandatory') === maxCoverage('mandatory')) leads.push('mandatory requirement')
  if (bestCoverage('ats') >= 0 && bestCoverage('ats') === maxCoverage('ats')) leads.push('ATS')

  let summary = `${best.title} is currently your strongest fit at ${formatScore(best.score)} / 100.`
  if (leads.length > 0) summary += ` It leads on ${leads.join(' and ')} coverage.`
  return summary
}

function ResultsPanel({ result, normalizedResume, resumeStructure, candidateName, isLoading, error, onStartOver }) {
  const [selectedJobId, setSelectedJobId] = useState(null)
  // Enhanced-DOCX export lifecycle: idle | generating | success | error.
  const [docxExport, setDocxExport] = useState({ status: 'idle', error: '' })
  // Interview question generation (on-demand): idle | loading | success | error.
  const [interview, setInterview] = useState({ status: 'idle', error: '', questions: [] })
  const [interviewOptions, setInterviewOptions] = useState({ count: 5, difficulty: 'standard' })
  const [expandedWhy, setExpandedWhy] = useState(() => new Set())
  const [expandedFramework, setExpandedFramework] = useState(() => new Set())
  // "Why this score?" disclosure + full-requirements toggle.
  const [whyScoreOpen, setWhyScoreOpen] = useState(false)
  const [showAllRequirements, setShowAllRequirements] = useState(false)
  // Priority Actions: first 3 shown by default, "View all actions" reveals the rest.
  const [showAllActions, setShowAllActions] = useState(false)
  // Presentation-only view toggle: 'individual' | 'compare'.
  const [viewMode, setViewMode] = useState('individual')
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
    return <ProcessingPanel />
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

  // "Why this score?" — deterministic explanation for the selected job. Derived
  // fresh each render from selectedJob, so switching jobs is never stale.
  const scoreExplanation = selectedJob?.scoreExplanation || null
  const componentRows = scoreExplanation
    ? ['mandatory', 'preferred', 'contextual', 'ats']
        .filter((key) => scoreExplanation.components[key].count > 0)
        .map((key) => ({ key, label: SCORE_COMPONENT_LABEL[key], value: scoreExplanation.components[key].coverage }))
    : []
  const topDeductions = scoreExplanation ? scoreExplanation.deductions.slice(0, 6) : []

  // Application Readiness + Priority Actions — both already computed
  // server-side (scoringService.buildApplicationReadiness / buildPriorityActions)
  // from the same scoring data as above. No recompute here, no AI call.
  const readiness = selectedJob?.readiness || null
  const priorityActions = selectedJob?.priorityActions || []
  const visibleActions = showAllActions ? priorityActions : priorityActions.slice(0, 3)

  // --- Comparison view data. Built entirely from existing rankedJobs +
  // scoreExplanation (already computed by the backend) — no recompute, no AI. ---
  const canCompare = rankedJobs.length >= 2
  const comparisonJobs = rankedJobs.map((job) => ({
    jobId: job.jobId,
    title: job.jobTitle,
    company: job.company || null,
    score: job.score,
    label: job.recommendationLabel,
    components: job.scoreExplanation?.components || null,
    strongMatches: job.scoreExplanation?.strongMatches || [],
    deductions: job.scoreExplanation?.deductions || [],
    strongCount: job.scoreExplanation?.strongMatches?.length || 0,
    deductionCount: job.scoreExplanation?.deductions?.length || 0,
  }))
  // Best fit follows the EXISTING ranking/tie-break order (rankedJobs[0]).
  const bestFitJobId = rankedJobs[0]?.jobId || null
  const comparisonSummary = buildComparisonSummary(comparisonJobs)
  const comparisonGridClass = `grid grid-cols-1 md:grid-cols-2 ${comparisonJobs.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-md`
  // "Why This Job Wins" — derived purely from rankedJobs (already in the
  // backend's ranked order); never reorders, never calls an AI provider.
  const recommendationExplanation = buildRecommendationExplanation(rankedJobs)

  // Presentation-only navigation — preserves rewrite/interview/selected state.
  const jumpToJobDetail = (jobId) => {
    setSelectedJobId(jobId)
    setShowAllRequirements(false)
    setShowAllActions(false)
    setViewMode('individual')
  }

  // Default decision for a rewrite that hasn't been touched yet — sourced
  // from the backend-computed validation, never mutated in place.
  const getDefaultDecision = (rewrite) => ({
    status: 'pending',
    text: rewrite.rewrittenText || '',
    editing: false,
    draftText: rewrite.rewrittenText || '',
    flags: rewrite.validation?.flags || [],
    // Inline "Accept anyway?" confirmation is open for this rewrite.
    confirming: false,
    // Momentary edit-revalidation state: null | { state: 'checking'|'safe'|'review' }.
    editFeedback: null,
    saving: false,
    // Safe but not a meaningful improvement over the original — Accept stays
    // disabled until the user edits it (a distinct concern from fabrication).
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

  const severityFor = (rewrite, text, flags) =>
    classifyRewriteSeverity(flags, { originalText: rewrite.originalText, rewrittenText: text, evidenceEntries })

  const acceptNow = (key, decision) =>
    setDecision(selectedJob.jobId, key, { ...decision, status: 'accepted', confirming: false })

  const handleAccept = (key, rewrite) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    if (decision.noMeaningfulImprovement) return // unchanged rewrite — nothing to accept
    // The validator is a warning, not a blocker: safe accepts directly; review /
    // high-risk open a lightweight confirmation before accepting.
    if (severityFor(rewrite, decision.text, decision.flags) === 'safe') {
      acceptNow(key, decision)
    } else {
      setDecision(selectedJob.jobId, key, { ...decision, confirming: true })
    }
  }

  const handleConfirmAccept = (key, rewrite) => acceptNow(key, getDecision(selectedJob.jobId, key, rewrite))
  const handleCancelConfirm = (key, rewrite) =>
    setDecision(selectedJob.jobId, key, { ...getDecision(selectedJob.jobId, key, rewrite), confirming: false })

  const handleReject = (key, rewrite) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    setDecision(selectedJob.jobId, key, { ...decision, status: 'rejected', confirming: false })
  }

  const handleEditOpen = (key, rewrite) => {
    const decision = getDecision(selectedJob.jobId, key, rewrite)
    setDecision(selectedJob.jobId, key, { ...decision, editing: true, draftText: decision.text, confirming: false, editFeedback: null })
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
      flags: rewrite.validation?.flags || [],
      editFeedback: null,
      saving: false,
      noMeaningfulImprovement: rewrite.rewriteQualityStatus === 'no-meaningful-improvement',
    })
  }

  // Patch a single decision from inside an async callback without stale state.
  const patchDecision = (jobId, key, rewrite, patch) =>
    setRewriteDecisions((current) => {
      const prev = current[jobId]?.[key] || getDefaultDecision(rewrite)
      return { ...current, [jobId]: { ...current[jobId], [key]: { ...prev, ...patch } } }
    })

  const handleSaveEdit = (key, rewrite) => {
    const jobId = selectedJob.jobId
    const decision = getDecision(jobId, key, rewrite)
    const draft = decision.draftText
    // Phase 1 — show a brief "Checking edit…" state and disable Save.
    setDecision(jobId, key, { ...decision, saving: true, editFeedback: { state: 'checking' } })

    window.setTimeout(() => {
      // Phase 2 — re-run the SAME anti-fabrication validation on the edited text.
      const validation = validateRewriteIntegrity({ originalText: rewrite.originalText, rewrittenText: draft }, evidenceEntries)
      const severity = severityFor(rewrite, draft, validation.flags)
      patchDecision(jobId, key, rewrite, {
        text: draft,
        editing: false,
        saving: false,
        flags: validation.flags,
        noMeaningfulImprovement: false,
        editFeedback: { state: severity === 'safe' ? 'safe' : 'review' },
      })
      // Phase 3 — auto-dismiss the subtle feedback after a short period.
      window.setTimeout(() => {
        patchDecision(jobId, key, rewrite, { editFeedback: null })
      }, 2500)
    }, 400)
  }

  // On-demand only — a single request per click, never during analysis.
  const handleGenerateInterview = async () => {
    if (interview.status === 'loading') return // disable duplicate requests

    setInterview({ status: 'loading', error: '', questions: [] })
    try {
      const atsKeywords = (atsWorker?.output?.keywordMatches || []).map((item) => item.keyword || item.text).filter(Boolean)
      const payload = {
        job: { title: selectedJob?.jobTitle, description: selectedJob?.jobDescription || '' },
        analysis: {
          matchedSkills: displayedMatchedSkills.map((item) => item.skill || item.text).filter(Boolean),
          mandatoryGaps: selectedJob?.mandatoryGaps || [],
          atsKeywords,
        },
        resumeEvidence: evidenceEntries.map((item) => ({ id: item.id, text: item.text })),
        count: interviewOptions.count,
        difficulty: interviewOptions.difficulty,
      }
      const result = await generateInterviewQuestions(payload)
      setInterview({ status: 'success', error: '', questions: result.questions || [] })
    } catch (err) {
      setInterview({
        status: 'error',
        error: 'Interview questions could not be generated right now. Please try again.',
        questions: [],
      })
    }
  }

  const toggleWhy = (id) =>
    setExpandedWhy((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleFramework = (id) =>
    setExpandedFramework((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

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

  // Enhanced DOCX is only offered when we still hold the DOCX-derived structure
  // (an active analysis of an uploaded .docx). History records don't carry it.
  const canExportDocx = Array.isArray(resumeStructure) && resumeStructure.length > 0

  const handleDownloadDocx = async () => {
    // Ignore duplicate clicks while a generation is already in flight, and
    // require at least one accepted rewrite (the button is also disabled).
    if (docxExport.status === 'generating' || acceptedEntries.length === 0) return

    // Only accepted rewrites (edited text already lives in decision.text) map to
    // a replacement keyed by evidenceId; everything else keeps its original text.
    const replacements = {}
    acceptedEntries.forEach((entry) => {
      const evidenceId = entry.rewrite.evidenceId
      if (evidenceId && typeof entry.decision.text === 'string' && entry.decision.text.trim()) {
        replacements[evidenceId] = entry.decision.text
      }
    })

    setDocxExport({ status: 'generating', error: '' })
    try {
      const blob = await exportResumeDocx({ candidateName, structure: resumeStructure, replacements })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = docxDownloadName(candidateName)
      link.click()
      window.URL.revokeObjectURL(url)
      setDocxExport({ status: 'success', error: '' })
    } catch (err) {
      setDocxExport({ status: 'error', error: err.message || 'Unable to generate the enhanced DOCX.' })
    }
  }

  return (
    <section className="space-y-xl pb-xl animate-enter" aria-labelledby="results-heading">
      {/* Progress Indicator */}
      <div className="mb-xl">
        <div className="flex items-center justify-between mb-md">
          <div className="flex items-center gap-sm">
            <span className="font-label-md text-label-md bg-on-surface text-surface px-3 py-1">PHASE 03</span>
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
          {canCompare ? (
            <button
              type="button"
              aria-pressed={viewMode === 'compare'}
              className={`px-lg py-sm border font-label-md text-label-md rounded transition-colors font-bold uppercase flex items-center gap-xs ${viewMode === 'compare' ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface hover:bg-surface-container'}`}
              onClick={() => setViewMode((mode) => (mode === 'compare' ? 'individual' : 'compare'))}
            >
              <span className="material-symbols-outlined text-[18px]">{viewMode === 'compare' ? 'view_agenda' : 'compare_arrows'}</span>
              {viewMode === 'compare' ? 'Individual Results' : 'Compare Jobs'}
            </button>
          ) : null}
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

      {viewMode === 'individual' ? (
      <>
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
                setShowAllRequirements(false)
                setShowAllActions(false)
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

        {/* Why this score? — transparent, deterministic breakdown */}
        {scoreExplanation ? (
          <div className="border border-outline-variant rounded-lg bg-surface">
            <button
              type="button"
              className="w-full flex items-center justify-between gap-sm px-lg py-md text-left"
              aria-expanded={whyScoreOpen}
              aria-controls="why-this-score-panel"
              onClick={() => setWhyScoreOpen((open) => !open)}
            >
              <span className="font-label-md text-label-md font-extrabold text-on-surface uppercase tracking-wider flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">insights</span>
                Why this score?
              </span>
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
                {whyScoreOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            <div id="why-this-score-panel" className={`collapsible ${whyScoreOpen ? 'collapsible-open' : ''}`} aria-hidden={!whyScoreOpen}>
              <div className="collapsible-inner">
                <div className="px-lg pb-lg space-y-lg">
                  {/* Deterministic summary */}
                  <p className="font-body-md text-body-md text-on-surface m-0">{scoreExplanation.summary}</p>

                  {/* Component coverage bars */}
                  {componentRows.length > 0 ? (
                    <div className="space-y-sm">
                      {componentRows.map((row) => (
                        <div key={row.key}>
                          <div className="flex justify-between items-center gap-sm mb-xs">
                            <span className="font-label-sm text-label-sm text-on-surface font-bold">{row.label}</span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant font-bold">{row.value}%</span>
                          </div>
                          <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden" role="img" aria-label={`${row.label}: ${row.value} percent`}>
                            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${row.value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {/* Strong matches */}
                  {scoreExplanation.strongMatches.length > 0 ? (
                    <div className="space-y-xs">
                      <h5 className="font-label-sm text-label-sm font-extrabold text-success uppercase tracking-wider m-0">Strong matches</h5>
                      <div className="flex flex-wrap gap-xs">
                        {scoreExplanation.strongMatches.map((match) => (
                          <span key={match.requirement} className="chip tone-strong flex items-center gap-xs">
                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">check</span>
                            {match.requirement}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Main deductions */}
                  {topDeductions.length > 0 ? (
                    <div className="space-y-xs">
                      <h5 className="font-label-sm text-label-sm font-extrabold text-on-surface uppercase tracking-wider m-0">Score deductions</h5>
                      <ul className="space-y-xs m-0 pl-0 list-none">
                        {topDeductions.map((deduction) => {
                          const meta = REQUIREMENT_STATUS_META[deduction.status] || REQUIREMENT_STATUS_META.missing
                          return (
                            <li key={deduction.requirement} className="flex items-center justify-between gap-sm">
                              <span className="font-body-md text-body-md text-on-surface">
                                <span className="font-bold">{deduction.requirement}</span>
                                <span className="text-on-surface-variant"> — {deduction.reason}</span>
                              </span>
                              <span className={`chip ${meta.tone} flex-none flex items-center gap-xs`}>
                                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{meta.icon}</span>
                                {meta.label}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {/* Score caps (only when they materially affected the result) */}
                  {scoreExplanation.capsApplied.length > 0 ? (
                    <div className="space-y-xs">
                      <h5 className="font-label-sm text-label-sm font-extrabold text-warning uppercase tracking-wider m-0">Score cap</h5>
                      {scoreExplanation.capsApplied.map((cap) => (
                        <p key={cap.code} className="font-body-md text-body-md text-on-surface-variant m-0 flex items-start gap-xs">
                          <span className="material-symbols-outlined text-[16px] text-warning flex-none" aria-hidden="true">block</span>
                          {cap.description}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {/* View all requirements */}
                  {scoreExplanation.requirements.length > 0 ? (
                    <div>
                      <button
                        type="button"
                        className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider flex items-center gap-xs"
                        aria-expanded={showAllRequirements}
                        aria-controls="all-requirements-panel"
                        onClick={() => setShowAllRequirements((open) => !open)}
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{showAllRequirements ? 'expand_less' : 'list'}</span>
                        {showAllRequirements ? 'Hide requirements' : `View all requirements (${scoreExplanation.requirements.length})`}
                      </button>
                      <div id="all-requirements-panel" className={`collapsible ${showAllRequirements ? 'collapsible-open mt-sm' : ''}`} aria-hidden={!showAllRequirements}>
                        <div className="collapsible-inner">
                          <ul className="space-y-xs m-0 pl-0 list-none">
                            {scoreExplanation.requirements.map((req) => {
                              const meta = REQUIREMENT_STATUS_META[req.status] || REQUIREMENT_STATUS_META.missing
                              return (
                                <li key={`${req.requirement}-${req.requirementType}`} className="flex items-center justify-between gap-sm py-xs border-b border-outline-variant last:border-b-0">
                                  <span className="font-body-md text-body-md text-on-surface">
                                    {req.requirement}
                                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase"> · {req.requirementType}</span>
                                  </span>
                                  <span className={`chip ${meta.tone} flex-none flex items-center gap-xs`}>
                                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{meta.icon}</span>
                                    {meta.label}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Application Readiness — deterministic status derived from the score
            explanation above (no new score, no AI call). */}
        {readiness ? (
          <div className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md">
            <div className="flex items-center justify-between gap-sm flex-wrap">
              <h4 className="font-label-md text-label-md font-extrabold uppercase tracking-widest flex items-center gap-sm m-0">
                <span className="material-symbols-outlined" aria-hidden="true">verified_user</span>
                Application Readiness
              </h4>
              <span className={`chip ${READINESS_META[readiness.status]?.tone || 'tone-info'} flex items-center gap-xs`}>
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{READINESS_META[readiness.status]?.icon || 'info'}</span>
                {readiness.label}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider m-0">Match</p>
                <p className="font-headline-md text-base font-bold text-on-surface m-0">{readiness.metrics.matchScore}%</p>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider m-0">Mandatory Coverage</p>
                <p className="font-headline-md text-base font-bold text-on-surface m-0">{readiness.metrics.mandatoryCoverage ?? '—'}{readiness.metrics.mandatoryCoverage !== null ? '%' : ''}</p>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider m-0">ATS Coverage</p>
                <p className="font-headline-md text-base font-bold text-on-surface m-0">{readiness.metrics.atsCoverage ?? '—'}{readiness.metrics.atsCoverage !== null ? '%' : ''}</p>
              </div>
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider m-0">Critical Gaps</p>
                <p className="font-headline-md text-base font-bold text-on-surface m-0">{readiness.metrics.criticalGapCount}</p>
              </div>
            </div>

            <p className="font-body-md text-body-md text-on-surface m-0">{readiness.summary}</p>
          </div>
        ) : null}

        {/* Priority Actions Before Applying — deterministic gap-to-action plan. */}
        {priorityActions.length > 0 ? (
          <section className="space-y-md">
            <h4 className="font-display text-headline-md font-bold text-on-surface flex items-center gap-sm">
              <span className="material-symbols-outlined text-primary" aria-hidden="true">checklist</span>
              Priority Actions Before Applying
            </h4>
            <ol className="space-y-md m-0 pl-0 list-none">
              {visibleActions.map((action) => {
                const meta = ACTION_SEVERITY_META[action.severity] || ACTION_SEVERITY_META.medium
                return (
                  <li key={`${action.priority}-${action.title}`} className="p-lg border border-outline-variant rounded-lg bg-surface space-y-xs">
                    <div className="flex items-start justify-between gap-sm flex-wrap">
                      <p className="font-body-lg text-body-lg font-bold text-on-surface m-0">
                        {action.priority}. {action.title}
                      </p>
                      <span className={`chip ${meta.tone} flex-none inline-flex items-center gap-xs`}>
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{meta.icon}</span>
                        {meta.label}
                      </span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant m-0">{action.reason}</p>
                    {action.evidenceIds.length > 0 ? (
                      <p className="font-label-sm text-label-sm text-on-surface-variant m-0">Evidence: {action.evidenceIds.join(', ')}</p>
                    ) : null}
                    <p className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary m-0 mt-xs">Recommended action</p>
                    <p className="font-body-md text-body-md text-on-surface m-0">{action.action}</p>
                  </li>
                )
              })}
            </ol>
            {priorityActions.length > 3 ? (
              <button
                type="button"
                className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider flex items-center gap-xs"
                aria-expanded={showAllActions}
                onClick={() => setShowAllActions((open) => !open)}
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{showAllActions ? 'expand_less' : 'expand_more'}</span>
                {showAllActions ? 'Show fewer actions' : `View all actions (${priorityActions.length})`}
              </button>
            ) : null}
          </section>
        ) : null}

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
          <div className="flex flex-col gap-md lg:flex-row lg:justify-between lg:items-center">
            <div>
              <h4 className="font-display text-headline-md font-bold text-on-surface flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">edit_note</span>
                Executive Bullet Rewrites
              </h4>
              <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
                Review and approve evidence-grounded bullet statements tailored for {selectedJob?.jobTitle}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-sm lg:flex-none lg:justify-end">
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleCopyApproved} title="Copy approved rewrites to clipboard">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span>
                Copy
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleExportJson} title="Export approvals as JSON">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">data_object</span>
                JSON
              </button>
              {canExportDocx ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleDownloadDocx}
                  disabled={docxExport.status === 'generating' || acceptedEntries.length === 0}
                  aria-disabled={docxExport.status === 'generating' || acceptedEntries.length === 0}
                  aria-busy={docxExport.status === 'generating'}
                  title={
                    acceptedEntries.length === 0
                      ? 'Accept at least one rewrite to enable the enhanced DOCX download'
                      : 'Download an enhanced DOCX with your accepted rewrites applied'
                  }
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${docxExport.status === 'generating' ? 'status-dot-pulse' : ''}`}
                    aria-hidden="true"
                  >
                    {docxExport.status === 'generating' ? 'progress_activity' : 'description'}
                  </span>
                  {docxExport.status === 'generating' ? 'Generating…' : 'Download DOCX'}
                </button>
              ) : null}
            </div>
          </div>

          {copyMessage ? <p className="font-label-md text-label-md text-success font-bold" role="status">{copyMessage}</p> : null}

          {canExportDocx && docxExport.status === 'success' ? (
            <p className="font-label-md text-label-md text-success font-bold" role="status">
              Enhanced DOCX downloaded.
            </p>
          ) : null}
          {canExportDocx && docxExport.status === 'error' ? (
            <p className="font-label-md text-label-md text-error font-bold" role="alert">
              {docxExport.error}
            </p>
          ) : null}

          {rewriteWorker?.status === 'failed' ? (
            <div className="p-md bg-error-container text-on-error-container rounded font-body-md text-body-md flex items-center gap-md" role="alert">
              <span className="material-symbols-outlined">error</span>
              Bullet rewrite generation failed: {rewriteWorker.errorMessage || 'Unknown error'}
            </div>
          ) : null}

          {rewriteEntries.length > 0 ? (
            <div className="space-y-md animate-stagger">
              {rewriteEntries.map(({ rewrite, key, decision }) => {
                const { status, editing, draftText, text, flags, confirming, editFeedback, saving, noMeaningfulImprovement } = decision
                const isAccepted = status === 'accepted'
                const isRejected = status === 'rejected'
                const cardClass = isAccepted
                  ? 'tone-strong-surface'
                  : isRejected
                    ? 'tone-failed-surface'
                    : 'bg-surface border-outline-variant'

                const noImprovementNoteId = `no-improvement-${selectedJob.jobId}-${key}`
                const severity = severityFor(rewrite, text, flags) // 'safe' | 'review' | 'highRisk'
                const needsReview = severity !== 'safe' && status === 'pending'
                const severityCopy = SEVERITY_COPY[severity]
                const isHighRisk = severity === 'highRisk'
                // Kept only for the collapsed "Validation details" disclosure — never the primary view.
                const explanations = explainFlags(flags, { originalText: rewrite.originalText, rewrittenText: text, evidenceEntries })
                const segments = !editing && rewrite.originalText ? splitAdditions(rewrite.originalText, text) : null
                const hasHighlight = Boolean(segments && segments.some((segment) => segment.added))

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
                        {noMeaningfulImprovement && status === 'pending' ? (
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
                        {confirming ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary relative z-10"
                              onClick={() => handleCancelConfirm(key, rewrite)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={`btn btn-sm relative z-10 ${isHighRisk ? 'btn-destructive' : 'btn-primary'}`}
                              onClick={() => handleConfirmAccept(key, rewrite)}
                            >
                              Accept anyway
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={noMeaningfulImprovement}
                              aria-disabled={noMeaningfulImprovement}
                              aria-describedby={noMeaningfulImprovement ? noImprovementNoteId : undefined}
                              title={noMeaningfulImprovement ? 'This rewrite is not a meaningful improvement — edit it before accepting.' : undefined}
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
                          </>
                        )}
                      </div>
                    </div>

                    {/* Lightweight "Accept anyway?" confirmation */}
                    {confirming ? (
                      <div role="alertdialog" aria-label="Confirm acceptance" className="rewrite-review-note p-md">
                        <p className="font-body-md text-body-md m-0">
                          This suggestion contains wording that may not be fully supported by your resume evidence. Accept anyway?
                        </p>
                      </div>
                    ) : null}

                    {/* Single yellow Review Required card (severity-driven). No verbose lists. */}
                    {needsReview && !editing ? (
                      <div className={`rewrite-review-note p-md space-y-xs ${isHighRisk ? 'rewrite-review-note--strong' : ''}`} role="status">
                        <p className="font-label-md text-label-md font-bold flex items-center gap-xs m-0">
                          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{isHighRisk ? 'error' : 'warning'}</span>
                          {severityCopy.title}
                        </p>
                        <p className="font-body-md text-body-md m-0">{severityCopy.body}</p>
                        {flags.length > 0 ? (
                          <p className="font-label-sm text-label-sm m-0 opacity-90">{severityCopy.secondary}</p>
                        ) : null}
                        {flags.length > 0 ? (
                          <details className="mt-xs">
                            <summary className="font-label-sm text-label-sm cursor-pointer select-none">Validation details</summary>
                            <ul className="mt-xs space-y-xs m-0 pl-md">
                              {explanations.map(({ code, message }) => (
                                <li key={code} className="font-label-sm text-label-sm">{message}</li>
                              ))}
                            </ul>
                            <code className="block mt-xs font-label-sm text-label-sm opacity-80">{flags.join(', ')}</code>
                          </details>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Subtle edit-revalidation feedback (auto-dismisses) */}
                    {editFeedback ? (
                      <p
                        className={`font-label-md text-label-md font-bold flex items-center gap-xs m-0 ${editFeedback.state === 'safe' ? 'text-success' : editFeedback.state === 'review' ? 'text-warning' : 'text-on-surface-variant'}`}
                        role="status"
                        aria-live="polite"
                      >
                        {editFeedback.state === 'checking' ? (
                          <>
                            <span className="material-symbols-outlined text-[18px] status-dot-pulse" aria-hidden="true">progress_activity</span>
                            Checking edit…
                          </>
                        ) : editFeedback.state === 'safe' ? (
                          <>
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span>
                            Review updated
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">warning</span>
                            Review recommended
                          </>
                        )}
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
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => handleSaveEdit(key, rewrite)}
                              disabled={saving}
                              aria-busy={saving}
                            >
                              {saving ? (
                                <>
                                  <span className="material-symbols-outlined text-[16px] status-dot-pulse" aria-hidden="true">progress_activity</span>
                                  Checking…
                                </>
                              ) : (
                                'Save Edit'
                              )}
                            </button>
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleCancelEdit(key, rewrite)} disabled={saving}>
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

        {/* Interview Preparation — on-demand question generation */}
        <section className="space-y-md pt-lg border-t border-outline-variant">
          <div className="flex flex-col gap-md lg:flex-row lg:justify-between lg:items-end">
            <div>
              <h4 className="font-display text-headline-md font-bold text-on-surface flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary">quiz</span>
                Interview Preparation
              </h4>
              <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
                Generate targeted, evidence-grounded interview questions for {selectedJob?.jobTitle}.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-md">
              <label className="flex flex-col gap-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Questions</span>
                <select
                  className="bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary"
                  value={interviewOptions.count}
                  aria-label="Question count"
                  onChange={(event) => setInterviewOptions((current) => ({ ...current, count: Number(event.target.value) }))}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </label>
              <label className="flex flex-col gap-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Difficulty</span>
                <select
                  className="bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary"
                  value={interviewOptions.difficulty}
                  aria-label="Difficulty"
                  onChange={(event) => setInterviewOptions((current) => ({ ...current, difficulty: event.target.value }))}
                >
                  <option value="standard">Standard</option>
                  <option value="challenging">Challenging</option>
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleGenerateInterview}
                disabled={interview.status === 'loading'}
                aria-busy={interview.status === 'loading'}
              >
                <span className={`material-symbols-outlined text-[18px] ${interview.status === 'loading' ? 'status-dot-pulse' : ''}`} aria-hidden="true">
                  {interview.status === 'loading' ? 'progress_activity' : 'auto_awesome'}
                </span>
                {interview.status === 'loading' ? 'Preparing…' : 'Generate Interview Questions'}
              </button>
            </div>
          </div>

          {interview.status === 'loading' ? (
            <p className="font-label-md text-label-md text-on-surface-variant font-bold flex items-center gap-xs" role="status" aria-live="polite">
              <span className="material-symbols-outlined text-[18px] status-dot-pulse" aria-hidden="true">progress_activity</span>
              Preparing interview questions...
            </p>
          ) : null}

          {interview.status === 'error' ? (
            <p className="font-label-md text-label-md text-error font-bold" role="alert">{interview.error}</p>
          ) : null}

          {interview.status === 'success' && interview.questions.length > 0 ? (
            <div className="space-y-md animate-stagger">
              {interview.questions.map((q) => {
                const whyOpen = expandedWhy.has(q.id)
                const frameworkOpen = expandedFramework.has(q.id)
                const evidenceRef = q.evidenceIds?.length ? q.evidenceIds.join(', ') : null
                return (
                  <article key={q.id} className="p-lg border border-outline-variant rounded-lg bg-surface space-y-sm animate-enter">
                    <div className="flex items-start justify-between gap-sm flex-wrap">
                      <span className={`chip ${INTERVIEW_CATEGORY_TONE[q.category] || 'tone-info'}`}>{INTERVIEW_CATEGORY_LABEL[q.category] || q.category}</span>
                      {evidenceRef ? (
                        <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase">Evidence: {evidenceRef}</span>
                      ) : null}
                    </div>
                    <p className="font-body-lg text-body-lg text-on-surface leading-relaxed m-0">{q.question}</p>

                    <div className="flex flex-wrap gap-md pt-xs">
                      <button
                        type="button"
                        className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-wider flex items-center gap-xs"
                        onClick={() => toggleWhy(q.id)}
                        aria-expanded={whyOpen}
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{whyOpen ? 'expand_less' : 'help'}</span>
                        Why this question?
                      </button>
                      <button
                        type="button"
                        className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider flex items-center gap-xs hover:text-on-surface"
                        onClick={() => toggleFramework(q.id)}
                        aria-expanded={frameworkOpen}
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{frameworkOpen ? 'expand_less' : 'lightbulb'}</span>
                        Show Answer Framework
                      </button>
                    </div>

                    {/* Smooth expand/collapse: the grid-rows 0fr↔1fr trick
                        animates height without measuring, plus a fade. */}
                    <div className={`collapsible ${whyOpen ? 'collapsible-open mt-xs' : ''}`} aria-hidden={!whyOpen}>
                      <div className="collapsible-inner">
                        <div className="rewrite-original p-md">
                          <p className="font-body-md text-body-md m-0">{q.whyThisQuestion}</p>
                          {q.relatedRequirement ? (
                            <p className="font-label-sm text-label-sm text-on-surface-variant m-0 mt-xs">Related requirement: {q.relatedRequirement}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className={`collapsible ${frameworkOpen ? 'collapsible-open mt-xs' : ''}`} aria-hidden={!frameworkOpen}>
                      <div className="collapsible-inner">
                        <div className="rewrite-suggested p-md space-y-xs">
                          <p className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary m-0">Answer Framework (STAR)</p>
                          {buildAnswerFramework(q).map(({ label, prompt }) => (
                            <p key={label} className="font-body-md text-body-md m-0">
                              <span className="font-bold">{label}:</span> {prompt}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}

          {interview.status === 'success' && interview.questions.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">No interview questions were generated. Please try again.</p>
          ) : null}
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
      </>
      ) : (
        <div className="space-y-lg animate-enter">
          {/* Deterministic recommended-role summary (no LLM) */}
          {comparisonSummary ? (
            <div className="p-lg bg-surface border border-outline-variant rounded-lg flex items-start gap-sm" role="status">
              <span className="material-symbols-outlined text-primary flex-none" aria-hidden="true">emoji_events</span>
              <p className="font-body-md text-body-md text-on-surface m-0">{comparisonSummary}</p>
            </div>
          ) : null}

          {/* Why This Job Wins — deterministic explanation for the best-fit job
              (rankedJobs[0], per the backend's existing ranking). Built purely
              from data already in rankedJobs; zero additional AI calls. */}
          {recommendationExplanation ? (
            <div className="p-lg bg-surface border-2 border-primary/30 rounded-lg space-y-md">
              <div className="flex items-center gap-sm flex-wrap">
                <span className="chip tone-strong inline-flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[14px]" aria-hidden="true">star</span>
                  Best Fit
                </span>
                <h4 className="font-display text-headline-md font-bold text-on-surface m-0">{recommendationExplanation.jobTitle}</h4>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider m-0">
                {recommendationExplanation.headline}
              </p>

              <div>
                <h5 className="font-label-sm text-label-sm font-extrabold text-success uppercase tracking-wider m-0 mb-xs">Why this role wins</h5>
                <ul className="space-y-xs m-0 pl-0 list-none">
                  {recommendationExplanation.strengths.map((strength) => (
                    <li key={strength.label} className="font-body-md text-body-md text-on-surface flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[16px] text-success flex-none" aria-hidden="true">check</span>
                      {strength.label}
                      {strength.value ? <span className="font-bold">&nbsp;({strength.value})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>

              {recommendationExplanation.comparison.map((entry) => (
                <div key={entry.jobId}>
                  <h5 className="font-label-sm text-label-sm font-extrabold text-on-surface-variant uppercase tracking-wider m-0 mb-xs">
                    Compared with {entry.jobTitle}
                  </h5>
                  <ul className="space-y-xs m-0 pl-0 list-none">
                    {entry.differences.map((line) => (
                      <li key={line} className="font-body-md text-body-md text-on-surface-variant flex items-start gap-xs">
                        <span className="material-symbols-outlined text-[16px] text-primary flex-none" aria-hidden="true">arrow_right</span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}

          {/* Metrics comparison — scrolls horizontally inside its own container */}
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Job comparison metrics">
            <table className="w-full border-collapse min-w-[520px]">
              <caption className="sr-only">Comparison of match score and requirement coverage across analyzed jobs</caption>
              <thead>
                <tr className="border-b border-outline-variant">
                  <th scope="col" className="text-left font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider px-md py-sm">Metric</th>
                  {comparisonJobs.map((job) => (
                    <th scope="col" key={job.jobId} className="px-md py-sm text-left align-bottom">
                      <button
                        type="button"
                        className="font-headline-md text-base font-bold text-on-surface hover:text-primary transition-colors text-left"
                        onClick={() => jumpToJobDetail(job.jobId)}
                        title={`Open ${job.title} detailed result`}
                      >
                        {job.title}
                      </button>
                      {job.company ? <p className="font-label-sm text-label-sm text-on-surface-variant m-0">{job.company}</p> : null}
                      {job.jobId === bestFitJobId ? (
                        <span className="chip tone-strong inline-flex items-center gap-xs mt-xs">
                          <span className="material-symbols-outlined text-[14px]" aria-hidden="true">star</span>
                          Best Fit
                        </span>
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.key} className="border-b border-outline-variant last:border-b-0">
                    <th scope="row" className="text-left font-label-sm text-label-sm text-on-surface font-bold px-md py-md align-top">{row.label}</th>
                    {comparisonJobs.map((job) => (
                      <td key={job.jobId} className="px-md py-md align-top min-w-[120px]">{renderComparisonCell(row, job)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-job breakdown (Strongest Matches + Main Deductions = Key Differences) */}
          <div className={comparisonGridClass}>
            {comparisonJobs.map((job) => (
              <div key={job.jobId} className="p-lg border border-outline-variant rounded-lg bg-surface space-y-md">
                <div className="flex items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <h5 className="font-headline-md text-base font-bold text-on-surface m-0 truncate">{job.title}</h5>
                    <p className="font-label-sm text-label-sm text-on-surface-variant m-0">{formatScore(job.score)} / 100 · {job.label}</p>
                  </div>
                  {job.jobId === bestFitJobId ? (
                    <span className="chip tone-strong flex-none inline-flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">star</span>
                      Best Fit
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-md font-label-sm text-label-sm text-on-surface-variant">
                  <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-[16px] text-success" aria-hidden="true">check_circle</span>{job.strongCount} strong matches</span>
                  <span className="flex items-center gap-xs"><span className="material-symbols-outlined text-[16px] text-warning" aria-hidden="true">warning</span>{job.deductionCount} deductions</span>
                </div>

                <div className="space-y-xs">
                  <h6 className="font-label-sm text-label-sm font-extrabold text-success uppercase tracking-wider m-0">Strongest Matches</h6>
                  {job.strongMatches.length > 0 ? (
                    <ul className="space-y-xs m-0 pl-0 list-none">
                      {job.strongMatches.slice(0, 5).map((match) => (
                        <li key={match.requirement} className="font-body-md text-body-md text-on-surface flex items-center gap-xs">
                          <span className="material-symbols-outlined text-[16px] text-success" aria-hidden="true">check</span>{match.requirement}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="font-body-md text-body-md text-on-surface-variant m-0">No strong matches surfaced.</p>
                  )}
                </div>

                <div className="space-y-xs">
                  <h6 className="font-label-sm text-label-sm font-extrabold text-on-surface uppercase tracking-wider m-0">Main Deductions</h6>
                  {job.deductions.length > 0 ? (
                    <ul className="space-y-xs m-0 pl-0 list-none">
                      {job.deductions.slice(0, 5).map((deduction) => {
                        const meta = REQUIREMENT_STATUS_META[deduction.status] || REQUIREMENT_STATUS_META.missing
                        return (
                          <li key={deduction.requirement} className="font-body-md text-body-md text-on-surface flex items-center justify-between gap-sm">
                            <span>{deduction.requirement}</span>
                            <span className={`chip ${meta.tone} flex-none inline-flex items-center gap-xs`}>
                              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{meta.icon}</span>{meta.label}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="font-body-md text-body-md text-on-surface-variant m-0">No deductions.</p>
                  )}
                </div>

                <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => jumpToJobDetail(job.jobId)}>
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">open_in_full</span>
                  View detailed result
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default ResultsPanel
