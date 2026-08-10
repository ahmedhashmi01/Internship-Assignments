import { describe, expect, it } from 'vitest'
import { evaluateRewriteUsefulness } from '../src/services/rewriteUsefulness.js'

describe('evaluateRewriteUsefulness', () => {
  it('flags an exactly identical rewrite (after trim)', () => {
    const result = evaluateRewriteUsefulness('Built React interfaces.', '  Built React interfaces.  ')
    expect(result.meaningfulRewrite).toBe(false)
    expect(result.reason).toBe('identical-to-original')
    expect(result.similarityScore).toBe(1)
  })

  it('flags a whitespace/case-only difference', () => {
    const result = evaluateRewriteUsefulness('Built React interfaces', 'built   react   INTERFACES')
    expect(result.meaningfulRewrite).toBe(false)
    expect(result.reason).toBe('identical-to-original')
  })

  it('flags a punctuation-only difference', () => {
    const result = evaluateRewriteUsefulness('Built React interfaces', 'Built, React interfaces!')
    expect(result.meaningfulRewrite).toBe(false)
    expect(result.reason).toBe('punctuation-only-change')
  })

  it('flags trivial rewording (only a stopword added, no new content)', () => {
    const result = evaluateRewriteUsefulness('Built React interfaces for tools', 'Built the React interfaces for tools')
    expect(result.meaningfulRewrite).toBe(false)
    expect(result.reason).toBe('trivial-rewording')
  })

  it('passes a genuinely meaningful rewrite', () => {
    const result = evaluateRewriteUsefulness(
      'Built React interfaces.',
      'Engineered responsive React interfaces, improving user workflow and delivery speed.',
    )
    expect(result.meaningfulRewrite).toBe(true)
    expect(result.reason).toBe('meaningful-rewrite')
    expect(result.similarityScore).toBeLessThan(0.8)
  })
})
