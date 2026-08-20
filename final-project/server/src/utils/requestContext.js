/**
 * TEMPORARY diagnostic instrumentation — request-scoped context (requestId,
 * worker name) for correlating timing logs across one HTTP request without
 * threading extra parameters through every function signature in the call
 * path (routes -> orchestrationService -> agents -> providerService ->
 * providerChain -> providers). Built on Node's AsyncLocalStorage, which
 * automatically propagates through every `await` in the same request.
 *
 * Added to investigate whether a single user analysis produces one or two
 * POST /api/analysis/run executions (see analysisRoutes.js / timingLog.js).
 * Safe to delete alongside timingLog.js once the investigation is complete —
 * not part of the permanent architecture. Carries no PII: requestId is a
 * random UUID generated per request, never derived from user input.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()

// Starts a brand-new context (e.g. once per incoming HTTP request).
export const runWithRequestContext = (context, fn) => storage.run(context, fn)

// Merges additional fields into the CURRENTLY ACTIVE context for the
// duration of fn (e.g. tagging a worker name onto an already-running
// request), without disturbing fields set by an outer call.
export const runWithContextFields = (fields, fn) => {
  const current = storage.getStore() || {}
  return storage.run({ ...current, ...fields }, fn)
}

export const getRequestContext = () => storage.getStore() || {}
