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

// ---------------------------------------------------------------------------
// Score explanation (transparency) — built ENTIRELY from the deterministic
// scoring inputs above. No LLM, no fabricated reasons: every entry maps 1:1 to
// a requirement/coverage/cap the scorer actually used.
// ---------------------------------------------------------------------------

const DEDUCTION_REASON = Object.freeze({
  missing: 'No supporting resume evidence',
  partial: 'Weak or partial supporting evidence',
  uncertain: 'Evidence could not be confirmed',
})

// Machine codes for the caps (frontend renders `description`, never the code).
const CAP_CODE = Object.freeze({
  'mandatory-requirement-missing': 'MANDATORY_REQUIREMENT_MISSING',
  'mandatory-coverage-below-50-percent': 'MANDATORY_COVERAGE_BELOW_50',
  'skill-match-worker-failed': 'SKILL_MATCH_FAILED',
  'no-requirement-evidence-returned': 'NO_REQUIREMENT_EVIDENCE',
  'all-matched-evidence-uncertain-or-partial': 'ALL_PARTIAL_OR_UNCERTAIN',
})

const CAP_DESCRIPTION = Object.freeze({
  'mandatory-requirement-missing': (cap) =>
    `One or more mandatory requirements had no supporting resume evidence, so the score was capped at ${cap}.`,
  'mandatory-coverage-below-50-percent': (cap) =>
    `Because fewer than half of the mandatory requirements were supported by resume evidence, the score was capped at ${cap}.`,
  'skill-match-worker-failed': (cap) =>
    `The skill-matching step could not complete, so the score was capped at ${cap}.`,
  'no-requirement-evidence-returned': (cap) =>
    `No requirement could be tied to resume evidence, so the score was capped at ${cap}.`,
  'all-matched-evidence-uncertain-or-partial': (cap) =>
    `All supported requirements were only partial or uncertain matches, so the score was capped at ${cap}.`,
})

const REQ_TYPE_RANK = { mandatory: 0, preferred: 1, contextual: 2 }
const STATUS_RANK = { missing: 0, partial: 1, uncertain: 2 }

const toProseList = (items) => {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

const buildScoreExplanation = ({
  skillMatches,
  atsItems,
  categoryCounts,
  coverages,
  capCandidates,
  scoreBeforeCaps,
}) => {
  const pct = (value) => Math.round(value * 100)

  const requirements = skillMatches.map((item) => ({
    requirement: item.skill,
    requirementType: resolveRequirementType(item),
    status: item.status,
    evidenceIds: item.evidenceId ? [item.evidenceId] : [],
  }))

  // ATS keywords at item granularity (the `ats` component above is only the
  // aggregate coverage) — needed to point priority actions at a specific term.
  const atsKeywords = (atsItems || []).map((item) => ({
    keyword: item.keyword,
    status: item.status,
    evidenceIds: item.evidenceId ? [item.evidenceId] : [],
  }))

  const strongMatches = requirements
    .filter((item) => item.status === 'matched')
    .map((item) => ({ requirement: item.requirement, evidenceIds: item.evidenceIds }))

  // Every non-matched requirement that lowered a coverage term — the data that
  // was previously invisible (only missing-mandatory surfaced as a "gap").
  const deductions = requirements
    .filter((item) => item.status !== 'matched')
    .map((item) => ({
      requirement: item.requirement,
      status: item.status,
      requirementType: item.requirementType,
      reason: DEDUCTION_REASON[item.status] || 'Reduced supporting evidence',
    }))
    .sort(
      (a, b) =>
        (REQ_TYPE_RANK[a.requirementType] - REQ_TYPE_RANK[b.requirementType]) ||
        (STATUS_RANK[a.status] - STATUS_RANK[b.status]) ||
        a.requirement.localeCompare(b.requirement),
    )

  // Only caps that MATERIALLY bound the achievable score (cap < uncapped score),
  // excluding the internal perfect-score guard.
  const capsApplied = capCandidates
    .filter((candidate) => candidate.reason !== 'not-eligible-for-perfect-score' && candidate.cap < scoreBeforeCaps)
    .sort((a, b) => a.cap - b.cap)
    .map((candidate) => ({
      code: CAP_CODE[candidate.reason] || 'SCORE_CAP',
      description: (CAP_DESCRIPTION[candidate.reason] || (() => 'A scoring cap was applied.'))(roundScore(candidate.cap)),
    }))

  const topMatches = strongMatches.slice(0, 5).map((item) => item.requirement)
  const topDeductions = deductions.slice(0, 4).map((item) => item.requirement)
  let summary =
    topMatches.length > 0
      ? `Your resume strongly matches the role's ${toProseList(topMatches)} ${topMatches.length === 1 ? 'requirement' : 'requirements'}.`
      : "Your resume shows limited direct evidence for this role's core requirements."
  summary +=
    topDeductions.length > 0
      ? ` The score is mainly reduced by missing or weak evidence for ${toProseList(topDeductions)}.`
      : ' No significant requirement gaps were found.'

  return {
    summary,
    components: {
      mandatory: { coverage: pct(coverages.mandatory), count: categoryCounts.mandatory },
      preferred: { coverage: pct(coverages.preferred), count: categoryCounts.preferred },
      contextual: { coverage: pct(coverages.contextual), count: categoryCounts.contextual },
      ats: { coverage: pct(coverages.ats), count: categoryCounts.ats },
    },
    strongMatches: strongMatches.slice(0, 6),
    deductions,
    capsApplied,
    requirements,
    atsKeywords,
  }
}

// ---------------------------------------------------------------------------
// Application Readiness — a status/label derived deterministically from the
// score explanation above. Reuses the EXISTING recommendation-label bands
// (85/70/50, see getRecommendationLabel) and the EXISTING score-cap codes
// (see CAP_CODE) rather than inventing new thresholds. No LLM, no new score.
// ---------------------------------------------------------------------------

export const READINESS_STATUS = Object.freeze({
  ready: 'ready',
  readyWithImprovements: 'ready_with_improvements',
  significantGaps: 'significant_gaps',
  lowFit: 'low_fit',
})

const READINESS_LABEL = Object.freeze({
  [READINESS_STATUS.ready]: 'Ready to Apply',
  [READINESS_STATUS.readyWithImprovements]: 'Ready With Improvements',
  [READINESS_STATUS.significantGaps]: 'Significant Gaps',
  [READINESS_STATUS.lowFit]: 'Low Fit',
})

// Caps severe enough that the underlying evidence/worker health itself is the
// problem, not just an addressable gap — mirrors the existing cap semantics.
const SEVERE_CAP_CODES = new Set(['MANDATORY_COVERAGE_BELOW_50', 'NO_REQUIREMENT_EVIDENCE', 'SKILL_MATCH_FAILED'])

const gapPhrase = (criticalGapCount) => {
  if (criticalGapCount === 0) return 'no critical mandatory gaps'
  if (criticalGapCount === 1) return 'one critical mandatory gap'
  return `${criticalGapCount} critical mandatory gaps`
}

const READINESS_SUMMARY = Object.freeze({
  [READINESS_STATUS.ready]: (criticalGapCount) =>
    `Strong overall alignment with ${gapPhrase(criticalGapCount)} — this profile is ready to apply.`,
  [READINESS_STATUS.readyWithImprovements]: (criticalGapCount) =>
    criticalGapCount > 0
      ? `Strong core alignment, but ${gapPhrase(criticalGapCount)} should be addressed before applying.`
      : 'Strong core alignment, but a few smaller gaps should be addressed before applying.',
  [READINESS_STATUS.significantGaps]: (criticalGapCount) =>
    `Moderate alignment with ${gapPhrase(criticalGapCount)} — meaningful preparation is recommended before applying.`,
  [READINESS_STATUS.lowFit]: (criticalGapCount) =>
    `Limited alignment with this role's core requirements (${gapPhrase(criticalGapCount)}) — consider other roles or significant preparation first.`,
})

/**
 * Derives a deterministic Application Readiness status from the already-
 * computed score + scoreExplanation. Never recomputes the score itself.
 */
export const buildApplicationReadiness = ({ score, recommendationLabel, scoreExplanation }) => {
  const components = scoreExplanation?.components || {}
  const requirements = scoreExplanation?.requirements || []
  const capsApplied = scoreExplanation?.capsApplied || []

  const criticalGapCount = requirements.filter((item) => item.requirementType === 'mandatory' && item.status === 'missing').length
  const hasSevereCap = capsApplied.some((cap) => SEVERE_CAP_CODES.has(cap.code))

  let status
  if (recommendationLabel === RECOMMENDATION_LABEL.low || hasSevereCap) {
    status = READINESS_STATUS.lowFit
  } else if (recommendationLabel === RECOMMENDATION_LABEL.moderate || criticalGapCount >= 2) {
    status = READINESS_STATUS.significantGaps
  } else if (recommendationLabel === RECOMMENDATION_LABEL.strong && criticalGapCount === 0) {
    status = READINESS_STATUS.ready
  } else {
    // good fit, or a strong fit with exactly one addressable gap.
    status = READINESS_STATUS.readyWithImprovements
  }

  const coverageOrNull = (key) => (components[key]?.count > 0 ? components[key].coverage : null)

  return {
    status,
    label: READINESS_LABEL[status],
    summary: READINESS_SUMMARY[status](criticalGapCount),
    metrics: {
      matchScore: Math.round(score),
      mandatoryCoverage: coverageOrNull('mandatory'),
      preferredCoverage: coverageOrNull('preferred'),
      atsCoverage: coverageOrNull('ats'),
      criticalGapCount,
    },
  }
}

// ---------------------------------------------------------------------------
// Priority Actions — deterministic gap-to-action list, most important first.
// Every action maps to a real, already-computed requirement/keyword; nothing
// is invented, and unsupported skills are never recommended as "add this".
// ---------------------------------------------------------------------------

const STRENGTHEN_REASON = Object.freeze({
  partial: 'Some supporting evidence exists, but coverage is partial.',
  uncertain: 'Supporting evidence exists but could not be clearly confirmed.',
})

// A missing ATS keyword is only ever surfaced when it is evidence-backed
// elsewhere in the resume (a MATCHED requirement whose name overlaps the
// keyword) — otherwise there is nothing honest to point the candidate at, so
// it is skipped rather than risk fabrication-adjacent advice.
const findRelatedEvidence = (keyword, matchedRequirements) => {
  const needle = keyword.trim().toLowerCase()
  if (!needle) return []
  const related = matchedRequirements.find((item) => {
    const name = item.requirement.trim().toLowerCase()
    return name.includes(needle) || needle.includes(name)
  })
  return related ? related.evidenceIds : []
}

/**
 * Builds up to `maxActions` priority actions (default 5) from the score
 * explanation, in priority order: missing mandatory → partial mandatory →
 * evidence-backed ATS keyword opportunities → missing preferred → partial
 * preferred. Purely a re-presentation of already-computed data — no AI call.
 */
export const buildPriorityActions = ({ scoreExplanation, maxActions = 5 }) => {
  const requirements = scoreExplanation?.requirements || []
  const atsKeywords = scoreExplanation?.atsKeywords || []
  const matchedRequirements = requirements.filter((item) => item.status === 'matched')

  const actions = []

  requirements
    .filter((item) => item.requirementType === 'mandatory' && item.status === 'missing')
    .forEach((item) => {
      actions.push({
        type: 'critical_gap',
        title: item.requirement,
        severity: 'high',
        reason: 'Mandatory requirement with no supporting resume evidence.',
        evidenceIds: [],
        action: `Do not claim ${item.requirement} unless you genuinely have that experience. If you have related experience, surface it more clearly in your resume.`,
      })
    })

  requirements
    .filter((item) => item.requirementType === 'mandatory' && (item.status === 'partial' || item.status === 'uncertain'))
    .forEach((item) => {
      actions.push({
        type: 'strengthen_evidence',
        title: item.requirement,
        severity: 'medium',
        reason: STRENGTHEN_REASON[item.status],
        evidenceIds: item.evidenceIds,
        action: 'Strengthen the existing bullet instead of adding unsupported experience.',
      })
    })

  atsKeywords
    .filter((item) => item.status === 'missing')
    .forEach((item) => {
      const evidenceIds = findRelatedEvidence(item.keyword, matchedRequirements)
      if (evidenceIds.length === 0) return
      actions.push({
        type: 'keyword_opportunity',
        title: item.keyword,
        severity: 'opportunity',
        reason: 'Your resume contains related evidence but does not clearly use terminology from the job posting.',
        evidenceIds,
        action: `Consider incorporating "${item.keyword}" into an existing evidence-supported bullet.`,
      })
    })

  requirements
    .filter((item) => item.requirementType === 'preferred' && item.status === 'missing')
    .forEach((item) => {
      actions.push({
        type: 'preferred_gap',
        title: item.requirement,
        severity: 'medium',
        reason: 'Preferred requirement with no supporting resume evidence.',
        evidenceIds: [],
        action: `Do not claim ${item.requirement} unless you genuinely have that experience. Highlight related experience if you have it.`,
      })
    })

  requirements
    .filter((item) => item.requirementType === 'preferred' && (item.status === 'partial' || item.status === 'uncertain'))
    .forEach((item) => {
      actions.push({
        type: 'strengthen_evidence',
        title: item.requirement,
        severity: 'opportunity',
        reason: STRENGTHEN_REASON[item.status],
        evidenceIds: item.evidenceIds,
        action: 'Strengthen the existing bullet instead of adding unsupported experience.',
      })
    })

  return actions.slice(0, maxActions).map((action, index) => ({ priority: index + 1, ...action }))
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

  const scoreExplanation = buildScoreExplanation({
    skillMatches,
    atsItems,
    categoryCounts: {
      mandatory: mandatoryItems.length,
      preferred: preferredItems.length,
      contextual: contextualItems.length,
      ats: atsItems.length,
    },
    coverages: {
      mandatory: mandatoryCoverage,
      preferred: preferredCoverage,
      contextual: contextualCoverage,
      ats: atsCoverage,
    },
    capCandidates,
    scoreBeforeCaps,
  })

  const recommendationLabel = getRecommendationLabel(finalScore)
  const readiness = buildApplicationReadiness({ score: finalScore, recommendationLabel, scoreExplanation })
  const priorityActions = buildPriorityActions({ scoreExplanation })

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
    scoreExplanation,
    readiness,
    priorityActions,
  }
}
