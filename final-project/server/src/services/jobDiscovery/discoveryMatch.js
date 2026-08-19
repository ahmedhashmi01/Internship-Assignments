/**
 * discoveryMatch.js
 *
 * Deterministic "Discovery Match" score for a retrieved live/demo job against
 * the candidate profile — DISTINCT from the existing detailed Match Score
 * (scoringService.js), which is never touched by this feature. No AI call.
 *
 * Weights: skill overlap 40%, role/title alignment 25%, seniority alignment
 * 20%, preference alignment 15%.
 */
import { extractKeywords } from '../jobInputExtractor.js'

export const DISCOVERY_WEIGHTS = Object.freeze({
  skillOverlap: 0.4,
  roleAlignment: 0.25,
  seniorityAlignment: 0.2,
  preferenceAlignment: 0.15,
})

const clampPct = (value) => Math.max(0, Math.min(100, Math.round(value)))

const toLowerSet = (items) => new Set((items || []).map((item) => String(item).toLowerCase()))

/**
 * Extracts deterministic "job skills" from a live/demo job's title +
 * description using the SAME keyword utility the rest of the app already
 * uses (jobInputExtractor.extractKeywords) — no separate extraction logic,
 * no AI call per job.
 */
export const extractJobSkills = (job) => extractKeywords(`${job.title || ''}. ${job.description || ''}`, 20)

const scoreSkillOverlap = (jobSkills, candidateSkillSet) => {
  if (jobSkills.length === 0) return { score: candidateSkillSet.size > 0 ? 50 : 30, matched: [], gaps: [] }
  const matched = jobSkills.filter((skill) => candidateSkillSet.has(skill.toLowerCase()))
  const gaps = jobSkills.filter((skill) => !candidateSkillSet.has(skill.toLowerCase()))
  return { score: clampPct((matched.length / jobSkills.length) * 100), matched, gaps }
}

// Deterministic role-family → natural job-title words, reused for both the
// query builder and role-alignment scoring so they stay in sync.
export const ROLE_FAMILY_TITLE = Object.freeze({
  'Frontend Engineering': 'Frontend Engineer',
  'Backend Engineering': 'Backend Engineer',
  'Full Stack Engineering': 'Full Stack Engineer',
  'Mobile Engineering': 'Mobile Engineer',
  'Data Engineering': 'Data Engineer',
  'Data Science': 'Data Scientist',
  'Machine Learning Engineering': 'Machine Learning Engineer',
  'DevOps / Platform Engineering': 'DevOps Engineer',
  'QA / Test Engineering': 'QA Engineer',
  'Software Engineering': 'Software Engineer',
})

const roleWords = (roleFamily) =>
  (ROLE_FAMILY_TITLE[roleFamily] || roleFamily || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && word !== 'engineer' && word !== 'engineering')

const scoreRoleAlignment = (job, candidateProfile) => {
  const title = (job.title || '').toLowerCase()
  if (!title) return 50

  const primaryWords = (candidateProfile.primaryRoleFamilies || []).flatMap(roleWords)
  const adjacentWords = (candidateProfile.adjacentRoleFamilies || []).flatMap(roleWords)

  if (primaryWords.some((word) => title.includes(word))) return 100
  if (adjacentWords.some((word) => title.includes(word))) return 70
  if (title.includes('engineer') || title.includes('developer')) return 50
  return 30
}

const SENIORITY_RANK = { junior: 0, mid: 1, senior: 2, lead: 3 }

const scoreSeniorityAlignment = (job, candidateProfile) => {
  const candidateSeniority = candidateProfile.seniority
  if (!job.seniority || !candidateSeniority) return 60 // no signal either side — neutral, not penalized

  if (job.seniority === candidateSeniority) return 100

  const jobRank = SENIORITY_RANK[job.seniority]
  const candidateRank = SENIORITY_RANK[candidateSeniority]
  if (jobRank == null || candidateRank == null) return 60

  return Math.abs(jobRank - candidateRank) === 1 ? 70 : 40
}

const scorePreferenceAlignment = (job, preferences = {}) => {
  let score = 0
  let terms = 0

  if (preferences.workTypes && preferences.workTypes.length > 0) {
    terms += 1
    if (job.workType && preferences.workTypes.includes(job.workType)) score += 100
    else if (!job.workType) score += 50 // unknown — don't penalize what the source never told us
  }

  if (preferences.location) {
    terms += 1
    const jobLocation = (job.location || '').toLowerCase()
    if (jobLocation.includes(preferences.location.toLowerCase())) score += 100
    else if (!jobLocation) score += 50
    else score += 20
  }

  return terms === 0 ? 70 : clampPct(score / terms) // no preferences given — neutral default
}

/**
 * Scores one normalized job against the candidate profile + search
 * preferences. Returns the job augmented with `discoveryScore`, `components`,
 * and `highlights` (matched skills / gap skills) — never mutates the input.
 */
export const scoreDiscoveryMatch = (job, candidateProfile, preferences = {}) => {
  const candidateSkillSet = toLowerSet(candidateProfile.skills)
  const jobSkills = extractJobSkills(job)
  const { score: skillOverlap, matched, gaps } = scoreSkillOverlap(jobSkills, candidateSkillSet)
  const roleAlignment = scoreRoleAlignment(job, candidateProfile)
  const seniorityAlignment = scoreSeniorityAlignment(job, candidateProfile)
  const preferenceAlignment = scorePreferenceAlignment(job, preferences)

  const discoveryScore = clampPct(
    skillOverlap * DISCOVERY_WEIGHTS.skillOverlap +
      roleAlignment * DISCOVERY_WEIGHTS.roleAlignment +
      seniorityAlignment * DISCOVERY_WEIGHTS.seniorityAlignment +
      preferenceAlignment * DISCOVERY_WEIGHTS.preferenceAlignment,
  )

  return {
    ...job,
    discoveryScore,
    components: { skillOverlap, roleAlignment, seniorityAlignment, preferenceAlignment },
    highlights: {
      matchedSkills: matched.slice(0, 6),
      gapSkills: gaps.slice(0, 6),
    },
  }
}

// Stable tie-break: discoveryScore → skillOverlap → roleAlignment →
// postedAt recency (when reliable) → original retrieval order. Never mixed
// with the existing detailed-analysis ranking (getStableJobRank).
export const compareDiscoveryRank = (a, b) => {
  if (b.discoveryScore !== a.discoveryScore) return b.discoveryScore - a.discoveryScore
  if (b.components.skillOverlap !== a.components.skillOverlap) return b.components.skillOverlap - a.components.skillOverlap
  if (b.components.roleAlignment !== a.components.roleAlignment) return b.components.roleAlignment - a.components.roleAlignment

  const aPosted = a.postedAt ? Date.parse(a.postedAt) : NaN
  const bPosted = b.postedAt ? Date.parse(b.postedAt) : NaN
  if (!Number.isNaN(aPosted) && !Number.isNaN(bPosted) && aPosted !== bPosted) return bPosted - aPosted

  return (a.__retrievalIndex ?? 0) - (b.__retrievalIndex ?? 0)
}
