import { describe, expect, it, vi } from 'vitest'
import { createProviderChain } from '../src/services/ai/providerChain.js'
import { createCooldownRegistry } from '../src/services/ai/cooldownRegistry.js'
import { FAILURE_CATEGORIES } from '../src/services/ai/errorClassification.js'

const makeError = (category, details = {}) => Object.assign(new Error(`simulated ${category}`), { category, details })

const makeFakeProvider = (overrides = {}) => ({
  providerName: 'fake',
  modelName: 'fake-model',
  requiresApiKey: false,
  apiKey: null,
  preflightHealthCheck: false,
  concurrencyLimiter: null,
  classifyError: (error) => error.category || FAILURE_CATEGORIES.UNKNOWN,
  generateJson: vi.fn(),
  generateText: vi.fn(),
  healthCheck: vi.fn(async () => ({ ok: true, provider: overrides.providerName || 'fake', model: overrides.modelName || 'fake-model' })),
  ...overrides,
})

const schema = { parse: (value) => value } // chain never calls schema itself, providers do — a stub is enough

describe('createProviderChain', () => {
  it('1. uses the primary provider on success with no fallback', async () => {
    const primary = makeFakeProvider({ providerName: 'primary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { value, diagnostics } = await chain.generateJson('prompt', schema)

    expect(value).toEqual({ ok: true })
    expect(diagnostics.selectedProvider).toBe('primary')
    expect(diagnostics.fallbackIndex).toBe(0)
    expect(diagnostics.attemptedProviders).toEqual([{ provider: 'primary', model: 'fake-model', attemptIndex: 0, outcome: 'succeeded' }])
    expect(secondary.generateJson).not.toHaveBeenCalled()
  })

  it('2. falls back to the next provider on HTTP 429 (rate-limited)', async () => {
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.RATE_LIMITED, { status: 429 })),
    })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(diagnostics.selectedProvider).toBe('secondary')
    expect(diagnostics.fallbackIndex).toBe(1)
    expect(diagnostics.attemptedProviders[0]).toMatchObject({ provider: 'primary', outcome: 'failed', failureCategory: 'rate-limited' })
  })

  it('3. falls back to the next provider on quota exhaustion', async () => {
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.QUOTA_EXHAUSTED)),
    })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(diagnostics.selectedProvider).toBe('secondary')
    expect(diagnostics.attemptedProviders[0].failureCategory).toBe('quota-exhausted')
  })

  it('4. falls back to the next provider on timeout', async () => {
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.TIMEOUT)),
    })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(diagnostics.selectedProvider).toBe('secondary')
    expect(diagnostics.attemptedProviders[0].failureCategory).toBe('timeout')
  })

  it('5a. falls back after schema-invalid failure survives the configured corrective retry', async () => {
    const schemaError = makeError(FAILURE_CATEGORIES.SCHEMA_INVALID)
    const primary = makeFakeProvider({
      providerName: 'primary',
      // Both the initial attempt AND the corrective retry fail identically.
      generateJson: vi.fn().mockRejectedValue(schemaError),
    })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { diagnostics } = await chain.generateJsonWithRetry('prompt', schema)

    // Attempt + corrective retry, both against `primary`, before falling back.
    expect(primary.generateJson).toHaveBeenCalledTimes(2)
    expect(diagnostics.selectedProvider).toBe('secondary')
    expect(diagnostics.attemptedProviders[0].failureCategory).toBe('schema-invalid')
  })

  it('5b. the corrective retry recovers on the SAME provider without falling back', async () => {
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn()
        .mockRejectedValueOnce(makeError(FAILURE_CATEGORIES.SCHEMA_INVALID))
        .mockResolvedValueOnce({ ok: true }),
    })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn() })
    const chain = createProviderChain([primary, secondary])

    const { diagnostics } = await chain.generateJsonWithRetry('prompt', schema)

    expect(diagnostics.selectedProvider).toBe('primary')
    expect(diagnostics.fallbackIndex).toBe(0)
    expect(secondary.generateJson).not.toHaveBeenCalled()
  })

  it('5c. invalid-json also falls back via the single-shot generateJson path (no corrective retry)', async () => {
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.INVALID_JSON)),
    })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { diagnostics } = await chain.generateJson('prompt', schema)

    // generateJson (no retry) — exactly one attempt against the failing provider.
    expect(primary.generateJson).toHaveBeenCalledTimes(1)
    expect(diagnostics.selectedProvider).toBe('secondary')
  })

  it('6. skips a provider whose API key is missing, without ever calling it', async () => {
    const keyless = makeFakeProvider({ providerName: 'keyless', requiresApiKey: true, apiKey: '', generateJson: vi.fn() })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([keyless, secondary])

    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(keyless.generateJson).not.toHaveBeenCalled()
    expect(diagnostics.attemptedProviders[0]).toEqual({
      provider: 'keyless',
      model: 'fake-model',
      attemptIndex: 0,
      outcome: 'skipped',
      reason: 'missing-api-key',
      message: 'Provider API key is not configured',
    })
    expect(diagnostics.selectedProvider).toBe('secondary')
  })

  it('7. respects cooldown — a provider that recently failed with a rate-limit is skipped on the next call', async () => {
    let now = 1_000_000
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.RATE_LIMITED, { status: 429 })),
    })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary], { now: () => now, cooldownMs: 300_000 })

    await chain.generateJson('prompt', schema) // primary fails, cooldown starts
    expect(primary.generateJson).toHaveBeenCalledTimes(1)

    now += 1000 // well within the 300s cooldown window
    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(primary.generateJson).toHaveBeenCalledTimes(1) // not called again
    expect(diagnostics.attemptedProviders[0]).toMatchObject({ provider: 'primary', outcome: 'skipped', reason: 'cooldown' })
    expect(diagnostics.selectedProvider).toBe('secondary')
  })

  it('7b. a provider becomes available again once its cooldown expires', async () => {
    let now = 1_000_000
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn()
        .mockRejectedValueOnce(makeError(FAILURE_CATEGORIES.RATE_LIMITED, { status: 429 }))
        .mockResolvedValueOnce({ ok: true }),
    })
    const chain = createProviderChain([primary], { now: () => now, cooldownMs: 5000 })

    await expect(chain.generateJson('prompt', schema)).rejects.toThrow()

    now += 5001 // cooldown has just expired
    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(diagnostics.selectedProvider).toBe('primary')
    expect(primary.generateJson).toHaveBeenCalledTimes(2)
  })

  it('8. respects a provider-supplied Retry-After instead of the default cooldown', async () => {
    let now = 1_000_000
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn()
        .mockRejectedValueOnce(makeError(FAILURE_CATEGORIES.RATE_LIMITED, { status: 429, retryAfterMs: 10_000 }))
        .mockResolvedValueOnce({ ok: true }),
    })
    const chain = createProviderChain([primary], { now: () => now, cooldownMs: 300_000 })

    await expect(chain.generateJson('prompt', schema)).rejects.toThrow()

    now += 10_001 // past the custom Retry-After, but nowhere near the 300s default
    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(diagnostics.selectedProvider).toBe('primary')
  })

  it('10. mock (or any final entry) is used when every earlier provider fails or is skipped', async () => {
    const keyless = makeFakeProvider({ providerName: 'gemini', requiresApiKey: true, apiKey: '' })
    const rateLimited = makeFakeProvider({ providerName: 'groq', generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.RATE_LIMITED)) })
    const unhealthyOllama = makeFakeProvider({ providerName: 'ollama', preflightHealthCheck: true, healthCheck: vi.fn().mockResolvedValue({ ok: false }) })
    const mock = makeFakeProvider({ providerName: 'mock', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([keyless, rateLimited, unhealthyOllama, mock])

    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(diagnostics.selectedProvider).toBe('mock')
    expect(diagnostics.fallbackIndex).toBe(3)
    expect(diagnostics.attemptedProviders.map((a) => a.provider)).toEqual(['gemini', 'groq', 'ollama', 'mock'])
    expect(diagnostics.attemptedProviders[2]).toMatchObject({ provider: 'ollama', outcome: 'skipped', reason: 'health-check-failed' })
  })

  it('11. never falls back when the primary provider returns a legitimate (schema-valid) result, however sparse', async () => {
    const emptyButValidResult = { items: [] } // a real "no matches found" result, not an error
    const primary = makeFakeProvider({ providerName: 'primary', generateJson: vi.fn().mockResolvedValue(emptyButValidResult) })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn() })
    const chain = createProviderChain([primary, secondary])

    const { value, diagnostics } = await chain.generateJson('prompt', schema)

    expect(value).toBe(emptyButValidResult)
    expect(diagnostics.attemptedProviders).toHaveLength(1)
    expect(secondary.generateJson).not.toHaveBeenCalled()
  })

  it('12. diagnostics never contain the provider API key', async () => {
    const secretKey = 'sk-super-secret-value-12345'
    const primary = makeFakeProvider({
      providerName: 'gemini',
      requiresApiKey: true,
      apiKey: secretKey,
      generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.SERVER_ERROR, { status: 503 })),
    })
    const secondary = makeFakeProvider({ providerName: 'mock', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(JSON.stringify(diagnostics)).not.toContain(secretKey)
  })

  it('aborts the whole chain immediately on an unknown (non-whitelisted) failure category, without trying later providers', async () => {
    const primary = makeFakeProvider({ providerName: 'primary', generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.UNKNOWN)) })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn() })
    const chain = createProviderChain([primary, secondary])

    await expect(chain.generateJson('prompt', schema)).rejects.toThrow('simulated unknown')
    expect(secondary.generateJson).not.toHaveBeenCalled()
  })

  it('throws a normalized AiProvidersUnavailableError (code AI_PROVIDERS_UNAVAILABLE) carrying attempted providers when every provider fails', async () => {
    const primary = makeFakeProvider({ providerName: 'primary', generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.TIMEOUT)) })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.NETWORK_ERROR)) })
    const chain = createProviderChain([primary, secondary])

    await expect(chain.generateJson('prompt', schema)).rejects.toMatchObject({
      name: 'AiProvidersUnavailableError',
      code: 'AI_PROVIDERS_UNAVAILABLE',
    })

    try {
      await chain.generateJson('prompt', schema)
      throw new Error('expected chain.generateJson to throw')
    } catch (error) {
      expect(error.details.attemptedProviders).toHaveLength(2)
      expect(error.details.attemptedProviders.every((entry) => entry.failureCategory && entry.message)).toBe(true)
    }
  })

  it('healthCheck() reflects the first eligible provider without spending a real generation call', async () => {
    const keyless = makeFakeProvider({ providerName: 'gemini', requiresApiKey: true, apiKey: '' })
    const secondary = makeFakeProvider({ providerName: 'groq', healthCheck: vi.fn().mockResolvedValue({ ok: true, provider: 'groq', model: 'fake-model' }) })
    const chain = createProviderChain([keyless, secondary])

    const health = await chain.healthCheck()

    expect(health).toEqual({ ok: true, provider: 'groq', model: 'fake-model' })
    expect(secondary.generateJson).not.toHaveBeenCalled()
  })

  it('generateText() routes through the same skip/fallback logic', async () => {
    const primary = makeFakeProvider({ providerName: 'primary', generateText: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.NETWORK_ERROR)) })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateText: vi.fn().mockResolvedValue('hello') })
    const chain = createProviderChain([primary, secondary])

    const { value, diagnostics } = await chain.generateText('prompt')

    expect(value).toBe('hello')
    expect(diagnostics.selectedProvider).toBe('secondary')
  })

  it('uses an externally supplied cooldownRegistry when given one, instead of creating its own', async () => {
    const registry = createCooldownRegistry()
    const primary = makeFakeProvider({ providerName: 'primary', generateJson: vi.fn().mockRejectedValue(makeError(FAILURE_CATEGORIES.RATE_LIMITED)) })
    const chain = createProviderChain([primary], { cooldownRegistry: registry, now: () => 5000 })

    await expect(chain.generateJson('prompt', schema)).rejects.toThrow()

    expect(registry.isCoolingDown('primary', 5000)).toBe(true)
  })
})
