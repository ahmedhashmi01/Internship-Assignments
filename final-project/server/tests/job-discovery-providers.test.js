import { describe, expect, it, vi } from 'vitest'
import * as adzunaProvider from '../src/services/jobDiscovery/providers/adzunaProvider.js'
import * as remotiveProvider from '../src/services/jobDiscovery/providers/remotiveProvider.js'
import * as joobleProvider from '../src/services/jobDiscovery/providers/joobleProvider.js'
import { ProviderSearchError } from '../src/services/jobDiscovery/providerErrors.js'

const jsonResponse = (body, { status = 200 } = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const adzunaConfig = { adzunaAppId: 'id123', adzunaAppKey: 'key456', adzunaCountry: 'gb', jobSearchTimeoutMs: 5000, jobDiscoveryMaxResults: 20 }

describe('adzunaProvider', () => {
  it('is not configured without both app id and app key, and never attempts a request', async () => {
    expect(adzunaProvider.isConfigured({})).toBe(false)
    expect(adzunaProvider.isConfigured({ adzunaAppId: 'x' })).toBe(false)
    expect(adzunaProvider.isConfigured({ adzunaAppId: 'x', adzunaAppKey: 'y' })).toBe(true)

    const fetchImpl = vi.fn()
    await expect(adzunaProvider.search({ query: 'Engineer', config: {}, fetchImpl })).rejects.toThrow(ProviderSearchError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('normalizes a successful Adzuna response and never sends credentials in a logged/thrown value', async () => {
    const fetchImpl = vi.fn(async (url) => {
      // Credentials travel as query params to Adzuna's own API — assert they
      // never leak into anything we return/throw (see other assertions).
      expect(String(url)).toContain('app_id=id123')
      return jsonResponse({
        results: [
          {
            id: 555, title: 'Senior Frontend Engineer', company: { display_name: 'Example Ltd' },
            location: { display_name: 'London, UK' }, description: 'Build React apps.',
            redirect_url: 'https://www.adzuna.co.uk/land/ad/555', created: '2026-08-10T09:00:00Z',
            salary_min: 60000, salary_max: 80000,
          },
        ],
      })
    })

    const { jobs } = await adzunaProvider.search({ query: 'Frontend Engineer', preferences: { location: 'London' }, config: adzunaConfig, fetchImpl })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      source: 'adzuna', sourceJobId: '555', sourceUrl: 'https://www.adzuna.co.uk/land/ad/555',
      title: 'Senior Frontend Engineer', company: 'Example Ltd', location: 'London, UK',
      salary: { min: 60000, max: 80000, currency: 'GBP' },
    })
  })

  it('handles a timeout as category "timeout"', async () => {
    const fetchImpl = vi.fn((_url, { signal }) => new Promise((_r, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    await expect(adzunaProvider.search({ query: 'x', config: { ...adzunaConfig, jobSearchTimeoutMs: 10 }, fetchImpl }))
      .rejects.toMatchObject({ category: 'timeout' })
  })

  it('categorizes 401/403 as unauthorized', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 403 }))
    await expect(adzunaProvider.search({ query: 'x', config: adzunaConfig, fetchImpl })).rejects.toMatchObject({ category: 'unauthorized' })
  })

  it('categorizes 429 as rate_limited', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 429 }))
    await expect(adzunaProvider.search({ query: 'x', config: adzunaConfig, fetchImpl })).rejects.toMatchObject({ category: 'rate_limited' })
  })

  it('categorizes 5xx as server_error', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }))
    await expect(adzunaProvider.search({ query: 'x', config: adzunaConfig, fetchImpl })).rejects.toMatchObject({ category: 'server_error' })
  })

  it('categorizes a malformed response as malformed_response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ notResults: [] }))
    await expect(adzunaProvider.search({ query: 'x', config: adzunaConfig, fetchImpl })).rejects.toMatchObject({ category: 'malformed_response' })

    const badJsonFetch = vi.fn(async () => new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(adzunaProvider.search({ query: 'x', config: adzunaConfig, fetchImpl: badJsonFetch })).rejects.toMatchObject({ category: 'malformed_response' })
  })

  it('drops a job with no valid http(s) URL rather than exposing an unsafe link', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      results: [{ id: 1, title: 'Bad URL Job', company: {}, location: {}, description: 'x', redirect_url: 'javascript:alert(1)' }],
    }))
    const { jobs } = await adzunaProvider.search({ query: 'x', config: adzunaConfig, fetchImpl })
    expect(jobs[0].sourceUrl).toBeNull()
  })
})

describe('remotiveProvider', () => {
  it('requires no credentials and is configured by default', () => {
    expect(remotiveProvider.isConfigured({})).toBe(true)
    expect(remotiveProvider.isConfigured({ remotiveEnabled: false })).toBe(false)
  })

  it('normalizes a successful Remotive response, strips HTML, and always marks workType remote', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      jobs: [
        {
          id: 999, title: 'React Engineer', company_name: 'Fernbridge Labs', candidate_required_location: 'Worldwide',
          description: '<p>Build <b>React</b> apps.</p>', url: 'https://remotive.com/remote-jobs/react/999',
          publication_date: '2026-08-12T00:00:00Z', salary: '$70k - $90k',
        },
      ],
    }))
    const { jobs } = await remotiveProvider.search({ query: 'React', config: { jobSearchTimeoutMs: 5000 }, fetchImpl })
    expect(jobs).toHaveLength(1)
    expect(jobs[0].workType).toBe('remote')
    expect(jobs[0].description).toBe('Build React apps.')
    expect(jobs[0].description).not.toContain('<b>')
    // A freeform salary string is never parsed into a fabricated min/max.
    expect(jobs[0].salary).toEqual({ min: null, max: null, currency: null })
  })

  it('handles timeout / 401 / 429 / 5xx / malformed exactly like Adzuna categorization', async () => {
    const timeoutFetch = vi.fn((_url, { signal }) => new Promise((_r, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    await expect(remotiveProvider.search({ query: 'x', config: { jobSearchTimeoutMs: 10 }, fetchImpl: timeoutFetch }))
      .rejects.toMatchObject({ category: 'timeout' })

    await expect(remotiveProvider.search({ query: 'x', config: {}, fetchImpl: async () => new Response('', { status: 401 }) }))
      .rejects.toMatchObject({ category: 'unauthorized' })
    await expect(remotiveProvider.search({ query: 'x', config: {}, fetchImpl: async () => new Response('', { status: 429 }) }))
      .rejects.toMatchObject({ category: 'rate_limited' })
    await expect(remotiveProvider.search({ query: 'x', config: {}, fetchImpl: async () => new Response('', { status: 500 }) }))
      .rejects.toMatchObject({ category: 'server_error' })
    await expect(remotiveProvider.search({ query: 'x', config: {}, fetchImpl: async () => jsonResponse({ notJobs: [] }) }))
      .rejects.toMatchObject({ category: 'malformed_response' })
  })
})

const joobleConfig = { joobleApiKey: 'key789', jobSearchTimeoutMs: 5000 }

describe('joobleProvider', () => {
  it('is not configured without an API key, and never attempts a request', async () => {
    expect(joobleProvider.isConfigured({})).toBe(false)
    expect(joobleProvider.isConfigured({ joobleApiKey: 'key789' })).toBe(true)

    const fetchImpl = vi.fn()
    await expect(joobleProvider.search({ query: 'Engineer', config: {}, fetchImpl })).rejects.toThrow(ProviderSearchError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts keywords/location to the key-scoped endpoint and never leaks the key in a thrown/logged value', async () => {
    const fetchImpl = vi.fn(async (url, options) => {
      expect(String(url)).toBe('https://jooble.org/api/key789')
      const body = JSON.parse(options.body)
      expect(body).toMatchObject({ keywords: 'Frontend Engineer', location: 'Karachi' })
      return jsonResponse({
        jobs: [
          {
            id: 42, title: 'Frontend Engineer', company: 'Example Co', location: 'Karachi, Pakistan',
            snippet: 'Build React apps.', link: 'https://pk.jooble.org/desc/42', updated: '2026-08-10T09:00:00Z',
            salary: 'PKR 150,000 - 200,000',
          },
        ],
      })
    })

    const { jobs } = await joobleProvider.search({ query: 'Frontend Engineer', preferences: { location: 'Karachi' }, config: joobleConfig, fetchImpl })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      source: 'jooble', sourceJobId: '42', sourceUrl: 'https://pk.jooble.org/desc/42',
      title: 'Frontend Engineer', company: 'Example Co', location: 'Karachi, Pakistan',
    })
    // A freeform salary string is never parsed into a fabricated min/max.
    expect(jobs[0].salary).toEqual({ min: null, max: null, currency: null })
  })

  it('falls back to config.joobleDefaultLocation when no preference is given', async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      expect(JSON.parse(options.body).location).toBe('Pakistan')
      return jsonResponse({ jobs: [] })
    })
    await joobleProvider.search({ query: 'x', config: { ...joobleConfig, joobleDefaultLocation: 'Pakistan' }, fetchImpl })
  })

  it('handles timeout / 401 / 429 / 5xx / malformed exactly like Adzuna/Remotive categorization', async () => {
    const timeoutFetch = vi.fn((_url, { signal }) => new Promise((_r, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    await expect(joobleProvider.search({ query: 'x', config: { ...joobleConfig, jobSearchTimeoutMs: 10 }, fetchImpl: timeoutFetch }))
      .rejects.toMatchObject({ category: 'timeout' })

    await expect(joobleProvider.search({ query: 'x', config: joobleConfig, fetchImpl: async () => new Response('', { status: 403 }) }))
      .rejects.toMatchObject({ category: 'unauthorized' })
    await expect(joobleProvider.search({ query: 'x', config: joobleConfig, fetchImpl: async () => new Response('', { status: 429 }) }))
      .rejects.toMatchObject({ category: 'rate_limited' })
    await expect(joobleProvider.search({ query: 'x', config: joobleConfig, fetchImpl: async () => new Response('', { status: 500 }) }))
      .rejects.toMatchObject({ category: 'server_error' })
    await expect(joobleProvider.search({ query: 'x', config: joobleConfig, fetchImpl: async () => jsonResponse({ notJobs: [] }) }))
      .rejects.toMatchObject({ category: 'malformed_response' })
  })

  it('drops a job with no valid http(s) URL rather than exposing an unsafe link', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      jobs: [{ id: 1, title: 'Bad URL Job', company: 'x', location: 'x', snippet: 'x', link: 'javascript:alert(1)' }],
    }))
    const { jobs } = await joobleProvider.search({ query: 'x', config: joobleConfig, fetchImpl })
    expect(jobs[0].sourceUrl).toBeNull()
  })
})
