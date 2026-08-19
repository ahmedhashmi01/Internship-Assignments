/**
 * adzunaProvider.js — Adzuna job search adapter.
 *
 * Used primarily for role/title + location searches and broader non-remote
 * jobs. Requires ADZUNA_APP_ID / ADZUNA_APP_KEY (never hardcoded, never sent
 * to the frontend, never logged). Bounded timeout; never blocks discovery.
 */
import { buildNormalizedJob } from '../jobNormalization.js'
import { ProviderSearchError } from '../providerErrors.js'

const ADZUNA_ENDPOINT = 'https://api.adzuna.com/v1/api/jobs'

// Adzuna doesn't return a currency code per job — it's implied by the
// country the search was scoped to. Small, explicit, non-invented mapping.
const COUNTRY_CURRENCY = Object.freeze({
  gb: 'GBP', us: 'USD', ca: 'CAD', au: 'AUD', de: 'EUR', fr: 'EUR',
  nl: 'EUR', ie: 'EUR', es: 'EUR', it: 'EUR', in: 'INR', sg: 'SGD',
})

export const providerName = 'adzuna'

export const isConfigured = (config = {}) => Boolean(config.adzunaAppId && config.adzunaAppKey)

const normalizeRaw = (raw, country) =>
  buildNormalizedJob({
    source: providerName,
    sourceJobId: raw?.id != null ? String(raw.id) : null,
    sourceUrl: raw?.redirect_url,
    title: raw?.title,
    company: raw?.company?.display_name,
    location: raw?.location?.display_name,
    description: raw?.description,
    postedAt: raw?.created,
    salaryMin: typeof raw?.salary_min === 'number' ? raw.salary_min : null,
    salaryMax: typeof raw?.salary_max === 'number' ? raw.salary_max : null,
    salaryCurrency: COUNTRY_CURRENCY[country] || null,
  })

/**
 * @returns {Promise<{jobs: object[]}>}
 * @throws {ProviderSearchError}
 */
export const search = async ({ query, preferences = {}, config = {}, fetchImpl = fetch }) => {
  if (!isConfigured(config)) {
    throw new ProviderSearchError('unauthorized', 'Adzuna is not configured', { configured: false })
  }

  const country = (preferences.country || config.adzunaCountry || 'gb').toLowerCase()
  const maxResults = config.jobDiscoveryMaxResults || 20
  const timeoutMs = config.jobSearchTimeoutMs || 8000

  const url = new URL(`${ADZUNA_ENDPOINT}/${encodeURIComponent(country)}/search/1`)
  url.searchParams.set('app_id', config.adzunaAppId)
  url.searchParams.set('app_key', config.adzunaAppKey)
  url.searchParams.set('what', query)
  url.searchParams.set('results_per_page', String(Math.min(maxResults, 50)))
  url.searchParams.set('content-type', 'application/json')
  if (preferences.location) url.searchParams.set('where', preferences.location)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetchImpl(url.toString(), { method: 'GET', signal: controller.signal })
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    throw new ProviderSearchError(
      timedOut ? 'timeout' : 'network_error',
      timedOut ? 'Adzuna request timed out' : 'Adzuna request failed',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const status = response.status
    if (status === 401 || status === 403) throw new ProviderSearchError('unauthorized', 'Adzuna rejected the request', { status })
    if (status === 429) throw new ProviderSearchError('rate_limited', 'Adzuna rate limit exceeded', { status })
    if (status >= 500) throw new ProviderSearchError('server_error', 'Adzuna returned a server error', { status })
    throw new ProviderSearchError('server_error', `Adzuna returned status ${status}`, { status })
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ProviderSearchError('malformed_response', 'Adzuna response was not valid JSON')
  }

  if (!payload || !Array.isArray(payload.results)) {
    throw new ProviderSearchError('malformed_response', 'Adzuna response was missing the expected results array')
  }

  const jobs = payload.results.map((raw) => normalizeRaw(raw, country)).filter((job) => job.title)
  return { jobs }
}
