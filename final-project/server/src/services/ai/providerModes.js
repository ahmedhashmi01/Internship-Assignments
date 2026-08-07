// Full automatic chain, in priority order: hosted free-tier providers first,
// Ollama as a local fallback. Mock is intentionally NOT part of this list —
// automatic mode must never silently produce fabricated mock analysis when
// every real provider is unavailable; it returns AI_PROVIDERS_UNAVAILABLE
// instead (see providerChain.js).
export const DEFAULT_PROVIDER_CHAIN = ['gemini', 'groq', 'openrouter', 'ollama']
export const CLOUD_PROVIDERS = ['gemini', 'groq', 'openrouter']
export const PRIVATE_PROVIDERS = ['ollama']
export const DEMO_PROVIDERS = ['mock']

// The only providers 'automatic' mode is allowed to use — mock is excluded
// even if a misconfigured AI_PROVIDER_CHAIN lists it.
const AUTOMATIC_MODE_PROVIDERS = new Set(DEFAULT_PROVIDER_CHAIN)

const parseChainList = (value) =>
  String(value || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

/**
 * Resolves the ordered list of provider NAMES (not instances) to try, based
 * on `config.aiMode` and, for 'automatic' mode, `config.aiProviderChain` /
 * `config.aiProvider`.
 *
 * - cloud / private / demo: a fixed, literal list — these modes are an
 *   explicit user choice (e.g. "private" means no cloud calls at all), so
 *   they do NOT silently fall through to other modes' providers.
 * - automatic: AI_PROVIDER_CHAIN when set (filtered to cloud+ollama only —
 *   mock is dropped even if misconfigured in), else the single legacy
 *   AI_PROVIDER value, else the full DEFAULT_PROVIDER_CHAIN.
 *
 * The legacy `config.aiProvider` single-provider fallback is NOT filtered —
 * it is how automated tests deliberately select 'mock' directly (an
 * explicit override, not automatic multi-provider fallback silently landing
 * on mock).
 */
export const resolveProviderChainNames = (config = {}) => {
  // An explicit single-provider 'mock' selection always wins, unconditionally
  // — this is the deliberate test/demo escape hatch (mock is excluded from
  // every mode's real routing above), and it must never be silently
  // overridden by AI_MODE/AI_PROVIDER_CHAIN leaking in from the ambient
  // environment. This matters concretely: `createApp({ aiProvider: 'mock' })`
  // merges that override onto config.js's real, .env-loaded defaults, so
  // config.aiMode/config.aiProviderChain can still be 'automatic'/a real
  // chain even though the caller explicitly asked for mock-only.
  if (String(config.aiProvider || '').toLowerCase() === 'mock') return DEMO_PROVIDERS

  const mode = String(config.aiMode || 'automatic').toLowerCase()

  if (mode === 'cloud') return CLOUD_PROVIDERS
  if (mode === 'private') return PRIVATE_PROVIDERS
  if (mode === 'demo') return DEMO_PROVIDERS

  const configuredChain = parseChainList(config.aiProviderChain).filter((name) => AUTOMATIC_MODE_PROVIDERS.has(name))
  if (configuredChain.length > 0) return configuredChain

  if (config.aiProvider) return [String(config.aiProvider).toLowerCase()]

  return DEFAULT_PROVIDER_CHAIN
}
