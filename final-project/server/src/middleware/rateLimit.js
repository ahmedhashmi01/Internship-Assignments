import { AppError, ERROR_CODES } from '../errors/AppError.js'

// Minimal dependency-free fixed-window rate limiter, keyed by client IP.
//
// This is a coarse abuse guard only — it is NOT the guest identity mechanism
// (that is the X-Guest-Id header + GuestUsage collection). When disabled it is
// a transparent pass-through, which keeps the default test runs deterministic.
//
// State is per-limiter-instance (per createApp), so each app gets a fresh
// counter — ideal for isolated tests.
export const createRateLimiter = ({ windowMs, max, enabled = true }) => {
  const hits = new Map() // ip -> { count, resetAt }

  return (req, res, next) => {
    if (!enabled || !max) return next()

    const now = Date.now()
    const key = req.ip || req.socket?.remoteAddress || 'unknown'
    const entry = hits.get(key)

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    entry.count += 1
    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSec))
      return next(
        new AppError(ERROR_CODES.RATE_LIMITED, 'Too many requests. Please try again later.'),
      )
    }

    return next()
  }
}
