import { BaseProvider } from './providerInterface.js'
import { ProviderTimeoutError, ProviderUnavailableError, InvalidOutputError, ProviderError } from './errors.js'
import { normalizeNullableOptionals } from './normalizeNullableOptionals.js'
import { repairSkillMatchConfidence, carryConfidenceRepairInfo } from './repairSkillMatchConfidence.js'
import { extractJsonFromText } from './jsonExtraction.js'
import { skillMatchBatchOutputSchema } from '../../schemas/workerSchemas.js'
import { timingLog } from '../../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

export class OllamaProvider extends BaseProvider {
  constructor(config) {
    super(config)
    // Local, no API key — but must be reachable and serving the configured
    // model, which is exactly what the chain's preflight health check verifies.
    this.requiresApiKey = false
    this.preflightHealthCheck = true
  }

  get providerName() {
    return 'ollama'
  }

  get modelName() {
    return this.config.ollamaModel
  }

  async generateText(prompt) {
    const response = await this._request(prompt)
    return response
  }

  async generateJson(prompt, schema, options = {}) {
    timingLog('ollama generateJson', { promptLength: prompt.length })

    const requestStartedAt = Date.now()
    const text = await this._request(prompt, { format: 'json', numPredict: options.numPredict })
    timingLog('ollama HTTP request', { durationMs: Date.now() - requestStartedAt, responseLength: text.length })

    const parseStartedAt = Date.now()
    const parsed = this._parseJson(text)
    timingLog('ollama JSON parse', { durationMs: Date.now() - parseStartedAt })

    if (schema && typeof schema.parse === 'function') {
      const normalized = normalizeNullableOptionals(parsed, schema)
      // skillMatch-only: fill in a missing (not merely invalid) confidence
      // deterministically so the batch doesn't fail validation — and retry —
      // for a single non-critical scalar. See repairSkillMatchConfidence.js.
      const repaired = schema === skillMatchBatchOutputSchema
        ? repairSkillMatchConfidence(normalized)
        : normalized
      const validateStartedAt = Date.now()
      try {
        const validated = schema.parse(repaired)
        timingLog('ollama Zod validation', { durationMs: Date.now() - validateStartedAt, result: 'pass' })
        return carryConfidenceRepairInfo(repaired, validated)
      } catch (error) {
        timingLog('ollama Zod validation', { durationMs: Date.now() - validateStartedAt, result: 'FAIL', error: error.message })
        throw new InvalidOutputError('Schema validation failed for provider output', { reason: 'schema-invalid', cause: error })
      }
    }

    return parsed
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`)
      if (!response.ok) {
        return { ok: false, provider: this.providerName, model: this.modelName, error: 'Ollama tags endpoint unavailable' }
      }

      const payload = await response.json()
      const availableModels = Array.isArray(payload.models) ? payload.models.map((item) => item.name || item.model || item) : []

      // Accept exact match OR match after stripping the tag suffix (e.g. "llama3.2:latest" matches configured "llama3.2:3b" base name)
      const configuredBase = this.modelName.split(':')[0]
      const modelAvailable = availableModels.some(
        (name) => name === this.modelName || name.split(':')[0] === configuredBase,
      )

      return {
        ok: modelAvailable,
        provider: this.providerName,
        model: this.modelName,
        availableModels,
        error: modelAvailable ? null : `Configured model '${this.modelName}' not found. Available: ${availableModels.join(', ') || 'none'}`,
      }
    } catch (error) {
      return { ok: false, provider: this.providerName, model: this.modelName, error: error.message || 'Ollama health check failed' }
    }
  }

  async _request(prompt, options = {}) {
    const timeoutMs = this.config.aiTimeoutMs || 10000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const bodyPayload = {
        model: this.config.ollamaModel,
        prompt,
        stream: false,
        options: {
          temperature: this.config.aiTemperature,
          num_predict: options.numPredict ?? this.config.ollamaNumPredict ?? 600,
        },
      }

      if (options.format) {
        bodyPayload.format = options.format
      }

      const response = await fetch(`${this.config.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })

      if (!response.ok) {
        throw new ProviderUnavailableError('Ollama provider unavailable', { status: response.status })
      }

      const payload = await response.json()
      return (payload && typeof payload.response === 'string' ? payload.response : '') || ''
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new ProviderTimeoutError('Ollama request timed out', { timeoutMs })
      }
      if (error instanceof ProviderError) {
        throw error
      }
      throw new ProviderUnavailableError('Ollama provider unavailable', { networkError: true, cause: error })
    } finally {
      clearTimeout(timer)
    }
  }

  _parseJson(text) {
    return extractJsonFromText(text)
  }
}
