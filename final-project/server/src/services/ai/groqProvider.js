import { BaseProvider } from './providerInterface.js'
import { ProviderTimeoutError, ProviderUnavailableError, InvalidOutputError, ProviderError } from './errors.js'
import { normalizeNullableOptionals } from './normalizeNullableOptionals.js'
import { repairSkillMatchConfidence, carryConfidenceRepairInfo } from './repairSkillMatchConfidence.js'
import { extractJsonFromText } from './jsonExtraction.js'
import { skillMatchBatchOutputSchema } from '../../schemas/workerSchemas.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MODEL = 'llama-3.1-8b-instant'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

export class GroqProvider extends BaseProvider {
  constructor(config) {
    super(config)
    this.requiresApiKey = true
    this.apiKey = config?.groqApiKey || ''
  }

  get providerName() {
    return 'groq'
  }

  get modelName() {
    return this.config?.groqModel || DEFAULT_MODEL
  }

  async healthCheck() {
    return {
      ok: Boolean(this.apiKey),
      provider: this.providerName,
      model: this.modelName,
      error: this.apiKey ? null : 'GROQ_API_KEY is not configured',
    }
  }

  async generateText(prompt) {
    return this._request(this.modelName, prompt, {})
  }

  async generateJson(prompt, schema, options = {}) {
    const text = await this._request(this.modelName, prompt, { jsonMode: true, options })
    const parsed = extractJsonFromText(text)

    if (schema && typeof schema.parse === 'function') {
      const normalized = normalizeNullableOptionals(parsed, schema)
      const repaired = schema === skillMatchBatchOutputSchema
        ? repairSkillMatchConfidence(normalized)
        : normalized
      try {
        return carryConfidenceRepairInfo(repaired, schema.parse(repaired))
      } catch (error) {
        throw new InvalidOutputError('Schema validation failed for provider output', { reason: 'schema-invalid', cause: error })
      }
    }

    return parsed
  }

  async _request(model, prompt, { jsonMode = false, options = {} } = {}) {
    if (!this.apiKey) {
      throw new ProviderUnavailableError('Groq API key is not configured', { missingApiKey: true })
    }

    const timeoutMs = this.config?.aiTimeoutMs || DEFAULT_TIMEOUT_MS
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: this.config?.aiTemperature,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        ...(options.numPredict ? { max_tokens: options.numPredict } : {}),
      }

      const response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw await this._buildHttpError(response)
      }

      const payload = await response.json()
      return payload?.choices?.[0]?.message?.content || ''
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new ProviderTimeoutError('Groq request timed out', { timeoutMs })
      }
      if (error instanceof ProviderError) throw error
      throw new ProviderUnavailableError('Groq provider unavailable', { networkError: true, cause: error })
    } finally {
      clearTimeout(timer)
    }
  }

  async _buildHttpError(response) {
    const status = response.status
    const retryAfterHeader = typeof response.headers?.get === 'function' ? response.headers.get('retry-after') : null
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined
    const errorPayload = await response.json().catch(() => null)
    const message = String(errorPayload?.error?.message || errorPayload?.error?.code || '').toLowerCase()
    const quotaExceeded = status === 429 && message.includes('quota')

    return new ProviderUnavailableError('Groq provider request failed', {
      status,
      quotaExceeded,
      retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
      // TEMPORARY (Groq 400 investigation) — short, enum-like identifiers
      // only (OpenAI-compatible error shape: {error:{type,code,param}}).
      // Deliberately NEVER captures errorPayload.error.message here — that
      // field can be arbitrarily descriptive prose and is not needed to
      // diagnose "why did Groq reject this request" the way type/code/param
      // already do. See providerChain.js for where these get logged.
      errorType: errorPayload?.error?.type || null,
      errorCode: errorPayload?.error?.code || null,
      errorParam: errorPayload?.error?.param || null,
      // TEMPORARY (json_validate_failed investigation) — Groq's own
      // best-effort capture of what it generated before failing its
      // internal json_object-mode validation (empty string when nothing was
      // produced at all, e.g. the whole token budget was spent on internal
      // reasoning before any output — see providerChain.js/aiDebugLog.js for
      // where this is logged, dev-mode + DEBUG_AI_RESPONSES gated only,
      // never in production, never by default).
      failedGeneration: typeof errorPayload?.error?.failed_generation === 'string' ? errorPayload.error.failed_generation : null,
    })
  }
}
