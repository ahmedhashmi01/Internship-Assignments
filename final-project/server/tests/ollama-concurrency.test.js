import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createConcurrencyLimiter } from '../src/services/ai/concurrencyLimiter.js'
import { createAiService } from '../src/services/ai/providerService.js'

const okSchema = z.object({ ok: z.boolean() })

describe('createConcurrencyLimiter (unit)', () => {
  it('never runs more than `limit` tasks at once', async () => {
    const limiter = createConcurrencyLimiter(2)
    let active = 0
    let maxActive = 0

    const task = () => new Promise((resolve) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      setTimeout(() => {
        active -= 1
        resolve('done')
      }, 0)
    })

    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.run(task)))

    expect(maxActive).toBeLessThanOrEqual(2)
    expect(results).toHaveLength(10)
    expect(results.every((value) => value === 'done')).toBe(true)
  })

  it('does not invoke a queued task until a slot is free (lazy start)', async () => {
    const limiter = createConcurrencyLimiter(2)
    const invokedOrder = []
    const resolvers = []

    const makeTask = (id) => () => new Promise((resolve) => {
      invokedOrder.push(id)
      resolvers.push(resolve)
    })

    const promises = [1, 2, 3, 4].map((id) => limiter.run(makeTask(id)))

    // Flush microtasks so `run()` has synchronously started as many tasks as it can.
    await Promise.resolve()
    await Promise.resolve()

    // Only the first 2 (the limit) should have been invoked — 3 and 4 are
    // still queued, so any timer they'd start on invocation hasn't started.
    expect(invokedOrder).toEqual([1, 2])

    resolvers[0]('a')
    resolvers[1]('b')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(invokedOrder).toEqual([1, 2, 3, 4])

    resolvers[2]('c')
    resolvers[3]('d')
    await Promise.all(promises)
  })
})

describe('Ollama provider concurrency (integration via createAiService)', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  // Fires `count` concurrent generateJson calls through a real OllamaProvider
  // (network calls stubbed via global.fetch) and drives them to completion by
  // manually resolving pending fetches in a microtask loop — no real timers,
  // so the test is fast and deterministic instead of relying on wall-clock delays.
  const runConcurrentBatch = async (config, count) => {
    let activeFetches = 0
    let maxActiveFetches = 0
    let generateFetchCallCount = 0
    const pendingResolvers = []

    global.fetch = vi.fn((url) => {
      // Preflight health check (chain-level) — resolved immediately and
      // excluded from the concurrency/count metrics below, which are
      // specifically about concurrent GENERATION calls.
      if (String(url).includes('/api/tags')) {
        return Promise.resolve({ ok: true, json: async () => ({ models: [{ name: config.ollamaModel }] }) })
      }

      generateFetchCallCount += 1
      activeFetches += 1
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
      return new Promise((resolve) => {
        pendingResolvers.push(() => {
          activeFetches -= 1
          resolve({ ok: true, json: async () => ({ response: JSON.stringify({ ok: true }) }) })
        })
      })
    })

    const aiService = createAiService(config)
    const promises = Array.from({ length: count }, () => aiService.generateJson('prompt', okSchema))

    let settled = false
    Promise.all(promises).then(() => { settled = true })

    let iterations = 0
    while (!settled) {
      iterations += 1
      if (iterations > 10000) {
        throw new Error('runConcurrentBatch did not settle — possible deadlock')
      }
      if (pendingResolvers.length > 0) {
        pendingResolvers.shift()()
      }
      await Promise.resolve()
    }

    const results = await Promise.all(promises)
    return { results, maxActiveFetches, fetchCallCount: generateFetchCallCount }
  }

  it('never exceeds the configured OLLAMA_MAX_CONCURRENCY across 3 jobs x 4 workers (12 calls)', async () => {
    const { results, maxActiveFetches, fetchCallCount } = await runConcurrentBatch(
      {
        aiProvider: 'ollama',
        ollamaMaxConcurrency: 2,
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama3.2:3b',
        aiTimeoutMs: 5000,
      },
      12,
    )

    expect(fetchCallCount).toBe(12)
    expect(results.every((value) => value.ok === true)).toBe(true)
    expect(maxActiveFetches).toBeLessThanOrEqual(2)
    expect(maxActiveFetches).toBe(2) // proves it actually uses the full allowance, not over-throttled
  })

  it('honors a custom OLLAMA_MAX_CONCURRENCY', async () => {
    const { maxActiveFetches } = await runConcurrentBatch(
      {
        aiProvider: 'ollama',
        ollamaMaxConcurrency: 3,
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama3.2:3b',
        aiTimeoutMs: 5000,
      },
      12,
    )

    expect(maxActiveFetches).toBe(3)
  })

  it('defaults to a concurrency of 2 when OLLAMA_MAX_CONCURRENCY is not set', async () => {
    const { maxActiveFetches } = await runConcurrentBatch(
      {
        aiProvider: 'ollama',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaModel: 'llama3.2:3b',
        aiTimeoutMs: 5000,
      },
      6,
    )

    expect(maxActiveFetches).toBe(2)
  })

  it('does not limit the mock provider', async () => {
    const aiService = createAiService({ aiProvider: 'mock' })
    const promises = Array.from({ length: 20 }, () => aiService.generateJson('prompt', okSchema))
    const results = await Promise.all(promises)

    expect(results).toHaveLength(20)
    expect(results.every((value) => value.ok === true)).toBe(true)
  })

  it('retries under the same concurrency slot without deadlocking or double-counting', async () => {
    let callCount = 0
    global.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/tags')) {
        return { ok: true, json: async () => ({ models: [{ name: 'llama3.2:3b' }] }) }
      }
      callCount += 1
      if (callCount === 1) {
        return { ok: true, json: async () => ({ response: 'not valid json {{{' }) }
      }
      return { ok: true, json: async () => ({ response: JSON.stringify({ ok: true }) }) }
    })

    const aiService = createAiService({
      aiProvider: 'ollama',
      ollamaMaxConcurrency: 1,
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2:3b',
      aiTimeoutMs: 5000,
    })

    const result = await aiService.generateJsonWithRetry('prompt', okSchema)

    expect(result).toEqual({ ok: true })
    expect(callCount).toBe(2)
  })
})
