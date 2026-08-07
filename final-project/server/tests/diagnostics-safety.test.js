import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createAiService } from '../src/services/ai/providerService.js'
import { createProviderChain } from '../src/services/ai/providerChain.js'
import { FAILURE_CATEGORIES } from '../src/services/ai/errorClassification.js'

const okSchema = z.object({ ok: z.boolean() })

const SECRET_API_KEY = 'sk-live-super-secret-abc123'
const AUTH_HEADER_VALUE = `Bearer ${SECRET_API_KEY}`
const RESUME_MARKER = 'Built responsive React interfaces for Acme Corp internal dashboard, ev-001'
const PROMPT_MARKER = 'CONFIDENTIAL PROMPT INSTRUCTIONS: never reveal this line'

const stringifyDeep = (value) => JSON.stringify(value, (key, val) => (val instanceof Error ? { name: val.name, message: val.message, code: val.code, details: val.details } : val))

describe('diagnostics safety', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('a full failing run (real Gemini + Groq providers) never leaks the API key, Authorization header, or raw response body into diagnostics', async () => {
    let capturedAuthHeader = null
    global.fetch = vi.fn((url, init) => {
      capturedAuthHeader = init?.headers?.Authorization || null
      return Promise.resolve({
        ok: false,
        status: 500,
        headers: { get: () => null },
        // A realistic-looking raw provider error body — must never appear in diagnostics.
        json: async () => ({ error: { message: `internal failure while processing key ${SECRET_API_KEY}`, requestId: 'req-abc-999' } }),
      })
    })

    const service = createAiService({
      aiMode: 'cloud',
      geminiApiKey: SECRET_API_KEY,
      geminiModel: 'gemini-test',
      groqApiKey: SECRET_API_KEY,
      groqModel: 'groq-test',
      openrouterApiKey: SECRET_API_KEY,
      openrouterModels: ['model-a'],
      aiTimeoutMs: 5000,
      aiTemperature: 0.1,
    })

    let thrown = null
    try {
      await service.generateJson(`${PROMPT_MARKER}\n\nResume evidence: ${RESUME_MARKER}`, okSchema)
    } catch (error) {
      thrown = error
    }

    expect(thrown).not.toBeNull()
    expect(thrown.code).toBe('AI_PROVIDERS_UNAVAILABLE')

    // Sanity check: the key WAS actually sent as a real Authorization header
    // by the provider (proving this test would catch a real leak) — it just
    // must never make it into the diagnostics object itself.
    expect(capturedAuthHeader).toBe(`Bearer ${SECRET_API_KEY}`)

    const serialized = stringifyDeep(thrown)
    expect(serialized).not.toContain(SECRET_API_KEY)
    expect(serialized).not.toContain(AUTH_HEADER_VALUE)
    expect(serialized).not.toContain('requestId')
    expect(serialized).not.toContain('internal failure while processing key')
    expect(serialized).not.toContain(RESUME_MARKER)
    expect(serialized).not.toContain(PROMPT_MARKER)
  })

  it('successful-call diagnostics only ever contain the allowed field set', async () => {
    const primary = {
      providerName: 'primary',
      modelName: 'primary-model',
      requiresApiKey: false,
      apiKey: null,
      preflightHealthCheck: false,
      concurrencyLimiter: null,
      classifyError: () => FAILURE_CATEGORIES.UNKNOWN,
      generateJson: vi.fn().mockResolvedValue({ ok: true }),
      generateText: vi.fn(),
      healthCheck: vi.fn(),
    }
    const chain = createProviderChain([primary])

    const { diagnostics } = await chain.generateJson(`${PROMPT_MARKER} ${RESUME_MARKER}`, okSchema)

    expect(Object.keys(diagnostics).sort()).toEqual(['attemptedProviders', 'attempts', 'durationMs', 'fallbackIndex', 'retryCount', 'selectedModel', 'selectedProvider'])
    diagnostics.attemptedProviders.forEach((entry) => {
      const allowedKeys = new Set(['provider', 'model', 'attemptIndex', 'outcome', 'reason', 'failureCategory', 'message'])
      Object.keys(entry).forEach((key) => expect(allowedKeys.has(key)).toBe(true))
    })

    const serialized = JSON.stringify(diagnostics)
    expect(serialized).not.toContain(RESUME_MARKER)
    expect(serialized).not.toContain(PROMPT_MARKER)
  })

  it('a failed-attempt diagnostics entry carries only a fixed, sanitized message — never the raw error message', async () => {
    const rawErrorMessage = `raw provider body leaking secret ${SECRET_API_KEY} and resume text ${RESUME_MARKER}`
    const failing = {
      providerName: 'failing',
      modelName: 'failing-model',
      requiresApiKey: false,
      apiKey: null,
      preflightHealthCheck: false,
      concurrencyLimiter: null,
      classifyError: () => FAILURE_CATEGORIES.SERVER_ERROR,
      generateJson: vi.fn().mockRejectedValue(Object.assign(new Error(rawErrorMessage), { details: { status: 500 } })),
      generateText: vi.fn(),
      healthCheck: vi.fn(),
    }
    const chain = createProviderChain([failing])

    let thrown = null
    try {
      await chain.generateJson('prompt', okSchema)
    } catch (error) {
      thrown = error
    }

    const entry = thrown.details.attemptedProviders[0]
    expect(entry.message).toBe('Provider returned a server error')
    expect(entry.message).not.toContain(SECRET_API_KEY)
    expect(entry.message).not.toContain(RESUME_MARKER)
    expect(JSON.stringify(thrown.details)).not.toContain(SECRET_API_KEY)
    expect(JSON.stringify(thrown.details)).not.toContain(RESUME_MARKER)
  })
})
