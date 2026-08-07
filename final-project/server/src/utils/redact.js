/**
 * Best-effort redaction of obvious personal data before anything derived
 * from resume/job text is logged. Order matters: URLs first (so a URL
 * containing digits doesn't get partially mangled by the phone pattern),
 * then email, then physical address, then phone.
 */
const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/gi
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const ADDRESS_PATTERN = /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s){1,5}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Suite|Ste)\.?\b/gi
const PHONE_PATTERN = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g

export const redactSensitiveText = (text) => {
  if (typeof text !== 'string') return text

  return text
    .replace(URL_PATTERN, '[redacted-url]')
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(ADDRESS_PATTERN, '[redacted-address]')
    .replace(PHONE_PATTERN, '[redacted-phone]')
}

/** Recursively redacts every string value in an object/array. */
export const redactDeep = (value) => {
  if (typeof value === 'string') return redactSensitiveText(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, redactDeep(val)]))
  }
  return value
}
