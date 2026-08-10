import { SupervisorAgent } from './agents/supervisorAgent.js'
import { SkillMatchAgent } from './agents/skillMatchAgent.js'
import { AtsKeywordAgent } from './agents/atsKeywordAgent.js'
import { BulletRewriteAgent } from './agents/bulletRewriteAgent.js'
import { createAiService } from './ai/providerService.js'
import { validateEvidenceId, validateRewriteIntegrity } from './antiFabricationValidation.js'
import { scoreSingleJob } from './scoringService.js'
import {
  extractPrimarySkill,
  extractPrimaryKeyword,
  pickMostRelevantEvidence,
  buildEvidenceSummary,
} from './jobInputExtractor.js'

const getRecommendationLabel = (score) => {
  if (score >= 80) return 'strong fit'
  if (score >= 60) return 'good fit'
  if (score >= 40) return 'stretch'
  return 'low fit'
}

const getStableJobRank = (jobA, jobB) => {
  if (jobA.score !== jobB.score) {
    return jobB.score - jobA.score
  }

  if (jobA.jobTitle !== jobB.jobTitle) {
    return jobA.jobTitle.localeCompare(jobB.jobTitle)
  }

  return jobA.jobId.localeCompare(jobB.jobId)
}

const collectMandatoryGaps = (singleJobResult) => {
  const skillWorker = singleJobResult?.workers?.find((worker) => worker.name === 'skillMatch')
  const skillOutput = skillWorker?.output || {}
  const missingSkills = Array.isArray(skillOutput.missingSkills) ? skillOutput.missingSkills : []

  return missingSkills
    .map((item) => item?.skill)
    .filter(Boolean)
}

export const createOrchestrationService = (config) => {
  const providerService = createAiService(config)
  const supervisorAgent = new SupervisorAgent(providerService, 'supervisor.prompt.md')
  const skillMatchAgent = new SkillMatchAgent(providerService, 'skill-match.prompt.md')
  const atsKeywordAgent = new AtsKeywordAgent(providerService, 'ats-keyword.prompt.md')
  const bulletRewriteAgent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')

  return {
    async runSingleJob({ normalizedResume, job }) {
      const evidenceIds = new Set(normalizedResume.evidence.map((item) => item.id))
      const startedAt = Date.now()
      const providerValidation = await providerService.healthCheck()

      // Derive real inputs from the submitted job description and resume evidence.
      const primarySkill = extractPrimarySkill(job.description)
      const primaryKeyword = extractPrimaryKeyword(job.description)
      const bestEvidence = pickMostRelevantEvidence(job.description, normalizedResume.evidence)
      const evidenceSummary = buildEvidenceSummary(normalizedResume.evidence)
      // Use the most-relevant evidence text as the bullet; fall back to the
      // first evidence item, then to a generic phrase if the resume is empty.
      const bulletText =
        bestEvidence?.text ||
        normalizedResume.evidence[0]?.text ||
        'Professional experience'

      const tasks = [
        {
          name: 'supervisor',
          task: () =>
            supervisorAgent.run({
              jobTitle: job.title,
              jobDescription: job.description,
              evidenceSummary,
            }),
        },
        {
          name: 'skillMatch',
          task: () =>
            skillMatchAgent.run({ skill: primarySkill, evidence: normalizedResume.evidence }),
        },
        {
          name: 'atsKeyword',
          task: () =>
            atsKeywordAgent.run({ keyword: primaryKeyword, evidence: normalizedResume.evidence }),
        },
        {
          name: 'bulletRewrite',
          task: () =>
            bulletRewriteAgent.run({
              bullet: bulletText,
              jobDescription: job.description,
              evidence: normalizedResume.evidence,
            }),
        },
      ]

      const results = await Promise.allSettled(tasks.map(async (entry) => {
        const taskStartedAt = Date.now()

        try {
          const result = await entry.task()
          return {
            name: entry.name,
            result,
            durationMs: Date.now() - taskStartedAt,
          }
        } catch (error) {
          return {
            name: entry.name,
            error,
            durationMs: Date.now() - taskStartedAt,
          }
        }
      }))

      const workers = results.map((settled, index) => {
        const entry = tasks[index]
        const workerBase = {
          name: entry.name,
          status: 'succeeded',
          durationMs: 0,
          errorType: null,
          errorMessage: null,
        }

        if (settled.status === 'fulfilled' && !settled.value.error) {
          const { result, durationMs } = settled.value
          const output = result
          const evidenceIdsInOutput = []

          if (output?.evidenceId) {
            evidenceIdsInOutput.push(output.evidenceId)
          }

          if (Array.isArray(output?.matchedSkills)) {
            output.matchedSkills.forEach((item) => {
              if (item?.evidenceId) {
                evidenceIdsInOutput.push(item.evidenceId)
              }
            })
          }

          if (Array.isArray(output?.missingSkills)) {
            output.missingSkills.forEach((item) => {
              if (item?.evidenceId) {
                evidenceIdsInOutput.push(item.evidenceId)
              }
            })
          }

          if (Array.isArray(output?.keywordMatches)) {
            output.keywordMatches.forEach((item) => {
              if (item?.evidenceId) {
                evidenceIdsInOutput.push(item.evidenceId)
              }
            })
          }

          if (Array.isArray(output?.rewrites)) {
            output.rewrites.forEach((item) => {
              if (item?.evidenceId) {
                evidenceIdsInOutput.push(item.evidenceId)
              }
            })
          }

          const invalidEvidence = evidenceIdsInOutput.filter((item) => !evidenceIds.has(item))

          if (invalidEvidence.length > 0) {
            workerBase.status = 'failed'
            workerBase.errorType = 'invalid-evidence-id'
            workerBase.errorMessage = 'Evidence ID does not exist in normalized resume'
          } else {
            if (Array.isArray(output?.rewrites)) {
              const validatedRewrites = output.rewrites.map((rewrite) => {
                try {
                  const evidenceValidation = validateEvidenceId(rewrite?.evidenceId, evidenceIds)
                  const integrityValidation = validateRewriteIntegrity(rewrite, normalizedResume.evidence)
                  const flags = Array.from(new Set([...evidenceValidation.flags, ...integrityValidation.flags]))

                  return {
                    ...rewrite,
                    validation: {
                      valid: evidenceValidation.valid && integrityValidation.valid,
                      flags,
                      riskStatus: flags.length === 0 ? 'low' : flags.some((flag) => flag === 'invalid-evidence-id' || flag === 'invented-metric' || flag === 'invented-date-or-year' || flag === 'invented-currency') ? 'high' : 'medium',
                    },
                  }
                } catch {
                  return {
                    ...rewrite,
                    validation: {
                      valid: false,
                      flags: ['validation-error'],
                      riskStatus: 'high',
                    },
                  }
                }
              })

              output.rewrites = validatedRewrites
              output.antiFabricationValidation = {
                valid: validatedRewrites.every((rewrite) => rewrite.validation.valid),
                flags: Array.from(new Set(validatedRewrites.flatMap((rewrite) => rewrite.validation.flags))),
                riskStatus: validatedRewrites.some((rewrite) => rewrite.validation.riskStatus === 'high') ? 'high' : validatedRewrites.some((rewrite) => rewrite.validation.riskStatus === 'medium') ? 'medium' : 'low',
              }
            }

            workerBase.output = output
            workerBase.durationMs = durationMs
          }

          return workerBase
        }

        const failureDurationMs = settled.status === 'fulfilled' ? settled.value.durationMs : 0
        workerBase.status = 'failed'
        workerBase.errorType = 'worker-error'
        workerBase.errorMessage = settled.status === 'fulfilled'
          ? settled.value.error?.message || 'Unknown worker failure'
          : settled.reason?.message || 'Unknown worker failure'
        workerBase.durationMs = failureDurationMs
        return workerBase
      })

      const bulletRewriteOutput = workers.find((worker) => worker.name === 'bulletRewrite')?.output || {}
      const skillMatchOutput = workers.find((worker) => worker.name === 'skillMatch')?.output || {}
      const atsOutput = workers.find((worker) => worker.name === 'atsKeyword')?.output || {}
      const finalReport = {
        jobTitle: job.title,
        summary: 'Single-job analysis completed',
        rewrites: bulletRewriteOutput.rewrites || [],
        antiFabricationValidation: bulletRewriteOutput.antiFabricationValidation || {
          valid: true,
          flags: [],
          riskStatus: 'low',
        },
      }

      const skillMatches = Array.isArray(skillMatchOutput.matchedSkills)
        ? skillMatchOutput.matchedSkills
        : [skillMatchOutput].filter(Boolean)
      const keywordMatches = Array.isArray(atsOutput.keywordMatches)
        ? atsOutput.keywordMatches
        : [atsOutput].filter(Boolean)
      const scoreResult = scoreSingleJob({
        skillMatches,
        keywordMatches,
        workers,
      })

      const validationSummary = {
        supervisor: {
          valid: workers.find((worker) => worker.name === 'supervisor')?.status === 'succeeded',
          flags: workers.find((worker) => worker.name === 'supervisor')?.status === 'succeeded' ? [] : ['worker-failed'],
          riskStatus: workers.find((worker) => worker.name === 'supervisor')?.status === 'succeeded' ? 'low' : 'high',
        },
        skill: {
          valid: workers.find((worker) => worker.name === 'skillMatch')?.status === 'succeeded',
          flags: workers.find((worker) => worker.name === 'skillMatch')?.status === 'succeeded' ? [] : ['worker-failed'],
          riskStatus: workers.find((worker) => worker.name === 'skillMatch')?.status === 'succeeded' ? 'low' : 'high',
        },
        ats: {
          valid: workers.find((worker) => worker.name === 'atsKeyword')?.status === 'succeeded',
          flags: workers.find((worker) => worker.name === 'atsKeyword')?.status === 'succeeded' ? [] : ['worker-failed'],
          riskStatus: workers.find((worker) => worker.name === 'atsKeyword')?.status === 'succeeded' ? 'low' : 'high',
        },
        rewrite: {
          valid: workers.find((worker) => worker.name === 'bulletRewrite')?.status === 'succeeded',
          flags: workers.find((worker) => worker.name === 'bulletRewrite')?.status === 'succeeded' ? [] : ['worker-failed'],
          riskStatus: workers.find((worker) => worker.name === 'bulletRewrite')?.status === 'succeeded' ? 'low' : 'high',
        },
        antiFabrication: bulletRewriteOutput.antiFabricationValidation || {
          valid: true,
          flags: [],
          riskStatus: 'low',
        },
        scoring: {
          valid: true,
          flags: [],
          riskStatus: 'low',
        },
      }

      return {
        jobTitle: job.title,
        workers,
        finalReport,
        score: scoreResult,
        validationSummary,
        providerValidation,
        totalDurationMs: Date.now() - startedAt,
        partial: workers.some((worker) => worker.status === 'failed'),
      }
    },

    async runMultiJob({ normalizedResume, jobs }) {
      if (!normalizedResume || !Array.isArray(jobs) || jobs.length < 1 || jobs.length > 3) {
        throw new Error('normalizedResume and 1-3 jobs are required')
      }

      const startedAt = Date.now()
      const jobResults = await Promise.allSettled(
        jobs.map(async (job, index) => ({
          jobId: `job-${String(index + 1).padStart(2, '0')}`,
          job,
          result: await this.runSingleJob({ normalizedResume, job }),
        })),
      )

      const successfulJobs = []
      const failedJobs = []

      jobResults.forEach((settled, index) => {
        const job = jobs[index]
        if (settled.status === 'fulfilled') {
          const payload = settled.value
          successfulJobs.push({
            jobId: `job-${String(index + 1).padStart(2, '0')}`,
            jobTitle: payload.jobTitle || job.title,
            jobDescription: job.description,
            score: payload.result?.score?.score ?? 0,
            scoreDrivers: payload.result?.score?.scoreDrivers || [],
            mandatoryGaps: collectMandatoryGaps(payload.result),
            recommendationLabel: getRecommendationLabel(payload.result?.score?.score ?? 0),
            status: 'succeeded',
            result: payload.result,
          })
        } else {
          failedJobs.push({
            jobId: `job-${String(index + 1).padStart(2, '0')}`,
            jobTitle: job.title,
            jobDescription: job.description,
            status: 'failed',
            errorMessage: settled.reason?.message || 'Unknown job failure',
          })
        }
      })

      const rankedJobs = successfulJobs
        .slice()
        .sort(getStableJobRank)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }))

      const recurringGaps = Array.from(
        successfulJobs.reduce((accumulator, jobResult) => {
          const gaps = jobResult.mandatoryGaps || []
          gaps.forEach((gap) => {
            accumulator.set(gap, (accumulator.get(gap) || 0) + 1)
          })
          return accumulator
        }, new Map()),
      )
        .filter(([, count]) => count > 1)
        .map(([gap, count]) => ({ gap, count }))

      const recommendations = rankedJobs.map((jobResult) => ({
        jobId: jobResult.jobId,
        jobTitle: jobResult.jobTitle,
        recommendationLabel: jobResult.recommendationLabel,
        score: jobResult.score,
      }))

      return {
        jobs: successfulJobs.map((jobResult) => ({
          jobId: jobResult.jobId,
          jobTitle: jobResult.jobTitle,
          jobDescription: jobResult.jobDescription,
          score: jobResult.score,
          scoreDrivers: jobResult.scoreDrivers,
          recommendationLabel: jobResult.recommendationLabel,
          mandatoryGaps: jobResult.mandatoryGaps,
          status: 'succeeded',
        })),
        rankedJobs,
        recommendations,
        failedJobs,
        recurringGaps,
        partial: failedJobs.length > 0,
        overallStatus: failedJobs.length > 0 ? 'partial' : 'complete',
        totalDurationMs: Date.now() - startedAt,
        providerValidation: successfulJobs[0]?.result.providerValidation || null,
      }
    },
  }
}
