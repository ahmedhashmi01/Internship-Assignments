/**
 * jobDiscoveryService.js — top-level Job Discovery orchestrator.
 *
 *   Resume → Candidate Profile → Search Queries → JobSearchService
 *   → Retrieve Jobs → Dedupe → Discovery Match → Sort → Cap → Display
 *
 * Never calls a provider directly (see jobSearchService.js) and never
 * touches the existing detailed-analysis scoring/ranking pipeline.
 */
import { buildCandidateProfile } from './candidateProfile.js'
import { buildSearchQueries } from './searchQueryBuilder.js'
import { searchJobs } from './jobSearchService.js'
import { dedupeJobs } from './dedupe.js'
import { scoreDiscoveryMatch, compareDiscoveryRank } from './discoveryMatch.js'

const stripInternalFields = ({ __retrievalIndex, ...job }) => job

/**
 * @param {object} params
 * @param {Array<{id:string,text:string}>} [params.evidence] - resume evidence; ignored when candidateProfile is provided
 * @param {object} [params.candidateProfile] - reuse a previously returned profile (skips profile generation + any AI call)
 * @param {object} [params.preferences] - location/country/workTypes/roleFamily/seniority/minimumDiscoveryScore (all optional)
 */
export const discoverJobs = async ({ evidence = [], candidateProfile: existingProfile, preferences = {}, config = {}, deps = {} }) => {
  const demoMode = String(config.aiMode || '').toLowerCase() === 'demo'

  // Reusing a passed-in profile means ZERO profile work (deterministic or AI)
  // — this is how changing only preferences never triggers a second AI call.
  const candidateProfile = existingProfile || (await buildCandidateProfile({ evidence, aiService: deps.aiService, demoMode }))

  const searchQueries = buildSearchQueries(candidateProfile)

  const { jobs: rawJobs, sources, mode } = await searchJobs({ queries: searchQueries, preferences, config, deps })

  // Dedupe BEFORE scoring/display — never show the same vacancy twice
  // because two search queries (or providers) both found it. Retrieval
  // index is attached post-dedupe so the final tie-break reflects the
  // actually-displayed candidate set, not raw (pre-dedupe) order.
  const deduped = dedupeJobs(rawJobs).map((job, index) => ({ ...job, __retrievalIndex: index }))
  const totalRetrieved = deduped.length

  const scored = deduped.map((job) => scoreDiscoveryMatch(job, candidateProfile, preferences))

  const minScore = typeof preferences.minimumDiscoveryScore === 'number' ? preferences.minimumDiscoveryScore : null
  const filtered = minScore != null ? scored.filter((job) => job.discoveryScore >= minScore) : scored

  const sorted = filtered.slice().sort(compareDiscoveryRank)

  // Configurable safety cap only — NEVER an arbitrary top-3/top-4 UI
  // truncation. If fewer jobs were retrieved than the cap, all of them are
  // displayed (e.g. 10 retrieved → 10 displayed).
  const maxResults = config.jobDiscoveryMaxResults || 20
  const displayed = sorted.slice(0, maxResults).map(stripInternalFields)

  return {
    mode,
    candidateProfile,
    searchQueries,
    totalRetrieved,
    totalDisplayed: displayed.length,
    sources,
    results: displayed,
  }
}
