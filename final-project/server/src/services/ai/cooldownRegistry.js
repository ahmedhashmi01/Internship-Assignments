/**
 * Tracks per-provider cooldown expiry after a quota/rate-limit failure.
 * Created fresh per `createAiService(config)` call (same lifetime as the
 * concurrency limiter) — long enough to persist across requests within one
 * running server process, but never shared across independent service
 * instances (e.g. separate test cases).
 */
export const createCooldownRegistry = () => {
  const cooldownUntil = new Map()

  return {
    isCoolingDown(providerName, now) {
      const until = cooldownUntil.get(providerName)
      return typeof until === 'number' && until > now
    },
    markCooldown(providerName, durationMs, now) {
      cooldownUntil.set(providerName, now + Math.max(0, durationMs))
    },
    getUntil(providerName) {
      return cooldownUntil.get(providerName) ?? null
    },
    clear(providerName) {
      cooldownUntil.delete(providerName)
    },
  }
}
