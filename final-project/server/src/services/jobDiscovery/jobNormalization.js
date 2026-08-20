/**
 * jobNormalization.js
 *
 * Converts each provider's raw job shape into ONE internal structure. If a
 * source doesn't provide a field, the field is `null` — never invented.
 * Pure functions, no network, no AI.
 */

const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:'])

// Only ever surface http(s) links for "View Job" — never let a provider's
// malformed/unexpected URL scheme (or a non-URL string) reach the frontend.
export const sanitizeExternalUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  try {
    const parsed = new URL(rawUrl)
    return ALLOWED_URL_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}

const decodeEntities = (value = '') =>
  String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")

// Provider descriptions (e.g. Remotive) may be HTML — normalize to plain text
// so the frontend never needs dangerouslySetInnerHTML on untrusted content.
export const stripHtmlToText = (html = '') =>
  decodeEntities(
    String(html)
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim()

const cleanText = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const cleanNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

// ISO timestamp only when the provider gave us something parseable — never
// defaults to "now", so a job is never dishonestly labeled "posted today".
const cleanDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const WORK_TYPE_VALUES = new Set(['remote', 'hybrid', 'onsite'])
export const normalizeWorkType = (value) => {
  if (!value) return null
  const lowered = String(value).toLowerCase()
  if (WORK_TYPE_VALUES.has(lowered)) return lowered
  if (lowered.includes('remote')) return 'remote'
  if (lowered.includes('hybrid')) return 'hybrid'
  if (lowered.includes('on-site') || lowered.includes('onsite') || lowered.includes('on site')) return 'onsite'
  return null
}

// Deterministic fallback when the provider has no structured work-type field
// (e.g. Adzuna) — looks for an explicit mention in the title/description.
// Still null (never guessed) when nothing is mentioned.
export const inferWorkType = (...texts) => normalizeWorkType(texts.filter(Boolean).join(' '))

const SENIORITY_PATTERNS = [
  { value: 'lead', pattern: /\b(lead|principal|staff|head of)\b/i },
  { value: 'senior', pattern: /\b(senior|sr\.?)\b/i },
  { value: 'junior', pattern: /\b(junior|jr\.?|entry[- ]level|graduate)\b/i },
  { value: 'mid', pattern: /\b(mid[- ]level|intermediate)\b/i },
]

// Deterministic — inferred from title/description text only when a clear
// signal is present; otherwise null (never guessed from nothing).
export const inferSeniority = (...texts) => {
  const haystack = texts.filter(Boolean).join(' ')
  for (const { value, pattern } of SENIORITY_PATTERNS) {
    if (pattern.test(haystack)) return value
  }
  return null
}

/**
 * Builds the shared normalized job envelope. `source`-specific adapters call
 * this with their own field mapping; nothing here is provider-specific.
 */
export const buildNormalizedJob = ({
  source,
  sourceJobId,
  sourceUrl,
  title,
  company,
  location,
  description,
  workType,
  seniority,
  postedAt,
  salaryMin,
  salaryMax,
  salaryCurrency,
}) => {
  const cleanTitle = cleanText(title)
  const cleanCompany = cleanText(company)
  const cleanLocation = cleanText(location)
  const safeUrl = sanitizeExternalUrl(sourceUrl)

  return {
    id: `${source}-${sourceJobId || fingerprintOf({ title: cleanTitle, company: cleanCompany, location: cleanLocation })}`,
    source,
    sourceJobId: cleanText(sourceJobId),
    sourceUrl: safeUrl,
    title: cleanTitle,
    company: cleanCompany,
    location: cleanLocation,
    description: cleanText(description),
    workType: normalizeWorkType(workType) ?? inferWorkType(cleanTitle, description),
    seniority: seniority ?? inferSeniority(cleanTitle, description),
    postedAt: cleanDate(postedAt),
    salary: {
      min: cleanNumber(salaryMin),
      max: cleanNumber(salaryMax),
      currency: cleanText(salaryCurrency),
    },
  }
}

// Stable fingerprint from title|company|location — the fallback identity
// when a provider gives no sourceJobId (see dedupe.js).
export const fingerprintOf = ({ title, company, location }) => {
  const slugify = (value) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  return [slugify(title), slugify(company), slugify(location)].join('|')
}
