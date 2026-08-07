import { MockProvider } from './mockProvider.js'
import { OllamaProvider } from './ollamaProvider.js'
import { GeminiProvider } from './geminiProvider.js'
import { GroqProvider } from './groqProvider.js'
import { OpenRouterProvider } from './openRouterProvider.js'

const PROVIDER_BUILDERS = {
  mock: (config) => new MockProvider(config),
  ollama: (config) => new OllamaProvider(config),
  gemini: (config) => new GeminiProvider(config),
  groq: (config) => new GroqProvider(config),
  openrouter: (config) => new OpenRouterProvider(config),
}

export const createNamedProvider = (providerName, config) => {
  const builder = PROVIDER_BUILDERS[String(providerName || '').toLowerCase()]
  if (!builder) {
    throw new Error(`Unsupported AI provider: ${providerName}`)
  }
  return builder(config)
}

// Preserved for backward compatibility — single-provider construction from
// the legacy `config.aiProvider` field.
export const createProvider = (config) => createNamedProvider(config.aiProvider || 'mock', config)
