import { BaseProvider } from './providerInterface.js'
import { InvalidOutputError } from './errors.js'
import {
  skillMatchBatchOutputSchema,
  atsKeywordBatchOutputSchema,
  bulletRewriteBatchOutputSchema,
} from '../../schemas/workerSchemas.js'

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

/**
 * Pulls the `Input: {...}` JSON payload back out of a rendered prompt so the
 * mock provider can produce content-aware (not just schema-shaped) output.
 * Scans for a balanced brace pair rather than anchoring to end-of-string,
 * since providerService.generateJsonWithRetry appends a corrective suffix
 * after the JSON blob on retry.
 */
const extractInputPayload = (prompt = '') => {
  const marker = 'Input: '
  const markerIndex = prompt.indexOf(marker)
  if (markerIndex === -1) return null

  const jsonStart = markerIndex + marker.length
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = jsonStart; i < prompt.length; i += 1) {
    const char = prompt[i]

    if (inString) {
      if (escapeNext) {
        escapeNext = false
      } else if (char === '\\') {
        escapeNext = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(prompt.slice(jsonStart, i + 1))
        } catch {
          return null
        }
      }
    }
  }

  return null
}

const findEvidenceMatch = (term = '', evidence = []) => {
  const needle = term.toLowerCase()
  return evidence.find((item) => (item.text || '').toLowerCase().includes(needle))
}

const buildSkillMatchMock = (payload) => {
  const requirements = Array.isArray(payload?.requirements) && payload.requirements.length > 0
    ? payload.requirements
    : [{ skill: 'technical proficiency', requirementType: 'preferred' }]
  const evidence = Array.isArray(payload?.evidence) ? payload.evidence : []

  const items = requirements.map(({ skill, requirementType }) => {
    const match = findEvidenceMatch(skill, evidence)
    return {
      skill,
      requirementType: requirementType || 'preferred',
      status: match ? 'matched' : 'missing',
      ...(match ? { evidenceId: match.id } : {}),
      confidence: match ? 0.9 : 0.3,
    }
  })

  return { items }
}

const buildAtsKeywordMock = (payload) => {
  const keywords = Array.isArray(payload?.keywords) && payload.keywords.length > 0
    ? payload.keywords
    : ['relevant experience']
  const evidence = Array.isArray(payload?.evidence) ? payload.evidence : []

  const items = keywords.map((keyword) => {
    const match = findEvidenceMatch(keyword, evidence)
    return {
      keyword,
      status: match ? 'matched' : 'missing',
      ...(match ? { evidenceId: match.id } : {}),
      confidence: match ? 0.9 : 0.3,
    }
  })

  return { items }
}

const buildBulletRewriteMock = (payload) => {
  const bullets = Array.isArray(payload?.bullets) && payload.bullets.length > 0
    ? payload.bullets
    : ['Professional experience']
  const evidence = Array.isArray(payload?.evidence) ? payload.evidence : []
  const keywords = Array.isArray(payload?.keywords) ? payload.keywords.slice(0, 3) : []

  const rewrites = bullets.map((bulletText) => {
    const matchedEvidence = evidence.find((item) => item.text === bulletText) || findEvidenceMatch(bulletText, evidence)

    return {
      originalText: bulletText,
      rewrittenText: bulletText,
      evidenceId: matchedEvidence?.id || 'ev-001',
      changedKeywords: keywords,
      riskStatus: 'low',
    }
  })

  return { rewrites }
}

export class MockProvider extends BaseProvider {
  async generateText(prompt) {
    return `Mock response for: ${prompt.slice(0, 40)}`
  }

  async generateJson(prompt, schema) {
    let parsed

    if (schema === skillMatchBatchOutputSchema) {
      parsed = buildSkillMatchMock(extractInputPayload(prompt))
    } else if (schema === atsKeywordBatchOutputSchema) {
      parsed = buildAtsKeywordMock(extractInputPayload(prompt))
    } else if (schema === bulletRewriteBatchOutputSchema) {
      parsed = buildBulletRewriteMock(extractInputPayload(prompt))
    } else {
      parsed = createMockValue(schema)
    }

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
