import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/server.js'
import { User } from '../src/models/User.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'

const app = createApp()

const signup = (body, headers = {}) =>
  request(app).post('/api/auth/signup').set(headers).send(body)
const login = (body) => request(app).post('/api/auth/login').send(body)

const validSignup = { name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'correcthorse' }

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('POST /api/auth/signup', () => {
  it('creates a user and returns a safe user object + token', async () => {
    const res = await signup(validSignup)

    expect(res.status).toBe(201)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' })
    expect(res.body.user.id).toEqual(expect.any(String))
    expect(res.body.user).not.toHaveProperty('passwordHash')
  })

  it('stores the password as a bcrypt hash, never plaintext', async () => {
    await signup(validSignup)
    const user = await User.findOne({ email: 'ada@example.com' }).select('+passwordHash')

    expect(user.passwordHash).toBeDefined()
    expect(user.passwordHash).not.toBe(validSignup.password)
    expect(user.passwordHash.startsWith('$2')).toBe(true)
  })

  it('rejects a duplicate email (exact case) with EMAIL_ALREADY_EXISTS', async () => {
    await signup(validSignup)
    const res = await signup(validSignup)

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS')
    expect(res.body.message).toMatch(/already exists/i)
  })

  it('rejects a duplicate email (different capitalization) with EMAIL_ALREADY_EXISTS', async () => {
    await signup(validSignup)
    const res = await signup({ ...validSignup, email: 'ADA@example.com' })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS')
  })

  it('cannot be bypassed by two concurrent signups with the same email (unique index)', async () => {
    // Build indexes so the DB-level unique constraint is enforced for the race.
    await User.init()
    const results = await Promise.allSettled([
      signup({ ...validSignup, email: 'race@example.com' }),
      signup({ ...validSignup, email: 'race@example.com' }),
    ])
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 500)).sort()

    // Exactly one account created (201), the other rejected as a duplicate (409).
    expect(statuses).toEqual([201, 409])
    expect(await User.countDocuments({ email: 'race@example.com' })).toBe(1)
  })

  it('rejects a too-short password with a validation error', async () => {
    const res = await signup({ ...validSignup, password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/auth/login', () => {
  it('returns a token + safe user for valid credentials', async () => {
    await signup(validSignup)
    const res = await login({ email: 'ada@example.com', password: 'correcthorse' })

    expect(res.status).toBe(200)
    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user.email).toBe('ada@example.com')
    expect(res.body.user).not.toHaveProperty('passwordHash')
  })

  it('rejects a bad password with a generic INVALID_CREDENTIALS error', async () => {
    await signup(validSignup)
    const res = await login({ email: 'ada@example.com', password: 'wrongpassword' })

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_CREDENTIALS')
    // Must not reveal that the account exists.
    expect(res.body.message).not.toMatch(/exist|found|registered/i)
  })

  it('returns the same generic error for an unknown email', async () => {
    const res = await login({ email: 'nobody@example.com', password: 'whatever123' })
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_CREDENTIALS')
  })
})

describe('GET /api/auth/me', () => {
  it('returns the current user when authenticated', async () => {
    const created = await signup(validSignup)
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${created.body.token}`)

    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('ada@example.com')
    expect(res.body.user).not.toHaveProperty('passwordHash')
  })

  it('rejects a request with no token (AUTH_REQUIRED)', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('AUTH_REQUIRED')
  })

  it('rejects a request with an invalid token (INVALID_TOKEN)', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.real.token')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })
})
