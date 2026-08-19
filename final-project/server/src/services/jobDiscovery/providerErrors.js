// Normalized, sanitized job-provider failure — never carries API keys, raw
// response bodies, or headers. `category` is one of: timeout | unauthorized |
// rate_limited | server_error | malformed_response | network_error.
export class ProviderSearchError extends Error {
  constructor(category, message, details = {}) {
    super(message)
    this.name = 'ProviderSearchError'
    this.category = category
    this.details = details
  }
}
