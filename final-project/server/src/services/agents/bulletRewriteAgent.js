import { BaseAgent } from './baseAgent.js'
import { bulletRewriteBatchOutputSchema } from '../../schemas/workerSchemas.js'
import { InvalidOutputError } from '../ai/errors.js'
import { timingLog } from '../../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

// Local Ollama models generate overly long/malformed JSON on larger rewrite
// batches. Capping predicted tokens keeps a single request bounded instead
// of running away for tens of seconds.
const BULLET_REWRITE_NUM_PREDICT = 350

const buildPrompt = (promptTemplate, { bullets, jobDescription, keywords, evidence }) =>
  `${promptTemplate}\n\nInput: ${JSON.stringify({ bullets, jobDescription, keywords, evidence })}`

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

    return value.rewrites
  }

  async run(input) {
    const promptTemplate = await this.loadPrompt()
    const bullets = input.bullets || []
    const context = { jobDescription: input.jobDescription, keywords: input.keywords, evidence: input.evidence }

    // Single-shot batch attempt — deliberately NOT generateJsonWithRetry's
    // built-in retry, which would repeat the full (expensive) batch. On any
    // failure we fall back to one request per bullet instead.
    try {
      const batchStartedAt = Date.now()
      const rewrites = await this.requestRewrites(
        promptTemplate,
        (prompt, schema, options) => this.providerService.generateJson(prompt, schema, options),
        { bullets, ...context },
      )
      timingLog('bulletRewrite batch succeeded', { durationMs: Date.now() - batchStartedAt, bullets: bullets.length })

      return { rewrites, partial: false }
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

      const rewrites = settledResults
        .filter((settled) => settled.status === 'fulfilled')
        .flatMap((settled) => settled.value)

      timingLog('bulletRewrite per-bullet fallback complete', {
        durationMs: Date.now() - fallbackStartedAt,
        requested: bullets.length,
        recovered: rewrites.length,
      })

      if (rewrites.length === 0) {
        // Nothing recovered — surface the original batch failure.
        throw batchError
      }

      return { rewrites, partial: rewrites.length < bullets.length }
    }
  }
}
