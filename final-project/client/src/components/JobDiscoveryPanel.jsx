import { useState } from 'react'
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

const WORK_TYPE_LABEL = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

function JobDiscoveryPanel({ resumeText, selectedFile, onSelectJob }) {
  const [preferences, setPreferences] = useState({ location: '', country: 'gb', workTypes: [], seniority: '', minimumDiscoveryScore: 0 })
  const [evidence, setEvidence] = useState(null)
  const [candidateProfile, setCandidateProfile] = useState(null)
  const [discovery, setDiscovery] = useState({ status: 'idle', error: '' })

  const hasResume = Boolean(resumeText?.trim() || selectedFile)

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
      setDiscovery({ status: 'success', error: '', ...result })
    } catch (err) {
      setDiscovery({ status: 'error', error: err.message || 'Unable to search for jobs right now.' })
    }
  }

  const results = discovery.status === 'success' ? discovery.results || [] : []
  const banner = discovery.status === 'success' ? MODE_BANNER[discovery.mode] : null

  return (
    <div className="space-y-lg">
      <div className="p-lg bg-surface border border-outline-variant rounded-md space-y-md">
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

        <button
          type="button"
          onClick={handleFindJobs}
          disabled={discovery.status === 'loading'}
          aria-busy={discovery.status === 'loading'}
          className="px-xl py-3 bg-on-surface text-surface font-label-md text-label-md font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all flex items-center justify-center gap-md disabled:opacity-60 w-full sm:w-auto"
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

      {discovery.status === 'success' ? (
        <div className="space-y-md">
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <h3 className="font-display text-headline-md font-bold text-on-surface">
              {discovery.totalDisplayed} {discovery.totalDisplayed === 1 ? 'job' : 'jobs'} found
            </h3>
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
            <div className="space-y-md animate-stagger">
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
    <article className="p-lg bg-surface border border-outline-variant rounded-lg space-y-md">
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

      {job.highlights?.matchedSkills?.length > 0 ? (
        <div>
          <p className="font-label-sm text-label-sm font-extrabold text-success uppercase tracking-wider m-0 mb-xs">Why it fits</p>
          <div className="flex flex-wrap gap-xs">
            {job.highlights.matchedSkills.map((skill) => (
              <span key={skill} className="chip tone-strong flex items-center gap-xs"><span className="material-symbols-outlined text-[14px]" aria-hidden="true">check</span>{skill}</span>
            ))}
          </div>
        </div>
      ) : null}

      {job.highlights?.gapSkills?.length > 0 ? (
        <div>
          <p className="font-label-sm text-label-sm font-extrabold text-on-surface uppercase tracking-wider m-0 mb-xs">Potential gaps</p>
          <div className="flex flex-wrap gap-xs">
            {job.highlights.gapSkills.map((skill) => (
              <span key={skill} className="chip tone-moderate flex items-center gap-xs"><span className="material-symbols-outlined text-[14px]" aria-hidden="true">warning</span>{skill}</span>
            ))}
          </div>
        </div>
      ) : null}

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
