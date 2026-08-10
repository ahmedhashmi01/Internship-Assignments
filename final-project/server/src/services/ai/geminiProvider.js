import { BaseProvider } from './providerInterface.js'
import { ProviderTimeoutError, ProviderUnavailableError, InvalidOutputError, ProviderError } from './errors.js'
import { normalizeNullableOptionals } from './normalizeNullableOptionals.js'
import { repairSkillMatchConfidence, carryConfidenceRepairInfo } from './repairSkillMatchConfidence.js'
import { extractJsonFromText } from './jsonExtraction.js'
import { skillMatchBatchOutputSchema } from '../../schemas/workerSchemas.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MODEL = 'gemini-2.0-flash'

export class GeminiProvider extends BaseProvider {
  constructor(config) {
    super(config)
    this.requiresApiKey = true
    this.apiKey = config?.geminiApiKey || ''
  }

  get providerName() {
    return 'gemini'
  }

  get modelName() {
    return this.config?.geminiModel || DEFAULT_MODEL
  }

  // No real network call — cloud provider health is "is it configured",
  // not "spend a quota-consuming request every time we check".
  async healthCheck() {
    return {
      ok: Boolean(this.apiKey),
      provider: this.providerName,
      model: this.modelName,
      error: this.apiKey ? null : 'GEMINI_API_KEY is not configured',
    }
  }

  async generateText(prompt) {
    return this._request(prompt, {})
  }

  async generateJson(prompt, schema, options = {}) {
    const text = await this._request(prompt, { jsonMode: true, options })
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

  async _request(prompt, { jsonMode = false, options = {} } = {}) {
    if (!this.apiKey) {
      throw new ProviderUnavailableError('Gemini API key is not configured', { missingApiKey: true })
    }

    const timeoutMs = this.config?.aiTimeoutMs || DEFAULT_TIMEOUT_MS
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: this.config?.aiTemperature,
          ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
          ...(options.numPredict ? { maxOutputTokens: options.numPredict } : {}),
        },
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw await this._buildHttpError(response)
      }

      const payload = await response.json()
      const parts = payload?.candidates?.[0]?.content?.parts
      return Array.isArray(parts) ? parts.map((part) => part.text || '').join('') : ''
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new ProviderTimeoutError('Gemini request timed out', { timeoutMs })
      }
      if (error instanceof ProviderError) throw error
      throw new ProviderUnavailableError('Gemini provider unavailable', { networkError: true, cause: error })
    } finally {
      clearTimeout(timer)
    }
  }

  async _buildHttpError(response) {
    const status = response.status
    const retryAfterHeader = typeof response.headers?.get === 'function' ? response.headers.get('retry-after') : null
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined
    const errorPayload = await response.json().catch(() => null)
    const geminiStatus = errorPayload?.error?.status
    const quotaExceeded = geminiStatus === 'RESOURCE_EXHAUSTED'

    return new ProviderUnavailableError('Gemini provider request failed', {
      status,
      quotaExceeded,
      retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
    })
  }
}
