import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'
import { User } from '../src/models/User.js'
import { AnalysisHistory } from '../src/models/AnalysisHistory.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'
import { makeFakeOrchestration, usableResult } from './helpers/fakeOrchestration.js'

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('Security & privacy', () => {
  it('never serializes passwordHash (toJSON transform strips it)', async () => {
    const app = createApp()
    await request(app).post('/api/auth/signup').send({ name: 'A', email: 'a@example.com', password: 'correcthorse' })
    const user = await User.findOne({ email: 'a@example.com' }).select('+passwordHash')

    expect(user.passwordHash).toBeDefined() // present in the DB (hashed)
    expect(JSON.stringify(user)).not.toContain('passwordHash') // but never serialized
    expect(user.toJSON()).not.toHaveProperty('passwordHash')
  })

  it('does not persist debug AI output in saved history', async () => {
    // Result carries a debugModelOutput field that must be stripped on save.
    const leaky = usableResult()
    leaky.rankedJobs[0].result = { workers: { skillMatch: { debugModelOutput: 'RAW_SECRET_PROMPT_ECHO' } } }
    const { orchestrationService } = makeFakeOrchestration('usable')
    orchestrationService.runMultiJob.mockResolvedValue(leaky)
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    const signup = await request(app).post('/api/auth/signup').send({ name: 'A', email: 'a@example.com', password: 'correcthorse' })
    await request(app)
      .post('/api/analysis/run')
      .set('Authorization', `Bearer ${signup.body.token}`)
      .send({
        normalizedResume: { originalText: 'x', evidence: [{ id: 'ev-001', text: 'x' }] },
        jobs: [{ title: 'Frontend Engineer', description: 'Build React interfaces.' }],
      })

    const record = await AnalysisHistory.findOne({})
    const serialized = JSON.stringify(record.result)
    expect(serialized).not.toContain('debugModelOutput')
    expect(serialized).not.toContain('RAW_SECRET_PROMPT_ECHO')
    // But the usable result itself is still stored (reopenable).
    expect(record.result.rankedJobs).toHaveLength(1)
  })
})
