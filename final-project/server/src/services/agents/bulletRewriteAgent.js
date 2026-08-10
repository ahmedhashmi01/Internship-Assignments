import { BaseAgent } from './baseAgent.js'
import { bulletRewriteBatchOutputSchema } from '../../schemas/workerSchemas.js'
import { InvalidOutputError } from '../ai/errors.js'
import { readDiagnostics, attachDiagnostics } from '../ai/diagnostics.js'
import { validateRewriteIntegrity } from '../antiFabricationValidation.js'
import { evaluateRewriteUsefulness } from '../rewriteUsefulness.js'
import { timingLog } from '../../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

// Local Ollama models generate overly long/malformed JSON on larger rewrite
// batches. Capping predicted tokens keeps a single request bounded instead
// of running away for tens of seconds.
const BULLET_REWRITE_NUM_PREDICT = 350

// Semantic anti-fabrication failures a corrective retry can plausibly fix by
// re-grounding the rewrite in the evidence. NOT retryable: 'missing-rewrite-text'
// (malformed) and 'invalid-evidence-id' (handled at the orchestration layer).
const RETRYABLE_VALIDATION_FLAGS = new Set([
  'unsupported-skill-or-tool',
  'invented-metric',
  'unsupported-leadership-claim',
  'invented-date-or-year',
  'invented-currency',
  'rewrite-does-not-map-to-original-evidence',
])

// Anti-fabrication correction rules.
const CORRECTION_INSTRUCTIONS = [
  'Preserve every number and percentage exactly as it appears in the original evidence — do not add, remove, or change any figure.',
  'Preserve all dates and years exactly.',
  'Preserve all currency amounts exactly.',
  'Use only the skills and tools that appear in the linked evidence text.',
  'Do not add leadership or ownership claims (led, owned, managed, directed, spearheaded).',
  'Do not infer or invent new achievements.',
  'Prefer minimal wording changes to the original evidence.',
  'Keep the same evidenceId.',
]

// Usefulness correction instruction (verbatim, per spec).
const USEFULNESS_INSTRUCTION =
  'Your previous rewrite was too similar to the original. Improve clarity, impact, and job relevance without adding any unsupported facts. Preserve all numbers, dates, metrics, tools, and claims exactly. Use only evidence already present. Return a materially improved sentence.'

const buildPrompt = (promptTemplate, { bullets, jobDescription, keywords, evidence }) =>
  `${promptTemplate}\n\nInput: ${JSON.stringify({ bullets, jobDescription, keywords, evidence })}`

// Corrective retry prompt. `mode` selects the anti-fabrication vs usefulness
// guidance. The trailing `Input:` block keeps the same single-rewrite schema.
const buildCorrectivePrompt = (promptTemplate, { mode, failedRewrite, evidenceText, flags, keywords, evidence }) => {
  const guidance =
    mode === 'usefulness'
      ? { instruction: USEFULNESS_INSTRUCTION }
      : {
          instruction: 'The previous rewrite failed anti-fabrication validation and must be corrected so it passes.',
          validationFlags: flags,
          correctionRules: CORRECTION_INSTRUCTIONS,
        }

  return (
    `${promptTemplate}\n\nCorrection: ${JSON.stringify({
      evidenceId: failedRewrite.evidenceId,
      originalEvidenceText: evidenceText,
      failedRewrittenText: failedRewrite.rewrittenText,
      ...guidance,
    })}` +
    `\n\nInput: ${JSON.stringify({ bullets: [evidenceText], jobDescription: '', keywords: keywords || [], evidence: evidence || [] })}`
  )
}

// Attaches the (secret-free) retry + usefulness diagnostics to a rewrite.
const decorate = (rewrite, { retried, retryCount, initialFlags, finalFlags, usefulness, qualityStatus, durationMs }) => ({
  ...rewrite,
  rewriteValidationRetry: retried,
  retryCount,
  initialValidationFlags: initialFlags,
  finalValidationFlags: finalFlags,
  validationRetryDurationMs: durationMs,
  meaningfulRewrite: usefulness.meaningfulRewrite,
  similarityScore: usefulness.similarityScore,
  usefulnessReason: usefulness.reason,
  ...(qualityStatus ? { rewriteQualityStatus: qualityStatus } : {}),
})

export class BulletRewriteAgent extends BaseAgent {
  /**
   * Requests rewrites for the given bullets and requires exactly one
   * rewrite per bullet — a schema-valid response with the wrong item count
   * (e.g. the model merging two bullets into one, or padding extra items)
   * is treated as a failure just like invalid JSON or a validation error.
   */
  async requestRewrites(promptTemplate, providerServiceCall, { bullets, jobDescription, keywords, evidence }) {
    const renderedPrompt = buildPrompt(promptTemplate, { bullets, jobDescription, keywords, evidence })
    const value = await providerServiceCall(renderedPrompt, bulletRewriteBatchOutputSchema, { numPredict: BULLET_REWRITE_NUM_PREDICT })

    if (value.rewrites.length !== bullets.length) {
      throw new InvalidOutputError(
        `Expected exactly ${bullets.length} rewrite(s), received ${value.rewrites.length}`,
      )
    }

    return { rewrites: value.rewrites, diagnostics: readDiagnostics(value) }
  }

  // Generation stage: single-shot batch, falling back to per-bullet requests.
  // Provider/network/schema retry lives inside generateJson[WithRetry] — a
  // separate concern from the semantic/usefulness retry below.
  async generateRewrites(promptTemplate, bullets, context) {
    try {
      const batchStartedAt = Date.now()
      const { rewrites, diagnostics } = await this.requestRewrites(
        promptTemplate,
        (prompt, schema, options) => this.providerService.generateJson(prompt, schema, options),
        { bullets, ...context },
      )
      timingLog('bulletRewrite batch succeeded', { durationMs: Date.now() - batchStartedAt, bullets: bullets.length })
      return { rewrites, partial: false, diagnostics }
    } catch (batchError) {
      timingLog('bulletRewrite batch failed, falling back to per-bullet requests', {
        reason: batchError.name,
        message: batchError.message,
        bullets: bullets.length,
      })

      const fallbackStartedAt = Date.now()
      const settledResults = await Promise.allSettled(
        bullets.map((bullet) =>
          this.requestRewrites(
            promptTemplate,
            (prompt, schema, options) => this.providerService.generateJsonWithRetry(prompt, schema, options),
            { bullets: [bullet], ...context },
          ),
        ),
      )

      const fulfilled = settledResults
        .filter((settled) => settled.status === 'fulfilled')
        .map((settled) => settled.value)
      const rewrites = fulfilled.flatMap((entry) => entry.rewrites)
      const diagnostics = fulfilled[0]?.diagnostics

      timingLog('bulletRewrite per-bullet fallback complete', {
        durationMs: Date.now() - fallbackStartedAt,
        requested: bullets.length,
        recovered: rewrites.length,
      })

      if (rewrites.length === 0) {
        throw batchError
      }

      return { rewrites, partial: rewrites.length < bullets.length, diagnostics }
    }
  }

  // One corrective model call. `mode` picks anti-fabrication vs usefulness guidance.
  async correctiveRewrite(promptTemplate, failedRewrite, context, { mode, flags }) {
    const evidenceText =
      (context.evidence || []).find((item) => item.id === failedRewrite.evidenceId)?.text || failedRewrite.originalText
    const prompt = buildCorrectivePrompt(promptTemplate, {
      mode,
      failedRewrite,
      evidenceText,
      flags,
      keywords: context.keywords,
      evidence: context.evidence,
    })

    // Provider-level retry inside this call handles transient network/schema
    // errors — it is NOT a second semantic retry.
    const value = await this.providerService.generateJsonWithRetry(prompt, bulletRewriteBatchOutputSchema, {
      numPredict: BULLET_REWRITE_NUM_PREDICT,
    })
    const corrected = value.rewrites?.[0]
    if (!corrected) {
      throw new InvalidOutputError('Corrective retry produced no rewrite')
    }

    // Anchor identity so re-validation compares against the same source.
    return { ...corrected, evidenceId: failedRewrite.evidenceId, originalText: failedRewrite.originalText }
  }

  // Validation order per bullet: anti-fabrication first, then usefulness. At most
  // ONE corrective retry total — anti-fabrication and usefulness never stack.
  async correctiveRetryIfNeeded(promptTemplate, rewrite, context) {
    const evidence = context.evidence || []
    const initialAntiFab = validateRewriteIntegrity(rewrite, evidence)
    const initialUsefulness = evaluateRewriteUsefulness(rewrite.originalText, rewrite.rewrittenText)
    const originalSafe = initialAntiFab.flags.length === 0
    const antiFabRetryable = initialAntiFab.flags.filter((flag) => RETRYABLE_VALIDATION_FLAGS.has(flag))

    // Choose the single retry: anti-fabrication takes precedence, then usefulness.
    let mode = null
    if (antiFabRetryable.length > 0) mode = 'anti-fabrication'
    else if (!initialUsefulness.meaningfulRewrite) mode = 'usefulness'

    // Safe + meaningful → no retry.
    if (!mode) {
      return decorate(rewrite, {
        retried: false,
        retryCount: 0,
        initialFlags: initialAntiFab.flags,
        finalFlags: initialAntiFab.flags,
        usefulness: initialUsefulness,
        qualityStatus: null,
        durationMs: 0,
      })
    }

    const startedAt = Date.now()
    let corrected
    try {
      corrected = await this.correctiveRewrite(promptTemplate, rewrite, context, { mode, flags: initialAntiFab.flags })
    } catch (error) {
      // Corrective model call failed (provider/schema). Keep the original; never loop.
      const durationMs = Date.now() - startedAt
      timingLog('bulletRewrite corrective retry failed', { mode, reason: error.name, durationMs })
      return decorate(rewrite, {
        retried: true,
        retryCount: 1,
        initialFlags: initialAntiFab.flags,
        finalFlags: initialAntiFab.flags,
        usefulness: initialUsefulness,
        // A safe-but-unimproved rewrite whose usefulness retry could not run.
        qualityStatus: mode === 'usefulness' ? 'no-meaningful-improvement' : null,
        durationMs,
      })
    }

    const durationMs = Date.now() - startedAt
    const finalAntiFab = validateRewriteIntegrity(corrected, evidence)
    const finalUsefulness = evaluateRewriteUsefulness(corrected.originalText, corrected.rewrittenText)
    const correctedSafe = finalAntiFab.flags.length === 0

    timingLog('bulletRewrite corrective retry complete', {
      mode,
      initialFlags: initialAntiFab.flags.length,
      finalFlags: finalAntiFab.flags.length,
      meaningful: finalUsefulness.meaningfulRewrite,
      durationMs,
    })

    // safe + meaningful → return the corrected rewrite normally.
    if (correctedSafe && finalUsefulness.meaningfulRewrite) {
      return decorate(corrected, {
        retried: true,
        retryCount: 1,
        initialFlags: initialAntiFab.flags,
        finalFlags: finalAntiFab.flags,
        usefulness: finalUsefulness,
        qualityStatus: null,
        durationMs,
      })
    }

    // safe but still not meaningful → surface no-meaningful-improvement on a SAFE
    // rewrite (prefer the safe original; the corrected is used only if the
    // original itself was unsafe).
    if (correctedSafe && !finalUsefulness.meaningfulRewrite) {
      const base = originalSafe ? rewrite : corrected
      return decorate(base, {
        retried: true,
        retryCount: 1,
        initialFlags: initialAntiFab.flags,
        finalFlags: finalAntiFab.flags,
        usefulness: originalSafe ? initialUsefulness : finalUsefulness,
        qualityStatus: 'no-meaningful-improvement',
        durationMs,
      })
    }

    // corrected is UNSAFE. If we started from a safe rewrite (usefulness path),
    // discard the newly-unsafe text and keep the safe original.
    if (originalSafe) {
      return decorate(rewrite, {
        retried: true,
        retryCount: 1,
        initialFlags: initialAntiFab.flags,
        finalFlags: initialAntiFab.flags,
        usefulness: initialUsefulness,
        qualityStatus: 'no-meaningful-improvement',
        durationMs,
      })
    }

    // Anti-fabrication path, still unsafe → return corrected; orchestration will
    // set needsReview=true (existing behavior).
    return decorate(corrected, {
      retried: true,
      retryCount: 1,
      initialFlags: initialAntiFab.flags,
      finalFlags: finalAntiFab.flags,
      usefulness: finalUsefulness,
      qualityStatus: null,
      durationMs,
    })
  }

  async run(input) {
    const promptTemplate = await this.loadPrompt()
    const bullets = input.bullets || []
    const context = { jobDescription: input.jobDescription, keywords: input.keywords, evidence: input.evidence || [] }

    const generated = await this.generateRewrites(promptTemplate, bullets, context)

    // Validation-driven corrective retry — at most one per rewrite (anti-fab OR
    // usefulness), independent of the provider-level retry used during generation.
    const rewrites = await Promise.all(
      generated.rewrites.map((rewrite) => this.correctiveRetryIfNeeded(promptTemplate, rewrite, context)),
    )

    return attachDiagnostics({ rewrites, partial: generated.partial }, generated.diagnostics)
  }
}
