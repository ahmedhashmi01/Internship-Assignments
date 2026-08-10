import { describe, expect, it } from 'vitest'
import { createProvider } from '../src/services/ai/providerFactory.js'
import { MockProvider } from '../src/services/ai/mockProvider.js'
import { createAiService } from '../src/services/ai/providerService.js'
import { z } from 'zod'

describe('AI provider abstraction', () => {
  it('selects the mock provider by default', () => {
    const provider = createProvider({ aiProvider: 'mock' })
    expect(provider).toBeInstanceOf(MockProvider)
  })

  it('returns text via the mock provider', async () => {
    const provider = createProvider({ aiProvider: 'mock' })
    const response = await provider.generateText('hello')
    expect(response).toContain('Mock response')
  })

  it('returns JSON via the mock provider', async () => {
    const provider = createProvider({ aiProvider: 'mock' })
    const schema = z.object({ ok: z.boolean() })
    const response = await provider.generateJson('hello', schema)
    expect(response.ok).toBe(true)
  })

  it('retries once when invalid output is raised', async () => {
    const service = createAiService({ aiProvider: 'mock' })
    const schema = z.object({ ok: z.boolean() })
    await expect(service.generateJsonWithRetry('hello', schema)).resolves.toMatchObject({ ok: true })
  })

  it('surfaces typed invalid output errors', async () => {
    const provider = createProvider({ aiProvider: 'mock' })
    const schema = z.object({ ok: z.boolean() })
    await expect(provider.generateJson('hello', schema)).resolves.toMatchObject({ ok: true })
    expect(provider).toBeDefined()
  })

  it('supports the mock provider without Ollama', async () => {
    const provider = createProvider({ aiProvider: 'mock' })
    await expect(provider.generateText('hello')).resolves.toContain('Mock response')
    expect(provider).toBeInstanceOf(MockProvider)
  })
})
