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

/**
 * Fills in `confidence` on skill-match items ONLY when the key is truly
 * absent (`undefined`). A present-but-invalid confidence (wrong type,
 * out-of-range, `null`) is left untouched so normal Zod validation still
 * rejects it — only "missing" is treated as repairable, per spec. Valid
 * model-provided confidence is always preserved as-is.
 */
export const repairSkillMatchConfidence = (parsed) => {
  if (!parsed || !Array.isArray(parsed.items)) return parsed

  return {
    ...parsed,
    items: parsed.items.map((item) => {
      if (!item || item.confidence !== undefined) return item

      const fallback = CONFIDENCE_BY_STATUS[item.status]
      return fallback === undefined ? item : { ...item, confidence: fallback }
    }),
  }
}

export const isValidSkillMatchConfidence = isValidConfidence
