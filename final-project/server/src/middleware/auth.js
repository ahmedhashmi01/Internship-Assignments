import { AppError, ERROR_CODES } from '../errors/AppError.js'

const GUEST_HEADER = 'x-guest-id'

const readBearer = (req) => {
  const header = req.headers.authorization || ''
  const [scheme, token] = header.split(' ')
  if (scheme === 'Bearer' && token) return token.trim()
  return null
}

const readGuestId = (req) => {
  const value = req.headers[GUEST_HEADER]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

// Identity is always derived here from the token — never from the request body.
export const createAuthMiddleware = (authService) => {
  // Attaches req.auth when a valid token is present, otherwise proceeds as a
  // guest. A present-but-invalid token is ignored (still a guest), matching the
  // "identify if token exists, otherwise continue as guest" contract.
  const optionalAuth = (req, _res, next) => {
    req.guestId = readGuestId(req)
    const token = readBearer(req)
    if (token) {
      try {
        const payload = authService.verifyToken(token)
        req.auth = { userId: payload.sub, role: payload.role }
      } catch {
        req.auth = null
      }
    }
    next()
  }

  // Blocks unauthenticated requests. Distinguishes "no token" (AUTH_REQUIRED)
  // from "bad/expired token" (INVALID_TOKEN) so the client can react precisely.
  const requireAuth = (req, _res, next) => {
    req.guestId = readGuestId(req)
    const token = readBearer(req)
    if (!token) {
      return next(new AppError(ERROR_CODES.AUTH_REQUIRED, 'Authentication required.'))
    }
    try {
      const payload = authService.verifyToken(token)
      req.auth = { userId: payload.sub, role: payload.role }
      return next()
    } catch (error) {
      return next(error)
    }
  }

  return { optionalAuth, requireAuth }
}
