import { z } from 'zod'
import { createNamedProvider } from './providerFactory.js'
import { resolveProviderChainNames } from './providerModes.js'
import { createProviderChain } from './providerChain.js'
import { createConcurrencyLimiter } from './concurrencyLimiter.js'
import { attachDiagnostics } from './diagnostics.js'
import { timingLog } from '../../utils/timingLog.js' // TEMPORARY — remove after Ollama latency investigation

const defaultJsonSchema = z.object({ ok: z.boolean() })
const DEFAULT_OLLAMA_MAX_CONCURRENCY = 2

// Local Ollama serves one model at a time; unthrottled fan-out (e.g. 3 jobs
// x 4 workers) queues requests inside Ollama while each request's own
// client-side timeout is already ticking, causing spurious timeouts. This is
// an OLLAMA-SPECIFIC constraint (cloud providers enforce their own
// server-side rate limits, handled instead by the chain's cooldown/backoff),
// so only the Ollama provider instance gets a limiter, wherever it sits in
// the chain — the chain runs each provider's whole per-attempt unit of work
// (attempt + corrective retry) through it as one atomic slot acquisition.
const applyOllamaConcurrencyLimit = (provider, config) => {
  if (provider.providerName === 'ollama') {
    provider.concurrencyLimiter = createConcurrencyLimiter(config.ollamaMaxConcurrency ?? DEFAULT_OLLAMA_MAX_CONCURRENCY)
  }
  return provider
}

export const createAiService = (config) => {
  const providerNames = resolveProviderChainNames(config)
  const providers = providerNames.map((name) => applyOllamaConcurrencyLimit(createNamedProvider(name, config), config))
  const chain = createProviderChain(providers, { cooldownMs: config.providerCooldownMs })

  const withTiming = (label, fn) => {
    const startedAt = Date.now()
    return fn().then((result) => {
      timingLog(label, { durationMs: Date.now() - startedAt })
      return result
    })
  }

  return {
    async generateText(prompt) {
      return withTiming('generateText', async () => {
        const { value } = await chain.generateText(prompt)
        return value
      })
    },

    async generateJson(prompt, schema = defaultJsonSchema, options = {}) {
      return withTiming('generateJson', async () => {
        const { value, diagnostics } = await chain.generateJson(prompt, schema, options)
        timingLog('generateJson chain result', { selectedProvider: diagnostics.selectedProvider, fallbackIndex: diagnostics.fallbackIndex })
        return attachDiagnostics(value, diagnostics)
      })
    },

    async generateJsonWithRetry(prompt, schema = defaultJsonSchema, options = {}) {
      return withTiming('generateJsonWithRetry', async () => {
        const { value, diagnostics } = await chain.generateJsonWithRetry(prompt, schema, options)
        timingLog('generateJsonWithRetry chain result', { selectedProvider: diagnostics.selectedProvider, fallbackIndex: diagnostics.fallbackIndex })
        return attachDiagnostics(value, diagnostics)
      })
    },

    async healthCheck() {
      return withTiming('healthCheck', () => chain.healthCheck())
    },
  }
}
