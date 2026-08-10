import { describe, expect, it } from 'vitest'
import { resolveProviderChainNames, DEFAULT_PROVIDER_CHAIN, CLOUD_PROVIDERS, PRIVATE_PROVIDERS, DEMO_PROVIDERS } from '../src/services/ai/providerModes.js'

describe('resolveProviderChainNames', () => {
  it('cloud mode uses only Gemini, Groq, OpenRouter', () => {
    expect(resolveProviderChainNames({ aiMode: 'cloud' })).toEqual(CLOUD_PROVIDERS)
    expect(resolveProviderChainNames({ aiMode: 'cloud' })).not.toContain('ollama')
    expect(resolveProviderChainNames({ aiMode: 'cloud' })).not.toContain('mock')
  })

  it('private mode uses only Ollama', () => {
    expect(resolveProviderChainNames({ aiMode: 'private' })).toEqual(PRIVATE_PROVIDERS)
    expect(resolveProviderChainNames({ aiMode: 'private' })).toEqual(['ollama'])
  })

  it('demo mode uses only mock', () => {
    expect(resolveProviderChainNames({ aiMode: 'demo' })).toEqual(DEMO_PROVIDERS)
    expect(resolveProviderChainNames({ aiMode: 'demo' })).toEqual(['mock'])
  })

  it('mode names are case-insensitive', () => {
    expect(resolveProviderChainNames({ aiMode: 'CLOUD' })).toEqual(CLOUD_PROVIDERS)
    expect(resolveProviderChainNames({ aiMode: 'Private' })).toEqual(PRIVATE_PROVIDERS)
  })

  it('automatic mode uses AI_PROVIDER_CHAIN when configured', () => {
    expect(resolveProviderChainNames({ aiMode: 'automatic', aiProviderChain: 'groq, ollama ,openrouter' })).toEqual(['groq', 'ollama', 'openrouter'])
  })

  it('automatic mode drops mock from a configured AI_PROVIDER_CHAIN — it must never silently fall back to mock', () => {
    expect(resolveProviderChainNames({ aiMode: 'automatic', aiProviderChain: 'groq, ollama ,mock' })).toEqual(['groq', 'ollama'])
  })

  it('automatic mode falls back to the legacy single AI_PROVIDER value when no chain is configured (backward compatibility)', () => {
    expect(resolveProviderChainNames({ aiMode: 'automatic', aiProvider: 'mock' })).toEqual(['mock'])
    expect(resolveProviderChainNames({ aiMode: 'automatic', aiProvider: 'ollama' })).toEqual(['ollama'])
  })

  it('defaults to automatic mode when aiMode is unset', () => {
    expect(resolveProviderChainNames({ aiProvider: 'mock' })).toEqual(['mock'])
  })

  it('falls back to the full default chain when neither a mode, a chain, nor a legacy provider is configured — and it never includes mock', () => {
    expect(resolveProviderChainNames({})).toEqual(DEFAULT_PROVIDER_CHAIN)
    expect(DEFAULT_PROVIDER_CHAIN).not.toContain('mock')
    expect(DEFAULT_PROVIDER_CHAIN).toEqual(['gemini', 'groq', 'openrouter', 'ollama'])
  })

  it('an empty AI_PROVIDER_CHAIN string is treated as unconfigured', () => {
    expect(resolveProviderChainNames({ aiProviderChain: '', aiProvider: 'mock' })).toEqual(['mock'])
    expect(resolveProviderChainNames({ aiProviderChain: '   ', aiProvider: 'mock' })).toEqual(['mock'])
  })
})
