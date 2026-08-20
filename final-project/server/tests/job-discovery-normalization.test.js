import { describe, expect, it } from 'vitest'
import { buildNormalizedJob, sanitizeExternalUrl, inferSeniority, normalizeWorkType, fingerprintOf } from '../src/services/jobDiscovery/jobNormalization.js'
import { dedupeJobs } from '../src/services/jobDiscovery/dedupe.js'

describe('job normalization', () => {
  it('returns null (never invents) for fields the source did not provide', () => {
    const job = buildNormalizedJob({ source: 'adzuna', sourceJobId: '1', title: 'Engineer', company: null, location: null, description: null })
    expect(job.company).toBeNull()
    expect(job.location).toBeNull()
    expect(job.description).toBeNull()
    expect(job.salary).toEqual({ min: null, max: null, currency: null })
    expect(job.postedAt).toBeNull()
  })

  it('only ever allows http/https source URLs', () => {
    expect(sanitizeExternalUrl('https://example.com/job/1')).toBe('https://example.com/job/1')
    expect(sanitizeExternalUrl('http://example.com/job/1')).toBe('http://example.com/job/1')
    expect(sanitizeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeExternalUrl('ftp://example.com/x')).toBeNull()
    expect(sanitizeExternalUrl('not a url')).toBeNull()
    expect(sanitizeExternalUrl(null)).toBeNull()
  })

  it('infers seniority deterministically from title/description text only when there is a clear signal', () => {
    expect(inferSeniority('Senior Backend Engineer')).toBe('senior')
    expect(inferSeniority('Junior Developer')).toBe('junior')
    expect(inferSeniority('Principal Engineer')).toBe('lead')
    expect(inferSeniority('Software Engineer')).toBeNull()
  })

  it('normalizes free-text work type into the enum, or null when unrecognized', () => {
    expect(normalizeWorkType('Remote')).toBe('remote')
    expect(normalizeWorkType('Hybrid working')).toBe('hybrid')
    expect(normalizeWorkType('On-site only')).toBe('onsite')
    expect(normalizeWorkType('')).toBeNull()
    expect(normalizeWorkType(undefined)).toBeNull()
  })

  it('produces a stable, comparable fingerprint from title|company|location', () => {
    expect(fingerprintOf({ title: 'Senior Frontend Engineer', company: 'Example Ltd', location: 'London' }))
      .toBe('senior-frontend-engineer|example-ltd|london')
  })
})

describe('dedupeJobs', () => {
  it('keeps one entry when the same sourceJobId appears twice (two search queries found it)', () => {
    const jobs = [
      buildNormalizedJob({ source: 'adzuna', sourceJobId: '42', title: 'A', company: 'B', location: 'C' }),
      buildNormalizedJob({ source: 'adzuna', sourceJobId: '42', title: 'A', company: 'B', location: 'C' }),
    ]
    expect(dedupeJobs(jobs)).toHaveLength(1)
  })

  it('falls back to a normalized title|company|location fingerprint when there is no sourceJobId', () => {
    const jobs = [
      buildNormalizedJob({ source: 'remotive', sourceJobId: null, title: 'Senior Frontend Engineer', company: 'Example Ltd', location: 'London' }),
      buildNormalizedJob({ source: 'remotive', sourceJobId: null, title: '  Senior   Frontend Engineer ', company: 'Example Ltd', location: 'London' }),
    ]
    expect(dedupeJobs(jobs)).toHaveLength(1)
  })

  it('does not merge genuinely different jobs', () => {
    const jobs = [
      buildNormalizedJob({ source: 'adzuna', sourceJobId: '1', title: 'Frontend Engineer', company: 'A', location: 'London' }),
      buildNormalizedJob({ source: 'adzuna', sourceJobId: '2', title: 'Backend Engineer', company: 'B', location: 'Bristol' }),
    ]
    expect(dedupeJobs(jobs)).toHaveLength(2)
  })

  it('preserves first-occurrence order', () => {
    const jobs = [
      buildNormalizedJob({ source: 'adzuna', sourceJobId: '1', title: 'First', company: 'A', location: 'X' }),
      buildNormalizedJob({ source: 'adzuna', sourceJobId: '2', title: 'Second', company: 'B', location: 'Y' }),
      buildNormalizedJob({ source: 'adzuna', sourceJobId: '1', title: 'First', company: 'A', location: 'X' }),
    ]
    const result = dedupeJobs(jobs)
    expect(result.map((j) => j.title)).toEqual(['First', 'Second'])
  })
})
