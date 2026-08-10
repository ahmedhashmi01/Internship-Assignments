import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export const config = {
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  aiProvider: process.env.AI_PROVIDER || 'mock',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  ollamaMaxConcurrency: Number(process.env.OLLAMA_MAX_CONCURRENCY || 2),
  ollamaNumPredict: Number(process.env.OLLAMA_NUM_PREDICT || 600),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 10000),
  aiTemperature: Number(process.env.AI_TEMPERATURE || 0.2),
  maxResumeTextLength: Number(process.env.MAX_RESUME_TEXT_LENGTH || 20000),
  maxUploadFileSizeBytes: Number(process.env.MAX_UPLOAD_FILE_SIZE_BYTES || 5 * 1024 * 1024),
}
