import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'
import { GuestUsage } from '../src/models/GuestUsage.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'
import { makeFakeOrchestration } from './helpers/fakeOrchestration.js'

const normalizedResume = {
  originalText: 'Experienced React developer.',
  evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
}
const runBody = { normalizedResume, jobs: [{ title: 'Frontend Engineer', description: 'Build React interfaces.' }] }
const singleBody = { normalizedResume, job: { title: 'Frontend Engineer', description: 'Build React interfaces.' } }

const postRun = (app, guestId) => request(app).post('/api/analysis/run').set('X-Guest-Id', guestId).send(runBody)
const postSingle = (app, guestId) => request(app).post('/api/analysis/run-single').set('X-Guest-Id', guestId).send(singleBody)

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('run-single cannot bypass the guest limit', () => {
  it('blocks run-single once the allowance was consumed via /run', async () => {
    const fake = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService: fake.orchestrationService })

    expect((await postRun(app, 'guest-a')).status).toBe(200)
    const res = await postSingle(app, 'guest-a')

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('SIGNUP_REQUIRED')
    expect(fake.runSingleJob).not.toHaveBeenCalled() // AI never invoked on the blocked route
  })

  it('run-single itself consumes the allowance, then blocks a later /run', async () => {
    const fake = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService: fake.orchestrationService })

    expect((await postSingle(app, 'guest-b')).status).toBe(200)
    expect((await GuestUsage.findOne({ guestId: 'guest-b' })).analysisCount).toBe(1)

    const res = await postRun(app, 'guest-b')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('SIGNUP_REQUIRED')
    expect(fake.runMultiJob).not.toHaveBeenCalled()
  })

  it('does not consume the allowance when run-single crashes', async () => {
    const fake = makeFakeOrchestration('throw')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService: fake.orchestrationService })

    expect((await postSingle(app, 'guest-c')).status).toBe(500)
    const usage = await GuestUsage.findOne({ guestId: 'guest-c' })
    expect(usage?.analysisCount ?? 0).toBe(0)
  })
})
