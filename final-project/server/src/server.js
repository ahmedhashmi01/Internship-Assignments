import cors from 'cors'
import express from 'express'
import { pathToFileURL } from 'url'
import { config as defaultConfig } from './config.js'
import { createAnalysisRouter } from './routes/analysisRoutes.js'
import { createResumeRouter } from './routes/resumeRoutes.js'
import { createAuthRouter } from './routes/authRoutes.js'
import { createHistoryRouter } from './routes/historyRoutes.js'
import { errorHandler } from './middleware/errorHandler.js'
import { createAiService } from './services/ai/providerService.js'
import { createAuthService } from './services/authService.js'
import { createGuestUsageService } from './services/guestUsageService.js'
import { createHistoryService } from './services/historyService.js'
import { createAuthMiddleware } from './middleware/auth.js'
import { createRateLimiter } from './middleware/rateLimit.js'
import { validateStartupConfig } from './config/validateStartup.js'
import { connectDb } from './db/mongoose.js'
import { ensureIndexes } from './db/ensureIndexes.js'

export const createApp = (configOverrides = {}, deps = {}) => {
  const app = express()
  const resolvedConfig = { ...defaultConfig, ...configOverrides }

  // Accurate req.ip behind a load balancer, so per-IP rate limiting is correct.
  if (resolvedConfig.trustProxy) app.set('trust proxy', 1)

  // Allowlist: exact-match origins from CLIENT_ORIGIN (comma-separated). No
  // credentials are needed — auth uses a Bearer token, not cookies — so the
  // frontend and backend can be deployed on separate hosts freely.
  const allowedOrigins = resolvedConfig.clientOrigins || [resolvedConfig.clientOrigin]
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
        return callback(null, false)
      },
    }),
  )
  app.use(express.json())

  // Shared service graph (wired once per app instance).
  const authService = createAuthService(resolvedConfig)
  const guestUsageService = createGuestUsageService(resolvedConfig)
  const historyService = createHistoryService()
  const authMiddleware = createAuthMiddleware(authService)

  // Per-IP rate limiters (fresh state per app instance). Disabled by default in
  // tests; independent of the X-Guest-Id guest-identity mechanism.
  const { rateLimitEnabled, rateLimits } = resolvedConfig
  const signupLimiter = createRateLimiter({ windowMs: rateLimits.windowMs, max: rateLimits.signup, enabled: rateLimitEnabled })
  const loginLimiter = createRateLimiter({ windowMs: rateLimits.windowMs, max: rateLimits.login, enabled: rateLimitEnabled })
  const analysisLimiter = createRateLimiter({ windowMs: rateLimits.windowMs, max: rateLimits.analysis, enabled: rateLimitEnabled })

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'resume-job-match-analyzer-api',
      provider: resolvedConfig.aiProvider,
      model: resolvedConfig.ollamaModel,
    })
  })

  app.get('/api/ai/health', async (_req, res) => {
    try {
      const aiService = createAiService(resolvedConfig)
      const response = await aiService.generateText('health-check')
      res.json({ status: 'ok', provider: resolvedConfig.aiProvider, model: resolvedConfig.ollamaModel, sampleResponse: response.slice(0, 40) })
    } catch (error) {
      res.status(503).json({ status: 'error', provider: resolvedConfig.aiProvider, message: error.message })
    }
  })

  app.use('/api/auth', createAuthRouter({ config: resolvedConfig, authService, guestUsageService, historyService, authMiddleware, signupLimiter, loginLimiter }))
  app.use('/api/history', createHistoryRouter({ historyService, authMiddleware }))
  app.use('/api/analysis', createAnalysisRouter({ config: resolvedConfig, guestUsageService, historyService, authMiddleware, orchestrationService: deps.orchestrationService, analysisLimiter }))
  app.use('/api/resume', createResumeRouter(resolvedConfig))
  app.use(errorHandler)

  return app
}

export const startServer = async (configOverrides = {}) => {
  const resolvedConfig = { ...defaultConfig, ...configOverrides }
  const nodeEnv = resolvedConfig.nodeEnv

  // Fail fast on invalid production configuration (missing DB, weak JWT secret)
  // before binding a port — never silently disable auth/history/guest limits.
  validateStartupConfig({ config: resolvedConfig, nodeEnv })

  if (resolvedConfig.mongodbUri) {
    try {
      await connectDb(resolvedConfig.mongodbUri)
      console.log('Connected to MongoDB')
      // Ensure unique indexes (e.g. User.email) actually exist on the live DB,
      // so duplicate-account protection is enforced at the database level and
      // not only by the application-level exists() check.
      await ensureIndexes()
    } catch (error) {
      // Log only safe, non-credential fields (the URI can contain a password).
      const detail = error.code || error.name || 'unknown'
      if (nodeEnv === 'production') {
        // Chain the original error for debuggers. Safe because the top-level
        // handler logs only `.message` (the sanitized string below), never the
        // cause — so the credential-bearing connection string is not printed.
        throw new Error(`Failed to connect to MongoDB (${detail}) — aborting startup.`, { cause: error })
      }
      console.error(`MongoDB connection failed (${detail}) — continuing without persistence.`)
    }
  } else {
    console.warn('MONGODB_URI not set — running without persistence (auth/history/guest limits disabled).')
  }

  const app = createApp(configOverrides)
  const port = configOverrides.port || resolvedConfig.port

  return app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
