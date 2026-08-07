import { BaseAgent } from './baseAgent.js'
import { skillMatchBatchOutputSchema } from '../../schemas/workerSchemas.js'
import { reconcileSkillMatches } from '../skillReconciliation.js'
import { readDiagnostics, attachDiagnostics } from '../ai/diagnostics.js'
import { getConfidenceRepairedIndices } from '../ai/repairSkillMatchConfidence.js'
import { logSkillDebug } from '../../utils/aiDebugLog.js'
import { timingLog } from '../../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

export class SkillMatchAgent extends BaseAgent {
  async run(input) {
    const promptStartedAt = Date.now()
    const prompt = await this.loadPrompt()
    const renderedPrompt = `${prompt}\n\nInput: ${JSON.stringify({ requirements: input.requirements, evidence: input.evidence })}`
    timingLog('skillMatch prompt construction', {
      durationMs: Date.now() - promptStartedAt,
      promptLength: renderedPrompt.length,
      requirements: input.requirements.length,
      evidenceItems: input.evidence.length,
    })

    const callStartedAt = Date.now()
    const value = await this.providerService.generateJsonWithRetry(renderedPrompt, skillMatchBatchOutputSchema)
    timingLog('skillMatch generateJsonWithRetry', { durationMs: Date.now() - callStartedAt, itemsReturned: value.items.length })

    // Reconcile before scoring/display ever see this data: dedupe case-insensitively
    // and collapse contradictory duplicate entries to one final status per requirement.
    const reconciled = reconcileSkillMatches(value.items)

    const repairedIndices = new Set(getConfidenceRepairedIndices(value))
    const reconciledByName = new Map(reconciled.map((item) => [(item.skill || '').toLowerCase(), item]))
    logSkillDebug({
      jobTitle: input.jobTitle,
      requirements: value.items.map((item, index) => ({
        requirementText: item.skill,
        requirementType: item.requirementType,
        modelStatus: item.status,
        modelConfidence: item.confidence,
        evidenceIds: item.evidenceId ? [item.evidenceId] : [],
        reconciledStatus: reconciledByName.get((item.skill || '').toLowerCase())?.status ?? null,
        confidenceSource: repairedIndices.has(index) ? 'backend-derived' : 'model-provided',
      })),
    })

    return attachDiagnostics({
      matchedSkills: reconciled,
      // Mandatory gaps must only reflect requirements that are BOTH missing AND
      // mandatory — a missing preferred/contextual skill is not a "gap".
      missingSkills: reconciled.filter((item) => item.status === 'missing' && item.requirementType === 'mandatory'),
    }, readDiagnostics(value))
  }
}
