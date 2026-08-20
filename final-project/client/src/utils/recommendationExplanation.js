// "Why This Job Wins" — a deterministic explanation for the current best-fit
// job in Compare Jobs, built ENTIRELY from data already returned by the API
// (rankedJobs[*].score / scoreExplanation / mandatoryGaps). No recompute, no
// re-ranking (the best fit is always rankedJobs[0], exactly as the backend
// ranked it), and ZERO additional AI calls.

const toProseList = (items) => {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

// Coverage is null (not a fake 0%) when the job has zero requirements in that
// category — mirrors how the "Why this score?" / readiness cards treat it.
const coverageOf = (job, key) => {
  const component = job?.scoreExplanation?.components?.[key]
  return component && component.count > 0 ? component.coverage : null
}

const criticalGapsOf = (job) => job?.mandatoryGaps?.length ?? 0

// Only claims "highest"/"best" when the best job is not tied with every other
// analyzed job on that metric — avoids a misleading claim on a full tie.
const buildStrengths = (best, rankedJobs) => {
  const strengths = []
  const others = rankedJobs.filter((job) => job.jobId !== best.jobId)

  const bestMandatory = coverageOf(best, 'mandatory')
  if (
    bestMandatory !== null &&
    others.every((job) => (coverageOf(job, 'mandatory') ?? -1) <= bestMandatory) &&
    others.some((job) => (coverageOf(job, 'mandatory') ?? -1) < bestMandatory)
  ) {
    strengths.push({ label: 'Highest mandatory requirement coverage', value: `${bestMandatory}%` })
  }

  const bestAts = coverageOf(best, 'ats')
  if (
    bestAts !== null &&
    others.every((job) => (coverageOf(job, 'ats') ?? -1) <= bestAts) &&
    others.some((job) => (coverageOf(job, 'ats') ?? -1) < bestAts)
  ) {
    strengths.push({ label: 'Best ATS alignment among analyzed roles', value: `${bestAts}%` })
  }

  const topMatches = (best.scoreExplanation?.strongMatches || []).slice(0, 2).map((match) => match.requirement)
  if (topMatches.length > 0) {
    strengths.push({ label: `Strong ${toProseList(topMatches)} evidence` })
  }

  const criticalGaps = criticalGapsOf(best)
  strengths.push(
    criticalGaps === 0
      ? { label: 'No critical mandatory requirement gaps' }
      : { label: `Only ${criticalGaps === 1 ? 'one critical requirement gap' : `${criticalGaps} critical requirement gaps`}` },
  )

  return strengths
}

// Honest, signed differences vs the next-best role — skipped entirely when
// tied (never claims "higher"/"fewer" on an exact tie).
const buildDifferences = (best, other) => {
  const differences = []

  const bestMandatory = coverageOf(best, 'mandatory')
  const otherMandatory = coverageOf(other, 'mandatory')
  if (bestMandatory !== null && otherMandatory !== null && bestMandatory !== otherMandatory) {
    const direction = bestMandatory > otherMandatory ? 'Higher' : 'Lower'
    differences.push(`${direction} mandatory coverage: ${bestMandatory}% vs ${otherMandatory}%`)
  }

  const bestAts = coverageOf(best, 'ats')
  const otherAts = coverageOf(other, 'ats')
  if (bestAts !== null && otherAts !== null && bestAts !== otherAts) {
    const direction = bestAts > otherAts ? 'Better' : 'Lower'
    differences.push(`${direction} ATS alignment: ${bestAts}% vs ${otherAts}%`)
  }

  const bestGaps = criticalGapsOf(best)
  const otherGaps = criticalGapsOf(other)
  if (bestGaps !== otherGaps) {
    const direction = bestGaps < otherGaps ? 'Fewer' : 'More'
    differences.push(`${direction} critical gaps: ${bestGaps} vs ${otherGaps}`)
  }

  if (typeof best.score === 'number' && typeof other.score === 'number' && best.score !== other.score) {
    const direction = best.score > other.score ? 'Higher' : 'Lower'
    differences.push(`${direction} match score: ${best.score} vs ${other.score}`)
  }

  return differences
}

/**
 * Builds the "Why This Job Wins" explanation for rankedJobs[0]. Never
 * reorders rankedJobs and never mutates the input. Returns null when there
 * are fewer than 2 successfully ranked jobs (nothing to compare/recommend).
 */
export const buildRecommendationExplanation = (rankedJobs = []) => {
  if (!Array.isArray(rankedJobs) || rankedJobs.length < 2) return null

  const best = rankedJobs[0]
  const nextBest = rankedJobs[1]
  if (!best || !nextBest) return null

  const differences = buildDifferences(best, nextBest)

  return {
    jobId: best.jobId,
    jobTitle: best.jobTitle,
    headline: 'Best fit among the analyzed roles',
    strengths: buildStrengths(best, rankedJobs),
    comparison: [
      {
        jobId: nextBest.jobId,
        jobTitle: nextBest.jobTitle,
        differences:
          differences.length > 0
            ? differences
            : ['Closely matched with this role — ranked first by the existing tie-break order.'],
      },
    ],
  }
}
