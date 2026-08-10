import { MockProvider } from './mockProvider.js'
import { OllamaProvider } from './ollamaProvider.js'

export const createProvider = (config) => {
  const providerName = (config.aiProvider || 'mock').toLowerCase()

  if (providerName === 'mock') {
    return new MockProvider(config)
  }

  if (providerName === 'ollama') {
    return new OllamaProvider(config)
  }

  throw new Error(`Unsupported AI provider: ${providerName}`)
}
