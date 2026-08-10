/**
 * TEMPORARY diagnostic instrumentation for investigating Ollama request
 * latency. Gated behind DEBUG_AI_TIMING so it's silent by default; set
 * DEBUG_AI_TIMING=true to see it. Safe to delete this file and its call
 * sites once the investigation is complete — not part of the permanent
 * architecture.
 */
export const timingLog = (label, fields = {}) => {
  if (process.env.DEBUG_AI_TIMING !== 'true') return

  const parts = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console.log(`[timing] ${label}${parts ? ' ' + parts : ''}`)
}
