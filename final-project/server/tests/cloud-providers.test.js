import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { GeminiProvider } from '../src/services/ai/geminiProvider.js'
import { GroqProvider } from '../src/services/ai/groqProvider.js'
import { OpenRouterProvider } from '../src/services/ai/openRouterProvider.js'
import { FAILURE_CATEGORIES } from '../src/services/ai/errorClassification.js'

const okSchema = z.object({ ok: z.boolean() })

const jsonResponse = (body, { ok = true, status = 200, headers = {} } = {}) => ({
  ok,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => body,
})

describe('GeminiProvider', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  const baseConfig = { geminiApiKey: 'gemini-secret-key', geminiModel: 'gemini-test', aiTimeoutMs: 5000, aiTemperature: 0.1 }

  it('is skippable when no API key is configured', () => {
    const provider = new GeminiProvider({})
    expect(provider.requiresApiKey).toBe(true)
    expect(provider.apiKey).toBe('')
  })

  it('healthCheck reflects API key presence WITHOUT making a network call', async () => {
    global.fetch = vi.fn()
    const configured = new GeminiProvider(baseConfig)
    const unconfigured = new GeminiProvider({})

    expect(await configured.healthCheck()).toMatchObject({ ok: true, provider: 'gemini' })
    expect(await unconfigured.healthCheck()).toMatchObject({ ok: false })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('requests structured JSON output via responseMimeType', async () => {
    let sentBody = null
    global.fetch = vi.fn((url, init) => {
      sentBody = JSON.parse(init.body)
      return Promise.resolve(jsonResponse({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }))
    })

    const provider = new GeminiProvider(baseConfig)
    const result = await provider.generateJson('prompt', okSchema)

    expect(result).toEqual({ ok: true })
    expect(sentBody.generationConfig.responseMimeType).toBe('application/json')
  })

  it('never puts the API key in the request body (only the URL, per Gemini API convention)', async () => {
    let sentBody = null
    let requestedUrl = null
    global.fetch = vi.fn((url, init) => {
      requestedUrl = url
      sentBody = JSON.parse(init.body)
      return Promise.resolve(jsonResponse({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }))
    })

    const provider = new GeminiProvider(baseConfig)
    await provider.generateJson('prompt', okSchema)

    expect(JSON.stringify(sentBody)).not.toContain('gemini-secret-key')
    expect(requestedUrl).toContain('gemini-secret-key') // the key belongs in the URL param, not the body
  })

  it('classifies a 429 as rate-limited', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ error: { status: 'RATE_LIMITED' } }, { ok: false, status: 429 })))
    const provider = new GeminiProvider(baseConfig)

    try {
      await provider.generateJson('prompt', okSchema)
      throw new Error('expected generateJson to throw')
    } catch (error) {
      expect(provider.classifyError(error)).toBe(FAILURE_CATEGORIES.RATE_LIMITED)
    }
  })

  it('classifies a RESOURCE_EXHAUSTED body as quota-exhausted', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ error: { status: 'RESOURCE_EXHAUSTED' } }, { ok: false, status: 429 })))
    const provider = new GeminiProvider(baseConfig)

    try {
      await provider.generateJson('prompt', okSchema)
      throw new Error('expected generateJson to throw')
    } catch (error) {
      expect(provider.classifyError(error)).toBe(FAILURE_CATEGORIES.QUOTA_EXHAUSTED)
    }
  })

  it('honors a Retry-After header', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ error: { status: 'RATE_LIMITED' } }, { ok: false, status: 429, headers: { 'retry-after': '45' } })))
    const provider = new GeminiProvider(baseConfig)

    try {
      await provider.generateJson('prompt', okSchema)
      throw new Error('expected generateJson to throw')
    } catch (error) {
      expect(error.details.retryAfterMs).toBe(45_000)
    }
  })

  it('classifies a 500 as server-error', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({}, { ok: false, status: 500 })))
    const provider = new GeminiProvider(baseConfig)

    try {
      await provider.generateJson('prompt', okSchema)
      throw new Error('expected generateJson to throw')
    } catch (error) {
      expect(provider.classifyError(error)).toBe(FAILURE_CATEGORIES.SERVER_ERROR)
    }
  })

  it('classifies a schema-shape failure as schema-invalid', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ candidates: [{ content: { parts: [{ text: '{"nope":true}' }] } }] })))
    const provider = new GeminiProvider(baseConfig)

    try {
      await provider.generateJson('prompt', okSchema)
      throw new Error('expected generateJson to throw')
    } catch (error) {
      expect(provider.classifyError(error)).toBe(FAILURE_CATEGORIES.SCHEMA_INVALID)
    }
  })
})

describe('GroqProvider', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  const baseConfig = { groqApiKey: 'groq-secret-key', groqModel: 'groq-test', aiTimeoutMs: 5000, aiTemperature: 0.1 }

  it('healthCheck reflects API key presence WITHOUT making a network call', async () => {
    global.fetch = vi.fn()
    expect(await new GroqProvider(baseConfig).healthCheck()).toMatchObject({ ok: true, provider: 'groq' })
    expect(await new GroqProvider({}).healthCheck()).toMatchObject({ ok: false })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('sends the API key as a Bearer header, never in the body', async () => {
    let sentBody = null
    let sentHeaders = null
    global.fetch = vi.fn((url, init) => {
      sentBody = JSON.parse(init.body)
      sentHeaders = init.headers
      return Promise.resolve(jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }))
    })

    const provider = new GroqProvider(baseConfig)
    await provider.generateJson('prompt', okSchema)

    expect(sentHeaders.Authorization).toBe('Bearer groq-secret-key')
    expect(JSON.stringify(sentBody)).not.toContain('groq-secret-key')
    expect(sentBody.response_format).toEqual({ type: 'json_object' })
  })

  it('classifies a 429 with a quota message as quota-exhausted, and a plain 429 as rate-limited', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ error: { message: 'monthly quota exceeded' } }, { ok: false, status: 429 })))
    const quotaProvider = new GroqProvider(baseConfig)
    await expect(quotaProvider.generateJson('prompt', okSchema)).rejects.toSatisfy((error) => quotaProvider.classifyError(error) === FAILURE_CATEGORIES.QUOTA_EXHAUSTED)

    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({ error: { message: 'too many requests' } }, { ok: false, status: 429 })))
    const rateProvider = new GroqProvider(baseConfig)
    await expect(rateProvider.generateJson('prompt', okSchema)).rejects.toSatisfy((error) => rateProvider.classifyError(error) === FAILURE_CATEGORIES.RATE_LIMITED)
  })

  it('classifies a network failure (fetch throws) as network-error', async () => {
    global.fetch = vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    const provider = new GroqProvider(baseConfig)

    try {
      await provider.generateJson('prompt', okSchema)
      throw new Error('expected generateJson to throw')
    } catch (error) {
      expect(provider.classifyError(error)).toBe(FAILURE_CATEGORIES.NETWORK_ERROR)
    }
  })

  it('classifies an aborted (timed-out) request as timeout', async () => {
    global.fetch = vi.fn(() => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      return Promise.reject(error)
    })
    const provider = new GroqProvider({ ...baseConfig, aiTimeoutMs: 1 })

    try {
      await provider.generateJson('prompt', okSchema)
      throw new Error('expected generateJson to throw')
    } catch (error) {
      expect(provider.classifyError(error)).toBe(FAILURE_CATEGORIES.TIMEOUT)
    }
  })
})

describe('OpenRouterProvider', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  const baseConfig = {
    openrouterApiKey: 'openrouter-secret-key',
    openrouterModels: ['model-a:free', 'model-b:free'],
    aiTimeoutMs: 5000,
    aiTemperature: 0.1,
  }

  it('healthCheck reflects API key presence WITHOUT making a network call', async () => {
    global.fetch = vi.fn()
    expect(await new OpenRouterProvider(baseConfig).healthCheck()).toMatchObject({ ok: true, provider: 'openrouter' })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('tries the configured model list in order, falling back within the provider on a retryable failure', async () => {
    const requestedModels = []
    global.fetch = vi.fn((url, init) => {
      const body = JSON.parse(init.body)
      requestedModels.push(body.model)
      if (body.model === 'model-a:free') {
        return Promise.resolve(jsonResponse({}, { ok: false, status: 503 }))
      }
      return Promise.resolve(jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }))
    })

    const provider = new OpenRouterProvider(baseConfig)
    const result = await provider.generateJson('prompt', okSchema)

    expect(result).toEqual({ ok: true })
    expect(requestedModels).toEqual(['model-a:free', 'model-b:free'])
    expect(provider.modelName).toBe('model-b:free') // reflects whichever model actually won
  })

  it('surfaces the final error once every configured model has failed', async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse({}, { ok: false, status: 503 })))
    const provider = new OpenRouterProvider(baseConfig)

    await expect(provider.generateJson('prompt', okSchema)).rejects.toThrow()
    expect(global.fetch).toHaveBeenCalledTimes(2) // one attempt per configured model
  })

  it('never leaks the API key into the request body', async () => {
    let sentBody = null
    global.fetch = vi.fn((url, init) => {
      sentBody = JSON.parse(init.body)
      return Promise.resolve(jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }))
    })

    await new OpenRouterProvider(baseConfig).generateJson('prompt', okSchema)

    expect(JSON.stringify(sentBody)).not.toContain('openrouter-secret-key')
  })
})
