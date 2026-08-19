/**
 * joobleProvider.js — Jooble job search adapter.
 *
 * Jooble is region-locked: an API key is issued per Jooble country domain
 * (e.g. a key generated on pk.jooble.org only returns Pakistani listings; a
 * key from uk.jooble.org only returns UK listings, etc.) — there is no single
 * global key. This adapter is source-agnostic about which country that is;
 * it's determined entirely by which domain's key the operator configures.
 * Requires JOOBLE_API_KEY (never hardcoded, never sent to the frontend, never
 * logged). Bounded timeout; never blocks discovery.
 */
import { buildNormalizedJob } from '../jobNormalization.js'
import { ProviderSearchError } from '../providerErrors.js'

const JOOBLE_ENDPOINT = 'https://jooble.org/api'

export const providerName = 'jooble'

export const isConfigured = (config = {}) => Boolean(config.joobleApiKey)

const normalizeRaw = (raw) =>
  buildNormalizedJob({
    source: providerName,
    sourceJobId: raw?.id != null ? String(raw.id) : null,
    sourceUrl: raw?.link,
    title: raw?.title,
    company: raw?.company,
    location: raw?.location,
    description: raw?.snippet,
    postedAt: raw?.updated,
    // Jooble's `salary` is a freeform, locale-specific string (e.g. "PKR
    // 80,000 - 120,000") rather than a structured range — parsing it would
    // risk inventing precision that isn't really there, so it's left null,
    // same treatment as Remotive's freeform salary string.
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
  })

/**
 * @returns {Promise<{jobs: object[]}>}
 * @throws {ProviderSearchError}
 */
export const search = async ({ query, preferences = {}, config = {}, fetchImpl = fetch }) => {
  if (!isConfigured(config)) {
    throw new ProviderSearchError('unauthorized', 'Jooble is not configured', { configured: false })
  }

  const timeoutMs = config.jobSearchTimeoutMs || 8000
  // The key's own domain already scopes the country — `location` here is a
  // finer-grained city/region filter within that country, defaulting to the
  // operator-configured default location (see config.joobleDefaultLocation).
  const location = preferences.location || config.joobleDefaultLocation || ''

  const url = `${JOOBLE_ENDPOINT}/${encodeURIComponent(config.joobleApiKey)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: query, location, page: '1' }),
      signal: controller.signal,
    })
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    throw new ProviderSearchError(
      timedOut ? 'timeout' : 'network_error',
      timedOut ? 'Jooble request timed out' : 'Jooble request failed',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const status = response.status
    if (status === 401 || status === 403) throw new ProviderSearchError('unauthorized', 'Jooble rejected the request', { status })
    if (status === 429) throw new ProviderSearchError('rate_limited', 'Jooble rate limit exceeded', { status })
    if (status >= 500) throw new ProviderSearchError('server_error', 'Jooble returned a server error', { status })
    throw new ProviderSearchError('server_error', `Jooble returned status ${status}`, { status })
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ProviderSearchError('malformed_response', 'Jooble response was not valid JSON')
  }

  if (!payload || !Array.isArray(payload.jobs)) {
    throw new ProviderSearchError('malformed_response', 'Jooble response was missing the expected jobs array')
  }

  const jobs = payload.jobs.map(normalizeRaw).filter((job) => job.title)
  return { jobs }
}
