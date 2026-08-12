import { lookup as dnsLookup } from 'dns/promises'

// ---------------------------------------------------------------------------
// Job Posting URL Import
//
// Fetches a public job-posting page (SSRF-hardened) and extracts title,
// company, location, and description deterministically — JSON-LD first, then
// Open Graph / meta tags, then semantic HTML. An optional single LLM cleanup
// call can normalize noisy HTML text, but is off unless explicitly enabled.
//
// Every network primitive (fetch, DNS) is injectable so tests never touch the
// real network.
// ---------------------------------------------------------------------------

// Normalized failure. `code` drives the HTTP status; the frontend treats any
// failure as "fall back to manual paste".
export class JobExtractionError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message)
    this.name = 'JobExtractionError'
    this.code = code
    this.statusCode = statusCode
  }
}

// --------------------------- SSRF: address checks ---------------------------

const ipv4ToInt = (ip) => {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    n = n * 256 + octet
  }
  return n >>> 0
}

const inRange = (n, base, maskBits) => {
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0
  return (n & mask) === (ipv4ToInt(base) & mask)
}

// Loopback, private, link-local, CGNAT, and reserved/documentation ranges.
const isPrivateIpv4 = (ip) => {
  const n = ipv4ToInt(ip)
  if (n === null) return false
  return (
    inRange(n, '0.0.0.0', 8) ||
    inRange(n, '10.0.0.0', 8) ||
    inRange(n, '100.64.0.0', 10) ||
    inRange(n, '127.0.0.0', 8) ||
    inRange(n, '169.254.0.0', 16) ||
    inRange(n, '172.16.0.0', 12) ||
    inRange(n, '192.0.0.0', 24) ||
    inRange(n, '192.0.2.0', 24) ||
    inRange(n, '192.168.0.0', 16) ||
    inRange(n, '198.18.0.0', 15) ||
    inRange(n, '198.51.100.0', 24) ||
    inRange(n, '203.0.113.0', 24) ||
    inRange(n, '224.0.0.0', 4) ||
    inRange(n, '240.0.0.0', 4)
  )
}

const isPrivateIpv6 = (rawAddr) => {
  const addr = String(rawAddr).toLowerCase().split('%')[0].replace(/^\[|\]$/g, '')
  // IPv4-mapped (::ffff:1.2.3.4) — reuse the IPv4 rules.
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  if (addr === '::1' || addr === '::') return true
  if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(addr)) return true // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(addr)) return true // ff00::/8 multicast
  return false
}

const isIpLiteral = (host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')

export const isPrivateAddress = (host) => {
  const cleaned = String(host).replace(/^\[|\]$/g, '')
  if (cleaned.includes(':')) return isPrivateIpv6(cleaned)
  return isPrivateIpv4(cleaned)
}

// Hostnames that must never be resolved/fetched (internal/loopback names).
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp']
const BLOCKED_HOST_EXACT = new Set(['localhost'])

// Validates protocol + host, and resolves DNS to reject any host that maps to
// a private/internal address. Returns the parsed URL when safe; throws a
// JobExtractionError otherwise.
export const assertSafeUrl = async (rawUrl, { dnsLookupImpl = dnsLookup } = {}) => {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new JobExtractionError('invalid-url', 'The provided value is not a valid URL.', 400)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new JobExtractionError('blocked-scheme', 'Only http and https URLs are supported.', 400)
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) {
    throw new JobExtractionError('invalid-url', 'The URL is missing a hostname.', 400)
  }

  if (BLOCKED_HOST_EXACT.has(host) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new JobExtractionError('blocked-address', 'This host is not permitted.', 400)
  }

  // IP literals are checked directly (no DNS needed).
  if (isIpLiteral(host)) {
    if (isPrivateAddress(host)) {
      throw new JobExtractionError('blocked-address', 'This address range is not permitted.', 400)
    }
    return parsed
  }

  // Resolve DNS and reject if ANY resolved address is private/internal.
  let addresses
  try {
    addresses = await dnsLookupImpl(host, { all: true })
  } catch {
    throw new JobExtractionError('fetch-failed', 'Could not resolve the host.', 502)
  }

  const list = Array.isArray(addresses) ? addresses : [addresses]
  if (list.length === 0) {
    throw new JobExtractionError('fetch-failed', 'Could not resolve the host.', 502)
  }
  for (const entry of list) {
    const address = typeof entry === 'string' ? entry : entry.address
    if (isPrivateAddress(address)) {
      throw new JobExtractionError('blocked-address', 'This host resolves to a private address.', 400)
    }
  }

  return parsed
}

// --------------------------- Fetch (size/type/redirect capped) --------------

const DEFAULTS = {
  timeoutMs: 8000,
  maxBytes: 2 * 1024 * 1024,
  maxRedirects: 3,
}

const HTML_CONTENT_TYPE = /text\/html|application\/xhtml\+xml/i

// Reads the response body but never accumulates more than maxBytes, so a
// server can't exhaust memory with an unbounded/chunked body.
const readCapped = async (response, maxBytes) => {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new JobExtractionError('oversized', 'The job posting page is too large.', 400)
  }

  const reader = response.body?.getReader?.()
  if (!reader) {
    const text = await response.text()
    if (Buffer.byteLength(text) > maxBytes) {
      throw new JobExtractionError('oversized', 'The job posting page is too large.', 400)
    }
    return text
  }

  const decoder = new TextDecoder()
  let received = 0
  let out = ''
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new JobExtractionError('oversized', 'The job posting page is too large.', 400)
    }
    out += decoder.decode(value, { stream: true })
  }
  out += decoder.decode()
  return out
}

// Fetches HTML following redirects manually, re-validating every hop against
// the SSRF rules. Never sends cookies or auth headers; never runs JS.
const fetchHtml = async (rawUrl, { config = {}, fetchImpl = fetch, dnsLookupImpl = dnsLookup } = {}) => {
  const timeoutMs = config.jobExtractTimeoutMs || DEFAULTS.timeoutMs
  const maxBytes = config.jobExtractMaxBytes || DEFAULTS.maxBytes
  const maxRedirects = config.jobExtractMaxRedirects ?? DEFAULTS.maxRedirects

  let currentUrl = rawUrl
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const parsed = await assertSafeUrl(currentUrl, { dnsLookupImpl })

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetchImpl(parsed.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        // No credentials, no cookies — a plain public GET.
        credentials: 'omit',
        headers: {
          'User-Agent': 'ResumeJobMatchAnalyzer/1.0 (+job-import)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })
    } catch (error) {
      const timedOut = error?.name === 'AbortError'
      throw new JobExtractionError(
        timedOut ? 'timeout' : 'fetch-failed',
        timedOut ? 'The job posting took too long to load.' : 'Could not fetch the job posting.',
        502,
      )
    } finally {
      clearTimeout(timer)
    }

    const status = response.status

    if (status >= 300 && status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw new JobExtractionError('fetch-failed', 'The job posting redirected without a destination.', 502)
      }
      currentUrl = new URL(location, parsed).toString()
      continue
    }

    // Bot walls / auth walls — do not attempt to bypass; fail gracefully.
    if (status === 401 || status === 403 || status === 429) {
      throw new JobExtractionError('blocked-by-site', 'This job site blocked automated access.', 422)
    }
    if (status >= 400) {
      throw new JobExtractionError('fetch-failed', `The job posting returned status ${status}.`, 502)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!HTML_CONTENT_TYPE.test(contentType)) {
      throw new JobExtractionError('unsupported-content-type', 'The URL did not return an HTML page.', 415)
    }

    const html = await readCapped(response, maxBytes)
    return { html, finalUrl: parsed.toString() }
  }

  throw new JobExtractionError('too-many-redirects', 'The job posting redirected too many times.', 400)
}

// --------------------------- HTML / structured parsing ----------------------

const decodeEntities = (value = '') =>
  String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))

const stripTags = (html = '') =>
  decodeEntities(
    String(html)
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim()

const attr = (tag, name) => {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return match ? decodeEntities(match[2] ?? match[3] ?? '') : ''
}

// -- A. JSON-LD JobPosting --

const collectObjects = (node, acc) => {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach((item) => collectObjects(item, acc))
    return
  }
  acc.push(node)
  if (Array.isArray(node['@graph'])) node['@graph'].forEach((item) => collectObjects(item, acc))
}

const isJobPosting = (obj) => {
  const type = obj['@type']
  if (!type) return false
  return Array.isArray(type) ? type.includes('JobPosting') : String(type) === 'JobPosting'
}

const readOrgName = (org) => {
  if (!org) return ''
  if (typeof org === 'string') return org
  if (Array.isArray(org)) return readOrgName(org[0])
  return org.name || ''
}

const readLocation = (loc) => {
  if (!loc) return ''
  if (Array.isArray(loc)) return readLocation(loc[0])
  const address = loc.address || loc
  if (typeof address === 'string') return address
  const parts = [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean)
  return parts.join(', ')
}

export const parseJsonLdJobPosting = (html = '') => {
  const scriptRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  const candidates = []
  let match
  while ((match = scriptRe.exec(html)) !== null) {
    let parsed
    try {
      parsed = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    collectObjects(parsed, candidates)
  }

  const job = candidates.find(isJobPosting)
  if (!job) return null

  const result = {}
  if (job.title) result.title = decodeEntities(String(job.title)).trim()
  if (job.description) result.description = stripTags(String(job.description))
  const company = readOrgName(job.hiringOrganization)
  if (company) result.company = decodeEntities(company).trim()
  const location = readLocation(job.jobLocation)
  if (location) result.location = decodeEntities(location).trim()
  return result
}

// -- B. Open Graph / meta tags --

export const parseMetaTags = (html = '') => {
  const metas = html.match(/<meta[^>]+>/gi) || []
  const byProp = {}
  for (const tag of metas) {
    const key = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase()
    const content = attr(tag, 'content')
    if (key && content && !byProp[key]) byProp[key] = content
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const pageTitle = titleTag ? decodeEntities(titleTag[1]).trim() : ''

  const result = {}
  const title = byProp['og:title'] || byProp['twitter:title'] || pageTitle
  if (title) result.title = title.trim()
  const description = byProp.description || byProp['og:description'] || byProp['twitter:description']
  if (description) result.description = description.trim()
  if (byProp['og:site_name']) result.company = byProp['og:site_name'].trim()
  return result
}

// -- C. Semantic HTML --

const removeNoise = (html = '') =>
  String(html)
    .replace(/<\s*(script|style|nav|footer|header|form|noscript)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<[^>]+(?:class|id)\s*=\s*["'][^"']*(cookie|consent|banner|subscribe|newsletter)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, ' ')

export const parseSemanticHtml = (html = '') => {
  const cleaned = removeNoise(html)
  const result = {}

  const h1 = cleaned.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1) {
    const text = stripTags(h1[1])
    if (text) result.title = text
  }

  const containerRe =
    /<(main|article)[^>]*>([\s\S]*?)<\/\1>|<[^>]+(?:class|id)\s*=\s*["'][^"']*(?:job-?description|jobDescription|description|job-details|posting)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
  const container = cleaned.match(containerRe)
  const rawSection = container ? container[2] || container[3] : ''
  const description = stripTags(rawSection || cleaned)
  if (description) result.description = description
  return result
}

// --------------------------- Optional AI cleanup ----------------------------

const looksNoisy = (text = '') => text.length > 4000 || (text.match(/\n/g) || []).length > 60

const aiCleanupSchemaShape = { title: '', company: '', description: '' }

// One small LLM call to normalize noisy extracted text into clean fields.
// Never invents requirements: if unsure, the caller keeps the source text.
const runAiCleanup = async ({ aiService, draft }) => {
  const { z } = await import('zod')
  const schema = z.object({
    title: z.string().optional().default(''),
    company: z.string().optional().default(''),
    description: z.string().optional().default(''),
  })
  const prompt =
    'You are cleaning up text scraped from a job posting page. Return ONLY JSON ' +
    `matching this shape: ${JSON.stringify(aiCleanupSchemaShape)}. ` +
    'Do NOT invent, add, or infer any requirement, skill, or detail not present in the input. ' +
    'Remove navigation, cookie notices, and boilerplate. Preserve the original wording of the job description. ' +
    'If you are unsure about a field, return it empty.\n\n' +
    `Input: ${JSON.stringify({
      title: draft.title || '',
      company: draft.company || '',
      description: (draft.description || '').slice(0, 8000),
    })}`
  const value = await aiService.generateJson(prompt, schema, { numPredict: 500 })
  return value
}

// --------------------------- Orchestration ----------------------------------

const MIN_DESCRIPTION_LENGTH = 40

const buildDemoJob = (url) => ({
  title: 'Senior Frontend Engineer',
  company: 'Kinetic Labs (Demo)',
  location: 'Remote',
  description:
    'We are hiring a Senior Frontend Engineer to build scalable React and TypeScript applications. ' +
    'Requirements: 5+ years with React and TypeScript (required), experience building component libraries (required), ' +
    'strong REST API integration, CI/CD and Docker (preferred), and mentoring experience (nice to have).',
  sourceUrl: url,
  extractionMethod: 'jsonld',
})

// First non-empty value wins.
const pick = (...values) => {
  for (const value of values) {
    if (value && String(value).trim()) return String(value).trim()
  }
  return undefined
}

/**
 * Fetches and extracts a job posting from a public URL.
 * @returns {Promise<{title?,company?,location?,description,sourceUrl,extractionMethod}>}
 */
export const extractJobFromUrl = async (rawUrl, { config = {}, deps = {} } = {}) => {
  const { fetchImpl, dnsLookupImpl, aiService } = deps

  // Presentation safety: demo mode returns a deterministic fixture, no network.
  if (String(config.aiMode || '').toLowerCase() === 'demo') {
    return buildDemoJob(rawUrl)
  }

  const { html, finalUrl } = await fetchHtml(rawUrl, { config, fetchImpl, dnsLookupImpl })

  const jsonLd = parseJsonLdJobPosting(html)
  const meta = parseMetaTags(html)
  const semantic = parseSemanticHtml(html)

  // Description drives the reported method (structured beats meta beats HTML).
  let extractionMethod = 'html'
  let description = semantic.description
  if (jsonLd && jsonLd.description && jsonLd.description.length >= MIN_DESCRIPTION_LENGTH) {
    extractionMethod = 'jsonld'
    description = jsonLd.description
  } else if (meta.description && meta.description.length >= MIN_DESCRIPTION_LENGTH) {
    extractionMethod = 'meta'
    description = meta.description
  }

  // Title/company/location merge independently, by strategy priority. The
  // semantic <h1> is preferred over a bare page <title> for the job title.
  let draft = {
    title: pick(jsonLd?.title, semantic.title, meta.title),
    company: pick(jsonLd?.company, meta.company, semantic.company),
    location: pick(jsonLd?.location, semantic.location, meta.location),
    description,
  }

  // Optional, opt-in single LLM cleanup for noisy semantic-HTML extractions.
  if (
    config.jobExtractAiCleanup &&
    aiService &&
    extractionMethod === 'html' &&
    looksNoisy(draft.description || '')
  ) {
    try {
      const cleaned = await runAiCleanup({ aiService, draft })
      if (cleaned?.description && cleaned.description.length >= MIN_DESCRIPTION_LENGTH) {
        draft = {
          title: cleaned.title || draft.title,
          company: cleaned.company || draft.company,
          location: draft.location,
          description: cleaned.description,
        }
        extractionMethod = 'ai-cleanup'
      }
    } catch {
      // Cleanup is best-effort; keep the deterministic draft on failure.
    }
  }

  if (!draft.description || draft.description.trim().length < MIN_DESCRIPTION_LENGTH) {
    throw new JobExtractionError(
      'no-content',
      'No meaningful job content could be extracted from this page.',
      422,
    )
  }

  const result = { description: draft.description.trim(), sourceUrl: finalUrl, extractionMethod }
  if (draft.title) result.title = draft.title.trim()
  if (draft.company) result.company = draft.company.trim()
  if (draft.location) result.location = draft.location.trim()
  return result
}
