import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'
import { GuestUsage } from '../src/models/GuestUsage.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'
import { makeFakeOrchestration } from './helpers/fakeOrchestration.js'

const validBody = {
  normalizedResume: {
    originalText: 'Experienced React developer with JavaScript skills.',
    evidence: [{ id: 'ev-001', text: 'Experienced React developer with JavaScript skills.' }],
  },
  jobs: [{ title: 'Frontend Engineer', description: 'Build React interfaces.' }],
}

const run = (app, guestId, body = validBody) =>
  request(app).post('/api/analysis/run').set('X-Guest-Id', guestId).send(body)

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('Guest usage limit (GUEST_ANALYSIS_LIMIT=1)', () => {
  it('allows the first guest analysis and calls the AI layer once', async () => {
    const { orchestrationService, runMultiJob } = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    const res = await run(app, 'guest-a')

    expect(res.status).toBe(200)
    expect(res.body.rankedJobs).toHaveLength(1)
    expect(runMultiJob).toHaveBeenCalledTimes(1)
  })

  it('increments usage to 1 after the first successful analysis', async () => {
    const { orchestrationService } = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    await run(app, 'guest-b')
    const usage = await GuestUsage.findOne({ guestId: 'guest-b' })
    expect(usage.analysisCount).toBe(1)
  })

  it('blocks the second guest analysis with 403 SIGNUP_REQUIRED and does NOT call the AI layer', async () => {
    const { orchestrationService, runMultiJob } = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    await run(app, 'guest-c') // consumes the single allowance
    const res = await run(app, 'guest-c') // blocked

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('SIGNUP_REQUIRED')
    expect(res.body.message).toBe('Create an account to continue analyzing resumes.')
    // AI called exactly once (for the first request), never for the blocked one.
    expect(runMultiJob).toHaveBeenCalledTimes(1)
  })

  it('does NOT consume the allowance when the analysis crashes', async () => {
    const { orchestrationService } = makeFakeOrchestration('throw')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    const res = await run(app, 'guest-d')
    expect(res.status).toBe(500)

    const usage = await GuestUsage.findOne({ guestId: 'guest-d' })
    // Reservation was released — count is back to 0 (or the doc never persisted a consumed slot).
    expect(usage?.analysisCount ?? 0).toBe(0)
  })

  it('does NOT consume the allowance when the result is unusable (no ranked jobs)', async () => {
    const { orchestrationService } = makeFakeOrchestration('unusable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    const res = await run(app, 'guest-e')
    expect(res.status).toBe(200)
    expect(res.body.rankedJobs).toHaveLength(0)

    const usage = await GuestUsage.findOne({ guestId: 'guest-e' })
    expect(usage?.analysisCount ?? 0).toBe(0)
  })

  it('does NOT consume the allowance (or call AI) when input is malformed', async () => {
    const { orchestrationService, runMultiJob } = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    const res = await run(app, 'guest-f', { jobs: [] })
    expect(res.status).toBe(400)
    expect(runMultiJob).not.toHaveBeenCalled()

    const usage = await GuestUsage.findOne({ guestId: 'guest-f' })
    expect(usage).toBeNull()
  })

  it('cannot be bypassed by two concurrent guest requests', async () => {
    const { orchestrationService, runMultiJob } = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    const [a, b] = await Promise.all([run(app, 'guest-race'), run(app, 'guest-race')])
    const statuses = [a.status, b.status].sort()

    // Exactly one succeeds, exactly one is blocked.
    expect(statuses).toEqual([200, 403])
    expect(runMultiJob).toHaveBeenCalledTimes(1)

    const usage = await GuestUsage.findOne({ guestId: 'guest-race' })
    expect(usage.analysisCount).toBe(1)
  })
})
