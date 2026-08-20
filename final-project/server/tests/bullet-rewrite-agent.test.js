import { describe, expect, it, vi } from 'vitest'
import { BulletRewriteAgent } from '../src/services/agents/bulletRewriteAgent.js'
import { InvalidOutputError } from '../src/services/ai/errors.js'

// Anti-fabrication SAFE (only evidence-backed words) AND usefulness MEANINGFUL
// (adds real content) so the generation-mechanics tests below never trip the
// corrective validation/usefulness retry — those tests assert exact provider
// call counts. Retry-specific tests use explicit failing fixtures further down.
const makeRewrite = (bullet, evidenceId = 'ev-001') => ({
  originalText: bullet,
  rewrittenText: `Delivered ${bullet} improving workflow efficiency`,
  evidenceId,
  changedKeywords: [],
  riskStatus: 'low',
})

const baseInput = {
  jobDescription: 'React and TypeScript required.',
  keywords: ['React'],
  evidence: [{ id: 'ev-001', text: 'Built and delivered responsive React interfaces for internal tools, improving workflow efficiency.' }],
}

describe('BulletRewriteAgent', () => {
  it('returns the batch result directly when it succeeds with the right count, using generateJson (no built-in retry)', async () => {
    const providerService = {
      generateJson: vi.fn(async (prompt, schema, options) => {
        // Bounded but generous enough for a reasoning-capable cloud model to
        // finish "thinking" and still emit the JSON (see BULLET_REWRITE_NUM_PREDICT).
        expect(options.numPredict).toBe(1200)
        return { rewrites: [makeRewrite('Built React interfaces.')] }
      }),
      generateJsonWithRetry: vi.fn(),
    }

    const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')
    const result = await agent.run({ ...baseInput, bullets: ['Built React interfaces.'] })

    expect(result.rewrites).toHaveLength(1)
    expect(result.partial).toBe(false)
    expect(providerService.generateJson).toHaveBeenCalledTimes(1)
    expect(providerService.generateJsonWithRetry).not.toHaveBeenCalled()
  })

  // BOUNDED RETRY BUDGET (presentation-safety): the generation stage is now
  // "batch attempt, then AT MOST one lightweight fallback attempt of the
  // SAME batch shape" — never a per-bullet fan-out. Both attempts go through
  // generateJson (a single provider-chain pass each); generateJsonWithRetry
  // is never called during generation anymore (it's still used by the
  // separate corrective/semantic-retry stage tested further down).
  describe('bounded generation retry (batch + at most one lightweight fallback)', () => {
    it('recovers via the lightweight fallback when the first batch returns the wrong item count', async () => {
      const generateJson = vi.fn()
        // Batch asked for 2 bullets but only returns 1 rewrite — a count mismatch.
        .mockResolvedValueOnce({ rewrites: [makeRewrite('A')] })
        // Lightweight fallback: same batch shape, this time the right count.
        .mockResolvedValueOnce({ rewrites: [makeRewrite('A'), makeRewrite('B')] })
      const providerService = { generateJson, generateJsonWithRetry: vi.fn() }

      const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')
      const result = await agent.run({ ...baseInput, bullets: ['A', 'B'] })

      // Exactly two generateJson calls total (batch + one lightweight
      // fallback) — never per-bullet, never generateJsonWithRetry.
      expect(generateJson).toHaveBeenCalledTimes(2)
      expect(providerService.generateJsonWithRetry).not.toHaveBeenCalled()
      expect(result.rewrites).toHaveLength(2)
      expect(result.partial).toBe(false)
    })

    it('treats an over-count batch response as a failure too (exact count required), and still bounds the retry to one', async () => {
      const generateJson = vi.fn()
        .mockResolvedValueOnce({ rewrites: [makeRewrite('A'), makeRewrite('B'), makeRewrite('C')] })
        .mockResolvedValueOnce({ rewrites: [makeRewrite('A')] })
      const providerService = { generateJson, generateJsonWithRetry: vi.fn() }

      const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')
      const result = await agent.run({ ...baseInput, bullets: ['A'] })

      // Batch returned 3 for 1 requested bullet — rejected, ONE lightweight
      // fallback attempt recovers the correct count.
      expect(generateJson).toHaveBeenCalledTimes(2)
      expect(result.rewrites).toHaveLength(1)
    })

    it('throws the original batch error when the lightweight fallback also fails — never a per-bullet fan-out', async () => {
      const generateJson = vi.fn(async () => { throw new InvalidOutputError('batch boom') })
      const providerService = { generateJson, generateJsonWithRetry: vi.fn() }

      const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')

      await expect(agent.run({ ...baseInput, bullets: ['A', 'B'] })).rejects.toThrow('batch boom')
      // Exactly 2 attempts total (batch + one lightweight fallback) for a
      // 2-bullet job — NOT 2 bullets x N providers x corrective retries.
      expect(generateJson).toHaveBeenCalledTimes(2)
      expect(providerService.generateJsonWithRetry).not.toHaveBeenCalled()
    })

    it('preserves evidence IDs from the resume evidence through the lightweight fallback', async () => {
      const generateJson = vi.fn()
        .mockResolvedValueOnce({ rewrites: [] }) // wrong count (0 for 1 bullet) -> triggers the fallback
        .mockResolvedValueOnce({ rewrites: [makeRewrite('Built React interfaces.', 'ev-001')] })
      const providerService = { generateJson, generateJsonWithRetry: vi.fn() }

      const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')
      const result = await agent.run({ ...baseInput, bullets: ['Built React interfaces.'] })

      expect(result.rewrites[0].evidenceId).toBe('ev-001')
    })
  })

  describe('validation-driven corrective retry', () => {
    const evidenceInput = {
      jobDescription: 'React and TypeScript required.',
      keywords: ['React'],
      evidence: [{ id: 'ev-001', text: 'Built and delivered responsive React interfaces for internal tools, improving workflow efficiency.' }],
    }
    const rewrite = (rewrittenText, evidenceId = 'ev-001') => ({
      originalText: 'Built React interfaces.',
      rewrittenText,
      evidenceId,
      changedKeywords: [],
      riskStatus: 'low',
    })

    // Safe (evidence-backed words only) AND meaningful (adds real content).
    const meaningfulSafe = rewrite('Delivered responsive React interfaces, improving workflow efficiency.')
    const inventedMetric = rewrite('Built React interfaces by 40%.') // invented-metric
    const unsupportedSkill = rewrite('Built React interfaces using TypeScript.') // unsupported-skill-or-tool
    const stillInventedMetric = rewrite('Built React interfaces by 55%.') // still invalid after retry

    const run = (providerService, bullets = ['Built React interfaces.']) =>
      new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md').run({ ...evidenceInput, bullets })

    it('does not retry when the first rewrite is already safe and meaningful', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [meaningfulSafe] })),
        generateJsonWithRetry: vi.fn(),
      }

      const result = await run(providerService)

      expect(providerService.generateJsonWithRetry).not.toHaveBeenCalled()
      expect(result.rewrites[0].rewriteValidationRetry).toBe(false)
      expect(result.rewrites[0].retryCount).toBe(0)
      expect(result.rewrites[0].finalValidationFlags).toEqual([])
      expect(result.rewrites[0].meaningfulRewrite).toBe(true)
    })

    it('performs exactly one corrective retry for an invented metric', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [inventedMetric] })),
        generateJsonWithRetry: vi.fn(async () => ({ rewrites: [meaningfulSafe] })),
      }

      const result = await run(providerService)

      expect(providerService.generateJson).toHaveBeenCalledTimes(1)
      expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(1)
      expect(result.rewrites[0].rewriteValidationRetry).toBe(true)
      expect(result.rewrites[0].retryCount).toBe(1)
      expect(result.rewrites[0].initialValidationFlags).toContain('invented-metric')
    })

    it('performs exactly one corrective retry for an unsupported skill/tool', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [unsupportedSkill] })),
        generateJsonWithRetry: vi.fn(async () => ({ rewrites: [meaningfulSafe] })),
      }

      const result = await run(providerService)

      expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(1)
      expect(result.rewrites[0].initialValidationFlags).toContain('unsupported-skill-or-tool')
      expect(result.rewrites[0].retryCount).toBe(1)
    })

    it('returns the corrected rewrite as safe when the retry fixes it', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [inventedMetric] })),
        generateJsonWithRetry: vi.fn(async () => ({ rewrites: [meaningfulSafe] })),
      }

      const result = await run(providerService)

      expect(result.rewrites[0].rewrittenText).toBe('Delivered responsive React interfaces, improving workflow efficiency.')
      expect(result.rewrites[0].finalValidationFlags).toEqual([]) // now passes → orchestration sets needsReview=false
    })

    it('returns the second rewrite with flags preserved when it still fails, and never retries twice', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [inventedMetric] })),
        generateJsonWithRetry: vi.fn(async () => ({ rewrites: [stillInventedMetric] })),
      }

      const result = await run(providerService)

      // Exactly one corrective retry — never more than one.
      expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(1)
      expect(result.rewrites[0].rewrittenText).toBe('Built React interfaces by 55%.')
      expect(result.rewrites[0].retryCount).toBe(1)
      expect(result.rewrites[0].finalValidationFlags).toContain('invented-metric') // still flagged → needsReview stays true
    })

    it('keeps generation-stage retry and semantic validation retry separate', async () => {
      // Batch fails (provider/schema error) → the ONE lightweight fallback
      // attempt recovers a VALID + meaningful rewrite. That is the
      // generation path; because the rewrite is safe and meaningful, NO
      // semantic corrective retry fires on top of it.
      const generateJson = vi.fn()
        .mockRejectedValueOnce(new InvalidOutputError('malformed batch JSON'))
        .mockResolvedValueOnce({ rewrites: [meaningfulSafe] })
      const providerService = { generateJson, generateJsonWithRetry: vi.fn() }

      const result = await run(providerService)

      // Two generation-stage calls (batch + lightweight fallback); zero
      // semantic-retry calls on top since the recovered rewrite is safe.
      expect(generateJson).toHaveBeenCalledTimes(2)
      expect(providerService.generateJsonWithRetry).not.toHaveBeenCalled()
      expect(result.rewrites[0].rewriteValidationRetry).toBe(false)
    })

    it('does not loop the semantic retry when the corrective model call itself fails', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [inventedMetric] })),
        generateJsonWithRetry: vi.fn(async () => { throw new InvalidOutputError('corrective attempt failed') }),
      }

      const result = await run(providerService)

      // Exactly one corrective attempt; the original (flagged) rewrite is kept.
      expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(1)
      expect(result.rewrites[0].rewrittenText).toBe('Built React interfaces by 40%.')
      expect(result.rewrites[0].finalValidationFlags).toContain('invented-metric')
    })
  })

  describe('usefulness-driven corrective retry', () => {
    const evidenceInput = {
      jobDescription: 'React and TypeScript required.',
      keywords: ['React'],
      evidence: [{ id: 'ev-001', text: 'Built and delivered responsive React interfaces for internal tools, improving workflow efficiency.' }],
    }
    const rewrite = (rewrittenText, evidenceId = 'ev-001') => ({
      originalText: 'Built React interfaces.',
      rewrittenText,
      evidenceId,
      changedKeywords: [],
      riskStatus: 'low',
    })

    const identical = rewrite('Built React interfaces.') // safe but useless
    const stillIdentical = rewrite('Built React interfaces.') // retry stays useless
    const meaningfulSafe = rewrite('Delivered responsive React interfaces, improving workflow efficiency.')

    const run = (providerService) =>
      new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md').run({ ...evidenceInput, bullets: ['Built React interfaces.'] })

    it('triggers exactly one usefulness retry for a safe-but-identical rewrite', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [identical] })),
        generateJsonWithRetry: vi.fn(async () => ({ rewrites: [meaningfulSafe] })),
      }

      const result = await run(providerService)

      expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(1)
      expect(result.rewrites[0].rewriteValidationRetry).toBe(true)
      expect(result.rewrites[0].retryCount).toBe(1)
    })

    it('returns the corrected meaningful rewrite when the usefulness retry improves it', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [identical] })),
        generateJsonWithRetry: vi.fn(async () => ({ rewrites: [meaningfulSafe] })),
      }

      const result = await run(providerService)

      expect(result.rewrites[0].rewrittenText).toBe('Delivered responsive React interfaces, improving workflow efficiency.')
      expect(result.rewrites[0].meaningfulRewrite).toBe(true)
      expect(result.rewrites[0].rewriteQualityStatus).toBeUndefined()
    })

    it('marks no-meaningful-improvement and returns the original when the retry is still not meaningful', async () => {
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [identical] })),
        generateJsonWithRetry: vi.fn(async () => ({ rewrites: [stillIdentical] })),
      }

      const result = await run(providerService)

      // Exactly one corrective retry, never two.
      expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(1)
      expect(result.rewrites[0].rewriteQualityStatus).toBe('no-meaningful-improvement')
      expect(result.rewrites[0].meaningfulRewrite).toBe(false)
      // The safe original is returned, not a fabricated "improvement".
      expect(result.rewrites[0].rewrittenText).toBe('Built React interfaces.')
    })

    it('never runs more than one corrective retry even when both checks would fail in sequence', async () => {
      // First (identical) → usefulness retry → still identical. No further retry.
      const providerService = {
        generateJson: vi.fn(async () => ({ rewrites: [identical] })),
        generateJsonWithRetry: vi.fn(async () => ({ rewrites: [stillIdentical] })),
      }

      await run(providerService)

      expect(providerService.generateJson).toHaveBeenCalledTimes(1)
      expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(1)
    })
  })
})
