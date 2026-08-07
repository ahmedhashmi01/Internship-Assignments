import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const parseCommaList = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean)

export const config = {
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

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
}
