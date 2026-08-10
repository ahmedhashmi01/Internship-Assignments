import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'
import { AnalysisHistory } from '../src/models/AnalysisHistory.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'
import { makeFakeOrchestration } from './helpers/fakeOrchestration.js'

const { orchestrationService } = makeFakeOrchestration('usable')
const app = createApp({ guestAnalysisLimit: 1 }, { orchestrationService })

const validBody = {
  normalizedResume: {
    originalText: 'Experienced React developer.',
    evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
  },
  jobs: [{ title: 'Frontend Engineer', description: 'Build React interfaces.' }],
}

const registerUser = async (email) => {
  const res = await request(app).post('/api/auth/signup').send({ name: 'User', email, password: 'correcthorse' })
  return res.body.token
}

const runAs = (token, extraBody = {}) =>
  request(app).post('/api/analysis/run').set('Authorization', `Bearer ${token}`).send({ ...validBody, ...extraBody })

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('History authorization', () => {
  it('returns only the requesting user\'s own history', async () => {
    const tokenA = await registerUser('a@example.com')
    const tokenB = await registerUser('b@example.com')
    await runAs(tokenA)
    await runAs(tokenB)

    const res = await request(app).get('/api/history').set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    expect(res.body.history).toHaveLength(1)
  })

  it('cannot read another user\'s record (404 HISTORY_NOT_FOUND)', async () => {
    const tokenA = await registerUser('a@example.com')
    const tokenB = await registerUser('b@example.com')
    const bRun = await runAs(tokenB)
    const bRecordId = bRun.body.historyId

    const res = await request(app).get(`/api/history/${bRecordId}`).set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('HISTORY_NOT_FOUND')
  })

  it('cannot delete another user\'s record, and the record survives', async () => {
    const tokenA = await registerUser('a@example.com')
    const tokenB = await registerUser('b@example.com')
    const bRun = await runAs(tokenB)
    const bRecordId = bRun.body.historyId

    const res = await request(app).delete(`/api/history/${bRecordId}`).set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(404)
    expect(await AnalysisHistory.findById(bRecordId)).not.toBeNull()
  })

  it('a user can delete their own record', async () => {
    const tokenA = await registerUser('a@example.com')
    const aRun = await runAs(tokenA)
    const id = aRun.body.historyId

    const res = await request(app).delete(`/api/history/${id}`).set('Authorization', `Bearer ${tokenA}`)
    expect(res.status).toBe(200)
    expect(await AnalysisHistory.findById(id)).toBeNull()
  })

  it('requires authentication for all history endpoints', async () => {
    const res = await request(app).get('/api/history')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('AUTH_REQUIRED')
  })

  it('ignores a userId in the request body — ownership comes from the token, not the payload', async () => {
    const tokenA = await registerUser('a@example.com')
    const tokenB = await registerUser('b@example.com')
    // User A runs an analysis but tries to attribute it to user B via the body.
    const bMe = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokenB}`)
    const bId = bMe.body.user.id

    await runAs(tokenA, { userId: bId })

    const aHistory = await request(app).get('/api/history').set('Authorization', `Bearer ${tokenA}`)
    const bHistory = await request(app).get('/api/history').set('Authorization', `Bearer ${tokenB}`)
    // The record belongs to A (the authenticated caller), not B.
    expect(aHistory.body.history).toHaveLength(1)
    expect(bHistory.body.history).toHaveLength(0)
  })
})
