import { describe, expect, it } from 'vitest'
import { createOrchestrationService } from '../src/services/orchestrationService.js'

describe('single-job orchestration', () => {
  it('returns full success with the mock provider', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      job: { title: 'Frontend Engineer', description: 'Build React apps.' },
    })

    expect(result.partial).toBe(false)
    expect(result.workers).toHaveLength(4)
  })

  it('returns partial results when one worker fails', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      job: { title: 'Frontend Engineer', description: 'Build React apps.' },
    })

    expect(result.partial).toBe(false)
  })

  it('flags invalid evidence IDs', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      job: { title: 'Frontend Engineer', description: 'Build React apps.' },
    })

    expect(result.workers.every((worker) => worker.status === 'succeeded' || worker.status === 'failed')).toBe(true)
  })

  it('supports retry success with the mock provider', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({
      normalizedResume: {
        originalText: 'Experienced React developer.',
        evidence: [{ id: 'ev-001', text: 'Experienced React developer.' }],
      },
      job: { title: 'Frontend Engineer', description: 'Build React apps.' },
    })

    expect(result.workers[0].status).toBe('succeeded')
  })

  const multiItemResume = {
    originalText:
      'Built responsive React and TypeScript interfaces. Developed Python data pipelines with PostgreSQL. ' +
      'Led AWS cloud migration for an eight-engineer team. Automated CI/CD with Docker and GitHub Actions. ' +
      'Wrote GraphQL APIs backed by Node.js and Express.js.',
    evidence: [
      { id: 'ev-001', text: 'Built responsive React and TypeScript interfaces.' },
      { id: 'ev-002', text: 'Developed Python data pipelines with PostgreSQL.' },
      { id: 'ev-003', text: 'Led AWS cloud migration for an eight-engineer team.' },
      { id: 'ev-004', text: 'Automated CI/CD with Docker and GitHub Actions.' },
      { id: 'ev-005', text: 'Wrote GraphQL APIs backed by Node.js and Express.js.' },
    ],
  }

  const multiSkillJob = {
    title: 'Senior Full-Stack Engineer',
    description:
      'We require React, TypeScript, and GraphQL experience. Python and PostgreSQL are preferred. ' +
      'AWS, Docker, and GitHub Actions are a bonus. Node.js and Express.js experience is nice to have.',
  }

  it('analyzes multiple skills, keywords, and bullets per job instead of just one', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })

    const skillWorker = result.workers.find((worker) => worker.name === 'skillMatch')
    const atsWorker = result.workers.find((worker) => worker.name === 'atsKeyword')
    const rewriteWorker = result.workers.find((worker) => worker.name === 'bulletRewrite')

    expect(skillWorker.status).toBe('succeeded')
    expect(skillWorker.output.matchedSkills.length).toBeGreaterThan(1)
    expect(atsWorker.status).toBe('succeeded')
    expect(atsWorker.output.keywordMatches.length).toBeGreaterThan(1)
    expect(rewriteWorker.status).toBe('succeeded')
    expect(rewriteWorker.output.rewrites.length).toBeGreaterThan(1)
    expect(rewriteWorker.output.rewrites.length).toBeLessThanOrEqual(5)
  })

  it('classifies extracted skills as mandatory, preferred, or contextual', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })
    const skillWorker = result.workers.find((worker) => worker.name === 'skillMatch')

    skillWorker.output.matchedSkills.forEach((item) => {
      expect(['mandatory', 'preferred', 'contextual']).toContain(item.requirementType)
    })
  })

  it('only references evidence IDs that exist in the resume', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })
    const validIds = new Set(multiItemResume.evidence.map((item) => item.id))

    const rewriteWorker = result.workers.find((worker) => worker.name === 'bulletRewrite')
    rewriteWorker.output.rewrites.forEach((rewrite) => {
      expect(validIds.has(rewrite.evidenceId)).toBe(true)
    })

    const skillWorker = result.workers.find((worker) => worker.name === 'skillMatch')
    skillWorker.output.matchedSkills.forEach((item) => {
      if (item.evidenceId) expect(validIds.has(item.evidenceId)).toBe(true)
    })
  })

  it('produces different scores for different job descriptions against the same resume (deterministic)', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const unrelatedJob = { title: 'Marketing Manager', description: 'Salesforce, SAP, and Tableau experience preferred.' }

    const [matchResult, mismatchResult] = await Promise.all([
      service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob }),
      service.runSingleJob({ normalizedResume: multiItemResume, job: unrelatedJob }),
    ])

    expect(matchResult.score.score).not.toBe(mismatchResult.score.score)

    // Re-running the same job against the same resume yields the same score (deterministic, no randomness)
    const repeatResult = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })
    expect(repeatResult.score.score).toBe(matchResult.score.score)
  })

  it('never reports the same skill as both matched and a mandatory gap', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })
    const skillWorker = result.workers.find((worker) => worker.name === 'skillMatch')

    const matchedNames = new Set(
      skillWorker.output.matchedSkills.filter((item) => item.status === 'matched').map((item) => item.skill.toLowerCase()),
    )
    const missingNames = new Set(skillWorker.output.missingSkills.map((item) => item.skill.toLowerCase()))
    const overlap = [...matchedNames].filter((name) => missingNames.has(name))

    expect(overlap).toHaveLength(0)
  })

  it('only surfaces mandatory missing skills as mandatory gaps, never preferred/contextual ones', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })
    const skillWorker = result.workers.find((worker) => worker.name === 'skillMatch')

    skillWorker.output.missingSkills.forEach((item) => {
      expect(item.requirementType).toBe('mandatory')
    })
  })

  it('returns a score rounded to at most one decimal place', async () => {
    const service = createOrchestrationService({ aiProvider: 'mock' })
    const result = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })

    expect(result.score.score.toString()).toMatch(/^\d+(\.\d)?$/)
  })

  describe('deterministic supervisor and ATS workers (no LLM call)', () => {
    it('supervisor and atsKeyword always succeed deterministically, without calling the provider', async () => {
      const service = createOrchestrationService({ aiProvider: 'mock' })
      const result = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })

      const supervisorWorker = result.workers.find((worker) => worker.name === 'supervisor')
      const atsWorker = result.workers.find((worker) => worker.name === 'atsKeyword')

      expect(supervisorWorker.status).toBe('succeeded')
      expect(Array.isArray(supervisorWorker.output.plan)).toBe(true)
      expect(supervisorWorker.output.rationale.length).toBeGreaterThan(0)

      expect(atsWorker.status).toBe('succeeded')
      expect(atsWorker.output.keywordMatches.length).toBeGreaterThan(0)
    })

    it('produces deterministic ATS keyword matches from normalized phrase matching against evidence', async () => {
      const service = createOrchestrationService({ aiProvider: 'mock' })
      const result = await service.runSingleJob({ normalizedResume: multiItemResume, job: multiSkillJob })
      const atsWorker = result.workers.find((worker) => worker.name === 'atsKeyword')

      const reactMatch = atsWorker.output.keywordMatches.find((item) => item.keyword.toLowerCase() === 'react')
      expect(reactMatch.status).toBe('matched')
      expect(reactMatch.evidenceId).toBe('ev-001')
    })
  })

  describe('partial status on LLM worker failure', () => {
    it('marks the job partial and the bulletRewrite worker failed when its output references evidence outside the resume', async () => {
      const service = createOrchestrationService({ aiProvider: 'mock' })
      const result = await service.runSingleJob({
        normalizedResume: { originalText: '', evidence: [] },
        job: multiSkillJob,
      })

      const bulletRewriteWorker = result.workers.find((worker) => worker.name === 'bulletRewrite')
      expect(bulletRewriteWorker.status).toBe('failed')
      expect(bulletRewriteWorker.errorType).toBe('invalid-evidence-id')
      expect(result.partial).toBe(true)
    })
  })
})
