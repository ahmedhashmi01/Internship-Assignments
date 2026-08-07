import { BaseProvider } from './providerInterface.js'
import { ProviderTimeoutError, ProviderUnavailableError, InvalidOutputError, ProviderError } from './errors.js'
import { normalizeNullableOptionals } from './normalizeNullableOptionals.js'
import { repairSkillMatchConfidence, carryConfidenceRepairInfo } from './repairSkillMatchConfidence.js'
import { extractJsonFromText } from './jsonExtraction.js'
import { skillMatchBatchOutputSchema } from '../../schemas/workerSchemas.js'
import { FALLBACK_CATEGORIES } from './errorClassification.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MODELS = ['meta-llama/llama-3.1-8b-instruct:free']
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * OpenRouter gets its own internal fallback across a configured ORDERED list
 * of models (OPENROUTER_MODELS) — it only surfaces a failure to the outer
 * provider chain once every configured model has been tried and failed.
 */
export class OpenRouterProvider extends BaseProvider {
  constructor(config) {
    super(config)
    this.requiresApiKey = true
    this.apiKey = config?.openrouterApiKey || ''
    this.models = Array.isArray(config?.openrouterModels) && config.openrouterModels.length > 0
      ? config.openrouterModels
      : DEFAULT_MODELS
    this.lastUsedModel = null
  }

  get providerName() {
    return 'openrouter'
  }

  get modelName() {
    return this.lastUsedModel || this.models[0]
  }

  async healthCheck() {
    return {
      ok: Boolean(this.apiKey),
      provider: this.providerName,
      model: this.modelName,
      error: this.apiKey ? null : 'OPENROUTER_API_KEY is not configured',
    }
  }

  async generateText(prompt) {
    return this._tryModelsInOrder((model) => this._request(model, prompt, {}))
  }

  async generateJson(prompt, schema, options = {}) {
    return this._tryModelsInOrder(async (model) => {
      const text = await this._request(model, prompt, { jsonMode: true, options })
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
    })
  }

  async _tryModelsInOrder(attemptFn) {
    if (!this.apiKey) {
      throw new ProviderUnavailableError('OpenRouter API key is not configured', { missingApiKey: true })
    }

    let lastError = null

    for (const model of this.models) {
      try {
        const result = await attemptFn(model)
        this.lastUsedModel = model
        return result
      } catch (error) {
        lastError = error
        const category = this.classifyError(error)
        if (!FALLBACK_CATEGORIES.has(category)) throw error
        // else: try the next configured model
      }
    }

    throw lastError
  }

  async _request(model, prompt, { jsonMode = false, options = {} } = {}) {
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

      const response = await fetch(OPENROUTER_ENDPOINT, {
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
        throw new ProviderTimeoutError('OpenRouter request timed out', { timeoutMs })
      }
      if (error instanceof ProviderError) throw error
      throw new ProviderUnavailableError('OpenRouter provider unavailable', { networkError: true, cause: error })
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

    return new ProviderUnavailableError('OpenRouter provider request failed', {
      status,
      quotaExceeded,
      retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
    })
  }
}
