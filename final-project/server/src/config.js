import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const parseCommaList = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const config = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Trust the first proxy hop so req.ip reflects the real client when deployed
  // behind a load balancer (needed for accurate per-IP rate limiting).
  trustProxy: process.env.TRUST_PROXY === 'true',
  // Single origin kept for backward compatibility; clientOrigins supports a
  // comma-separated allowlist so frontend and backend can deploy separately
  // without hardcoding localhost as the only permitted origin.
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  clientOrigins: parseCommaList(process.env.CLIENT_ORIGIN).length > 0
    ? parseCommaList(process.env.CLIENT_ORIGIN)
    : ['http://localhost:5173'],

  // Persistence + auth. When mongodbUri is empty the analyzer runs exactly as
  // before (stateless: no auth, no guest limit, no history) so existing
  // behavior and the AI test suite are preserved.
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  minPasswordLength: Number(process.env.MIN_PASSWORD_LENGTH || 8),
  guestAnalysisLimit: Number(process.env.GUEST_ANALYSIS_LIMIT || 1),

  // Lightweight per-IP rate limiting. Disabled by default under NODE_ENV=test
  // so the existing suite stays deterministic; rate-limit tests opt in via a
  // config override. Independent of the guest identity mechanism (X-Guest-Id).
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED
    ? process.env.RATE_LIMIT_ENABLED === 'true'
    : (process.env.NODE_ENV || 'development') !== 'test',
  rateLimits: {
    windowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    signup: parsePositiveInt(process.env.RATE_LIMIT_SIGNUP_MAX, 10),
    login: parsePositiveInt(process.env.RATE_LIMIT_LOGIN_MAX, 20),
    analysis: parsePositiveInt(process.env.RATE_LIMIT_ANALYSIS_MAX, 60),
  },

  // Legacy single-provider selector — still honored when AI_PROVIDER_CHAIN
  // and AI_MODE are both unset (see providerModes.js).
  aiProvider: process.env.AI_PROVIDER || 'mock',
  // 'automatic' (configured chain) | 'cloud' | 'private' | 'demo'
  aiMode: process.env.AI_MODE || 'automatic',
  // Ordered, comma-separated provider names, e.g. "gemini,groq,openrouter,ollama,mock"
  aiProviderChain: process.env.AI_PROVIDER_CHAIN || '',
  // How long a provider is skipped after a quota/rate-limit failure, unless
  // the provider's own Retry-After response overrides it for that failure.
  providerCooldownMs: Number(process.env.AI_PROVIDER_COOLDOWN_MS || 300_000),

  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  ollamaMaxConcurrency: Number(process.env.OLLAMA_MAX_CONCURRENCY || 2),
  ollamaNumPredict: Number(process.env.OLLAMA_NUM_PREDICT || 600),

  // Never sent to the client — read server-side only, used to call each
  // hosted provider's API directly from this backend.
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',

  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',

  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterModels: parseCommaList(process.env.OPENROUTER_MODELS).length > 0
    ? parseCommaList(process.env.OPENROUTER_MODELS)
    : ['meta-llama/llama-3.1-8b-instruct:free'],

  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 10000),
  aiTemperature: Number(process.env.AI_TEMPERATURE || 0.2),
  maxResumeTextLength: Number(process.env.MAX_RESUME_TEXT_LENGTH || 20000),
  maxUploadFileSizeBytes: Number(process.env.MAX_UPLOAD_FILE_SIZE_BYTES || 5 * 1024 * 1024),

  // Job Posting URL Import — SSRF-hardened fetch bounds. AI cleanup is an
  // opt-in single-call fallback for noisy HTML (off by default; no token use).
  jobExtractTimeoutMs: Number(process.env.JOB_EXTRACT_TIMEOUT_MS || 8000),
  jobExtractMaxBytes: Number(process.env.JOB_EXTRACT_MAX_BYTES || 2 * 1024 * 1024),
  jobExtractMaxRedirects: Number(process.env.JOB_EXTRACT_MAX_REDIRECTS || 3),
  jobExtractAiCleanup: process.env.JOB_EXTRACT_AI_CLEANUP === 'true',

  // Interview Question Generation — token-conscious, on-demand only.
  interviewNumPredict: Number(process.env.INTERVIEW_NUM_PREDICT || 700),
  interviewMaxQuestions: Number(process.env.INTERVIEW_MAX_QUESTIONS || 10),
}
