import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/server.js'

describe('POST /api/jobs/discover', () => {
  it('rejects a request with neither resume evidence nor a candidateProfile', async () => {
    const response = await request(createApp()).post('/api/jobs/discover').send({})
    expect(response.status).toBe(400)
  })

  it('returns the documented response shape in demo mode (live disabled by default)', async () => {
    // Pin the AI provider to mock AND explicitly disable live discovery —
    // relying on the config default here would silently inherit whatever a
    // developer's local .env has set for JOB_DISCOVERY_LIVE_ENABLED (a known
    // source of test flakiness), turning this into a real network call.
    const response = await request(createApp({ aiProvider: 'mock', jobDiscoveryLiveEnabled: false }))
      .post('/api/jobs/discover')
      .send({ resume: { evidence: [{ id: 'ev-001', text: 'Senior Frontend Engineer with React and TypeScript experience.' }] }, preferences: {} })

    expect(response.status).toBe(200)
    expect(response.body.mode).toBe('demo')
    expect(response.body.sources).toEqual(['demo'])
    expect(Array.isArray(response.body.searchQueries)).toBe(true)
    expect(response.body.searchQueries.length).toBeLessThanOrEqual(3)
    expect(response.body.totalDisplayed).toBe(response.body.results.length)
    expect(response.body.totalRetrieved).toBeGreaterThanOrEqual(response.body.totalDisplayed)
    expect(response.body.candidateProfile).toBeTruthy()
    // Every result carries source attribution — never presented as ours.
    response.body.results.forEach((job) => {
      expect(job).toHaveProperty('source')
      expect(job).toHaveProperty('discoveryScore')
      expect(job).toHaveProperty('components')
    })
  })

  it('never truncates to a hardcoded top-3/top-4 — displays every retrieved (deduped) result under the cap', async () => {
    const fakeDiscoverJobsFn = vi.fn(async () => ({
      mode: 'live',
      candidateProfile: { primaryRoleFamilies: [], adjacentRoleFamilies: [], skills: [], seniority: null },
      searchQueries: ['Frontend Engineer'],
      totalRetrieved: 13,
      totalDisplayed: 13,
      sources: ['adzuna'],
      results: Array.from({ length: 13 }, (_, i) => ({
        id: `demo-${i}`, source: 'adzuna', sourceJobId: String(i), sourceUrl: null,
        title: `Job ${i}`, company: null, location: null, description: null,
        workType: null, seniority: null, postedAt: null, salary: { min: null, max: null, currency: null },
        discoveryScore: 50, components: { skillOverlap: 50, roleAlignment: 50, seniorityAlignment: 50, preferenceAlignment: 50 },
        highlights: { matchedSkills: [], gapSkills: [] },
      })),
    }))

    const response = await request(createApp({}, { jobDiscoveryService: fakeDiscoverJobsFn }))
      .post('/api/jobs/discover')
      .send({ resume: { evidence: [{ id: 'ev-001', text: 'x' }] } })

    expect(response.status).toBe(200)
    expect(response.body.results).toHaveLength(13)
    expect(response.body.totalDisplayed).toBe(13)
  })

  it('normalizes a discovery-service failure to a clean error rather than crashing', async () => {
    const fakeDiscoverJobsFn = vi.fn(async () => { throw new Error('boom') })
    const response = await request(createApp({}, { jobDiscoveryService: fakeDiscoverJobsFn }))
      .post('/api/jobs/discover')
      .send({ resume: { evidence: [{ id: 'ev-001', text: 'x' }] } })
    expect(response.status).toBe(500)
  })
})

describe('Run Full Analysis reuses the EXISTING /api/analysis/run pipeline (no parallel implementation)', () => {
  it('accepts a job built from a discovered result exactly like a manually-entered job', async () => {
    // Simulates the frontend selecting a discovered job and feeding its
    // title/description into the pre-existing analysis endpoint — no new
    // "discovery analysis" route or logic exists.
    const discoveredJob = { title: 'Senior Frontend Engineer', description: 'React, TypeScript, and CI/CD experience required.' }
    const normalizedResume = {
      originalText: 'Senior Frontend Engineer with React and TypeScript experience.',
      evidence: [{ id: 'ev-001', text: 'Senior Frontend Engineer with React and TypeScript experience.' }],
    }

    const response = await request(createApp({ aiProvider: 'mock' }))
      .post('/api/analysis/run')
      .send({ normalizedResume, jobs: [discoveredJob] })

    expect(response.status).toBe(200)
    expect(response.body.rankedJobs).toHaveLength(1)
    expect(response.body.rankedJobs[0].jobTitle).toBe('Senior Frontend Engineer')
    // The full existing pipeline ran — Discovery Match never substitutes for it.
    expect(response.body.rankedJobs[0].scoreExplanation).toBeTruthy()
    expect(response.body.rankedJobs[0].readiness).toBeTruthy()
  })
})
