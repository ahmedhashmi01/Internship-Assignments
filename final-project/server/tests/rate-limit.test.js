import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'
import { makeFakeOrchestration } from './helpers/fakeOrchestration.js'

// Deterministic: rate limiting is off by default under NODE_ENV=test, so each
// test opts in explicitly with a fresh app (fresh counters) and a tiny cap.
const limits = (overrides) => ({
  rateLimitEnabled: true,
  rateLimits: { windowMs: 60000, signup: 100, login: 100, analysis: 100, ...overrides },
})

const normalizedResume = {
  originalText: 'Experienced React developer.',
  evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
}
const runBody = { normalizedResume, jobs: [{ title: 'Frontend Engineer', description: 'Build React interfaces.' }] }

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('Rate limiting (normalized 429)', () => {
  it('limits repeated signups from one IP', async () => {
    const app = createApp(limits({ signup: 2 }))
    const send = (n) =>
      request(app).post('/api/auth/signup').send({ name: 'A', email: `su${n}@example.com`, password: 'correcthorse' })

    expect((await send(1)).status).toBe(201)
    expect((await send(2)).status).toBe(201)
    const third = await send(3)
    expect(third.status).toBe(429)
    expect(third.body.code).toBe('RATE_LIMITED')
    expect(third.headers['retry-after']).toBeDefined()
  })

  it('limits repeated logins from one IP', async () => {
    const app = createApp(limits({ login: 2 }))
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever123' })

    expect((await attempt()).status).toBe(401)
    expect((await attempt()).status).toBe(401)
    const third = await attempt()
    expect(third.status).toBe(429)
    expect(third.body.code).toBe('RATE_LIMITED')
  })

  it('limits repeated analysis requests from one IP (without invoking AI on the blocked call)', async () => {
    const fake = makeFakeOrchestration('usable')
    const app = createApp(limits({ analysis: 2 }), { orchestrationService: fake.orchestrationService })
    // Authenticated so the guest limit is not what blocks the third call.
    const signup = await request(app).post('/api/auth/signup').send({ name: 'A', email: 'a@example.com', password: 'correcthorse' })
    const auth = { Authorization: `Bearer ${signup.body.token}` }

    expect((await request(app).post('/api/analysis/run').set(auth).send(runBody)).status).toBe(200)
    expect((await request(app).post('/api/analysis/run').set(auth).send(runBody)).status).toBe(200)
    const third = await request(app).post('/api/analysis/run').set(auth).send(runBody)

    expect(third.status).toBe(429)
    expect(third.body.code).toBe('RATE_LIMITED')
    expect(fake.runMultiJob).toHaveBeenCalledTimes(2) // blocked before the AI layer
  })

  it('does not rate-limit when disabled (default test behavior)', async () => {
    const app = createApp() // rateLimitEnabled defaults false under NODE_ENV=test
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever123' })
      expect(res.status).toBe(401) // never 429
    }
  })
})
