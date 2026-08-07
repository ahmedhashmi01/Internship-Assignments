import { describe, expect, it } from 'vitest'
import { redactSensitiveText, redactDeep } from '../src/utils/redact.js'

describe('redactSensitiveText', () => {
  it('redacts email addresses', () => {
    expect(redactSensitiveText('Contact me at jane.doe@example.com for details')).toBe('Contact me at [redacted-email] for details')
  })

  it('redacts phone numbers', () => {
    expect(redactSensitiveText('Call 555-123-4567 anytime')).toBe('Call [redacted-phone] anytime')
    expect(redactSensitiveText('Call (555) 123-4567 anytime')).toBe('Call [redacted-phone] anytime')
  })

  it('redacts URLs', () => {
    expect(redactSensitiveText('Portfolio at https://janedoe.dev/portfolio')).toBe('Portfolio at [redacted-url]')
    expect(redactSensitiveText('See www.example.com for more')).toBe('See [redacted-url] for more')
  })

  it('redacts physical street addresses', () => {
    expect(redactSensitiveText('Lives at 123 Main Street, hometown')).toBe('Lives at [redacted-address], hometown')
    expect(redactSensitiveText('742 Evergreen Avenue')).toBe('[redacted-address]')
  })

  it('leaves ordinary evidence/requirement text untouched', () => {
    const text = 'Built responsive React interfaces for an internal analytics dashboard.'
    expect(redactSensitiveText(text)).toBe(text)
  })

  it('leaves evidence IDs untouched (not mistaken for phone numbers)', () => {
    expect(redactSensitiveText('Matched via ev-001 and ev-002')).toBe('Matched via ev-001 and ev-002')
  })

  it('passes through non-string values unchanged', () => {
    expect(redactSensitiveText(42)).toBe(42)
    expect(redactSensitiveText(null)).toBeNull()
    expect(redactSensitiveText(undefined)).toBeUndefined()
  })

  it('redacts multiple categories in the same string', () => {
    const result = redactSensitiveText('Email jane@example.com or call 555-987-6543, portfolio at https://jane.dev')
    expect(result).not.toContain('jane@example.com')
    expect(result).not.toContain('555-987-6543')
    expect(result).not.toContain('https://jane.dev')
    expect(result).toContain('[redacted-email]')
    expect(result).toContain('[redacted-phone]')
    expect(result).toContain('[redacted-url]')
  })
})

describe('redactDeep', () => {
  it('redacts string values recursively through nested objects and arrays', () => {
    const input = {
      rewrites: [
        { originalText: 'Reach me at jane@example.com', notes: 'call 555-222-3333' },
        { originalText: 'clean text', notes: null },
      ],
      contact: { email: 'test@example.org' },
    }

    const result = redactDeep(input)

    expect(result.rewrites[0].originalText).toBe('Reach me at [redacted-email]')
    expect(result.rewrites[0].notes).toBe('call [redacted-phone]')
    expect(result.rewrites[1].originalText).toBe('clean text')
    expect(result.contact.email).toBe('[redacted-email]')
  })

  it('leaves numbers, booleans, and null untouched', () => {
    expect(redactDeep({ confidence: 0.9, matched: true, evidenceId: null })).toEqual({ confidence: 0.9, matched: true, evidenceId: null })
  })
})
