import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aiDebugEnabled,
  logProviderSelection,
  logModelResponse,
  logSkillDebug,
  logAtsDebug,
  logScoreDebug,
  logScoreWarning,
} from '../src/utils/aiDebugLog.js'

describe('aiDebugLog', () => {
  const originalFlag = process.env.DEBUG_AI_RESPONSES
  let logSpy

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    if (originalFlag === undefined) delete process.env.DEBUG_AI_RESPONSES
    else process.env.DEBUG_AI_RESPONSES = originalFlag
  })

  describe('disabled (unset or false) — preserves current logging behavior, prints nothing new', () => {
    it('prints nothing when DEBUG_AI_RESPONSES is unset', () => {
      delete process.env.DEBUG_AI_RESPONSES
      expect(aiDebugEnabled()).toBe(false)

      logProviderSelection({ jobTitle: 'X', worker: 'skillMatch', provider: 'mock', model: 'mock', fallbackIndex: 0, attempt: 1, durationMs: 5, retryCount: 0, responseChars: 10 })
      logModelResponse({ jobTitle: 'X', worker: 'skillMatch', output: { items: [] } })
      logSkillDebug({ jobTitle: 'X', requirements: [] })
      logAtsDebug({ jobTitle: 'X', extractedKeywords: [], genericKeywordsRemoved: [], normalizedPhrases: [], matched: [], missing: [] })
      logScoreDebug({ jobTitle: 'X', finalScore: 100 })
      logScoreWarning({ jobTitle: 'X' })

      expect(logSpy).not.toHaveBeenCalled()
    })

    it('prints nothing when DEBUG_AI_RESPONSES=false', () => {
      process.env.DEBUG_AI_RESPONSES = 'false'
      logProviderSelection({ jobTitle: 'X', worker: 'skillMatch', provider: 'mock', model: 'mock', fallbackIndex: 0, attempt: 1, durationMs: 5, retryCount: 0, responseChars: 10 })
      expect(logSpy).not.toHaveBeenCalled()
    })
  })

  describe('enabled (DEBUG_AI_RESPONSES=true)', () => {
    beforeEach(() => {
      process.env.DEBUG_AI_RESPONSES = 'true'
    })

    it('logProviderSelection prints an [ai-debug] line with provider/model/fallback/attempt/duration/retry/response size', () => {
      logProviderSelection({
        jobTitle: 'Senior Frontend Engineer',
        worker: 'skillMatch',
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        fallbackIndex: 1,
        attempt: 1,
        durationMs: 1350,
        retryCount: 0,
        responseChars: 512,
      })

      expect(logSpy).toHaveBeenCalledTimes(1)
      const line = logSpy.mock.calls[0].join(' ')
      expect(line).toContain('[ai-debug]')
      expect(line).toContain('job=Senior Frontend Engineer')
      expect(line).toContain('worker=skillMatch')
      expect(line).toContain('provider=groq')
      expect(line).toContain('model=llama-3.1-8b-instant')
      expect(line).toContain('fallbackIndex=1')
      expect(line).toContain('attempt=1')
      expect(line).toContain('durationMs=1350')
      expect(line).toContain('retryCount=0')
      expect(line).toContain('responseChars=512')
    })

    it('logModelResponse prints [ai-response] with the parsed output, redacted', () => {
      logModelResponse({ jobTitle: 'X', worker: 'skillMatch', output: { items: [{ skill: 'React', notes: 'contact jane@example.com' }] } })

      expect(logSpy).toHaveBeenCalledTimes(1)
      const line = logSpy.mock.calls[0].join(' ')
      expect(line).toContain('[ai-response]')
      expect(line).toContain('React')
      expect(line).not.toContain('jane@example.com')
      expect(line).toContain('[redacted-email]')
    })

    it('logSkillDebug prints [skill-debug] with requirement-level detail', () => {
      logSkillDebug({
        jobTitle: 'X',
        requirements: [{ requirementText: 'React', requirementType: 'mandatory', modelStatus: 'matched', modelConfidence: 0.9, evidenceIds: ['ev-001'], reconciledStatus: 'matched', confidenceSource: 'model-provided' }],
      })

      const line = logSpy.mock.calls[0].join(' ')
      expect(line).toContain('[skill-debug]')
      expect(line).toContain('confidenceSource')
      expect(line).toContain('model-provided')
    })

    it('logAtsDebug prints [ats-debug] with keyword-matching detail', () => {
      logAtsDebug({ jobTitle: 'X', extractedKeywords: ['React'], genericKeywordsRemoved: [], normalizedPhrases: [{ keyword: 'React', normalized: 'react' }], matched: [{ keyword: 'React', evidenceId: 'ev-001' }], missing: [] })

      const line = logSpy.mock.calls[0].join(' ')
      expect(line).toContain('[ats-debug]')
      expect(line).toContain('normalizedPhrases')
    })

    it('logScoreDebug and logScoreWarning print their respective prefixes', () => {
      logScoreDebug({ jobTitle: 'X', finalScore: 82.4 })
      logScoreWarning({ jobTitle: 'X', formulaComponents: {} })

      expect(logSpy.mock.calls[0].join(' ')).toContain('[score-debug]')
      expect(logSpy.mock.calls[1].join(' ')).toContain('[score-warning]')
    })
  })
})
