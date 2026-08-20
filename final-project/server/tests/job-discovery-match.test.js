import { describe, expect, it } from 'vitest'
import { scoreDiscoveryMatch, compareDiscoveryRank, extractJobSkills } from '../src/services/jobDiscovery/discoveryMatch.js'
import { buildNormalizedJob } from '../src/services/jobDiscovery/jobNormalization.js'

const candidateProfile = {
  primaryRoleFamilies: ['Frontend Engineering'],
  adjacentRoleFamilies: ['Full Stack Engineering'],
  skills: ['React', 'TypeScript', 'Node.js', 'CSS', 'Jest'],
  seniority: 'senior',
}

const job = (overrides = {}) =>
  buildNormalizedJob({
    source: 'demo', sourceJobId: '1', title: 'Senior Frontend Engineer', company: 'Acme', location: 'London',
    description: 'Build React and TypeScript interfaces with strong CI/CD and AWS exposure.',
    ...overrides,
  })

describe('scoreDiscoveryMatch', () => {
  it('produces a 0-100 discoveryScore with the four weighted components', () => {
    const scored = scoreDiscoveryMatch(job(), candidateProfile, {})
    expect(scored.discoveryScore).toBeGreaterThanOrEqual(0)
    expect(scored.discoveryScore).toBeLessThanOrEqual(100)
    expect(Object.keys(scored.components).sort()).toEqual(['preferenceAlignment', 'roleAlignment', 'seniorityAlignment', 'skillOverlap'])
  })

  it('never invents a full detailed-analysis score — only the four documented components feed it', () => {
    const scored = scoreDiscoveryMatch(job(), candidateProfile, {})
    const { skillOverlap, roleAlignment, seniorityAlignment, preferenceAlignment } = scored.components
    const expected = Math.round(skillOverlap * 0.4 + roleAlignment * 0.25 + seniorityAlignment * 0.2 + preferenceAlignment * 0.15)
    expect(scored.discoveryScore).toBe(expected)
  })

  it('reports matched and gap skills separately (Why it fits / Potential gaps)', () => {
    const scored = scoreDiscoveryMatch(job(), candidateProfile, {})
    expect(scored.highlights.matchedSkills).toEqual(expect.arrayContaining(['React', 'TypeScript']))
    expect(scored.highlights.gapSkills).toEqual(expect.arrayContaining(['AWS']))
    expect(scored.highlights.matchedSkills).not.toEqual(expect.arrayContaining(['AWS']))
  })

  it('scores role alignment higher for a title matching the primary role family', () => {
    const matching = scoreDiscoveryMatch(job({ title: 'Senior Frontend Engineer' }), candidateProfile, {})
    const unrelated = scoreDiscoveryMatch(job({ title: 'Warehouse Operative' }), candidateProfile, {})
    expect(matching.components.roleAlignment).toBeGreaterThan(unrelated.components.roleAlignment)
  })

  it('rewards preference alignment (work type + location) when they match', () => {
    const matches = scoreDiscoveryMatch(job({ workType: 'remote', location: 'London, UK' }), candidateProfile, { workTypes: ['remote'], location: 'London' })
    const mismatches = scoreDiscoveryMatch(job({ workType: 'onsite', location: 'Berlin' }), candidateProfile, { workTypes: ['remote'], location: 'London' })
    expect(matches.components.preferenceAlignment).toBeGreaterThan(mismatches.components.preferenceAlignment)
  })

  it('extracts job skills using the existing keyword utility (no separate/duplicated logic, no AI)', () => {
    const skills = extractJobSkills(job())
    expect(skills).toEqual(expect.arrayContaining(['React', 'TypeScript']))
  })
})

describe('compareDiscoveryRank (stable tie-break)', () => {
  const withScore = (discoveryScore, extra = {}) => ({
    discoveryScore,
    components: { skillOverlap: 50, roleAlignment: 50, ...extra },
    postedAt: null,
    __retrievalIndex: extra.__retrievalIndex ?? 0,
  })

  it('sorts by discoveryScore descending first', () => {
    const jobs = [withScore(60), withScore(90), withScore(75)]
    expect(jobs.slice().sort(compareDiscoveryRank).map((j) => j.discoveryScore)).toEqual([90, 75, 60])
  })

  it('breaks a discoveryScore tie by skillOverlap', () => {
    const a = { discoveryScore: 80, components: { skillOverlap: 90, roleAlignment: 50 }, __retrievalIndex: 0 }
    const b = { discoveryScore: 80, components: { skillOverlap: 60, roleAlignment: 50 }, __retrievalIndex: 1 }
    expect([b, a].sort(compareDiscoveryRank)).toEqual([a, b])
  })

  it('then by roleAlignment, then postedAt recency, then original retrieval order', () => {
    const older = { discoveryScore: 80, components: { skillOverlap: 50, roleAlignment: 50 }, postedAt: '2026-08-01T00:00:00Z', __retrievalIndex: 0 }
    const newer = { discoveryScore: 80, components: { skillOverlap: 50, roleAlignment: 50 }, postedAt: '2026-08-10T00:00:00Z', __retrievalIndex: 1 }
    expect([older, newer].sort(compareDiscoveryRank)).toEqual([newer, older])

    const first = { discoveryScore: 80, components: { skillOverlap: 50, roleAlignment: 50 }, postedAt: null, __retrievalIndex: 0 }
    const second = { discoveryScore: 80, components: { skillOverlap: 50, roleAlignment: 50 }, postedAt: null, __retrievalIndex: 1 }
    expect([second, first].sort(compareDiscoveryRank)).toEqual([first, second])
  })
})
