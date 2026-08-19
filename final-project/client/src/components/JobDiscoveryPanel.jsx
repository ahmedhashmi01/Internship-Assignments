import { useEffect, useState } from 'react'
import { discoverJobs, parseResume } from '../services/api.js'

const WORK_TYPE_OPTIONS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
]

const SENIORITY_OPTIONS = [
  { value: '', label: 'Any seniority' },
  { value: 'junior', label: 'Junior' },
  { value: 'mid', label: 'Mid-level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
]

const MIN_SCORE_OPTIONS = [0, 40, 50, 60, 70, 80]

const MODE_BANNER = {
  live: { tone: 'tone-strong', icon: 'wifi', label: (sources) => `Live search · ${sources.join(' + ')}` },
  demo: { tone: 'tone-info', icon: 'science', label: () => 'Showing sample jobs (live search is off)' },
  'demo-fallback': { tone: 'tone-moderate', icon: 'warning', label: () => 'Live search unavailable — showing sample jobs.' },
}

const WORK_TYPE_LABEL = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }
const CANDIDATE_SENIORITY_LABEL = { junior: 'Junior', mid: 'Mid-level', senior: 'Senior', lead: 'Lead' }
const MAX_VISIBLE_CHIPS = 4

// Purely client-side loading feedback (the search request/response is
// unchanged — this never touches provider/matching logic). Cycling messages +
// an elapsed timer + skeleton cards make a several-second search read as
// "working", not "stuck" — same reassurance pattern as the interview-question
// loading state.
const JOB_SEARCH_LOADING_MESSAGES = [
  'Analyzing your candidate profile…',
  'Building search queries from your strongest skills…',
  'Searching Adzuna, Remotive, and Jooble…',
  'Removing duplicate listings…',
  'Scoring each role’s Discovery Match…',
  'Ranking your best-fit roles…',
]

function JobSearchLoadingState() {
  const [messageIndex, setMessageIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  // Fresh timers every time this mounts (i.e. every time a search starts).
  useEffect(() => {
    const startedAt = Date.now()
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    const cycle = setInterval(() => {
      setMessageIndex((current) => (current < JOB_SEARCH_LOADING_MESSAGES.length - 1 ? current + 1 : current))
    }, 1600)
    return () => {
      clearInterval(tick)
      clearInterval(cycle)
    }
  }, [])

  return (
    <div className="space-y-md animate-enter" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-md p-md bg-surface border border-outline-variant rounded-lg">
        <span className="material-symbols-outlined text-primary text-[22px] status-dot-pulse flex-none" aria-hidden="true">travel_explore</span>
        <div className="min-w-0 flex-1">
          <p className="font-label-md text-label-md text-on-surface font-bold m-0 min-h-[1.25rem]">
            {JOB_SEARCH_LOADING_MESSAGES[messageIndex]}
          </p>
          <p className="font-label-sm text-label-sm text-on-surface-variant m-0">{elapsed}s elapsed — this can take a little while</p>
        </div>
        <div className="flex items-center gap-1.5 flex-none" aria-hidden="true">
          <span className="w-2 h-2 rounded-full bg-primary processing-dot" />
          <span className="w-2 h-2 rounded-full bg-primary processing-dot" />
          <span className="w-2 h-2 rounded-full bg-primary processing-dot" />
        </div>
      </div>

      {/* Skeleton job cards — shows the shape of what's coming (title, meta
          lines, score badge) so the section never looks empty/frozen. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-lg" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="p-lg border border-outline-variant rounded-lg bg-surface space-y-sm status-dot-pulse">
            <div className="flex items-start justify-between gap-md">
              <div className="flex-1 space-y-xs">
                <div className="h-5 w-2/3 rounded bg-surface-container-high" />
                <div className="h-4 w-1/2 rounded bg-surface-container-high" />
                <div className="h-4 w-1/3 rounded bg-surface-container-high" />
              </div>
              <div className="h-8 w-12 rounded bg-surface-container-high flex-none" />
            </div>
            <div className="flex gap-xs pt-xs">
              <div className="h-6 w-16 rounded-full bg-surface-container-high" />
              <div className="h-6 w-16 rounded-full bg-surface-container-high" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Never claims "Posted today" unless the timestamp genuinely supports it.
function formatPostedAt(iso) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days <= 0) return 'Posted today'
  if (days === 1) return 'Posted 1 day ago'
  if (days < 30) return `Posted ${days} days ago`
  return `Posted ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
}

function formatSalary(salary) {
  if (!salary || (salary.min == null && salary.max == null)) return null
  const currency = salary.currency || ''
  const fmt = (n) => `${currency} ${Number(n).toLocaleString()}`.trim()
  if (salary.min != null && salary.max != null) return `${fmt(salary.min)} – ${fmt(salary.max)}`
  return fmt(salary.min ?? salary.max)
}

// Shared field set for the search form — rendered both before the first
// search and again inside "Edit Preferences" after a search has run.
function PreferencesFields({ preferences, setPreferences, toggleWorkType }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
        <div>
          <label htmlFor="jd-location" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Location</label>
          <input
            id="jd-location"
            type="text"
            className="w-full bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary"
            value={preferences.location}
            onChange={(e) => setPreferences((current) => ({ ...current, location: e.target.value }))}
            placeholder="e.g. London"
          />
        </div>
        <div>
          <label htmlFor="jd-country" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Country</label>
          <input
            id="jd-country"
            type="text"
            maxLength={2}
            className="w-full bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary uppercase"
            value={preferences.country}
            onChange={(e) => setPreferences((current) => ({ ...current, country: e.target.value.toLowerCase() }))}
            placeholder="gb"
          />
        </div>
        <div>
          <label htmlFor="jd-seniority" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Seniority</label>
          <select
            id="jd-seniority"
            className="w-full bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary"
            value={preferences.seniority}
            onChange={(e) => setPreferences((current) => ({ ...current, seniority: e.target.value }))}
          >
            {SENIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="jd-min-score" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Minimum Discovery Match</label>
          <select
            id="jd-min-score"
            className="w-full bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary"
            value={preferences.minimumDiscoveryScore}
            onChange={(e) => setPreferences((current) => ({ ...current, minimumDiscoveryScore: Number(e.target.value) }))}
          >
            {MIN_SCORE_OPTIONS.map((value) => <option key={value} value={value}>{value === 0 ? 'Any' : `${value}%+`}</option>)}
          </select>
        </div>
      </div>

      <div>
        <span className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Work type</span>
        <div className="flex flex-wrap gap-md">
          {WORK_TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-xs font-body-md text-body-md text-on-surface">
              <input type="checkbox" checked={preferences.workTypes.includes(option.value)} onChange={() => toggleWorkType(option.value)} />
              {option.label}
            </label>
          ))}
        </div>
      </div>
    </>
  )
}

// Compact "Candidate Profile" summary — replaces showing the raw resume
// beside every job result. Built entirely from the profile already returned
// by the discovery call; no extra request.
function CandidateProfileSummary({ profile }) {
  if (!profile) return null

  const primaryFit = profile.primaryRoleFamilies?.length ? profile.primaryRoleFamilies.join(' / ') : 'Not determined'
  const seniority = profile.seniority ? (CANDIDATE_SENIORITY_LABEL[profile.seniority] || profile.seniority) : 'Not specified'
  const skills = profile.skills?.length ? profile.skills.slice(0, 5).join(' · ') : '—'
  const adjacent = profile.adjacentRoleFamilies?.length ? profile.adjacentRoleFamilies.join(' · ') : '—'

  const fields = [
    { label: 'Primary Fit', value: primaryFit },
    { label: 'Seniority', value: seniority },
    { label: 'Strongest Skills', value: skills },
    { label: 'Adjacent Roles', value: adjacent },
  ]

  return (
    <div className="p-lg bg-surface border border-outline-variant rounded-md">
      <p className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider m-0 mb-md">Candidate Profile</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-md">
        {fields.map((field) => (
          <div key={field.label}>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider m-0">{field.label}</p>
            <p className="font-body-md text-body-md text-on-surface font-bold m-0">{field.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Raw resume text stays reachable (never removed) but tucked behind a
// disclosure instead of sitting beside every job result.
function ResumeDisclosure({ resumeText, selectedFile, evidence, open, onToggle }) {
  const hasRawText = Boolean(resumeText?.trim())
  const evidenceLines = (evidence || []).map((item) => item.text).filter(Boolean)
  if (!hasRawText && evidenceLines.length === 0 && !selectedFile) return null

  const content = hasRawText
    ? resumeText
    : evidenceLines.length > 0
      ? evidenceLines.join('\n')
      : `Uploaded file: ${selectedFile?.name || 'resume'}`

  return (
    <div className="p-lg bg-surface border border-outline-variant rounded-md">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-sm font-label-md text-label-md font-bold uppercase tracking-wider text-on-surface"
        aria-expanded={open}
        aria-controls="jd-resume-panel"
        onClick={onToggle}
      >
        <span className="flex items-center gap-xs">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">description</span>
          Resume Evidence
        </span>
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>
      </button>
      <div id="jd-resume-panel" className={`collapsible ${open ? 'collapsible-open mt-md' : ''}`} aria-hidden={!open}>
        <div className="collapsible-inner">
          <div className="max-h-64 overflow-y-auto custom-scrollbar font-body-md text-body-md text-on-surface-variant whitespace-pre-wrap">
            {content}
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact one-line-per-breakpoint summary of the preferences a search already
// ran with, plus a way back into the full field set.
function PreferencesSummaryBar({ preferences, onEdit }) {
  const workTypeLabel = preferences.workTypes.length > 0 ? preferences.workTypes.map((w) => WORK_TYPE_LABEL[w]).join(', ') : 'Any'
  const seniorityLabel = SENIORITY_OPTIONS.find((o) => o.value === preferences.seniority)?.label || 'Any seniority'
  const minScoreLabel = preferences.minimumDiscoveryScore ? `${preferences.minimumDiscoveryScore}%+` : 'Any'

  return (
    <div className="p-lg bg-surface border border-outline-variant rounded-md flex flex-wrap items-center justify-between gap-md">
      <div className="flex flex-wrap items-center gap-x-lg gap-y-xs font-body-md text-body-md text-on-surface">
        <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider mr-sm">Search Preferences</span>
        <span><span className="text-on-surface-variant">Location:</span> {preferences.location || 'Any'}</span>
        <span><span className="text-on-surface-variant">Work Type:</span> {workTypeLabel}</span>
        <span><span className="text-on-surface-variant">Seniority:</span> {seniorityLabel}</span>
        <span><span className="text-on-surface-variant">Minimum Match:</span> {minScoreLabel}</span>
      </div>
      <button type="button" className="btn btn-secondary btn-sm flex-none" onClick={onEdit}>
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">tune</span>
        Edit Preferences
      </button>
    </div>
  )
}

// A skill-chip list capped to MAX_VISIBLE_CHIPS with a "+N more" expander —
// presentation only; never changes which skills were matched/gapped.
function ChipGroup({ label, icon, tone, items }) {
  const [expanded, setExpanded] = useState(false)
  if (!items || items.length === 0) return null

  const visible = expanded ? items : items.slice(0, MAX_VISIBLE_CHIPS)
  const hiddenCount = items.length - visible.length

  return (
    <div>
      <p className={`font-label-sm text-label-sm font-extrabold uppercase tracking-wider m-0 mb-xs ${tone === 'tone-strong' ? 'text-success' : 'text-on-surface'}`}>{label}</p>
      <div className="flex flex-wrap gap-xs">
        {visible.map((skill) => (
          <span key={skill} className={`chip ${tone} flex items-center gap-xs`}>
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{icon}</span>{skill}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <button type="button" className="chip flex items-center gap-xs" onClick={() => setExpanded(true)}>
            +{hiddenCount} more
          </button>
        ) : null}
        {expanded && items.length > MAX_VISIBLE_CHIPS ? (
          <button type="button" className="chip flex items-center gap-xs" onClick={() => setExpanded(false)}>
            Show less
          </button>
        ) : null}
      </div>
    </div>
  )
}

function JobDiscoveryPanel({ resumeText, selectedFile, onSelectJob, onExpandChange }) {
  const [preferences, setPreferences] = useState({ location: '', country: 'gb', workTypes: [], seniority: '', minimumDiscoveryScore: 0 })
  const [evidence, setEvidence] = useState(null)
  const [candidateProfile, setCandidateProfile] = useState(null)
  const [discovery, setDiscovery] = useState({ status: 'idle', error: '' })
  const [editingPreferences, setEditingPreferences] = useState(false)
  const [resumeOpen, setResumeOpen] = useState(false)

  const hasResume = Boolean(resumeText?.trim() || selectedFile)
  const hasSearched = discovery.status === 'success'

  // Once a search has actually produced a candidate profile / results, the
  // parent (ResumeForm) expands this section to the full page width so the
  // job grid isn't squeezed beside an otherwise-empty resume column. Sticky
  // by design — a later re-search or transient error never shrinks it back;
  // only leaving the Discover tab resets it.
  useEffect(() => {
    if (discovery.status === 'success') onExpandChange?.(true)
  }, [discovery.status, onExpandChange])

  const toggleWorkType = (value) => {
    setPreferences((current) => ({
      ...current,
      workTypes: current.workTypes.includes(value) ? current.workTypes.filter((w) => w !== value) : [...current.workTypes, value],
    }))
  }

  const handleFindJobs = async () => {
    if (discovery.status === 'loading') return // disable duplicate requests
    if (!hasResume) {
      setDiscovery({ status: 'error', error: 'Add your resume text or upload a file first.' })
      return
    }

    setDiscovery({ status: 'loading', error: '' })
    try {
      let currentEvidence = evidence
      // Only parse the resume once — a cached candidateProfile (or the
      // evidence used to build it) means changing filters never re-parses
      // the resume or re-triggers profile generation.
      if (!candidateProfile && !currentEvidence) {
        const parsed = selectedFile ? await parseResume(selectedFile) : await parseResume(resumeText)
        currentEvidence = parsed?.normalizedResume?.evidence || []
        setEvidence(currentEvidence)
      }

      const cleanPreferences = {
        ...(preferences.country ? { country: preferences.country } : {}),
        ...(preferences.location.trim() ? { location: preferences.location.trim() } : {}),
        ...(preferences.workTypes.length ? { workTypes: preferences.workTypes } : {}),
        ...(preferences.seniority ? { seniority: preferences.seniority } : {}),
        ...(preferences.minimumDiscoveryScore ? { minimumDiscoveryScore: preferences.minimumDiscoveryScore } : {}),
      }

      const payload = {
        preferences: cleanPreferences,
        ...(candidateProfile ? { candidateProfile } : { resume: { evidence: currentEvidence } }),
      }

      const result = await discoverJobs(payload)
      setCandidateProfile(result.candidateProfile)
      setEditingPreferences(false)
      setDiscovery({ status: 'success', error: '', ...result })
    } catch (err) {
      setDiscovery({ status: 'error', error: err.message || 'Unable to search for jobs right now.' })
    }
  }

  const results = discovery.status === 'success' ? discovery.results || [] : []
  const banner = discovery.status === 'success' ? MODE_BANNER[discovery.mode] : null

  const preferencesPanel = (
    <div className="p-lg bg-surface border border-outline-variant rounded-md space-y-md">
      <PreferencesFields preferences={preferences} setPreferences={setPreferences} toggleWorkType={toggleWorkType} />

      <button
        type="button"
        onClick={handleFindJobs}
        disabled={discovery.status === 'loading'}
        aria-busy={discovery.status === 'loading'}
        className="px-xl py-3 bg-on-surface text-surface font-label-md text-label-md font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all flex items-center justify-center gap-md disabled:opacity-60 w-full sm:w-auto rounded-sm"
      >
        <span className={`material-symbols-outlined text-[20px] ${discovery.status === 'loading' ? 'status-dot-pulse' : ''}`} aria-hidden="true">
          {discovery.status === 'loading' ? 'progress_activity' : 'travel_explore'}
        </span>
        {discovery.status === 'loading' ? 'Searching for live jobs…' : 'Find Jobs For Me'}
      </button>

      {discovery.status === 'error' ? (
        <p className="font-label-md text-label-md text-error font-bold" role="alert">{discovery.error}</p>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-lg">
      {hasSearched ? <CandidateProfileSummary profile={candidateProfile} /> : null}

      {hasSearched ? (
        <ResumeDisclosure
          resumeText={resumeText}
          selectedFile={selectedFile}
          evidence={evidence}
          open={resumeOpen}
          onToggle={() => setResumeOpen((open) => !open)}
        />
      ) : null}

      {hasSearched && !editingPreferences ? (
        <PreferencesSummaryBar preferences={preferences} onEdit={() => setEditingPreferences(true)} />
      ) : (
        preferencesPanel
      )}

      {discovery.status === 'loading' ? <JobSearchLoadingState /> : null}

      {hasSearched ? (
        <div className="space-y-md">
          <div className="flex flex-wrap items-end justify-between gap-sm">
            <div>
              <p className="font-label-sm text-label-sm text-primary font-bold uppercase tracking-widest m-0">Live Job Matches</p>
              <h3 className="font-display text-headline-md font-bold text-on-surface m-0">
                {discovery.totalDisplayed} {discovery.totalDisplayed === 1 ? 'job' : 'jobs'} found
              </h3>
              {results.length > 0 ? <p className="font-label-sm text-label-sm text-on-surface-variant m-0">Sorted by Discovery Match</p> : null}
            </div>
            {banner ? (
              <span className={`chip ${banner.tone} flex items-center gap-xs`}>
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">{banner.icon}</span>
                {banner.label(discovery.sources || [])}
              </span>
            ) : null}
          </div>

          {results.length === 0 ? (
            <div className="p-xl border border-dashed border-outline-variant rounded-md text-center space-y-xs">
              <p className="font-body-md text-body-md text-on-surface font-bold m-0">No matching jobs found for these preferences.</p>
              <p className="font-body-md text-body-md text-on-surface-variant m-0">Try expanding the location, reducing the minimum Discovery Match, or selecting additional work types.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-lg items-start animate-stagger">
              {results.map((job, index) => (
                <JobDiscoveryCard key={job.id} job={job} rank={index + 1} onSelectJob={onSelectJob} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function JobDiscoveryCard({ job, rank, onSelectJob }) {
  const posted = formatPostedAt(job.postedAt)
  const salary = formatSalary(job.salary)
  const workTypeLabel = job.workType ? WORK_TYPE_LABEL[job.workType] : null
  const locationLine = [job.location, workTypeLabel].filter(Boolean).join(' · ')

  return (
    <article className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md self-start">
      <div className="flex items-start justify-between gap-md flex-wrap">
        <div className="min-w-0">
          <p className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase m-0">#{rank}</p>
          <h4 className="font-display text-headline-md font-bold text-on-surface m-0">{job.title || 'Untitled role'}</h4>
          {job.company ? <p className="font-body-md text-body-md text-on-surface-variant m-0">{job.company}</p> : null}
          {locationLine ? <p className="font-body-md text-body-md text-on-surface-variant m-0">{locationLine}</p> : null}
          {posted ? <p className="font-label-sm text-label-sm text-on-surface-variant m-0">{posted}</p> : null}
          {salary ? <p className="font-label-sm text-label-sm text-on-surface-variant m-0">{salary}</p> : null}
          {!job.sourceUrl ? <span className="chip tone-info mt-xs inline-flex">Sample listing</span> : null}
        </div>
        <div className="text-right flex-none">
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider m-0">Discovery Match</p>
          <p className="font-display text-display font-extrabold text-primary m-0">{job.discoveryScore}%</p>
        </div>
      </div>

      <ChipGroup label="Why it fits" icon="check" tone="tone-strong" items={job.highlights?.matchedSkills} />
      <ChipGroup label="Potential gaps" icon="warning" tone="tone-moderate" items={job.highlights?.gapSkills} />

      <div className="flex flex-wrap gap-sm pt-xs">
        {job.sourceUrl ? (
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">open_in_new</span>
            View Job
          </a>
        ) : null}
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onSelectJob?.({ title: job.title || '', description: job.description || '' })}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">analytics</span>
          Run Full Analysis
        </button>
      </div>
    </article>
  )
}

export default JobDiscoveryPanel
