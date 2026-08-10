import express from 'express'
import { createAuthSchemas } from '../schemas/authSchemas.js'
import { ERROR_CODES } from '../errors/AppError.js'

const formatZodError = (error) => {
  const fieldErrors = {}
  for (const issue of error.issues) {
    const field = issue.path?.[0] || 'form'
    if (!fieldErrors[field]) fieldErrors[field] = issue.message
  }
  const message = Object.entries(fieldErrors)
    .map(([field, msg]) => `${field}: ${msg}`)
    .join(' • ')
  return { code: ERROR_CODES.VALIDATION_ERROR, message, fieldErrors }
}

const readGuestId = (req) => {
  const value = req.headers['x-guest-id']
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const passthrough = (_req, _res, next) => next()

export const createAuthRouter = ({
  config,
  authService,
  guestUsageService,
  historyService,
  authMiddleware,
  signupLimiter = passthrough,
  loginLimiter = passthrough,
}) => {
  const router = express.Router()
  const { signupSchema, loginSchema } = createAuthSchemas(config)

  router.post('/signup', signupLimiter, async (req, res, next) => {
    const parsed = signupSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json(formatZodError(parsed.error))
    }

    try {
      const { user, token } = await authService.signup(parsed.data)

      // Convert the guest identity into this account (best-effort): move any
      // guest history to the new user and mark the guest usage as converted.
      // A migration hiccup must not fail an otherwise-successful signup.
      const guestId = readGuestId(req)
      if (guestId) {
        try {
          await historyService.migrateGuestToUser(guestId, user.id)
          await guestUsageService.markConverted(guestId, user.id)
        } catch (migrationError) {
          // Log only the error type — never the message, which could echo input.
          console.error('Guest conversion failed after signup:', migrationError.name)
        }
      }

      return res.status(201).json({ user, token })
    } catch (error) {
      next(error)
    }
  })

  router.post('/login', loginLimiter, async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body || {})
    if (!parsed.success) {
      // Generic — do not disclose which field failed on login.
      return res.status(401).json({
        code: ERROR_CODES.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      })
    }

    try {
      const { user, token } = await authService.login(parsed.data)
      return res.json({ user, token })
    } catch (error) {
      next(error)
    }
  })

  router.get('/me', authMiddleware.requireAuth, async (req, res, next) => {
    try {
      const user = await authService.getSafeUserById(req.auth.userId)
      return res.json({ user })
    } catch (error) {
      next(error)
    }
  })

  // Stateless JWT: logout is a client-side token discard. Endpoint provided for
  // a consistent client API and future refresh-token revocation.
  router.post('/logout', (_req, res) => {
    res.json({ success: true })
  })

  return router
}
