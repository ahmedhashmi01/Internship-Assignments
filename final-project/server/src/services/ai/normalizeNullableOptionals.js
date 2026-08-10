/**
 * Ollama's JSON mode often fills declared-but-unset optional fields with an
 * explicit `null` instead of omitting them. Zod's `.optional()` only accepts
 * `undefined`, not `null`, so a response like `{ "gapType": null }` fails
 * validation even though the model is (correctly) saying "no value" —
 * forcing an unnecessary retry.
 *
 * This walks a parsed value against its Zod schema and converts `null` to
 * `undefined` ONLY for fields the schema itself marks optional (`.optional()`
 * or `.default()`). Required fields are left untouched — a `null` on a
 * required field still fails validation exactly as before. The Zod schema
 * definitions are never modified; this is a data transform, not a schema
 * change.
 */
export const normalizeNullableOptionals = (value, schema) => {
  if (!schema || typeof schema !== 'object') return value

  const typeName = schema._def?.typeName

  if (typeName === 'ZodOptional' || typeName === 'ZodDefault') {
    return normalizeNullableOptionals(value, schema._def.innerType)
  }

  if (typeName === 'ZodObject' && value && typeof value === 'object' && !Array.isArray(value)) {
    const shape = typeof schema.shape === 'function' ? schema.shape() : schema.shape || {}
    const result = { ...value }

    for (const [key, fieldSchema] of Object.entries(shape)) {
      if (!(key in result)) continue

      const fieldTypeName = fieldSchema._def?.typeName
      const isOptionalField = fieldTypeName === 'ZodOptional' || fieldTypeName === 'ZodDefault'

      if (result[key] === null && isOptionalField) {
        delete result[key]
        continue
      }

      result[key] = normalizeNullableOptionals(result[key], fieldSchema)
    }

    return result
  }

  if (typeName === 'ZodArray' && Array.isArray(value)) {
    return value.map((item) => normalizeNullableOptionals(item, schema._def.type))
  }

  return value
}
