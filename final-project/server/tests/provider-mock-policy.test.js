import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createAiService } from '../src/services/ai/providerService.js'
import { resolveProviderChainNames, DEFAULT_PROVIDER_CHAIN } from '../src/services/ai/providerModes.js'

const okSchema = z.object({ ok: z.boolean() })

const failingJsonResponse = (status) => ({
  ok: false,
  status,
  headers: { get: () => null },
  json: async () => ({ error: { message: 'boom' } }),
})

describe('mock fallback policy', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  const cloudConfig = {
    geminiApiKey: 'gemini-key',
    geminiModel: 'gemini-test',
    groqApiKey: 'groq-key',
    groqModel: 'groq-test',
    openrouterApiKey: 'openrouter-key',
    openrouterModels: ['model-a'],
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2:1b',
    aiTimeoutMs: 5000,
    aiTemperature: 0.1,
  }

  it('automatic mode never reaches mock — DEFAULT_PROVIDER_CHAIN excludes it entirely', () => {
    expect(DEFAULT_PROVIDER_CHAIN).not.toContain('mock')
    expect(resolveProviderChainNames({})).toEqual(DEFAULT_PROVIDER_CHAIN)
  })

  it('automatic mode drops mock even if AI_PROVIDER_CHAIN is misconfigured to include it', () => {
    const resolved = resolveProviderChainNames({ aiMode: 'automatic', aiProviderChain: 'groq,mock,ollama' })
    expect(resolved).not.toContain('mock')
    expect(resolved).toEqual(['groq', 'ollama'])
  })

  it('cloud mode never reaches Ollama or mock, even if configured', () => {
    const resolved = resolveProviderChainNames({ aiMode: 'cloud', aiProviderChain: 'gemini,ollama,mock' })
    expect(resolved).not.toContain('ollama')
    expect(resolved).not.toContain('mock')
    expect(resolved).toEqual(['gemini', 'groq', 'openrouter'])
  })

  it('demo mode uses mock, and only mock', async () => {
    const service = createAiService({ aiMode: 'demo' })
    const result = await service.generateJson('prompt', okSchema)
    expect(result).toEqual({ ok: true })
  })

  it('automatic mode: when every real provider fails, throws a normalized AI_PROVIDERS_UNAVAILABLE error instead of silently returning mock data', async () => {
    global.fetch = vi.fn((url) => {
      // Ollama health check fails too — nothing in the chain is usable.
      if (String(url).includes('/api/tags')) return Promise.resolve({ ok: false, json: async () => ({}) })
      return Promise.resolve(failingJsonResponse(500))
    })

    const service = createAiService({ aiMode: 'automatic', ...cloudConfig })

    await expect(service.generateJson('prompt', okSchema)).rejects.toMatchObject({
      name: 'AiProvidersUnavailableError',
      code: 'AI_PROVIDERS_UNAVAILABLE',
    })
  })

  it('cloud mode: when every cloud provider fails, throws AI_PROVIDERS_UNAVAILABLE without ever touching Ollama or mock', async () => {
    let ollamaTouched = false
    global.fetch = vi.fn((url) => {
      if (String(url).includes('11434')) ollamaTouched = true
      return Promise.resolve(failingJsonResponse(503))
    })

    const service = createAiService({ aiMode: 'cloud', ...cloudConfig })

    await expect(service.generateJson('prompt', okSchema)).rejects.toMatchObject({ code: 'AI_PROVIDERS_UNAVAILABLE' })
    expect(ollamaTouched).toBe(false)
  })

  it('private mode never touches cloud providers even when their keys are configured', async () => {
    let cloudTouched = false
    global.fetch = vi.fn((url) => {
      const target = String(url)
      if (target.includes('googleapis.com') || target.includes('groq.com') || target.includes('openrouter.ai')) {
        cloudTouched = true
      }
      if (target.includes('/api/tags')) return Promise.resolve({ ok: false, json: async () => ({}) })
      return Promise.resolve(failingJsonResponse(500))
    })

    const service = createAiService({ aiMode: 'private', ...cloudConfig })

    await expect(service.generateJson('prompt', okSchema)).rejects.toMatchObject({ code: 'AI_PROVIDERS_UNAVAILABLE' })
    expect(cloudTouched).toBe(false)
  })
})
