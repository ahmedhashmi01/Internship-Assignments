import { describe, expect, it, vi } from 'vitest'
import { buildCandidateProfile, buildDeterministicCandidateProfile } from '../src/services/jobDiscovery/candidateProfile.js'
import { buildSearchQueries } from '../src/services/jobDiscovery/searchQueryBuilder.js'
import { searchJobs } from '../src/services/jobDiscovery/jobSearchService.js'
import { discoverJobs } from '../src/services/jobDiscovery/jobDiscoveryService.js'

const evidence = [
  { id: 'ev-001', text: 'Senior Frontend Engineer with 6 years building React and TypeScript applications.' },
  { id: 'ev-002', text: 'Built a Node.js and Express REST API used by 2M+ daily requests.' },
]

const jsonResponse = (body, { status = 200 } = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('buildCandidateProfile (AI-cost behavior)', () => {
  it('is fully deterministic with no aiService — zero AI calls', async () => {
    const profile = await buildCandidateProfile({ evidence })
    expect(profile.skills).toEqual(expect.arrayContaining(['React', 'TypeScript']))
    expect(profile.primaryRoleFamilies.length).toBeGreaterThan(0)
    expect(['junior', 'mid', 'senior', 'lead']).toContain(profile.seniority)
  })

  it('makes exactly ONE AI call when an aiService is provided (not demo mode)', async () => {
    const generateJson = vi.fn(async () => ({ primaryRoleFamilies: ['Frontend Engineering'], skills: ['React', 'TypeScript', 'Node.js'] }))
    await buildCandidateProfile({ evidence, aiService: { generateJson } })
    expect(generateJson).toHaveBeenCalledTimes(1)
  })

  it('never calls AI in demo mode, even when an aiService is provided', async () => {
    const generateJson = vi.fn()
    const profile = await buildCandidateProfile({ evidence, aiService: { generateJson }, demoMode: true })
    expect(generateJson).not.toHaveBeenCalled()
    expect(profile).toEqual(buildDeterministicCandidateProfile(evidence))
  })

  it('keeps the deterministic profile if the AI enrichment call fails — never blocks/throws', async () => {
    const generateJson = vi.fn(async () => { throw new Error('provider down') })
    const profile = await buildCandidateProfile({ evidence, aiService: { generateJson } })
    expect(profile).toEqual(buildDeterministicCandidateProfile(evidence))
  })
})

describe('buildSearchQueries', () => {
  it('builds at most 3 deterministic queries from role family / top skill / adjacent family', () => {
    const queries = buildSearchQueries({
      primaryRoleFamilies: ['Frontend Engineering'],
      adjacentRoleFamilies: ['Full Stack Engineering'],
      skills: ['React', 'TypeScript'],
      seniority: 'senior',
    })
    expect(queries.length).toBeLessThanOrEqual(3)
    expect(queries).toContain('Senior Frontend Engineer')
    expect(queries).toContain('React Engineer')
    expect(queries).toContain('Full Stack Engineer')
  })

  it('never exceeds 3 queries even with a rich profile, and de-duplicates', () => {
    const queries = buildSearchQueries({
      primaryRoleFamilies: ['Frontend Engineering'],
      adjacentRoleFamilies: ['Frontend Engineering'], // deliberately duplicate
      skills: [],
      seniority: 'senior',
    })
    expect(queries.length).toBeLessThanOrEqual(3)
    expect(new Set(queries.map((q) => q.toLowerCase())).size).toBe(queries.length)
  })

  it('falls back to a sane default for a completely empty profile', () => {
    expect(buildSearchQueries({})).toEqual(['Software Engineer'])
  })
})

describe('jobSearchService.searchJobs (provider fallback + mode)', () => {
  it('uses the demo catalog and mode "demo" when live discovery is disabled', async () => {
    const result = await searchJobs({ queries: ['Frontend Engineer'], config: { jobDiscoveryLiveEnabled: false } })
    expect(result.mode).toBe('demo')
    expect(result.sources).toEqual(['demo'])
    expect(result.jobs.length).toBeGreaterThan(0)
  })

  it('combines Adzuna + Remotive results across queries when live and both are configured', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('adzuna.com')) return jsonResponse({ results: [{ id: 1, title: 'Adzuna Job', company: {}, location: {}, description: 'x' }] })
      return jsonResponse({ jobs: [{ id: 2, title: 'Remotive Job', company_name: 'x', description: 'x' }] })
    })
    const config = { jobDiscoveryLiveEnabled: true, adzunaAppId: 'a', adzunaAppKey: 'b', remotiveEnabled: true, jobSearchTimeoutMs: 5000 }
    const result = await searchJobs({ queries: ['Frontend Engineer'], config, deps: { fetchImpl } })

    expect(result.mode).toBe('live')
    expect(result.sources.sort()).toEqual(['adzuna', 'remotive'])
    expect(result.jobs.map((j) => j.title).sort()).toEqual(['Adzuna Job', 'Remotive Job'])
  })

  it('falls back to the demo catalog (mode "demo-fallback") when every live provider call fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }))
    const config = { jobDiscoveryLiveEnabled: true, adzunaAppId: 'a', adzunaAppKey: 'b', remotiveEnabled: true, jobSearchTimeoutMs: 5000 }
    const result = await searchJobs({ queries: ['Frontend Engineer'], config, deps: { fetchImpl } })

    expect(result.mode).toBe('demo-fallback')
    expect(result.sources).toEqual(['demo'])
    expect(result.jobs.length).toBeGreaterThan(0)
  })

  it('does not hard-fail overall when only ONE provider fails — the other still contributes (live, not fallback)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('adzuna.com')) return new Response('', { status: 500 })
      return jsonResponse({ jobs: [{ id: 2, title: 'Remotive Job', company_name: 'x', description: 'x' }] })
    })
    const config = { jobDiscoveryLiveEnabled: true, adzunaAppId: 'a', adzunaAppKey: 'b', remotiveEnabled: true, jobSearchTimeoutMs: 5000 }
    const result = await searchJobs({ queries: ['Frontend Engineer'], config, deps: { fetchImpl } })

    expect(result.mode).toBe('live')
    expect(result.sources).toEqual(['remotive'])
  })

  it('falls back to demo when live is enabled but no provider is configured at all', async () => {
    const result = await searchJobs({ queries: ['x'], config: { jobDiscoveryLiveEnabled: true, remotiveEnabled: false } })
    expect(result.mode).toBe('demo-fallback')
  })
})

describe('discoverJobs (end-to-end orchestration)', () => {
  const liveConfigFor = (perQueryJobs) => {
    let call = 0
    const fetchImpl = vi.fn(async () => {
      const jobs = perQueryJobs[call] || []
      call += 1
      return jsonResponse({ results: jobs })
    })
    return { config: { jobDiscoveryLiveEnabled: true, adzunaAppId: 'a', adzunaAppKey: 'b', remotiveEnabled: false, jobSearchTimeoutMs: 5000, jobDiscoveryMaxResults: 20 }, fetchImpl }
  }

  const adzunaJob = (id, title) => ({ id, title, company: { display_name: 'Co' }, location: { display_name: 'London' }, description: 'React TypeScript role.' })

  it('displays exactly what was retrieved when under the cap: 4 retrieved → 4 displayed', async () => {
    const jobs = [adzunaJob(1, 'A'), adzunaJob(2, 'B'), adzunaJob(3, 'C'), adzunaJob(4, 'D')]
    const { config, fetchImpl } = liveConfigFor([jobs, [], []]) // 3 queries fire; only first has results
    const result = await discoverJobs({ evidence, preferences: {}, config, deps: { fetchImpl } })
    expect(result.totalRetrieved).toBe(4)
    expect(result.totalDisplayed).toBe(4)
    expect(result.results).toHaveLength(4)
  })

  it('10 retrieved → 10 displayed (never truncated to a top-3/top-4 subset)', async () => {
    const jobs = Array.from({ length: 10 }, (_, i) => adzunaJob(i + 1, `Job ${i + 1}`))
    const { config, fetchImpl } = liveConfigFor([jobs, [], []])
    const result = await discoverJobs({ evidence, preferences: {}, config, deps: { fetchImpl } })
    expect(result.totalDisplayed).toBe(10)
    expect(result.results).toHaveLength(10)
  })

  it('17 retrieved → 17 displayed', async () => {
    const jobs = Array.from({ length: 17 }, (_, i) => adzunaJob(i + 1, `Job ${i + 1}`))
    const { config, fetchImpl } = liveConfigFor([jobs, [], []])
    const result = await discoverJobs({ evidence, preferences: {}, config, deps: { fetchImpl } })
    expect(result.totalDisplayed).toBe(17)
  })

  it('caps display at the configured maximum when more than max are retrieved (50 → 20)', async () => {
    const jobs = Array.from({ length: 50 }, (_, i) => adzunaJob(i + 1, `Job ${i + 1}`))
    const { config, fetchImpl } = liveConfigFor([jobs, [], []])
    const result = await discoverJobs({ evidence, preferences: {}, config, deps: { fetchImpl } })
    expect(result.totalRetrieved).toBe(50)
    expect(result.totalDisplayed).toBe(20)
    expect(result.results).toHaveLength(20)
  })

  it('deduplicates a job returned by two different search queries before counting/displaying', async () => {
    const duplicate = adzunaJob(1, 'Same Job')
    const { config, fetchImpl } = liveConfigFor([[duplicate], [duplicate], []])
    const result = await discoverJobs({ evidence, preferences: {}, config, deps: { fetchImpl } })
    expect(result.totalRetrieved).toBe(1)
    expect(result.totalDisplayed).toBe(1)
  })

  it('sorts results by discoveryScore descending', async () => {
    const strong = { id: 1, title: 'Senior Frontend Engineer', company: { display_name: 'Co' }, location: { display_name: 'London' }, description: 'React TypeScript Node.js Jest CSS role, senior.' }
    const weak = { id: 2, title: 'Warehouse Operative', company: { display_name: 'Co' }, location: { display_name: 'Hull' }, description: 'Forklift operation and inventory.' }
    const { config, fetchImpl } = liveConfigFor([[weak, strong], [], []])
    const result = await discoverJobs({ evidence, preferences: {}, config, deps: { fetchImpl } })
    expect(result.results[0].title).toBe('Senior Frontend Engineer')
    expect(result.results[0].discoveryScore).toBeGreaterThanOrEqual(result.results[1].discoveryScore)
  })

  it('filters out jobs below preferences.minimumDiscoveryScore', async () => {
    const strong = { id: 1, title: 'Senior Frontend Engineer', company: { display_name: 'Co' }, location: { display_name: 'London' }, description: 'React TypeScript Node.js Jest CSS senior role.' }
    const weak = { id: 2, title: 'Warehouse Operative', company: { display_name: 'Co' }, location: { display_name: 'Hull' }, description: 'Forklift operation and inventory management.' }
    const { config, fetchImpl } = liveConfigFor([[weak, strong], [], []])
    const result = await discoverJobs({ evidence, preferences: { minimumDiscoveryScore: 50 }, config, deps: { fetchImpl } })
    expect(result.results.every((job) => job.discoveryScore >= 50)).toBe(true)
    expect(result.results.some((job) => job.title === 'Warehouse Operative')).toBe(false)
  })

  it('AI-cost: zero Claude/LLM calls per job — the aiService is only ever invoked for profile building, never per result', async () => {
    const jobs = Array.from({ length: 6 }, (_, i) => adzunaJob(i + 1, `Job ${i + 1}`))
    const { config, fetchImpl } = liveConfigFor([jobs, [], []])
    const generateJson = vi.fn(async () => ({ skills: ['React'] }))
    await discoverJobs({ evidence, preferences: {}, config, deps: { fetchImpl, aiService: { generateJson } } })
    expect(generateJson).toHaveBeenCalledTimes(1) // profile enrichment only, never once per job
  })

  it('reuses a passed-in candidateProfile and makes ZERO AI calls (changing only preferences never re-triggers enrichment)', async () => {
    const jobs = [adzunaJob(1, 'Job 1')]
    const { config, fetchImpl } = liveConfigFor([jobs, [], []])
    const generateJson = vi.fn()
    const existingProfile = buildDeterministicCandidateProfile(evidence)
    const result = await discoverJobs({
      candidateProfile: existingProfile,
      preferences: { location: 'London' },
      config,
      deps: { fetchImpl, aiService: { generateJson } },
    })
    expect(generateJson).not.toHaveBeenCalled()
    expect(result.candidateProfile).toEqual(existingProfile)
  })
})
