// Normalized failure categories used across every provider so the fallback
// chain can make routing decisions without knowing provider-specific error
// shapes. Providers populate `error.details` (status, retryAfterMs,
// quotaExceeded, networkError, missingApiKey) when they throw; this module
// is the single place that turns those details into one of these categories.
export const FAILURE_CATEGORIES = Object.freeze({
  QUOTA_EXHAUSTED: 'quota-exhausted',
  RATE_LIMITED: 'rate-limited',
  SERVER_ERROR: 'server-error',
  NETWORK_ERROR: 'network-error',
  TIMEOUT: 'timeout',
  INVALID_JSON: 'invalid-json',
  SCHEMA_INVALID: 'schema-invalid',
  MISSING_API_KEY: 'missing-api-key',
  // A 4xx that means "the request itself was rejected" (bad model name,
  // unsupported parameter, malformed body, revoked/invalid credentials) —
  // distinct from a transient/availability problem. Retrying the IDENTICAL
  // request against the SAME provider will not help (see providerChain.js:
  // these never trigger the corrective retry, and never cooldown the
  // provider, since the failure isn't about availability).
  INVALID_REQUEST: 'invalid_request',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  UNKNOWN: 'unknown',
})

// Only these categories cause the chain to move on to the next provider.
// Everything else (e.g. UNKNOWN — an unexpected/programming error) aborts
// the whole chain immediately rather than silently masking a real bug by
// cycling through providers.
export const FALLBACK_CATEGORIES = new Set([
  FAILURE_CATEGORIES.QUOTA_EXHAUSTED,
  FAILURE_CATEGORIES.RATE_LIMITED,
  FAILURE_CATEGORIES.SERVER_ERROR,
  FAILURE_CATEGORIES.NETWORK_ERROR,
  FAILURE_CATEGORIES.TIMEOUT,
  FAILURE_CATEGORIES.INVALID_JSON,
  FAILURE_CATEGORIES.SCHEMA_INVALID,
  // A rejected request or bad credentials on THIS provider doesn't mean
  // every provider is unusable — still worth trying the next one.
  FAILURE_CATEGORIES.INVALID_REQUEST,
  FAILURE_CATEGORIES.UNAUTHORIZED,
  FAILURE_CATEGORIES.FORBIDDEN,
])

// Availability signals — these additionally put the provider in cooldown,
// not just fail over for this one call. Deliberately NOT including
// INVALID_REQUEST/UNAUTHORIZED/FORBIDDEN: those are request/config problems,
// not transient availability problems, so a global time-based cooldown isn't
// the right response (and could wrongly bench a provider that's actually
// fine, based on one bad call).
export const COOLDOWN_CATEGORIES = new Set([
  FAILURE_CATEGORIES.QUOTA_EXHAUSTED,
  FAILURE_CATEGORIES.RATE_LIMITED,
])

// Fixed, sanitized message per category/skip-reason for diagnostics — NEVER
// derived from the raw error/response, so it can never leak a provider's
// response body, headers, or request content. This is the only "message"
// diagnostics are allowed to carry (see providerChain.js).
export const DIAGNOSTIC_MESSAGES = Object.freeze({
  [FAILURE_CATEGORIES.QUOTA_EXHAUSTED]: 'Provider quota exhausted',
  [FAILURE_CATEGORIES.RATE_LIMITED]: 'Provider rate limit exceeded',
  [FAILURE_CATEGORIES.SERVER_ERROR]: 'Provider returned a server error',
  [FAILURE_CATEGORIES.NETWORK_ERROR]: 'Provider network request failed',
  [FAILURE_CATEGORIES.TIMEOUT]: 'Provider request timed out',
  [FAILURE_CATEGORIES.INVALID_JSON]: 'Provider returned invalid JSON',
  [FAILURE_CATEGORIES.SCHEMA_INVALID]: 'Provider output failed schema validation',
  [FAILURE_CATEGORIES.MISSING_API_KEY]: 'Provider API key is not configured',
  [FAILURE_CATEGORIES.INVALID_REQUEST]: 'Provider rejected the request (invalid parameters)',
  [FAILURE_CATEGORIES.UNAUTHORIZED]: 'Provider rejected the request (unauthorized)',
  [FAILURE_CATEGORIES.FORBIDDEN]: 'Provider rejected the request (forbidden)',
  [FAILURE_CATEGORIES.UNKNOWN]: 'Provider failed for an unrecognized reason',
  cooldown: 'Provider temporarily disabled after a recent quota/rate-limit failure',
  'health-check-failed': 'Provider health check failed',
})

export const classifyProviderError = (error) => {
  if (!error) return FAILURE_CATEGORIES.UNKNOWN

  if (error.name === 'ProviderTimeoutError') return FAILURE_CATEGORIES.TIMEOUT

  if (error.name === 'InvalidOutputError') {
    return error.details?.reason === 'invalid-json'
      ? FAILURE_CATEGORIES.INVALID_JSON
      : FAILURE_CATEGORIES.SCHEMA_INVALID
  }

  if (error.name === 'ProviderUnavailableError') {
    const details = error.details || {}
    if (details.missingApiKey) return FAILURE_CATEGORIES.MISSING_API_KEY
    if (details.quotaExceeded) return FAILURE_CATEGORIES.QUOTA_EXHAUSTED
    if (details.status === 429) return FAILURE_CATEGORIES.RATE_LIMITED
    if (details.status === 400) return FAILURE_CATEGORIES.INVALID_REQUEST
    if (details.status === 401) return FAILURE_CATEGORIES.UNAUTHORIZED
    if (details.status === 403) return FAILURE_CATEGORIES.FORBIDDEN
    if (typeof details.status === 'number' && details.status >= 500) return FAILURE_CATEGORIES.SERVER_ERROR
    if (details.networkError) return FAILURE_CATEGORIES.NETWORK_ERROR
    // Genuinely unrecognized shape (no status, or a status outside the
    // explicit cases above) — keep the pre-existing, already-safe fallback:
    // treat it as a network error so the chain still falls back rather than
    // aborting on an edge case nobody has asked to change tonight.
    return FAILURE_CATEGORIES.NETWORK_ERROR
  }

  return FAILURE_CATEGORIES.UNKNOWN
}
