import { logScoreDebug, logScoreWarning } from '../utils/aiDebugLog.js'

// Point-based weights for the normalized formula — these always sum to 100
// when every category has at least one requirement/keyword. A category with
// zero items is excluded and the remaining weights are rescaled
// proportionally so they still sum to 100 (see `renormalizeWeights`).
export const SCORE_COMPONENT_WEIGHTS = Object.freeze({
  mandatory: 55,
  preferred: 25,
  contextual: 10,
  ats: 10,
})

// Worker-health penalties — unchanged from the prior formula, still applied
// as a multiplier (see `computeWorkerHealth`).
export const SCORING_WEIGHTS = Object.freeze({
  failedWorkerPenalty: 0.1,
  skillMatchFailureConfidencePenalty: 0.15,
})

const clampScore = (value) => Math.min(100, Math.max(0, value))

// Guards against IEEE754 accumulation artifacts (e.g. 7.075000000000003)
// leaking into the API response — scores are meaningful to one decimal place.
const roundScore = (value) => Math.round(value * 10) / 10

// matched=1, partial=0.5, uncertain=0.25, missing=0 — per the normalized
// coverage spec. Deliberately distinct from any legacy scoring weights.
const coverageScoreForStatus = (status) => {
  switch (status) {
    case 'matched':
      return 1
    case 'partial':
      return 0.5
    case 'uncertain':
      return 0.25
    case 'missing':
      return 0
    default:
      return 0
  }
}

const resolveRequirementType = (item) => item.requirementType || (item.isMandatory ? 'mandatory' : 'preferred')

const byRequirementType = (skillMatches, type) => skillMatches.filter((item) => resolveRequirementType(item) === type)

/** matched/total coverage fraction (0 when there are no items in the category). */
const coverageOf = (items) => (items.length > 0 ? items.reduce((total, item) => total + coverageScoreForStatus(item.status), 0) / items.length : 0)

/**
 * Excludes zero-item categories from `SCORE_COMPONENT_WEIGHTS` and rescales
 * the remaining weights proportionally so they still sum to 100.
 */
const renormalizeWeights = (categoryTotals) => {
  const activeEntries = Object.entries(SCORE_COMPONENT_WEIGHTS).filter(([key]) => categoryTotals[key] > 0)
  const activeWeightSum = activeEntries.reduce((total, [, weight]) => total + weight, 0)

  if (activeWeightSum === 0) {
    return { mandatory: 0, preferred: 0, contextual: 0, ats: 0 }
  }

  return Object.fromEntries(
    Object.keys(SCORE_COMPONENT_WEIGHTS).map((key) => [
      key,
      categoryTotals[key] > 0 ? (SCORE_COMPONENT_WEIGHTS[key] / activeWeightSum) * 100 : 0,
    ]),
  )
}

const GENERIC_ATS_TERMS = new Set(['experience', 'skills', 'team', 'role', 'responsibilities', 'requirements', 'preferred', 'required'])

/**
 * Reduces the already-normalized ATS worker output (see atsKeywordAgent.js)
 * to unique, meaningful keyword matches: drops single-character fragments,
 * a small generic-filler-term stoplist, and case-insensitive duplicates.
 * Does not re-derive extraction — it's a defensive pass over the existing
 * matched/missing keyword list.
 */
const meaningfulAtsMatches = (keywordMatches = []) => {
  const seen = new Set()
  const meaningful = []

  for (const item of keywordMatches) {
    const keyword = typeof item?.keyword === 'string' ? item.keyword.trim() : ''
    if (keyword.length <= 1) continue
    const key = keyword.toLowerCase()
    if (GENERIC_ATS_TERMS.has(key) || seen.has(key)) continue
    seen.add(key)
    meaningful.push(item)
  }

  return meaningful
}

const computeWorkerHealth = (workers) => {
  const failedWorkers = workers.filter((worker) => worker.status === 'failed').length
  const skillMatchFailed = workers.some((worker) => worker.name === 'skillMatch' && worker.status === 'failed')

  return {
    skillMatchFailed,
    workerHealth: Math.max(
      0,
      1 - failedWorkers * SCORING_WEIGHTS.failedWorkerPenalty - (skillMatchFailed ? SCORING_WEIGHTS.skillMatchFailureConfidencePenalty : 0),
    ),
  }
}

const confidenceMultiplierFor = (averageConfidence) => {
  if (averageConfidence >= 0.85) return 1.0
  if (averageConfidence >= 0.7) return 0.97
  if (averageConfidence >= 0.5) return 0.92
  return 0.85
}

const RECOMMENDATION_LABEL = Object.freeze({
  strong: 'strong fit',
  good: 'good fit',
  moderate: 'moderate fit',
  low: 'low fit',
})

export const getRecommendationLabel = (score) => {
  if (score >= 85) return RECOMMENDATION_LABEL.strong
  if (score >= 70) return RECOMMENDATION_LABEL.good
  if (score >= 50) return RECOMMENDATION_LABEL.moderate
  return RECOMMENDATION_LABEL.low
}

export const scoreSingleJob = ({ skillMatches = [], keywordMatches = [], workers = [], jobTitle = 'unknown' } = {}) => {
  const mandatoryItems = byRequirementType(skillMatches, 'mandatory')
  const preferredItems = byRequirementType(skillMatches, 'preferred')
  const contextualItems = byRequirementType(skillMatches, 'contextual')
  const atsItems = meaningfulAtsMatches(keywordMatches)

  const mandatoryCoverage = coverageOf(mandatoryItems)
  const preferredCoverage = coverageOf(preferredItems)
  const contextualCoverage = coverageOf(contextualItems)
  const atsCoverage = coverageOf(atsItems)

  const weights = renormalizeWeights({
    mandatory: mandatoryItems.length,
    preferred: preferredItems.length,
    contextual: contextualItems.length,
    ats: atsItems.length,
  })

  const componentContributions = {
    mandatory: mandatoryCoverage * weights.mandatory,
    preferred: preferredCoverage * weights.preferred,
    contextual: contextualCoverage * weights.contextual,
    ats: atsCoverage * weights.ats,
  }

  // Never independently scaled to 0-100 per category, so this can never
  // exceed 100 on its own — the bug the normalized formula replaces.
  const baseScore = componentContributions.mandatory + componentContributions.preferred + componentContributions.contextual + componentContributions.ats

  const averageEvidenceConfidence = skillMatches.length > 0
    ? skillMatches.reduce((total, item) => total + (item.confidence ?? 0), 0) / skillMatches.length
    : 0
  const confidenceMultiplier = confidenceMultiplierFor(averageEvidenceConfidence)
  const scoreAfterConfidence = baseScore * confidenceMultiplier

  const { workerHealth, skillMatchFailed } = computeWorkerHealth(workers)
  const scoreBeforeCaps = scoreAfterConfidence * workerHealth

  const hasAnyEvidence = skillMatches.some((item) => item.evidenceId)
  const nonMissingItems = skillMatches.filter((item) => item.status !== 'missing')
  const allMatchedEvidenceUncertainOrPartial = nonMissingItems.length > 0 && nonMissingItems.every((item) => item.status === 'partial' || item.status === 'uncertain')
  const anyMandatoryMissing = mandatoryItems.some((item) => item.status === 'missing')
  const hasEvidenceIntegrityIssue = workers.some((worker) => worker.errorType === 'invalid-evidence-id')

  const eligibleFor100 =
    (mandatoryItems.length === 0 || mandatoryCoverage === 1) &&
    (preferredItems.length === 0 || preferredCoverage >= 0.8) &&
    (contextualItems.length === 0 || contextualCoverage >= 0.7) &&
    (atsItems.length === 0 || atsCoverage >= 0.8) &&
    !skillMatchFailed &&
    !hasEvidenceIntegrityIssue

  const capCandidates = []
  if (anyMandatoryMissing) capCandidates.push({ cap: 84, reason: 'mandatory-requirement-missing' })
  if (mandatoryItems.length > 0 && mandatoryCoverage < 0.5) capCandidates.push({ cap: 59, reason: 'mandatory-coverage-below-50-percent' })
  if (skillMatchFailed) capCandidates.push({ cap: 49, reason: 'skill-match-worker-failed' })
  if (!hasAnyEvidence) capCandidates.push({ cap: 39, reason: 'no-requirement-evidence-returned' })
  if (allMatchedEvidenceUncertainOrPartial) capCandidates.push({ cap: 69, reason: 'all-matched-evidence-uncertain-or-partial' })
  if (!eligibleFor100) capCandidates.push({ cap: 99.9, reason: 'not-eligible-for-perfect-score' })

  const effectiveCap = capCandidates.length > 0 ? Math.min(...capCandidates.map((candidate) => candidate.cap)) : 100
  const capApplied = scoreBeforeCaps > effectiveCap
  const capReason = capApplied ? capCandidates.find((candidate) => candidate.cap === effectiveCap).reason : 'none'

  const finalScore = roundScore(clampScore(Math.min(scoreBeforeCaps, effectiveCap)))

  const scoreDrivers = [
    ...skillMatches.filter((item) => item.status === 'matched').map((item) => `${item.skill} matched`),
    ...keywordMatches.filter((item) => item.status === 'matched').map((item) => `${item.keyword} matched`),
  ].slice(0, 5)

  const supportedRequirementCount = skillMatches.filter((item) => item.evidenceId).length

  logScoreDebug({
    jobTitle,
    mandatoryCoverage,
    preferredCoverage,
    contextualCoverage,
    atsCoverage,
    componentContributions,
    weights,
    baseScore,
    averageEvidenceConfidence,
    confidenceMultiplier,
    workerHealth,
    scoreBeforeCaps,
    capApplied,
    capReason,
    finalScore,
  })

  if (finalScore === 100) {
    logScoreWarning({
      jobTitle,
      mandatoryRequirements: mandatoryItems.map((item) => ({ skill: item.skill, status: item.status, evidenceId: item.evidenceId || null })),
      preferredCoverage,
      atsCoverage,
      eligibleFor100,
      componentContributions,
      baseScore,
      confidenceMultiplier,
      workerHealth,
      scoreBeforeCaps,
    })
  }

  return {
    score: finalScore,
    scoreDrivers,
    workerHealth,
    skillMatchFailed,
    mandatoryCoverage,
    preferredCoverage,
    contextualCoverage,
    atsCoverage,
    componentContributions,
    supportedRequirementCount,
    capApplied,
    capReason,
  }
}
