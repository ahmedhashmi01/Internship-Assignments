export const SCORING_WEIGHTS = Object.freeze({
  mandatorySkillWeight: 0.5,
  preferredSkillWeight: 0.2,
  atsWeight: 0.25,
  confidenceWeight: 0.05,
  mandatoryGapPenalty: 0.2,
  partialPenalty: 0.1,
  uncertainPenalty: 0.15,
  failedWorkerPenalty: 0.1,
})

const clampScore = (value) => Math.min(100, Math.max(0, value))

const normalizeStatusScore = (status) => {
  switch (status) {
    case 'matched':
      return 1
    case 'partial':
      return 0.6
    case 'missing':
      return 0
    case 'uncertain':
      return 0.35
    default:
      return 0
  }
}

const getRequirementWeight = (item) => {
  const requirementType = item.requirementType || (item.isMandatory ? 'mandatory' : 'preferred')

  if (requirementType === 'mandatory') {
    return SCORING_WEIGHTS.mandatorySkillWeight
  }

  if (requirementType === 'contextual') {
    return SCORING_WEIGHTS.preferredSkillWeight * 0.5
  }

  return SCORING_WEIGHTS.preferredSkillWeight
}

const buildCategoryScores = (skillMatches, keywordMatches, workerHealth) => {
  const skillScore = skillMatches.reduce((total, item) => total + normalizeStatusScore(item.status) * getRequirementWeight(item), 0)
  const atsScore = keywordMatches.reduce((total, item) => total + normalizeStatusScore(item.status) * SCORING_WEIGHTS.atsWeight, 0)
  const confidenceAdjustment = (skillMatches.length + keywordMatches.length > 0
    ? (skillMatches.reduce((total, item) => total + (item.confidence ?? 0), 0) + keywordMatches.reduce((total, item) => total + (item.confidence ?? 0), 0)) / (skillMatches.length + keywordMatches.length)
    : 0) * SCORING_WEIGHTS.confidenceWeight

  return {
    skillScore: clampScore(skillScore * 100),
    atsScore: clampScore(atsScore * 100),
    confidenceAdjustment: clampScore(confidenceAdjustment * 100),
    workerHealth,
  }
}

export const scoreSingleJob = ({ skillMatches = [], keywordMatches = [], workers = [] } = {}) => {
  const failedWorkers = workers.filter((worker) => worker.status === 'failed').length
  const workerHealth = Math.max(0, 1 - failedWorkers * SCORING_WEIGHTS.failedWorkerPenalty)

  const categoryScores = buildCategoryScores(skillMatches, keywordMatches, workerHealth)

  let weightedScore = categoryScores.skillScore + categoryScores.atsScore + categoryScores.confidenceAdjustment

  skillMatches.forEach((item) => {
    if (item.isMandatory && item.status === 'missing') {
      weightedScore -= SCORING_WEIGHTS.mandatoryGapPenalty * 100
    } else if (item.status === 'partial') {
      weightedScore -= SCORING_WEIGHTS.partialPenalty * 100
    } else if (item.status === 'uncertain') {
      weightedScore -= SCORING_WEIGHTS.uncertainPenalty * 100
    }
  })

  keywordMatches.forEach((item) => {
    if (item.status === 'partial') {
      weightedScore -= SCORING_WEIGHTS.partialPenalty * 100
    } else if (item.status === 'uncertain') {
      weightedScore -= SCORING_WEIGHTS.uncertainPenalty * 100
    }
  })

  const finalScore = clampScore(weightedScore * workerHealth)

  const scoreDrivers = [
    ...skillMatches.filter((item) => item.status === 'matched').map((item) => `${item.skill} matched`),
    ...keywordMatches.filter((item) => item.status === 'matched').map((item) => `${item.keyword} matched`),
  ].slice(0, 5)

  return {
    score: finalScore,
    categoryScores: {
      skills: categoryScores.skillScore,
      ats: categoryScores.atsScore,
      confidence: categoryScores.confidenceAdjustment,
    },
    scoreDrivers,
    workerHealth,
  }
}
