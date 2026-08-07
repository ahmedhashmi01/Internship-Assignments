import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { OllamaProvider } from '../src/services/ai/ollamaProvider.js'
import { createAiService } from '../src/services/ai/providerService.js'
import { skillMatchBatchOutputSchema, bulletRewriteBatchOutputSchema } from '../src/schemas/workerSchemas.js'

describe('OllamaProvider', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  const baseConfig = {
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2:1b',
    aiTemperature: 0.1,
    aiTimeoutMs: 5000,
  }

  it('sends num_predict from config.ollamaNumPredict', async () => {
    let sentBody = null
    global.fetch = vi.fn((url, init) => {
      sentBody = JSON.parse(init.body)
      return Promise.resolve({ ok: true, json: async () => ({ response: 'hello' }) })
    })

    const provider = new OllamaProvider({ ...baseConfig, ollamaNumPredict: 250 })
    await provider.generateText('prompt')

    expect(sentBody.options.num_predict).toBe(250)
    expect(sentBody.options.temperature).toBe(0.1) // temperature untouched
  })

  it('defaults num_predict to 600 when not configured', async () => {
    let sentBody = null
    global.fetch = vi.fn((url, init) => {
      sentBody = JSON.parse(init.body)
      return Promise.resolve({ ok: true, json: async () => ({ response: 'hello' }) })
    })

    const provider = new OllamaProvider({ ...baseConfig })
    await provider.generateText('prompt')

    expect(sentBody.options.num_predict).toBe(600)
  })

  it('lets generateJson override num_predict per call, ignoring config.ollamaNumPredict', async () => {
    let sentBody = null
    global.fetch = vi.fn((url, init) => {
      sentBody = JSON.parse(init.body)
      return Promise.resolve({ ok: true, json: async () => ({ response: '{"ok":true}' }) })
    })

    const provider = new OllamaProvider({ ...baseConfig, ollamaNumPredict: 600 })
    await provider.generateJson('prompt', z.object({ ok: z.boolean() }), { numPredict: 350 })

    expect(sentBody.options.num_predict).toBe(350)
  })

  it('falls back to config.ollamaNumPredict when generateJson is called without an override', async () => {
    let sentBody = null
    global.fetch = vi.fn((url, init) => {
      sentBody = JSON.parse(init.body)
      return Promise.resolve({ ok: true, json: async () => ({ response: '{"ok":true}' }) })
    })

    const provider = new OllamaProvider({ ...baseConfig, ollamaNumPredict: 600 })
    await provider.generateJson('prompt', z.object({ ok: z.boolean() }))

    expect(sentBody.options.num_predict).toBe(600)
  })

  it('accepts a batch response with null optional fields (gapType, evidenceId, notes)', async () => {
    const rawResponse = {
      items: [
        {
          skill: 'React',
          requirementType: 'mandatory',
          status: 'missing',
          evidenceId: null,
          confidence: 0.3,
          gapType: null,
          notes: null,
        },
        {
          skill: 'TypeScript',
          requirementType: 'preferred',
          status: 'matched',
          evidenceId: 'ev-001',
          confidence: 0.9,
          gapType: null,
          notes: null,
        },
      ],
    }

    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ response: JSON.stringify(rawResponse) }),
    }))

    const provider = new OllamaProvider(baseConfig)
    const result = await provider.generateJson('prompt', skillMatchBatchOutputSchema)

    expect(result.items).toHaveLength(2)
    expect(result.items[0].gapType).toBeUndefined()
    expect(result.items[0].evidenceId).toBeUndefined()
    expect(result.items[1].evidenceId).toBe('ev-001')
  })

  it('repairs a skill-match response missing confidence and does not retry (single fetch call)', async () => {
    let fetchCallCount = 0
    global.fetch = vi.fn((url) => {
      // Preflight health check (chain-level) — resolved separately, not
      // counted as a generation attempt.
      if (String(url).includes('/api/tags')) {
        return Promise.resolve({ ok: true, json: async () => ({ models: [{ name: baseConfig.ollamaModel }] }) })
      }
      fetchCallCount += 1
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            items: [
              { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001' },
              { skill: 'SQL', requirementType: 'preferred', status: 'missing' },
              { skill: 'Go', requirementType: 'preferred', status: 'uncertain', evidenceId: 'ev-002' },
            ],
          }),
        }),
      })
    })

    const service = createAiService({ aiProvider: 'ollama', ...baseConfig })
    const result = await service.generateJsonWithRetry('prompt', skillMatchBatchOutputSchema)

    expect(fetchCallCount).toBe(1)
    expect(result.items[0].confidence).toBe(0.9)
    expect(result.items[1].confidence).toBe(0)
    expect(result.items[2].confidence).toBe(0.35)
  })

  it('preserves valid model-provided skill-match confidence instead of overwriting it', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          items: [
            { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001', confidence: 0.73 },
          ],
        }),
      }),
    }))

    const provider = new OllamaProvider(baseConfig)
    const result = await provider.generateJson('prompt', skillMatchBatchOutputSchema)

    expect(result.items[0].confidence).toBe(0.73)
  })

  it('still triggers a retry (does not silently normalize) when confidence is present but invalid', async () => {
    let fetchCallCount = 0
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/api/tags')) {
        return Promise.resolve({ ok: true, json: async () => ({ models: [{ name: baseConfig.ollamaModel }] }) })
      }
      fetchCallCount += 1
      return Promise.resolve({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            items: [
              { skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001', confidence: 5 },
            ],
          }),
        }),
      })
    })

    const service = createAiService({ aiProvider: 'ollama', ...baseConfig })
    await expect(service.generateJsonWithRetry('prompt', skillMatchBatchOutputSchema)).rejects.toThrow()
    // First attempt + one retry — an invalid (not missing) confidence is a
    // real validation failure and still goes through the normal retry path.
    expect(fetchCallCount).toBe(2)
  })

  it('still rejects a null on a required field (evidenceId on bullet rewrites)', async () => {
    const rawResponse = {
      rewrites: [
        {
          originalText: 'Built dashboards.',
          rewrittenText: 'Built dashboards.',
          evidenceId: null,
          changedKeywords: [],
          riskStatus: 'low',
        },
      ],
    }

    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ response: JSON.stringify(rawResponse) }),
    }))

    const provider = new OllamaProvider(baseConfig)

    await expect(provider.generateJson('prompt', bulletRewriteBatchOutputSchema)).rejects.toThrow()
  })
})
