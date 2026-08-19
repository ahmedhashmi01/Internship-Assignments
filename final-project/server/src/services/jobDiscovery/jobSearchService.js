/**
 * jobSearchService.js
 *
 * The ONLY place that calls external job-provider adapters. Job Discovery
 * business logic (jobDiscoveryService.js) never imports a provider directly
 * — it only calls `searchJobs(...)` here, so adding a new source later never
 * touches discovery logic.
 *
 *   JobDiscoveryService → JobSearchService → Adzuna / Remotive / Demo
 */
import * as adzunaProvider from './providers/adzunaProvider.js'
import * as remotiveProvider from './providers/remotiveProvider.js'
import * as joobleProvider from './providers/joobleProvider.js'
import * as demoProvider from './providers/demoProvider.js'
import { ProviderSearchError } from './providerErrors.js'
import { timingLog } from '../../utils/timingLog.js'

// Preferred order: Adzuna (role/title/location, broader non-remote), Remotive
// (remote-focused, no credentials needed), then Jooble (region-locked to
// whichever country domain the configured key belongs to — e.g. Pakistan via
// pk.jooble.org). Independent adapters — this list is the only place that
// encodes "which providers, in what order".
const LIVE_PROVIDERS = [adzunaProvider, remotiveProvider, joobleProvider]

const buildDiagnostic = (provider, query, error) => {
  const category = error instanceof ProviderSearchError ? error.category : 'unknown'
  const status = error?.details?.status ?? null
  // Sanitized: provider name, category, HTTP status only — never credentials,
  // headers, or response bodies.
  timingLog('job search provider attempt failed', { provider, category, status: status ?? 'n/a' })
  return { provider, query, outcome: 'failed', category, status }
}

/**
 * Runs every configured live provider for every query, combining all
 * successful results. Never throws — a failing/unconfigured/timed-out
 * provider is skipped and recorded in `diagnostics`; discovery degrades to
 * the demo catalog only when EVERY attempted call failed (see mode below).
 *
 * @returns {Promise<{jobs: object[], sources: string[], mode: 'live'|'demo'|'demo-fallback', diagnostics: object[]}>}
 */
export const searchJobs = async ({ queries = [], preferences = {}, config = {}, deps = {} }) => {
  const fetchImpl = deps.fetchImpl || fetch

  if (config.jobDiscoveryLiveEnabled !== true) {
    const { jobs } = demoProvider.search()
    return { jobs, sources: [demoProvider.providerName], mode: 'demo', diagnostics: [] }
  }

  const diagnostics = []
  const collected = []
  const sourcesUsed = new Set()
  let anyAttempted = false
  let anySucceeded = false

  for (const query of queries) {
    for (const provider of LIVE_PROVIDERS) {
      if (!provider.isConfigured(config)) continue
      anyAttempted = true
      try {
        const { jobs } = await provider.search({ query, preferences, config, fetchImpl })
        collected.push(...jobs)
        sourcesUsed.add(provider.providerName)
        anySucceeded = true
        diagnostics.push({ provider: provider.providerName, query, outcome: 'succeeded', count: jobs.length })
      } catch (error) {
        diagnostics.push(buildDiagnostic(provider.providerName, query, error))
      }
    }
  }

  // Live was enabled but nothing could even be attempted (no provider
  // configured) or every attempt failed — degrade to the sample catalog
  // rather than surfacing an error to the user.
  if (!anyAttempted || !anySucceeded) {
    const { jobs } = demoProvider.search()
    return { jobs, sources: [demoProvider.providerName], mode: 'demo-fallback', diagnostics }
  }

  return { jobs: collected, sources: Array.from(sourcesUsed), mode: 'live', diagnostics }
}
