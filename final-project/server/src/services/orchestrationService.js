import { SupervisorAgent } from './agents/supervisorAgent.js'
import { SkillMatchAgent } from './agents/skillMatchAgent.js'
import { AtsKeywordAgent } from './agents/atsKeywordAgent.js'
import { BulletRewriteAgent } from './agents/bulletRewriteAgent.js'
import { createAiService } from './ai/providerService.js'
import { validateEvidenceId, validateRewriteIntegrity } from './antiFabricationValidation.js'
import { computeNeedsReview } from './rewriteApproval.js'
import { scoreSingleJob } from './scoringService.js'
import {
  extractRequirements,
  extractKeywords,
  pickTopEvidenceItems,
  buildEvidenceSummary,
} from './jobInputExtractor.js'
import { timingLog } from '../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

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
  // supervisor and atsKeyword are deterministic (no LLM call, no prompt file
  // needed) — only skillMatch and bulletRewrite still call providerService.
  const supervisorAgent = new SupervisorAgent()
  const skillMatchAgent = new SkillMatchAgent(providerService, 'skill-match.prompt.md')
  const atsKeywordAgent = new AtsKeywordAgent()
  const bulletRewriteAgent = new BulletRewriteAgent(providerService, 'bullet-rewrite.prompt.md')

  return {
    async runSingleJob({ normalizedResume, job }) {
      const evidenceIds = new Set(normalizedResume.evidence.map((item) => item.id))
      const startedAt = Date.now()
      timingLog('runSingleJob START', { job: job.title })

      const healthCheckStartedAt = Date.now()
      const providerValidation = await providerService.healthCheck()
      timingLog('healthCheck', { durationMs: Date.now() - healthCheckStartedAt, ok: providerValidation.ok })

      // Derive real inputs from the submitted job description and resume evidence.
      const extractionStartedAt = Date.now()
      const requirements = extractRequirements(job.description, 10)
      const keywords = extractKeywords(job.description, 15)
      // Capped at 2 (not the schema's max of 5): the local Ollama bullet-rewrite
      // worker generates overly long/malformed JSON and times out on larger
      // batches — see bulletRewriteAgent.js for the per-bullet fallback that
      // also protects against this.
      const topEvidence = pickTopEvidenceItems(job.description, normalizedResume.evidence, 2)
      const evidenceSummary = buildEvidenceSummary(normalizedResume.evidence)
      // Use the most-relevant evidence texts as the bullets to rewrite; fall
      // back to a generic phrase only when the resume has no evidence at all.
      const bulletTexts =
        topEvidence.length > 0
          ? topEvidence.map((item) => item.text)
          : [normalizedResume.evidence[0]?.text || 'Professional experience']
      timingLog('input extraction (prompt construction inputs)', {
        durationMs: Date.now() - extractionStartedAt,
        requirements: requirements.length,
        keywords: keywords.length,
        bullets: bulletTexts.length,
        evidenceItems: normalizedResume.evidence.length,
      })

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
            skillMatchAgent.run({ requirements, evidence: normalizedResume.evidence }),
        },
        {
          name: 'atsKeyword',
          task: () =>
            atsKeywordAgent.run({ keywords, evidence: normalizedResume.evidence }),
        },
        {
          name: 'bulletRewrite',
          task: () =>
            bulletRewriteAgent.run({
              bullets: bulletTexts,
              jobDescription: job.description,
              keywords,
              evidence: normalizedResume.evidence,
            }),
        },
      ]

      const results = await Promise.allSettled(tasks.map(async (entry) => {
        const taskStartedAt = Date.now()
        timingLog('worker START', { name: entry.name, tPlusMs: taskStartedAt - startedAt })

        try {
          const result = await entry.task()
          const durationMs = Date.now() - taskStartedAt
          timingLog('worker END', { name: entry.name, durationMs, status: 'succeeded' })
          return {
            name: entry.name,
            result,
            durationMs,
          }
        } catch (error) {
          const durationMs = Date.now() - taskStartedAt
          timingLog('worker END', { name: entry.name, durationMs, status: 'failed', error: error.message })
          return {
            name: entry.name,
            error,
            durationMs,
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
                      // Blocks default approval in the UI — see rewriteApproval.js.
                      needsReview: computeNeedsReview(flags),
                    },
                  }
                } catch {
                  return {
                    ...rewrite,
                    validation: {
                      valid: false,
                      flags: ['validation-error'],
                      riskStatus: 'high',
                      needsReview: true,
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

      const scoringStartedAt = Date.now()
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

      const skillMatches = Array.isArray(skillMatchOutput.matchedSkills) ? skillMatchOutput.matchedSkills : []
      const keywordMatches = Array.isArray(atsOutput.keywordMatches) ? atsOutput.keywordMatches : []
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

      timingLog('scoring + final assembly', { durationMs: Date.now() - scoringStartedAt })

      const totalDurationMs = Date.now() - startedAt
      timingLog('runSingleJob END', { job: job.title, totalDurationMs })

      return {
        jobTitle: job.title,
        workers,
        finalReport,
        score: scoreResult,
        validationSummary,
        providerValidation,
        totalDurationMs,
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
            // A job that ran to completion but had a worker (e.g. skillMatch,
            // bulletRewrite) fail internally must not be reported as a plain
            // 'succeeded' — that hid partial results behind a "complete" status.
            status: payload.result?.partial ? 'partial' : 'succeeded',
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

      const anyJobPartial = successfulJobs.some((jobResult) => jobResult.status === 'partial')
      const overallPartial = failedJobs.length > 0 || anyJobPartial

      return {
        jobs: successfulJobs.map((jobResult) => ({
          jobId: jobResult.jobId,
          jobTitle: jobResult.jobTitle,
          jobDescription: jobResult.jobDescription,
          score: jobResult.score,
          scoreDrivers: jobResult.scoreDrivers,
          recommendationLabel: jobResult.recommendationLabel,
          mandatoryGaps: jobResult.mandatoryGaps,
          status: jobResult.status,
        })),
        rankedJobs,
        recommendations,
        failedJobs,
        recurringGaps,
        partial: overallPartial,
        overallStatus: overallPartial ? 'partial' : 'complete',
        totalDurationMs: Date.now() - startedAt,
        providerValidation: successfulJobs[0]?.result.providerValidation || null,
      }
    },
  }
}
