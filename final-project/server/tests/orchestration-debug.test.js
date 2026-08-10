import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOrchestrationService } from '../src/services/orchestrationService.js'

const resume = {
  originalText: 'Built responsive React interfaces.',
  evidence: [
    { id: 'ev-001', text: 'Built responsive React interfaces.' },
    { id: 'ev-002', text: 'Developed Node.js APIs.' },
  ],
}
const job = { title: 'Frontend Engineer', description: 'React and Node.js required.' }

describe('orchestration debug logging (integration)', () => {
  const originalDebugFlag = process.env.DEBUG_AI_RESPONSES
  const originalNodeEnv = process.env.NODE_ENV
  const originalFetch = global.fetch
  let logSpy

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    global.fetch = originalFetch
    if (originalDebugFlag === undefined) delete process.env.DEBUG_AI_RESPONSES
    else process.env.DEBUG_AI_RESPONSES = originalDebugFlag
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  })

  const allLoggedText = () => logSpy.mock.calls.map((call) => call.join(' ')).join('\n')

  it('selected provider and model appear in [ai-debug] logs for skillMatch and bulletRewrite', async () => {
    process.env.DEBUG_AI_RESPONSES = 'true'
    const service = createOrchestrationService({ aiProvider: 'mock' })
    await service.runSingleJob({ normalizedResume: resume, job })

    const text = allLoggedText()
    expect(text).toMatch(/\[ai-debug\] job=Frontend Engineer worker=skillMatch provider=mock model=mock/)
    expect(text).toMatch(/\[ai-debug\] job=Frontend Engineer worker=bulletRewrite provider=mock model=mock/)
  })

  it('logs no model output at all when DEBUG_AI_RESPONSES is disabled', async () => {
    delete process.env.DEBUG_AI_RESPONSES
    const service = createOrchestrationService({ aiProvider: 'mock' })
    await service.runSingleJob({ normalizedResume: resume, job })

    expect(logSpy).not.toHaveBeenCalled()
  })

  it('a real (stubbed) Gemini call never leaks the API key, an Authorization header, resume text, or job description into any debug log', async () => {
    process.env.DEBUG_AI_RESPONSES = 'true'
    const SECRET_KEY = 'gemini-secret-abc123'
    const RESUME_MARKER = 'ev001-unique-resume-marker-xyz'
    const JOB_DESCRIPTION_MARKER = 'unique-job-description-marker-xyz'

    const skillMatchPayload = JSON.stringify({
      items: [{ skill: 'React', requirementType: 'mandatory', status: 'matched', evidenceId: 'ev-001', confidence: 0.9 }],
    })

    global.fetch = vi.fn((url) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            candidates: [{ content: { parts: [{ text: skillMatchPayload }] } }],
          }),
        })
      }
      return Promise.resolve({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) })
    })

    const service = createOrchestrationService({
      aiMode: 'cloud',
      geminiApiKey: SECRET_KEY,
      geminiModel: 'gemini-test',
      groqApiKey: '',
      openrouterApiKey: '',
      aiTimeoutMs: 5000,
      aiTemperature: 0.1,
    })

    await service.runSingleJob({
      normalizedResume: { originalText: RESUME_MARKER, evidence: [{ id: 'ev-001', text: RESUME_MARKER }] },
      job: { title: 'Frontend Engineer', description: JOB_DESCRIPTION_MARKER },
    })

    const text = allLoggedText()
    expect(text).not.toContain(SECRET_KEY)
    expect(text).not.toContain('Authorization')
    expect(text).not.toContain('Bearer')
    expect(text).not.toContain(RESUME_MARKER)
    expect(text).not.toContain(JOB_DESCRIPTION_MARKER)
  })

  describe('production API safety (requirement 8)', () => {
    it('never attaches raw model output to a worker result when NODE_ENV=production, even with debug logging on', async () => {
      process.env.DEBUG_AI_RESPONSES = 'true'
      process.env.NODE_ENV = 'production'

      const service = createOrchestrationService({ aiProvider: 'mock' })
      const result = await service.runSingleJob({ normalizedResume: resume, job })

      const skillMatchWorker = result.workers.find((worker) => worker.name === 'skillMatch')
      const bulletRewriteWorker = result.workers.find((worker) => worker.name === 'bulletRewrite')
      expect(skillMatchWorker.debugModelOutput).toBeUndefined()
      expect(bulletRewriteWorker.debugModelOutput).toBeUndefined()
      // The public/processed output must still be present — production
      // behavior is unaffected, only the extra raw-debug field is withheld.
      expect(skillMatchWorker.output).toBeDefined()
    })

    it('attaches (redacted) raw model output outside production when debug logging is on', async () => {
      process.env.DEBUG_AI_RESPONSES = 'true'
      process.env.NODE_ENV = 'development'

      const service = createOrchestrationService({ aiProvider: 'mock' })
      const result = await service.runSingleJob({ normalizedResume: resume, job })

      const skillMatchWorker = result.workers.find((worker) => worker.name === 'skillMatch')
      expect(skillMatchWorker.debugModelOutput).toBeDefined()
    })

    it('never attaches raw model output when DEBUG_AI_RESPONSES is off, regardless of NODE_ENV', async () => {
      delete process.env.DEBUG_AI_RESPONSES
      process.env.NODE_ENV = 'development'

      const service = createOrchestrationService({ aiProvider: 'mock' })
      const result = await service.runSingleJob({ normalizedResume: resume, job })

      const skillMatchWorker = result.workers.find((worker) => worker.name === 'skillMatch')
      expect(skillMatchWorker.debugModelOutput).toBeUndefined()
    })
  })
})
