import { BaseProvider } from './providerInterface.js'
import { InvalidOutputError } from './errors.js'

const createMockValue = (schema) => {
  if (!schema || typeof schema.parse !== 'function') {
    return { ok: true }
  }

  const typeName = schema._def?.typeName

  if (typeName === 'ZodString') {
    const regexCheck = schema._def.checks?.find((check) => check.kind === 'regex')
    if (regexCheck?.regex?.source?.includes('ev-')) {
      return 'ev-001'
    }

    return 'mock'
  }

  if (typeName === 'ZodNumber') {
    return 0.5
  }

  if (typeName === 'ZodBoolean') {
    return true
  }

  if (typeName === 'ZodEnum') {
    return schema._def.values[0]
  }

  if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
    return createMockValue(schema._def.innerType)
  }

  if (typeName === 'ZodArray') {
    return [createMockValue(schema._def.type)]
  }

  if (typeName === 'ZodObject') {
    const shape = typeof schema.shape === 'function' ? schema.shape() : schema.shape || {}
    return Object.fromEntries(
      Object.entries(shape).map(([key, fieldSchema]) => [key, createMockValue(fieldSchema)]),
    )
  }

  if (typeName === 'ZodDefault') {
    return createMockValue(schema._def.innerType)
  }

  return { ok: true }
}

export class MockProvider extends BaseProvider {
  async generateText(prompt) {
    return `Mock response for: ${prompt.slice(0, 40)}`
  }

  async generateJson(prompt, schema) {
    const parsed = createMockValue(schema)

    if (schema && typeof schema.parse === 'function') {
      return schema.parse(parsed)
    }

    return parsed
  }

  async generateJsonWithRetry(prompt, schema) {
    try {
      return await this.generateJson(prompt, schema)
    } catch (error) {
      if (error instanceof InvalidOutputError) {
        throw error
      }
      throw new InvalidOutputError('Mock provider invalid output', { cause: error })
    }
  }
}
