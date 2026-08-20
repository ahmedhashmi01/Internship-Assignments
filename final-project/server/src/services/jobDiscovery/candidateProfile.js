/**
 * candidateProfile.js
 *
 * Builds the candidate profile that drives job discovery: deterministic by
 * default (reuses the existing extractKeywords utility — no AI required),
 * with an OPTIONAL single best-effort AI call to refine it. Never more than
 * ONE AI call per resume — callers that already have a profile (e.g. only
 * preferences changed) should pass it straight through and skip this
 * function entirely (see jobDiscoveryService.js).
 */
import { extractKeywords } from '../jobInputExtractor.js'
import { candidateProfileEnrichmentSchema } from '../../schemas/jobDiscoverySchemas.js'
import { timingLog } from '../../utils/timingLog.js'

const ROLE_FAMILY_SKILL_SIGNALS = Object.freeze({
  'Frontend Engineering': ['react', 'vue.js', 'angular', 'typescript', 'javascript', 'html', 'css', 'tailwind', 'redux', 'next.js', 'svelte', 'sass'],
  'Backend Engineering': ['node.js', 'express.js', 'django', 'fastapi', 'flask', 'spring boot', 'postgresql', 'mysql', 'mongodb', 'redis', 'graphql', 'rest', 'grpc'],
  'Mobile Engineering': ['android', 'ios', 'flutter', 'react native', 'swift', 'kotlin'],
  'Data Engineering': ['airflow', 'apache spark', 'hadoop', 'kafka', 'dbt', 'snowflake', 'bigquery'],
  'Data Science': ['machine learning', 'deep learning', 'data science', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'scikit-learn', 'nlp', 'computer vision'],
  'DevOps / Platform Engineering': ['docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'circleci', 'github actions', 'aws', 'azure', 'gcp', 'ci/cd', 'devops'],
  'QA / Test Engineering': ['jest', 'pytest', 'cypress', 'playwright', 'selenium'],
})

const rankRoleFamilies = (skills) => {
  const skillSet = new Set(skills.map((skill) => skill.toLowerCase()))
  return Object.entries(ROLE_FAMILY_SKILL_SIGNALS)
    .map(([family, signals]) => ({ family, count: signals.filter((signal) => skillSet.has(signal)).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
}

const deriveRoleFamilies = (skills) => {
  const ranked = rankRoleFamilies(skills)
  if (ranked.length === 0) {
    return { primaryRoleFamilies: ['Software Engineering'], adjacentRoleFamilies: [] }
  }

  const [top, second] = ranked
  const primaryRoleFamilies = [top.family]
  const adjacentRoleFamilies = []

  const hasFrontend = ranked.some((entry) => entry.family === 'Frontend Engineering')
  const hasBackend = ranked.some((entry) => entry.family === 'Backend Engineering')
  if (hasFrontend && hasBackend) {
    // Full Stack is a derived label, not a raw signal bucket — surfaced as
    // primary alongside the stronger single discipline.
    if (!primaryRoleFamilies.includes('Full Stack Engineering')) primaryRoleFamilies.push('Full Stack Engineering')
  }

  if (second && second.family !== top.family && !primaryRoleFamilies.includes(second.family)) {
    adjacentRoleFamilies.push(second.family)
  }

  return { primaryRoleFamilies: primaryRoleFamilies.slice(0, 2), adjacentRoleFamilies: adjacentRoleFamilies.slice(0, 2) }
}

const YEARS_PATTERN = /(\d{1,2})\+?\s*years?/gi

const inferSeniorityFromResume = (text) => {
  if (/\b(lead|principal|staff|head of engineering)\b/i.test(text)) return 'lead'
  if (/\bsenior\b/i.test(text)) return 'senior'
  if (/\b(junior|intern|entry[- ]level|graduate)\b/i.test(text)) return 'junior'

  let maxYears = 0
  for (const match of text.matchAll(YEARS_PATTERN)) {
    const years = Number(match[1])
    if (Number.isFinite(years)) maxYears = Math.max(maxYears, years)
  }
  if (maxYears >= 8) return 'lead'
  if (maxYears >= 4) return 'senior'
  if (maxYears > 0 && maxYears < 2) return 'junior'
  return 'mid'
}

/** Pure, deterministic profile — no AI, no network. Always succeeds. */
export const buildDeterministicCandidateProfile = (evidence = []) => {
  const resumeText = evidence.map((item) => item.text || '').join('\n')
  const skills = extractKeywords(resumeText, 20)
  const { primaryRoleFamilies, adjacentRoleFamilies } = deriveRoleFamilies(skills)
  const seniority = resumeText.trim() ? inferSeniorityFromResume(resumeText) : null

  return { primaryRoleFamilies, adjacentRoleFamilies, skills, seniority }
}

/**
 * Best-effort single AI call to refine the deterministic profile. Never
 * throws — on any failure (or when disabled/demo mode) the deterministic
 * profile is returned unchanged, so discovery never depends on AI.
 */
const enrichWithAi = async (deterministicProfile, { aiService, evidence }) => {
  if (!aiService) return deterministicProfile

  const resumeSummary = evidence
    .slice(0, 40)
    .map((item) => item.text)
    .join('\n')
    .slice(0, 6000)

  const prompt =
    'You refine a deterministically-derived candidate job-search profile. Improve role family naming and the skill ' +
    'list ONLY using information already present in the resume text below — do not invent skills or experience. ' +
    'Return ONLY JSON: {"primaryRoleFamilies":[],"adjacentRoleFamilies":[],"seniority":"junior|mid|senior|lead","skills":[]}.\n\n' +
    `Deterministic draft: ${JSON.stringify(deterministicProfile)}\n\nResume text: ${resumeSummary}`

  try {
    const refined = await aiService.generateJson(prompt, candidateProfileEnrichmentSchema, { numPredict: 400 })
    return {
      primaryRoleFamilies: refined.primaryRoleFamilies?.length ? refined.primaryRoleFamilies : deterministicProfile.primaryRoleFamilies,
      adjacentRoleFamilies: refined.adjacentRoleFamilies?.length ? refined.adjacentRoleFamilies : deterministicProfile.adjacentRoleFamilies,
      seniority: refined.seniority || deterministicProfile.seniority,
      skills: refined.skills?.length ? refined.skills : deterministicProfile.skills,
    }
  } catch (error) {
    timingLog('candidate profile enrichment failed — keeping deterministic profile', { reason: error.name })
    return deterministicProfile
  }
}

/**
 * Builds the candidate profile for a NEW resume. Exactly zero or one AI call:
 * zero when `aiService` is omitted or `demoMode` is true (presentation
 * safety, mirrors the rest of the app's demo-mode behavior), otherwise one
 * best-effort enrichment call.
 */
export const buildCandidateProfile = async ({ evidence = [], aiService, demoMode = false } = {}) => {
  const deterministicProfile = buildDeterministicCandidateProfile(evidence)
  if (demoMode || !aiService) return deterministicProfile
  return enrichWithAi(deterministicProfile, { aiService, evidence })
}
