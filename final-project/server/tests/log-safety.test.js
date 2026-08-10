import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/server.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('Log safety', () => {
  it('never writes passwords, hashes, tokens, or Authorization headers to logs', async () => {
    const app = createApp()
    const password = 'SuperSecret!2345'

    const logs = []
    const capture = (...args) => logs.push(args.map(String).join(' '))
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(capture),
      vi.spyOn(console, 'error').mockImplementation(capture),
      vi.spyOn(console, 'warn').mockImplementation(capture),
      vi.spyOn(console, 'info').mockImplementation(capture),
    ]

    try {
      const signup = await request(app)
        .post('/api/auth/signup')
        .set('X-Guest-Id', 'guest-log')
        .send({ name: 'Ada', email: 'ada@example.com', password })
      const token = signup.body.token

      // Successful login, a failed login, and an authenticated call.
      await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password })
      await request(app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'wrongwrong' })
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)

      const output = logs.join('\n')
      expect(output).not.toContain(password)
      expect(output).not.toContain(token)
      expect(output).not.toMatch(/\$2[aby]\$/) // bcrypt hash signature
      expect(output).not.toMatch(/Bearer\s/)
      expect(output.toLowerCase()).not.toContain('authorization')
    } finally {
      spies.forEach((s) => s.mockRestore())
    }
  })
})
