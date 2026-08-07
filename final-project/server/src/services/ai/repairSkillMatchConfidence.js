// Deterministic fallback confidence per skill-match status — used only when
// the model's JSON is otherwise valid but omits the required `confidence`
// field (a confirmed, reproducible qwen2.5:1.5b behavior on 5-item batches:
// syntactically complete JSON, `done_reason: "stop"`, tokens to spare, but no
// `confidence` key on any item). Retrying the whole batch for a single
// missing scalar wastes a full generation cycle (~20-45s) for no benefit.
const CONFIDENCE_BY_STATUS = {
  matched: 0.9,
  partial: 0.6,
  uncertain: 0.35,
  missing: 0,
}

const isValidConfidence = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

const REPAIRED_INDICES_KEY = '__confidenceRepairedIndices'

/**
 * Fills in `confidence` on skill-match items ONLY when the key is truly
 * absent (`undefined`). A present-but-invalid confidence (wrong type,
 * out-of-range, `null`) is left untouched so normal Zod validation still
 * rejects it — only "missing" is treated as repairable, per spec. Valid
 * model-provided confidence is always preserved as-is.
 *
 * For diagnostics (skill-debug logging), the indices of items that were
 * backend-repaired (as opposed to model-provided) are recorded as a hidden,
 * non-enumerable property on the returned object — invisible to
 * JSON.stringify/schema validation, but readable via
 * `getConfidenceRepairedIndices()` before the object is discarded. Zod's
 * `.parse()` builds a NEW object, so this marker does not survive validation
 * on its own — see `carryConfidenceRepairInfo` below.
 */
export const repairSkillMatchConfidence = (parsed) => {
  if (!parsed || !Array.isArray(parsed.items)) return parsed

  const repairedIndices = []
  const items = parsed.items.map((item, index) => {
    if (!item || item.confidence !== undefined) return item

    const fallback = CONFIDENCE_BY_STATUS[item.status]
    if (fallback === undefined) return item
    repairedIndices.push(index)
    return { ...item, confidence: fallback }
  })

  const result = { ...parsed, items }
  try {
    Object.defineProperty(result, REPAIRED_INDICES_KEY, { value: repairedIndices, enumerable: false, configurable: true })
  } catch {
    // Non-extensible result (rare) — the marker just won't be attached.
  }
  return result
}

export const getConfidenceRepairedIndices = (value) => (value && typeof value === 'object' ? value[REPAIRED_INDICES_KEY] || [] : [])

/**
 * Re-attaches the repaired-indices marker from the pre-validation object
 * (`source`, returned by repairSkillMatchConfidence) onto the post-validation
 * object (`target`, returned by schema.parse()) — call this right after
 * `schema.parse()` in each provider that handles skillMatchBatchOutputSchema.
 */
export const carryConfidenceRepairInfo = (source, target) => {
  const indices = getConfidenceRepairedIndices(source)
  if (indices.length === 0 || !target || typeof target !== 'object') return target
  try {
    Object.defineProperty(target, REPAIRED_INDICES_KEY, { value: indices, enumerable: false, configurable: true })
  } catch {
    // Non-extensible target (rare) — the marker just won't be attached.
  }
  return target
}

export const isValidSkillMatchConfidence = isValidConfidence
