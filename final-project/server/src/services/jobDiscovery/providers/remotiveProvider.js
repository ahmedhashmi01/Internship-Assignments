/**
 * remotiveProvider.js — Remotive job search adapter.
 *
 * No credentials required. Used primarily for remote job search / as a
 * remote-focused complement to Adzuna. Every Remotive listing is remote by
 * definition, so workType is always explicitly 'remote' (not inferred).
 */
import { buildNormalizedJob, stripHtmlToText } from '../jobNormalization.js'
import { ProviderSearchError } from '../providerErrors.js'

const REMOTIVE_ENDPOINT = 'https://remotive.com/api/remote-jobs'

export const providerName = 'remotive'

export const isConfigured = (config = {}) => config.remotiveEnabled !== false

const normalizeRaw = (raw) =>
  buildNormalizedJob({
    source: providerName,
    sourceJobId: raw?.id != null ? String(raw.id) : null,
    sourceUrl: raw?.url,
    title: raw?.title,
    company: raw?.company_name,
    location: raw?.candidate_required_location,
    description: stripHtmlToText(raw?.description || ''),
    workType: 'remote', // Remotive only lists remote roles — an explicit fact, not a guess.
    postedAt: raw?.publication_date,
    // Remotive's `salary` is a freeform string (e.g. "$60k - $75k"), not a
    // structured range — parsing it would risk inventing precision that
    // isn't really there, so it's left null per the "never invent it" rule.
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
  })

/**
 * @returns {Promise<{jobs: object[]}>}
 * @throws {ProviderSearchError}
 */
export const search = async ({ query, config = {}, fetchImpl = fetch }) => {
  if (!isConfigured(config)) {
    throw new ProviderSearchError('unauthorized', 'Remotive is disabled', { configured: false })
  }

  const timeoutMs = config.jobSearchTimeoutMs || 8000
  const url = new URL(REMOTIVE_ENDPOINT)
  if (query) url.searchParams.set('search', query)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetchImpl(url.toString(), { method: 'GET', signal: controller.signal })
  } catch (error) {
    const timedOut = error?.name === 'AbortError'
    throw new ProviderSearchError(
      timedOut ? 'timeout' : 'network_error',
      timedOut ? 'Remotive request timed out' : 'Remotive request failed',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const status = response.status
    if (status === 401 || status === 403) throw new ProviderSearchError('unauthorized', 'Remotive rejected the request', { status })
    if (status === 429) throw new ProviderSearchError('rate_limited', 'Remotive rate limit exceeded', { status })
    if (status >= 500) throw new ProviderSearchError('server_error', 'Remotive returned a server error', { status })
    throw new ProviderSearchError('server_error', `Remotive returned status ${status}`, { status })
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new ProviderSearchError('malformed_response', 'Remotive response was not valid JSON')
  }

  if (!payload || !Array.isArray(payload.jobs)) {
    throw new ProviderSearchError('malformed_response', 'Remotive response was missing the expected jobs array')
  }

  const jobs = payload.jobs.map(normalizeRaw).filter((job) => job.title)
  return { jobs }
}
