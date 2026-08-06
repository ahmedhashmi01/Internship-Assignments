const STATUS_PRIORITY = { matched: 3, partial: 2, uncertain: 1, missing: 0 }
const REQUIREMENT_TYPE_PRIORITY = { mandatory: 2, preferred: 1, contextual: 0 }

const statusRank = (status) => STATUS_PRIORITY[status] ?? -1
const requirementTypeRank = (requirementType) => REQUIREMENT_TYPE_PRIORITY[requirementType] ?? -1

/**
 * Picks the surviving entry when the same requirement appears more than
 * once. "matched" always overrides "partial"/"uncertain"/"missing" for the
 * same requirement. Ties on status fall back to the more conservative
 * (higher-priority) requirement classification, then to higher confidence.
 */
const pickBetterItem = (a, b) => {
  const statusDelta = statusRank(a.status) - statusRank(b.status)
  if (statusDelta !== 0) return statusDelta > 0 ? a : b

  const typeDelta = requirementTypeRank(a.requirementType) - requirementTypeRank(b.requirementType)
  if (typeDelta !== 0) return typeDelta > 0 ? a : b

  return (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a
}

/**
 * Reconciles raw skill-match items into one final entry per requirement.
 * - Deduplicates case-insensitively on the skill name.
 * - "matched" overrides "partial"/"uncertain"/"missing" for the same
 *   requirement, so each requirement ends with exactly one, non-contradictory
 *   final status (no skill can end up both matched and missing).
 * - Preserves first-appearance order.
 */
export const reconcileSkillMatches = (items = []) => {
  const byKey = new Map()
  const order = []

  items.forEach((item) => {
    const skill = item?.skill
    if (!skill || typeof skill !== 'string') return

    const key = skill.trim().toLowerCase()
    if (!key) return

    if (!byKey.has(key)) {
      byKey.set(key, item)
      order.push(key)
      return
    }

    byKey.set(key, pickBetterItem(byKey.get(key), item))
  })

  return order.map((key) => byKey.get(key))
}
