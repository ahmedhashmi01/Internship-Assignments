import { z } from 'zod'
import { createProvider } from './providerFactory.js'
import { InvalidOutputError } from './errors.js'
import { createConcurrencyLimiter } from './concurrencyLimiter.js'
import { timingLog } from '../../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

const defaultJsonSchema = z.object({ ok: z.boolean() })
const DEFAULT_OLLAMA_MAX_CONCURRENCY = 2

// Pulls the Zod issue list out of an InvalidOutputError (or a raw ZodError)
// so the retry prompt can name the exact fields that failed, instead of a
// generic "not valid JSON" message that gives the model nothing to correct —
// confirmed via benchmark to produce byte-identical failing output on retry.
const summarizeValidationIssues = (error) => {
  const zodError = error?.name === 'ZodError' ? error : error?.details?.cause
  const issues = zodError?.issues
  if (!Array.isArray(issues) || issues.length === 0) return null

  return issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ')
}

export const createAiService = (config) => {
  const provider = createProvider(config)

  // Local Ollama serves one model at a time; unthrottled fan-out (e.g. 3 jobs
  // x 4 workers) queues requests inside Ollama while each request's own
  // client-side timeout is already ticking, causing spurious timeouts. The
  // mock provider has no such backend and stays unrestricted.
  const isOllama = (config.aiProvider || '').toLowerCase() === 'ollama'
  const limiter = isOllama
    ? createConcurrencyLimiter(config.ollamaMaxConcurrency ?? DEFAULT_OLLAMA_MAX_CONCURRENCY)
    : null

  const withLimit = (fn) => (limiter ? limiter.run(fn) : fn())

  // TEMPORARY — wraps `fn` so queue wait time (enqueue -> execution start) is
  // logged separately from execution time. Remove alongside timingLog.js.
  const withQueueTiming = (label, fn) => {
    const enqueuedAt = Date.now()
    return withLimit(async () => {
      const startedAt = Date.now()
      timingLog(`${label} queueWait`, { queueWaitMs: startedAt - enqueuedAt, limiterActive: limiter?.active ?? 'n/a', limiterPending: limiter?.pending ?? 'n/a' })
      const result = await fn()
      timingLog(`${label} execution`, { executionMs: Date.now() - startedAt })
      return result
    })
  }

  return {
    async generateText(prompt) {
      return withQueueTiming('generateText', () => provider.generateText(prompt))
    },

    async generateJson(prompt, schema = defaultJsonSchema, options = {}) {
      return withQueueTiming('generateJson', () => provider.generateJson(prompt, schema, options))
    },

    async generateJsonWithRetry(prompt, schema = defaultJsonSchema, options = {}) {
      // The whole attempt (including its single retry) runs under one
      // acquired slot — a retry continues existing work, it does not queue
      // for a second slot.
      return withQueueTiming('generateJsonWithRetry', async () => {
        try {
          const attemptStartedAt = Date.now()
          const result = await provider.generateJson(prompt, schema, options)
          timingLog('generateJsonWithRetry first attempt', { durationMs: Date.now() - attemptStartedAt, retried: false })
          return result
        } catch (error) {
          if (error instanceof InvalidOutputError || error?.name === 'ZodError') {
            // Retry with a corrective suffix. When the failure was a schema
            // validation error, name the exact fields that failed so the
            // retry can actually fix them — a generic "not valid JSON"
            // message gives the model nothing to act on when its JSON was
            // syntactically valid but shape-incomplete.
            timingLog('generateJsonWithRetry retry triggered', { reason: error.name, message: error.message })
            const retryStartedAt = Date.now()
            const validationDetail = summarizeValidationIssues(error)
            const correctionMessage = validationDetail
              ? `IMPORTANT: Your previous response failed schema validation: ${validationDetail}. Respond again with ONLY a single valid JSON object that fixes these errors — every item must include every required field.`
              : 'IMPORTANT: Your previous response was not valid JSON. Respond with ONLY a valid JSON object and nothing else — no markdown fences, no explanation.'
            const correctedPrompt = `${prompt}\n\n${correctionMessage}`
            const retryResult = await provider.generateJson(correctedPrompt, schema, options)
            timingLog('generateJsonWithRetry retry attempt', { durationMs: Date.now() - retryStartedAt, retried: true })
            return retryResult
          }
          throw error
        }
      })
    },

    async healthCheck() {
      return withQueueTiming('healthCheck', () => provider.healthCheck())
    },
  }
}
