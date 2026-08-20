// Presentation-safety bounded retry budget — proves (by call count AND wall
// clock) that none of the "what if a provider fails" paths can spiral into
// the 20-40s worst case described in the pre-implementation investigation.
import { describe, expect, it, vi } from 'vitest'
import { FAILURE_CATEGORIES, FALLBACK_CATEGORIES, COOLDOWN_CATEGORIES, classifyProviderError } from '../src/services/ai/errorClassification.js'
import { createProviderChain } from '../src/services/ai/providerChain.js'
import { createCooldownRegistry } from '../src/services/ai/cooldownRegistry.js'
import { BulletRewriteAgent } from '../src/services/agents/bulletRewriteAgent.js'
import { createInterviewService } from '../src/services/interviewService.js'

const makeFakeProvider = (overrides = {}) => ({
  providerName: 'fake',
  modelName: 'fake-model',
  requiresApiKey: false,
  apiKey: null,
  preflightHealthCheck: false,
  concurrencyLimiter: null,
  classifyError: classifyProviderError,
  generateJson: vi.fn(),
  generateText: vi.fn(),
  healthCheck: vi.fn(async () => ({ ok: true, provider: overrides.providerName || 'fake', model: overrides.modelName || 'fake-model' })),
  ...overrides,
})

const schema = { parse: (value) => value }

// A ProviderUnavailableError-shaped rejection with a given HTTP status, the
// same shape every real provider's _buildHttpError produces.
const httpError = (status) => Object.assign(new Error(`simulated ${status}`), { name: 'ProviderUnavailableError', details: { status } })

describe('Error classification: 400/401/403 vs transient failures', () => {
  it('classifies 400/401/403 distinctly (never as network-error)', () => {
    expect(classifyProviderError(httpError(400))).toBe(FAILURE_CATEGORIES.INVALID_REQUEST)
    expect(classifyProviderError(httpError(401))).toBe(FAILURE_CATEGORIES.UNAUTHORIZED)
    expect(classifyProviderError(httpError(403))).toBe(FAILURE_CATEGORIES.FORBIDDEN)
    expect(classifyProviderError(httpError(400))).not.toBe(FAILURE_CATEGORIES.NETWORK_ERROR)
  })

  it('still classifies 429/5xx as before (unchanged, existing behavior)', () => {
    expect(classifyProviderError(httpError(429))).toBe(FAILURE_CATEGORIES.RATE_LIMITED)
    expect(classifyProviderError(httpError(503))).toBe(FAILURE_CATEGORIES.SERVER_ERROR)
  })

  it('invalid_request/unauthorized/forbidden fall back to the next provider but are never cooled down', () => {
    ;[FAILURE_CATEGORIES.INVALID_REQUEST, FAILURE_CATEGORIES.UNAUTHORIZED, FAILURE_CATEGORIES.FORBIDDEN].forEach((category) => {
      expect(FALLBACK_CATEGORIES.has(category)).toBe(true)
      expect(COOLDOWN_CATEGORIES.has(category)).toBe(false)
    })
  })
})

describe('Provider chain: HTTP 400 behavior', () => {
  it('does NOT retry the identical request against the same provider on a 400 (generateJsonWithRetry)', async () => {
    const primary = makeFakeProvider({ providerName: 'primary', generateJson: vi.fn().mockRejectedValue(httpError(400)) })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { diagnostics } = await chain.generateJsonWithRetry('prompt', schema)

    // Exactly ONE call to the 400-ing provider — no corrective retry.
    expect(primary.generateJson).toHaveBeenCalledTimes(1)
    expect(diagnostics.selectedProvider).toBe('secondary')
    expect(diagnostics.attemptedProviders[0]).toMatchObject({ provider: 'primary', outcome: 'failed', failureCategory: FAILURE_CATEGORIES.INVALID_REQUEST })
  })

  it('immediately moves to the next provider on a 400 rather than aborting the whole chain', async () => {
    const primary = makeFakeProvider({ providerName: 'primary', generateJson: vi.fn().mockRejectedValue(httpError(400)) })
    const secondary = makeFakeProvider({ providerName: 'secondary', generateJson: vi.fn().mockResolvedValue({ ok: true }) })
    const chain = createProviderChain([primary, secondary])

    const { value, diagnostics } = await chain.generateJson('prompt', schema)

    expect(value).toEqual({ ok: true })
    expect(diagnostics.selectedProvider).toBe('secondary')
  })

  it('does NOT globally cooldown a provider after a 400 — it is tried again on the very next call', async () => {
    let now = 1_000_000
    const primary = makeFakeProvider({
      providerName: 'primary',
      generateJson: vi.fn()
        .mockRejectedValueOnce(httpError(400))
        .mockResolvedValueOnce({ ok: true }),
    })
    const chain = createProviderChain([primary], { now: () => now, cooldownMs: 300_000, cooldownRegistry: createCooldownRegistry() })

    await expect(chain.generateJson('prompt', schema)).rejects.toThrow() // fails with 400 (only provider, so the chain is exhausted)
    now += 1 // effectively immediately — a cooled-down provider would still be skipped here
    const { diagnostics } = await chain.generateJson('prompt', schema)

    expect(diagnostics.selectedProvider).toBe('primary') // not skipped for "cooldown"
    expect(primary.generateJson).toHaveBeenCalledTimes(2)
  })
})

describe('Bullet rewrite: bounded generation retry budget (timing)', () => {
  // Simulates a provider that takes real (small but measurable) time to fail
  // — proves the BOUND is on attempt count, not just that mocks resolve
  // instantly. A regression back to per-bullet fan-out (N bullets x M
  // providers x corrective retry) would blow well past this budget.
  const slowFailingGenerateJson = (delayMs) => vi.fn(() => new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error('simulated slow provider failure')), delayMs)
  }))

  it('a 2-bullet job makes at most 2 generation calls total, bounding worst-case duration', async () => {
    const delayMs = 40
    const generateJson = slowFailingGenerateJson(delayMs)
    const providerService = { generateJson, generateJsonWithRetry: vi.fn() }
    const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')

    const startedAt = Date.now()
    await expect(agent.run({
      jobDescription: 'React required.',
      keywords: ['React'],
      evidence: [{ id: 'ev-001', text: 'Built React apps.' }],
      bullets: ['Built React apps.', 'Shipped features.'], // 2 bullets
    })).rejects.toThrow()
    const elapsedMs = Date.now() - startedAt

    // Exactly 2 calls (batch + one lightweight fallback) — NEVER 2 bullets x
    // N providers x 2(corrective retry), which is what produced the
    // pre-fix 20-40s worst case.
    expect(generateJson).toHaveBeenCalledTimes(2)
    // Generous upper bound: 2 sequential attempts at delayMs each, plus
    // scheduling slack — nowhere near the old multi-call explosion.
    expect(elapsedMs).toBeLessThan(delayMs * 2 + 500)
  })

  it('the happy path (batch succeeds first try) makes exactly one call', async () => {
    const generateJson = vi.fn(async () => ({
      rewrites: [{ originalText: 'Built React apps.', rewrittenText: 'Delivered React apps.', evidenceId: 'ev-001', changedKeywords: [], riskStatus: 'low' }],
    }))
    const providerService = { generateJson, generateJsonWithRetry: vi.fn() }
    const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')

    const result = await agent.run({
      jobDescription: 'React required.',
      keywords: ['React'],
      evidence: [{ id: 'ev-001', text: 'Built React apps.' }],
      bullets: ['Built React apps.'],
    })

    expect(generateJson).toHaveBeenCalledTimes(1)
    expect(result.partial).toBe(false)
  })
})

describe('Interview questions: bounded retry (initial + at most one retry)', () => {
  it('never exceeds 2 generateJson calls even under repeated failure, and fails gracefully', async () => {
    const generateJson = vi.fn().mockRejectedValue(new Error('provider down'))
    const service = createInterviewService({ config: {}, aiService: { generateJson } })

    await expect(service.generateQuestions({
      job: { title: 'Engineer', description: 'x' },
      analysis: {},
      resumeEvidence: [],
      count: 3,
      difficulty: 'standard',
    })).rejects.toThrow('provider down')

    expect(generateJson).toHaveBeenCalledTimes(2) // initial attempt + exactly one retry, never more
  })
})
