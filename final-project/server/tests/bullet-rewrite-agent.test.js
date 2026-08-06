import { describe, expect, it, vi } from 'vitest'
import { BulletRewriteAgent } from '../src/services/agents/bulletRewriteAgent.js'
import { InvalidOutputError } from '../src/services/ai/errors.js'

const makeRewrite = (bullet, evidenceId = 'ev-001') => ({
  originalText: bullet,
  rewrittenText: `${bullet} (rewritten)`,
  evidenceId,
  changedKeywords: [],
  riskStatus: 'low',
})

const baseInput = {
  jobDescription: 'React and TypeScript required.',
  keywords: ['React'],
  evidence: [{ id: 'ev-001', text: 'Built React interfaces.' }],
}

describe('BulletRewriteAgent', () => {
  it('returns the batch result directly when it succeeds with the right count, using generateJson (no built-in retry)', async () => {
    const providerService = {
      generateJson: vi.fn(async (prompt, schema, options) => {
        expect(options.numPredict).toBe(350)
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

  it('falls back to one request per bullet when the batch returns the wrong item count', async () => {
    const providerService = {
      // Batch asked for 2 bullets but only returns 1 rewrite — a count mismatch.
      generateJson: vi.fn(async () => ({ rewrites: [makeRewrite('A')] })),
      generateJsonWithRetry: vi.fn(async (prompt, schema, options) => {
        expect(options.numPredict).toBe(350)
        const payload = JSON.parse(prompt.slice(prompt.indexOf('Input: ') + 'Input: '.length))
        return { rewrites: [makeRewrite(payload.bullets[0])] }
      }),
    }

    const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')
    const result = await agent.run({ ...baseInput, bullets: ['A', 'B'] })

    expect(providerService.generateJson).toHaveBeenCalledTimes(1)
    expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(2)
    expect(result.rewrites).toHaveLength(2)
    expect(result.partial).toBe(false)
  })

  it('treats an over-count batch response as a failure too (exact count required)', async () => {
    const providerService = {
      generateJson: vi.fn(async () => ({ rewrites: [makeRewrite('A'), makeRewrite('B'), makeRewrite('C')] })),
      generateJsonWithRetry: vi.fn(async () => ({ rewrites: [makeRewrite('A')] })),
    }

    const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')
    const result = await agent.run({ ...baseInput, bullets: ['A'] })

    // Batch returned 3 for 1 requested bullet — rejected, falls back to individual.
    expect(providerService.generateJsonWithRetry).toHaveBeenCalledTimes(1)
    expect(result.rewrites).toHaveLength(1)
  })

  it('returns successful individual rewrites as partial results when only some bullets recover', async () => {
    const providerService = {
      generateJson: vi.fn(async () => { throw new InvalidOutputError('malformed batch JSON') }),
      generateJsonWithRetry: vi.fn()
        .mockResolvedValueOnce({ rewrites: [makeRewrite('A')] })
        .mockRejectedValueOnce(new InvalidOutputError('still malformed')),
    }

    const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')
    const result = await agent.run({ ...baseInput, bullets: ['A', 'B'] })

    expect(result.rewrites).toHaveLength(1)
    expect(result.rewrites[0].originalText).toBe('A')
    expect(result.partial).toBe(true)
  })

  it('throws the original batch error when every individual fallback also fails', async () => {
    const providerService = {
      generateJson: vi.fn(async () => { throw new InvalidOutputError('batch boom') }),
      generateJsonWithRetry: vi.fn(async () => { throw new InvalidOutputError('individual boom') }),
    }

    const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')

    await expect(agent.run({ ...baseInput, bullets: ['A', 'B'] })).rejects.toThrow('batch boom')
  })

  it('preserves evidence IDs from the resume evidence through the fallback path', async () => {
    const providerService = {
      generateJson: vi.fn(async () => ({ rewrites: [] })), // wrong count (0 for 1 bullet) -> triggers fallback
      generateJsonWithRetry: vi.fn(async () => ({ rewrites: [makeRewrite('Built React interfaces.', 'ev-001')] })),
    }

    const agent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')
    const result = await agent.run({ ...baseInput, bullets: ['Built React interfaces.'] })

    expect(result.rewrites[0].evidenceId).toBe('ev-001')
  })
})
