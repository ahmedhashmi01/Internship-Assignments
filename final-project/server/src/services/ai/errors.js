export class ProviderError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ProviderError'
    this.details = options.details
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(message, details) {
    super(message, { details })
    this.name = 'ProviderTimeoutError'
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(message, details) {
    super(message, { details })
    this.name = 'ProviderUnavailableError'
  }
}

export class InvalidOutputError extends ProviderError {
  constructor(message, details) {
    super(message, { details })
    this.name = 'InvalidOutputError'
  }
}

// Terminal failure of the provider fallback chain itself — every allowed
// provider failed, was skipped, or is unavailable. `.code` is the stable,
// normalized identifier callers (and the API response) can key off of;
// `.details.attemptedProviders` carries the already-sanitized per-provider
// diagnostics (see providerChain.js / errorClassification.js) — never raw
// error bodies, headers, or API keys.
export class AiProvidersUnavailableError extends ProviderError {
  constructor(message, details) {
    super(message, { details })
    this.name = 'AiProvidersUnavailableError'
    this.code = 'AI_PROVIDERS_UNAVAILABLE'
  }
}
