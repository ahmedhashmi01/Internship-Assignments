import { FAILURE_CATEGORIES, FALLBACK_CATEGORIES, COOLDOWN_CATEGORIES, DIAGNOSTIC_MESSAGES } from './errorClassification.js'
import { createCooldownRegistry } from './cooldownRegistry.js'
import { AiProvidersUnavailableError } from './errors.js'
import { timingLog } from '../../utils/timingLog.js' // Sanitized per-provider diagnostics — gated behind DEBUG_AI_TIMING=true

const DEFAULT_COOLDOWN_MS = 300_000

// Pulls the Zod issue list out of a schema-validation failure so the retry
// prompt can name the exact fields that failed, instead of a generic "not
// valid JSON" message that gives the model nothing to correct — confirmed
// via benchmark to otherwise produce byte-identical failing output on retry.
const summarizeValidationIssues = (error) => {
  const zodError = error?.name === 'ZodError' ? error : error?.details?.cause
  const issues = zodError?.issues
  if (!Array.isArray(issues) || issues.length === 0) return null

  return issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
}

const buildCorrectedPrompt = (prompt, error) => {
  const validationDetail = summarizeValidationIssues(error)
  const correctionMessage = validationDetail
    ? `IMPORTANT: Your previous response failed schema validation: ${validationDetail}. Respond again with ONLY a single valid JSON object that fixes these errors — every item must include every required field.`
    : 'IMPORTANT: Your previous response was not valid JSON. Respond with ONLY a valid JSON object and nothing else — no markdown fences, no explanation.'
  return `${prompt}\n\n${correctionMessage}`
}

// One attempt, no corrective retry — used for calls that deliberately avoid
// resending an expensive full batch (e.g. bulletRewrite's batch attempt).
// `stats` is a mutable diagnostics side-channel (see runChain) — attemptFns
// report their retry count onto it; it is never part of the return value.
const attemptSingle = (provider, prompt, schema, options, stats) => {
  stats.retryCount = 0
  return provider.generateJson(prompt, schema, options)
}

// One attempt, plus a single corrective retry against the SAME provider when
// the failure was a JSON/schema problem — this is the "configured retry"
// that must be exhausted before the chain moves to the next provider.
const attemptWithCorrectiveRetry = async (provider, prompt, schema, options, stats) => {
  try {
    const result = await provider.generateJson(prompt, schema, options)
    stats.retryCount = 0
    return result
  } catch (error) {
    const category = provider.classifyError(error)
    if (category !== FAILURE_CATEGORIES.INVALID_JSON && category !== FAILURE_CATEGORIES.SCHEMA_INVALID) {
      throw error
    }
    const correctedPrompt = buildCorrectedPrompt(prompt, error)
    const result = await provider.generateJson(correctedPrompt, schema, options)
    stats.retryCount = 1
    return result
  }
}

const attemptText = (provider, prompt, schema, options, stats) => {
  stats.retryCount = 0
  return provider.generateText(prompt)
}

/**
 * Finds the first provider the chain would actually try right now (skipping
 * missing-API-key and cooling-down providers), without invoking it. Used for
 * healthCheck(), which should reflect the chain's current preference without
 * spending a real generation call.
 */
const findFirstEligibleProvider = (providers, cooldownRegistry, now) => {
  for (const provider of providers) {
    if (provider.requiresApiKey && !provider.apiKey) continue
    if (cooldownRegistry.isCoolingDown(provider.providerName, now())) continue
    return provider
  }
  return null
}

/**
 * Builds the sequential (never parallel) fallback engine over an ordered
 * list of already-constructed provider instances. Stops on the first
 * successful response; every attempted provider's outcome is recorded for
 * diagnostics. Never falls back for business-logic outcomes (low score,
 * empty result, anti-fabrication rejection) — those aren't errors this layer
 * ever sees, since they're computed by the orchestration layer AFTER a
 * successful generateJson call.
 */
export const createProviderChain = (providers, options = {}) => {
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const cooldownRegistry = options.cooldownRegistry ?? createCooldownRegistry()
  const now = options.now ?? (() => Date.now())

  const runChain = async (attemptFn, prompt, schema, options2) => {
    const attempted = []
    const startedAt = now()

    for (let index = 0; index < providers.length; index += 1) {
      const provider = providers[index]
      const nowMs = now()

      if (provider.requiresApiKey && !provider.apiKey) {
        attempted.push({
          provider: provider.providerName,
          model: provider.modelName,
          attemptIndex: index,
          outcome: 'skipped',
          reason: FAILURE_CATEGORIES.MISSING_API_KEY,
          message: DIAGNOSTIC_MESSAGES[FAILURE_CATEGORIES.MISSING_API_KEY],
        })
        timingLog('provider skipped', { provider: provider.providerName, model: provider.modelName, attemptIndex: index, reason: FAILURE_CATEGORIES.MISSING_API_KEY, cooldown: false })
        continue
      }

      if (cooldownRegistry.isCoolingDown(provider.providerName, nowMs)) {
        attempted.push({
          provider: provider.providerName,
          model: provider.modelName,
          attemptIndex: index,
          outcome: 'skipped',
          reason: 'cooldown',
          message: DIAGNOSTIC_MESSAGES.cooldown,
        })
        // Sanitized — provider name, model, and a remaining-duration NUMBER
        // only; never the raw error that originally triggered the cooldown.
        const cooldownUntil = cooldownRegistry.getUntil(provider.providerName)
        const cooldownRemainingMs = typeof cooldownUntil === 'number' ? Math.max(0, cooldownUntil - nowMs) : null
        timingLog('provider skipped', { provider: provider.providerName, model: provider.modelName, attemptIndex: index, reason: 'cooldown', cooldown: true, cooldownRemainingMs })
        continue
      }

      if (provider.preflightHealthCheck) {
        const health = await provider.healthCheck()
        if (!health.ok) {
          attempted.push({
            provider: provider.providerName,
            model: provider.modelName,
            attemptIndex: index,
            outcome: 'skipped',
            reason: 'health-check-failed',
            message: DIAGNOSTIC_MESSAGES['health-check-failed'],
          })
          timingLog('provider skipped', { provider: provider.providerName, model: provider.modelName, attemptIndex: index, reason: 'health-check-failed', cooldown: false })
          continue
        }
      }

      const stats = { retryCount: 0 }
      try {
        const runAttempt = () => attemptFn(provider, prompt, schema, options2, stats)
        const value = await (provider.concurrencyLimiter ? provider.concurrencyLimiter.run(runAttempt) : runAttempt())
        attempted.push({ provider: provider.providerName, model: provider.modelName, attemptIndex: index, outcome: 'succeeded' })
        return {
          value,
          diagnostics: {
            selectedProvider: provider.providerName,
            selectedModel: provider.modelName,
            fallbackIndex: index,
            durationMs: now() - startedAt,
            retryCount: stats.retryCount,
            attempts: stats.retryCount + 1,
            attemptedProviders: attempted,
          },
        }
      } catch (error) {
        const category = provider.classifyError(error)
        const willCooldown = COOLDOWN_CATEGORIES.has(category)
        attempted.push({
          provider: provider.providerName,
          model: provider.modelName,
          attemptIndex: index,
          outcome: 'failed',
          failureCategory: category,
          message: DIAGNOSTIC_MESSAGES[category] || DIAGNOSTIC_MESSAGES[FAILURE_CATEGORIES.UNKNOWN],
        })

        // Sanitized per-provider failure diagnostics: provider/model/status/
        // category/retry-after/cooldown ONLY — never the API key, the prompt,
        // resume/job text, or the raw provider response body. `status` and
        // `retryAfterMs` come from error.details, populated by each
        // provider's _buildHttpError from the HTTP response status/headers
        // alone, never from the response body content.
        timingLog('provider attempt failed', {
          provider: provider.providerName,
          model: provider.modelName,
          attemptIndex: index,
          status: error?.details?.status ?? 'n/a',
          category,
          retryAfterMs: error?.details?.retryAfterMs ?? 'n/a',
          cooldown: willCooldown,
        })

        if (willCooldown) {
          const retryAfterMs = error?.details?.retryAfterMs
          cooldownRegistry.markCooldown(
            provider.providerName,
            typeof retryAfterMs === 'number' && retryAfterMs >= 0 ? retryAfterMs : cooldownMs,
            nowMs,
          )
        }

        if (!FALLBACK_CATEGORIES.has(category)) throw error
        // else: fall through to the next provider in the chain
      }
    }

    // Consolidated summary — one line correlating every attempt in this chain
    // run, so a single grep shows the full skip/fail sequence without
    // reconstructing it from separate "provider attempt failed" lines.
    timingLog('provider chain exhausted', {
      attempts: attempted.map((entry) => `${entry.provider}:${entry.outcome === 'failed' ? entry.failureCategory : entry.reason}`).join(','),
      durationMs: now() - startedAt,
    })

    throw new AiProvidersUnavailableError(
      'All configured providers failed, were skipped, or are unavailable',
      { attemptedProviders: attempted },
    )
  }

  return {
    async generateJson(prompt, schema, opts = {}) {
      return runChain(attemptSingle, prompt, schema, opts)
    },
    async generateJsonWithRetry(prompt, schema, opts = {}) {
      return runChain(attemptWithCorrectiveRetry, prompt, schema, opts)
    },
    async generateText(prompt) {
      return runChain(attemptText, prompt, null, {})
    },
    async healthCheck() {
      const provider = findFirstEligibleProvider(providers, cooldownRegistry, now)
      if (!provider) {
        return { ok: false, provider: 'none', model: null, error: 'No provider is configured and available (missing API keys or all in cooldown)' }
      }
      return provider.healthCheck()
    },
    cooldownRegistry,
  }
}
