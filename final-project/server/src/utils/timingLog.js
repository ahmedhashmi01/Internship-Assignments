/**
 * TEMPORARY diagnostic instrumentation for investigating Ollama request
 * latency, and (as of the duplicate-execution investigation) for
 * distinguishing separate HTTP requests from duplicate work inside one
 * request. Gated behind DEBUG_AI_TIMING so it's silent by default; set
 * DEBUG_AI_TIMING=true to see it. Safe to delete this file and its call
 * sites once the investigation is complete — not part of the permanent
 * architecture.
 */
import { getRequestContext } from './requestContext.js'

export const timingLog = (label, fields = {}) => {
  if (process.env.DEBUG_AI_TIMING !== 'true') return

  // Auto-tag every line with the active request's id (and worker name, when
  // set) — see requestContext.js. Explicit `fields` win on any key collision.
  const context = getRequestContext()
  const tagged = {
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.workerName ? { worker: context.workerName } : {}),
    ...fields,
  }

  const parts = Object.entries(tagged)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console.log(`[timing] ${label}${parts ? ' ' + parts : ''}`)
}
