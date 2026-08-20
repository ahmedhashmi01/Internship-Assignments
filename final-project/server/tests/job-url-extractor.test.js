import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/server.js'
import { extractJobFromUrl, JobExtractionError } from '../src/services/jobUrlExtractor.js'

// ---- Test helpers: fake fetch + DNS so no real network is ever touched ----

const publicDns = async () => [{ address: '93.184.216.34', family: 4 }]

const htmlResponse = (html, { status = 200, contentType = 'text/html; charset=utf-8', headers = {} } = {}) =>
  new Response(html, { status, headers: { 'content-type': contentType, ...headers } })

const fetchReturning = (response) => vi.fn(async () => response)

const JSONLD_HTML = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org/',
  '@type': 'JobPosting',
  title: 'Senior Frontend Engineer',
  description: '<p>Build <b>React</b> applications. Requirements: 5+ years of React and TypeScript.</p>',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Corp' },
  jobLocation: { '@type': 'Place', address: { addressLocality: 'Berlin', addressRegion: 'BE', addressCountry: 'DE' } },
})}</script>
</head><body><h1>Senior Frontend Engineer</h1></body></html>`

const META_HTML = `<!doctype html><html><head>
<meta property="og:title" content="Backend Engineer">
<meta name="description" content="We are hiring a Backend Engineer to scale our core services. Requirements: Node.js and PostgreSQL.">
<meta property="og:site_name" content="Globex">
</head><body></body></html>`

const SEMANTIC_HTML = `<!doctype html><html><head><title>Careers | Initech</title></head>
<body><nav>menu links</nav><h1>Data Scientist</h1>
<main><p>Join our data team. You will build ML models in Python. Requirements: Python, SQL, and statistics.</p></main>
<footer>copyright</footer></body></html>`

describe('extractJobFromUrl (deterministic strategies)', () => {
  it('extracts a JSON-LD JobPosting (title, company, location, cleaned description)', async () => {
    const job = await extractJobFromUrl('https://jobs.example.com/1', {
      config: {},
      deps: { fetchImpl: fetchReturning(htmlResponse(JSONLD_HTML)), dnsLookupImpl: publicDns },
    })

    expect(job.extractionMethod).toBe('jsonld')
    expect(job.title).toBe('Senior Frontend Engineer')
    expect(job.company).toBe('Acme Corp')
    expect(job.location).toBe('Berlin, BE, DE')
    expect(job.description).toContain('Build React applications')
    expect(job.description).not.toContain('<b>') // HTML stripped
    expect(job.sourceUrl).toBe('https://jobs.example.com/1')
  })

  it('falls back to Open Graph / meta tags when there is no JSON-LD', async () => {
    const job = await extractJobFromUrl('https://jobs.example.com/2', {
      config: {},
      deps: { fetchImpl: fetchReturning(htmlResponse(META_HTML)), dnsLookupImpl: publicDns },
    })

    expect(job.extractionMethod).toBe('meta')
    expect(job.title).toBe('Backend Engineer')
    expect(job.company).toBe('Globex')
    expect(job.description).toContain('Backend Engineer')
  })

  it('falls back to semantic HTML (h1 + main) and prefers h1 over the page title', async () => {
    const job = await extractJobFromUrl('https://jobs.example.com/3', {
      config: {},
      deps: { fetchImpl: fetchReturning(htmlResponse(SEMANTIC_HTML)), dnsLookupImpl: publicDns },
    })

    expect(job.extractionMethod).toBe('html')
    expect(job.title).toBe('Data Scientist')
    expect(job.description).toContain('build ML models in Python')
    expect(job.description).not.toContain('menu links') // nav removed
    expect(job.description).not.toContain('copyright') // footer removed
  })

  it('uses an optional single AI cleanup call for noisy HTML when enabled', async () => {
    const noisy = `<html><body><h1>Platform Engineer</h1><main>${'lorem ipsum navigation clutter '.repeat(400)}</main></body></html>`
    const aiService = {
      generateJson: vi.fn(async () => ({
        title: 'Platform Engineer',
        company: 'Umbrella',
        description: 'Own the CI/CD platform. Requirements: Kubernetes, Terraform, and AWS experience required.',
      })),
    }

    const job = await extractJobFromUrl('https://jobs.example.com/4', {
      config: { jobExtractAiCleanup: true },
      deps: { fetchImpl: fetchReturning(htmlResponse(noisy)), dnsLookupImpl: publicDns, aiService },
    })

    expect(aiService.generateJson).toHaveBeenCalledTimes(1)
    expect(job.extractionMethod).toBe('ai-cleanup')
    expect(job.description).toContain('Kubernetes')
  })
})

describe('extractJobFromUrl (SSRF + fetch safety)', () => {
  const expectCode = async (promise, code) => {
    await expect(promise).rejects.toMatchObject({ name: 'JobExtractionError', code })
  }

  it('rejects a malformed URL', async () => {
    await expectCode(extractJobFromUrl('not-a-url', { deps: { dnsLookupImpl: publicDns } }), 'invalid-url')
  })

  it('rejects non-http(s) schemes', async () => {
    await expectCode(extractJobFromUrl('file:///etc/passwd', { deps: { dnsLookupImpl: publicDns } }), 'blocked-scheme')
    await expectCode(extractJobFromUrl('ftp://example.com/x', { deps: { dnsLookupImpl: publicDns } }), 'blocked-scheme')
  })

  it('rejects localhost', async () => {
    await expectCode(extractJobFromUrl('http://localhost:8080/x', { deps: { dnsLookupImpl: publicDns } }), 'blocked-address')
  })

  it('rejects private IP literals', async () => {
    await expectCode(extractJobFromUrl('http://127.0.0.1/x', { deps: { dnsLookupImpl: publicDns } }), 'blocked-address')
    await expectCode(extractJobFromUrl('http://10.0.0.5/x', { deps: { dnsLookupImpl: publicDns } }), 'blocked-address')
    await expectCode(extractJobFromUrl('http://169.254.169.254/latest', { deps: { dnsLookupImpl: publicDns } }), 'blocked-address')
  })

  it('rejects a hostname that resolves to a private address', async () => {
    const privateDns = async () => [{ address: '10.1.2.3', family: 4 }]
    await expectCode(
      extractJobFromUrl('https://internal.example.com/x', { deps: { fetchImpl: fetchReturning(htmlResponse('<html></html>')), dnsLookupImpl: privateDns } }),
      'blocked-address',
    )
  })

  it('rejects a redirect that points to a private address', async () => {
    const fetchImpl = fetchReturning(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }),
    )
    await expectCode(
      extractJobFromUrl('https://jobs.example.com/redir', { config: {}, deps: { fetchImpl, dnsLookupImpl: publicDns } }),
      'blocked-address',
    )
  })

  it('rejects an oversized response', async () => {
    const big = `<html><body>${'x'.repeat(5000)}</body></html>`
    await expectCode(
      extractJobFromUrl('https://jobs.example.com/big', {
        config: { jobExtractMaxBytes: 500 },
        deps: { fetchImpl: fetchReturning(htmlResponse(big)), dnsLookupImpl: publicDns },
      }),
      'oversized',
    )
  })

  it('rejects an unsupported content type', async () => {
    await expectCode(
      extractJobFromUrl('https://jobs.example.com/json', {
        config: {},
        deps: { fetchImpl: fetchReturning(htmlResponse('{"a":1}', { contentType: 'application/json' })), dnsLookupImpl: publicDns },
      }),
      'unsupported-content-type',
    )
  })

  it('handles a request timeout gracefully', async () => {
    const hangingFetch = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }),
    )
    await expectCode(
      extractJobFromUrl('https://jobs.example.com/slow', {
        config: { jobExtractTimeoutMs: 10 },
        deps: { fetchImpl: hangingFetch, dnsLookupImpl: publicDns },
      }),
      'timeout',
    )
  })

  it('returns a graceful error when the site blocks automated access (403)', async () => {
    await expectCode(
      extractJobFromUrl('https://jobs.example.com/blocked', {
        config: {},
        deps: { fetchImpl: fetchReturning(htmlResponse('<html></html>', { status: 403 })), dnsLookupImpl: publicDns },
      }),
      'blocked-by-site',
    )
  })

  it('returns no-content when the page has no meaningful job text', async () => {
    await expectCode(
      extractJobFromUrl('https://jobs.example.com/empty', {
        config: {},
        deps: { fetchImpl: fetchReturning(htmlResponse('<html><body><div>Loading…</div></body></html>')), dnsLookupImpl: publicDns },
      }),
      'no-content',
    )
  })
})

describe('POST /api/jobs/extract route', () => {
  it('rejects a missing/invalid URL with 400', async () => {
    const response = await request(createApp()).post('/api/jobs/extract').send({})
    expect(response.status).toBe(400)
  })

  it('rejects localhost with 400 (no network access)', async () => {
    const response = await request(createApp()).post('/api/jobs/extract').send({ url: 'http://localhost/x' })
    expect(response.status).toBe(400)
    expect(response.body.code).toBe('blocked-address')
  })

  it('returns a deterministic fixture in demo mode without any network call', async () => {
    const response = await request(createApp({ aiMode: 'demo' })).post('/api/jobs/extract').send({ url: 'https://jobs.example.com/anything' })
    expect(response.status).toBe(200)
    expect(response.body.title).toBeTruthy()
    expect(response.body.description).toContain('React')
    expect(response.body.sourceUrl).toBe('https://jobs.example.com/anything')
  })
})

describe('JobExtractionError', () => {
  it('carries a code and http status', () => {
    const err = new JobExtractionError('blocked-address', 'nope', 400)
    expect(err.code).toBe('blocked-address')
    expect(err.statusCode).toBe(400)
  })
})
