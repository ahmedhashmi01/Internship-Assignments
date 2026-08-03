import { z } from 'zod'
import { createProvider } from './providerFactory.js'
import { InvalidOutputError } from './errors.js'

const defaultJsonSchema = z.object({ ok: z.boolean() })

export const createAiService = (config) => {
  const provider = createProvider(config)

  return {
    async generateText(prompt) {
      return provider.generateText(prompt)
    },

    async generateJson(prompt, schema = defaultJsonSchema) {
      const initial = await provider.generateJson(prompt, schema)
      return initial
    },

    async generateJsonWithRetry(prompt, schema = defaultJsonSchema) {
      try {
        return await provider.generateJson(prompt, schema)
      } catch (error) {
        if (error instanceof InvalidOutputError || error?.name === 'ZodError') {
          // Retry with a corrective suffix so the model gets an explicit reminder
          // to return only valid JSON (avoids repeating the same bad output)
          const correctedPrompt = `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Respond with ONLY a valid JSON object and nothing else — no markdown fences, no explanation.`
          return provider.generateJson(correctedPrompt, schema)
        }
        throw error
      }
    },

    async healthCheck() {
      return provider.healthCheck()
    },
  }
}
