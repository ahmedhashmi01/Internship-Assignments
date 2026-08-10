import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'
import { GuestUsage } from '../src/models/GuestUsage.js'
import { AnalysisHistory } from '../src/models/AnalysisHistory.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'
import { makeFakeOrchestration } from './helpers/fakeOrchestration.js'

const validBody = {
  normalizedResume: {
    originalText: 'Experienced React developer.',
    evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
  },
  jobs: [{ title: 'Frontend Engineer', description: 'Build React interfaces.' }],
}

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('Guest → registered user conversion', () => {
  const guestId = 'guest-convert-1'

  const doGuestAnalysis = (app) =>
    request(app).post('/api/analysis/run').set('X-Guest-Id', guestId).send(validBody)

  it('transfers the guest analysis to the new account without duplicating it, and marks usage converted', async () => {
    const { orchestrationService } = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    // 1. Guest runs their free analysis (saved under guestId).
    const analysis = await doGuestAnalysis(app)
    expect(analysis.status).toBe(200)
    const guestRecords = await AnalysisHistory.find({ guestId })
    expect(guestRecords).toHaveLength(1)

    // 2. Guest signs up, carrying the same guest identity.
    const signup = await request(app)
      .post('/api/auth/signup')
      .set('X-Guest-Id', guestId)
      .send({ name: 'New User', email: 'new@example.com', password: 'correcthorse' })
    expect(signup.status).toBe(201)
    const userId = signup.body.user.id
    const token = signup.body.token

    // 3. The record now belongs to the user, guest ownership cleared, no duplicate.
    const total = await AnalysisHistory.countDocuments({})
    expect(total).toBe(1)
    const migrated = await AnalysisHistory.findOne({})
    expect(migrated.userId.toString()).toBe(userId)
    expect(migrated.guestId).toBeNull()

    // 4. Guest usage is marked converted.
    const usage = await GuestUsage.findOne({ guestId })
    expect(usage.convertedUserId.toString()).toBe(userId)

    // 5. The migrated analysis is visible in the registered user's history.
    const history = await request(app).get('/api/history').set('Authorization', `Bearer ${token}`)
    expect(history.status).toBe(200)
    expect(history.body.history).toHaveLength(1)
  })

  it('lets a converted user run further analyses (no longer guest-limited)', async () => {
    const { orchestrationService } = makeFakeOrchestration('usable')
    const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

    await doGuestAnalysis(app) // uses the single guest allowance
    const signup = await request(app)
      .post('/api/auth/signup')
      .set('X-Guest-Id', guestId)
      .send({ name: 'New User', email: 'again@example.com', password: 'correcthorse' })
    const token = signup.body.token

    // Authenticated analysis is allowed even though the guest allowance is spent.
    const res = await request(app)
      .post('/api/analysis/run')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Guest-Id', guestId)
      .send(validBody)
    expect(res.status).toBe(200)
    expect(res.body.rankedJobs).toHaveLength(1)
  })
})
