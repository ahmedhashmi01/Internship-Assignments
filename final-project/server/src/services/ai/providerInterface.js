import { classifyProviderError } from './errorClassification.js'

export class BaseProvider {
  constructor(config) {
    this.config = config
    // Providers that call a hosted API key must set requiresApiKey = true
    // and expose the key as `this.apiKey` — the chain skips them up front
    // when the key is missing, rather than attempting and failing.
    this.requiresApiKey = false
    this.apiKey = null
    // Set true only for providers whose availability must be verified with a
    // real health check before every attempt (currently: Ollama).
    this.preflightHealthCheck = false
    // Optional createConcurrencyLimiter() instance. When set, the chain runs
    // this provider's ENTIRE per-attempt unit of work (including its
    // corrective retry, if any) through it as one atomic slot acquisition —
    // a retry continues existing work, it does not queue for a second slot.
    this.concurrencyLimiter = null
  }

  get providerName() {
    return 'base'
  }

  get modelName() {
    return this.config?.modelName || 'unknown'
  }

  async generateText(_prompt) {
    throw new Error('Not implemented')
  }

  async generateJson(_prompt, _schema) {
    throw new Error('Not implemented')
  }

  async healthCheck() {
    return { ok: true, provider: this.providerName, model: this.modelName }
  }

  // Normalizes a thrown error into one of the shared failure categories
  // (see errorClassification.js) so the fallback chain can decide whether to
  // move on to the next provider. Data-driven off `error.details`, so
  // subclasses rarely need to override this — they just need to populate
  // `.details` (status, retryAfterMs, quotaExceeded, networkError) richly
  // when they throw.
  classifyError(error) {
    return classifyProviderError(error)
  }
}
