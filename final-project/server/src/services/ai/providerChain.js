import { FAILURE_CATEGORIES, FALLBACK_CATEGORIES, COOLDOWN_CATEGORIES, DIAGNOSTIC_MESSAGES } from './errorClassification.js'
import { createCooldownRegistry } from './cooldownRegistry.js'
import { AiProvidersUnavailableError } from './errors.js'
import { timingLog } from '../../utils/timingLog.js' // Sanitized per-provider diagnostics — gated behind DEBUG_AI_TIMING=true
import { logJsonValidateFailure, logRawJsonParseFailure } from '../../utils/aiDebugLog.js' // TEMPORARY — see json_validate_failed investigation notes below

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
  // TEMPORARY (Groq 400 investigation) — this path never retries at all, so
  // any failure here is definitionally pre-retry. See attemptWithCorrectiveRetry.
  stats.retryPhase = 'no-retry-configured'
  return provider.generateJson(prompt, schema, options)
}

// One attempt, plus a single corrective retry against the SAME provider when
// the failure was a JSON/schema problem — this is the "configured retry"
// that must be exhausted before the chain moves to the next provider.
const attemptWithCorrectiveRetry = async (provider, prompt, schema, options, stats) => {
  // TEMPORARY (Groq 400 investigation) — set BEFORE each attempt (not just on
  // success) so a failure that propagates out of either call is correctly
  // attributed to the initial attempt or the corrective retry, never left
  // showing the stale value from a previous call in this same chain run.
  stats.retryPhase = 'initial'
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
    stats.retryPhase = 'retry'
    const result = await provider.generateJson(correctedPrompt, schema, options)
    stats.retryCount = 1
    return result
  }
}

const attemptText = (provider, prompt, schema, options, stats) => {
  stats.retryCount = 0
  stats.retryPhase = 'no-retry-configured' // TEMPORARY (Groq 400 investigation)
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

        // TEMPORARY (Groq 400 investigation) — HTTP 400 is classified as
        // 'invalid_request' (see errorClassification.js): Groq rejected the
        // REQUEST itself (bad model name, unsupported parameter, a
        // json_object-mode validation failure, etc.), not a connectivity/
        // outage problem. This extra line captures exactly what's needed to
        // confirm why, without changing classification/fallback/cooldown
        // behavior. errorType/errorCode/errorParam are short, enum-like
        // identifiers from Groq's OpenAI-compatible error shape
        // ({error:{type,code,param}}) — never the free-text error message,
        // never the prompt, resume, or API key. requestId/worker are
        // auto-attached by timingLog from the active request context.
        if (provider.providerName === 'groq' && error?.details?.status === 400) {
          timingLog('groq 400 diagnostic', {
            provider: provider.providerName,
            model: provider.modelName,
            status: error.details.status,
            errorType: error.details.errorType ?? 'n/a',
            errorCode: error.details.errorCode ?? 'n/a',
            errorParam: error.details.errorParam ?? 'n/a',
            retryPhase: stats.retryPhase ?? 'n/a',
          })

          // json_validate_failed specifically: also surface the raw
          // (possibly empty) failed_generation fragment, so the actual vs.
          // expected JSON shape can be compared. Separately gated (dev-mode +
          // DEBUG_AI_RESPONSES) since it's nearer to raw provider content —
          // see aiDebugLog.js's logJsonValidateFailure for the exact rules.
          if (error.details.errorCode === 'json_validate_failed') {
            logJsonValidateFailure({
              provider: provider.providerName,
              model: provider.modelName,
              errorCode: error.details.errorCode,
              failedGeneration: error.details.failedGeneration,
            })
          }
        }

        // TEMPORARY (interview all-providers-fail investigation) — ANY
        // provider whose text response our own jsonExtraction.js couldn't
        // parse (category invalid-json). Unlike the Groq-only block above,
        // this applies to every provider — the point is to see the actual
        // raw text a provider returned before we gave up on it, most often
        // to confirm/rule out truncation (max_tokens too low for the
        // requested output) vs. a genuinely malformed shape. Same dev-mode +
        // DEBUG_AI_RESPONSES double gate — see aiDebugLog.js.
        if (category === FAILURE_CATEGORIES.INVALID_JSON && typeof error?.details?.rawText === 'string') {
          logRawJsonParseFailure({
            provider: provider.providerName,
            model: provider.modelName,
            rawText: error.details.rawText,
          })
        }

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
