import { SupervisorAgent } from './agents/supervisorAgent.js'
import { SkillMatchAgent } from './agents/skillMatchAgent.js'
import { AtsKeywordAgent } from './agents/atsKeywordAgent.js'
import { BulletRewriteAgent } from './agents/bulletRewriteAgent.js'
import { createAiService } from './ai/providerService.js'
import { validateEvidenceId, validateRewriteIntegrity } from './antiFabricationValidation.js'
import { computeNeedsReview } from './rewriteApproval.js'
import { readDiagnostics } from './ai/diagnostics.js'
import { logProviderSelection, logModelResponse, aiDebugEnabled } from '../utils/aiDebugLog.js'
import { redactDeep } from '../utils/redact.js'
import { scoreSingleJob, getRecommendationLabel } from './scoringService.js'
import {
  extractRequirements,
  extractKeywords,
  pickTopEvidenceItems,
  buildEvidenceSummary,
} from './jobInputExtractor.js'
import { timingLog } from '../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation
import { runWithContextFields } from '../utils/requestContext.js' // TEMPORARY — see requestContext.js

// Tie-break order for equal rounded scores: mandatory coverage, preferred
// coverage, number of directly evidence-supported requirements, ATS
// coverage, then original submission order (stable — never job title/id,
// which have no bearing on fit).
export const getStableJobRank = (jobA, jobB) => {
  if (jobA.score !== jobB.score) return jobB.score - jobA.score
  if (jobA.mandatoryCoverage !== jobB.mandatoryCoverage) return jobB.mandatoryCoverage - jobA.mandatoryCoverage
  if (jobA.preferredCoverage !== jobB.preferredCoverage) return jobB.preferredCoverage - jobA.preferredCoverage
  if (jobA.supportedRequirementCount !== jobB.supportedRequirementCount) return jobB.supportedRequirementCount - jobA.supportedRequirementCount
  if (jobA.atsCoverage !== jobB.atsCoverage) return jobB.atsCoverage - jobA.atsCoverage
  return jobA.originalIndex - jobB.originalIndex
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
            skillMatchAgent.run({ requirements, evidence: normalizedResume.evidence, jobTitle: job.title }),
        },
        {
          name: 'atsKeyword',
          task: () =>
            atsKeywordAgent.run({ keywords, evidence: normalizedResume.evidence, jobTitle: job.title }),
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

      // TEMPORARY: tag every timingLog call made while this task runs
      // (including inside providerService/providerChain) with its worker
      // name, so a "provider attempt failed" or "groq 400 diagnostic" line
      // can be attributed to skillMatch vs bulletRewrite without threading
      // an extra parameter through agents/providerChain — see requestContext.js.
      const results = await Promise.allSettled(tasks.map((entry) => runWithContextFields({ workerName: entry.name }, async () => {
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
      })))

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
            // Provider-chain routing metadata (selected provider/model,
            // fallback index, attempted providers) — undefined for
            // deterministic workers (supervisor, atsKeyword), which never
            // call the AI provider chain at all.
            const diagnostics = readDiagnostics(output)
            if (diagnostics) {
              workerBase.providerDiagnostics = diagnostics
              logProviderSelection({
                jobTitle: job.title,
                worker: entry.name,
                provider: diagnostics.selectedProvider,
                model: diagnostics.selectedModel,
                fallbackIndex: diagnostics.fallbackIndex,
                attempt: diagnostics.attempts,
                durationMs: diagnostics.durationMs,
                retryCount: diagnostics.retryCount,
                responseChars: JSON.stringify(output).length,
              })

              if (entry.name === 'skillMatch' || entry.name === 'bulletRewrite') {
                logModelResponse({ jobTitle: job.title, worker: entry.name, output })

                // Requirement 8 — a raw(-ish) model output field on the worker
                // result itself, ONLY ever populated outside production with
                // debug logging explicitly enabled. Never present otherwise.
                if (process.env.NODE_ENV !== 'production' && aiDebugEnabled()) {
                  workerBase.debugModelOutput = redactDeep(output)
                }
              }
            }
          }

          return workerBase
        }

        const failureDurationMs = settled.status === 'fulfilled' ? settled.value.durationMs : 0
        const workerError = settled.status === 'fulfilled' ? settled.value.error : settled.reason

        workerBase.status = 'failed'
        // Normalize the "every configured AI provider failed/was unavailable"
        // case to a stable, distinguishable errorType instead of the
        // generic 'worker-error' — see errors.js#AiProvidersUnavailableError.
        workerBase.errorType = workerError?.code === 'AI_PROVIDERS_UNAVAILABLE' ? 'AI_PROVIDERS_UNAVAILABLE' : 'worker-error'
        workerBase.errorMessage = workerError?.message || 'Unknown worker failure'
        workerBase.durationMs = failureDurationMs

        if (workerBase.errorType === 'AI_PROVIDERS_UNAVAILABLE' && Array.isArray(workerError?.details?.attemptedProviders)) {
          // Already-sanitized (provider/model/category/message only — see
          // providerChain.js) even on total failure, not just success.
          workerBase.providerDiagnostics = { attemptedProviders: workerError.details.attemptedProviders }
        }

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
        jobTitle: job.title,
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
            // Deterministic transparency payload (why this score) — see scoringService.
            scoreExplanation: payload.result?.score?.scoreExplanation,
            // Deterministic readiness status + gap-to-action plan — same source
            // data as scoreExplanation, no new score, no AI call.
            readiness: payload.result?.score?.readiness,
            priorityActions: payload.result?.score?.priorityActions,
            recommendationLabel: getRecommendationLabel(payload.result?.score?.score ?? 0),
            // A job that ran to completion but had a worker (e.g. skillMatch,
            // bulletRewrite) fail internally must not be reported as a plain
            // 'succeeded' — that hid partial results behind a "complete" status.
            status: payload.result?.partial ? 'partial' : 'succeeded',
            result: payload.result,
            // Tie-break inputs only (see getStableJobRank) — not part of the
            // public per-job schema, stripped by rankedJobResultSchema.
            mandatoryCoverage: payload.result?.score?.mandatoryCoverage ?? 0,
            preferredCoverage: payload.result?.score?.preferredCoverage ?? 0,
            atsCoverage: payload.result?.score?.atsCoverage ?? 0,
            supportedRequirementCount: payload.result?.score?.supportedRequirementCount ?? 0,
            originalIndex: index,
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
          scoreExplanation: jobResult.scoreExplanation,
          readiness: jobResult.readiness,
          priorityActions: jobResult.priorityActions,
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
