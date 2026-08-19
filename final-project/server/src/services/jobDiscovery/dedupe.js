import { fingerprintOf } from './jobNormalization.js'

/**
 * Deduplicates already-normalized jobs. Prefers `source:sourceJobId` as the
 * identity key (exact provider identity); falls back to a normalized
 * title|company|location fingerprint when a provider gives no sourceJobId.
 * First occurrence wins (preserves original retrieval order for ties).
 */
export const dedupeJobs = (jobs = []) => {
  const seen = new Set()
  const result = []

  for (const job of jobs) {
    const key = job.sourceJobId
      ? `${job.source}:${job.sourceJobId}`
      : `fingerprint:${fingerprintOf({ title: job.title, company: job.company, location: job.location })}`

    if (seen.has(key)) continue
    seen.add(key)
    result.push(job)
  }

  return result
}
