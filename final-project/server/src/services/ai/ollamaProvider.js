import { BaseProvider } from './providerInterface.js'
import { ProviderTimeoutError, ProviderUnavailableError, InvalidOutputError, ProviderError } from './errors.js'
import { normalizeNullableOptionals } from './normalizeNullableOptionals.js'
import { repairSkillMatchConfidence } from './repairSkillMatchConfidence.js'
import { skillMatchBatchOutputSchema } from '../../schemas/workerSchemas.js'
import { timingLog } from '../../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

export class OllamaProvider extends BaseProvider {
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
        return validated
      } catch (error) {
        timingLog('ollama Zod validation', { durationMs: Date.now() - validateStartedAt, result: 'FAIL', error: error.message })
        throw new InvalidOutputError('Schema validation failed for provider output', { cause: error })
      }
    }

    return parsed
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`)
      if (!response.ok) {
        return { ok: false, provider: 'ollama', model: this.config.ollamaModel, error: 'Ollama tags endpoint unavailable' }
      }

      const payload = await response.json()
      const availableModels = Array.isArray(payload.models) ? payload.models.map((item) => item.name || item.model || item) : []

      // Accept exact match OR match after stripping the tag suffix (e.g. "llama3.2:latest" matches configured "llama3.2:3b" base name)
      const configuredBase = this.config.ollamaModel.split(':')[0]
      const modelAvailable = availableModels.some(
        (name) => name === this.config.ollamaModel || name.split(':')[0] === configuredBase,
      )

      return {
        ok: modelAvailable,
        provider: 'ollama',
        model: this.config.ollamaModel,
        availableModels,
        error: modelAvailable ? null : `Configured model '${this.config.ollamaModel}' not found. Available: ${availableModels.join(', ') || 'none'}`,
      }
    } catch (error) {
      return { ok: false, provider: 'ollama', model: this.config.ollamaModel, error: error.message || 'Ollama health check failed' }
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
      throw new ProviderUnavailableError('Ollama provider unavailable', { cause: error })
    } finally {
      clearTimeout(timer)
    }
  }

  _parseJson(text) {
    // Step 1: strip fenced code blocks (```json ... ```)
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    let candidate = fenced ? fenced[1] : text

    // Step 2: strip common Ollama preamble text before the first { or [
    const preambleStripped = candidate.replace(/^[^{[\r\n]*/u, '').trim()
    if (preambleStripped) candidate = preambleStripped

    // Step 3: remove trailing commas before } or ] (common Ollama output quirk)
    const sanitized = candidate
      .trim()
      .replace(/,\s*([}\]])/gu, '$1')

    try {
      return JSON.parse(sanitized)
    } catch {
      // Step 4: extract first {...} or [...] block as fallback
      const match = sanitized.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
      if (match) {
        try {
          return JSON.parse(match[0].replace(/,\s*([}\]])/gu, '$1'))
        } catch {
          // fall through
        }
      }
      throw new InvalidOutputError('Invalid JSON returned by provider', { text: sanitized.slice(0, 120) })
    }
  }
}
