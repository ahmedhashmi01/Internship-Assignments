import { describe, expect, it } from 'vitest'
import { isWeakJwtSecret, validateStartupConfig } from '../src/config/validateStartup.js'

const strongSecret = 'k9f2X'.repeat(8) // 40 chars, non-placeholder

describe('validateStartupConfig (production guards)', () => {
  it('rejects a missing MONGODB_URI in production', () => {
    expect(() =>
      validateStartupConfig({ config: { mongodbUri: '', jwtSecret: strongSecret }, nodeEnv: 'production' }),
    ).toThrow(/MONGODB_URI/)
  })

  it('rejects a weak/default JWT secret in production', () => {
    expect(() =>
      validateStartupConfig({
        config: { mongodbUri: 'mongodb://db/app', jwtSecret: 'dev-insecure-secret-change-me' },
        nodeEnv: 'production',
      }),
    ).toThrow(/JWT_SECRET/)
  })

  it('reports all problems at once', () => {
    expect(() =>
      validateStartupConfig({ config: { mongodbUri: '', jwtSecret: '' }, nodeEnv: 'production' }),
    ).toThrow(/MONGODB_URI[\s\S]*JWT_SECRET/)
  })

  it('passes with a valid production config', () => {
    expect(() =>
      validateStartupConfig({ config: { mongodbUri: 'mongodb://db/app', jwtSecret: strongSecret }, nodeEnv: 'production' }),
    ).not.toThrow()
  })

  it('does nothing outside production (stateless dev/test stays allowed)', () => {
    expect(() =>
      validateStartupConfig({ config: { mongodbUri: '', jwtSecret: '' }, nodeEnv: 'development' }),
    ).not.toThrow()
    expect(() =>
      validateStartupConfig({ config: { mongodbUri: '', jwtSecret: '' }, nodeEnv: 'test' }),
    ).not.toThrow()
  })
})

describe('isWeakJwtSecret', () => {
  it('flags empty, placeholder, and short secrets', () => {
    expect(isWeakJwtSecret('')).toBe(true)
    expect(isWeakJwtSecret('dev-insecure-secret-change-me')).toBe(true)
    expect(isWeakJwtSecret('changeme')).toBe(true)
    expect(isWeakJwtSecret('secret')).toBe(true)
    expect(isWeakJwtSecret('short-secret')).toBe(true)
  })

  it('accepts a long, non-placeholder secret', () => {
    expect(isWeakJwtSecret(strongSecret)).toBe(false)
  })
})
