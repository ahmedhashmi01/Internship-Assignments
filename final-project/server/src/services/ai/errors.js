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
