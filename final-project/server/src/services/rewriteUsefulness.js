// Usefulness (semantic-improvement) validation for a bullet rewrite. Separate
// from anti-fabrication: a rewrite can be perfectly SAFE yet useless because it
// is identical or near-identical to the original. This detects that so the
// agent can trigger one usefulness-corrective retry.
//
// NOT a diff engine — token-set similarity plus a few cheap structural checks.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'to', 'in', 'on', 'of', 'by',
  'at', 'is', 'are', 'was', 'were', 'that', 'this', 'as', 'from', 'it', 'be',
])

const collapseWhitespace = (value) => value.replace(/\s+/gu, ' ').trim()

// Lowercased alphanumeric tokens (punctuation removed).
const tokenize = (value) =>
  collapseWhitespace(value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' '))
    .split(' ')
    .filter(Boolean)

const round = (value) => Number(value.toFixed(3))

/**
 * @returns {{ meaningfulRewrite: boolean, similarityScore: number, reason: string }}
 *   reason ∈ identical-to-original | punctuation-only-change | trivial-rewording | meaningful-rewrite
 */
export const evaluateRewriteUsefulness = (originalText = '', rewrittenText = '') => {
  const original = String(originalText ?? '')
  const rewritten = String(rewrittenText ?? '')

  // 1. Exact equality after trim.
  if (original.trim() === rewritten.trim()) {
    return { meaningfulRewrite: false, similarityScore: 1, reason: 'identical-to-original' }
  }

  // 2. Equality after case + whitespace normalization (whitespace/case-only diff).
  if (collapseWhitespace(original.toLowerCase()) === collapseWhitespace(rewritten.toLowerCase())) {
    return { meaningfulRewrite: false, similarityScore: 1, reason: 'identical-to-original' }
  }

  const originalTokens = tokenize(original)
  const rewrittenTokens = tokenize(rewritten)

  // 3. Punctuation-only change: identical alphanumeric token sequence.
  if (originalTokens.length === rewrittenTokens.length && originalTokens.join(' ') === rewrittenTokens.join(' ')) {
    return { meaningfulRewrite: false, similarityScore: 1, reason: 'punctuation-only-change' }
  }

  // Token-set (Jaccard) similarity.
  const originalSet = new Set(originalTokens)
  const rewrittenSet = new Set(rewrittenTokens)
  const intersection = [...rewrittenSet].filter((token) => originalSet.has(token)).length
  const union = new Set([...originalTokens, ...rewrittenTokens]).size
  const similarityScore = union === 0 ? 1 : round(intersection / union)

  // Meaningful (non-stopword, non-trivial) content introduced by the rewrite.
  const newContentTokens = [...rewrittenSet].filter(
    (token) => !originalSet.has(token) && token.length > 2 && !STOPWORDS.has(token),
  )

  // 4. Trivial rewording: extremely high similarity with no meaningful additions.
  if (similarityScore >= 0.8 && newContentTokens.length === 0) {
    return { meaningfulRewrite: false, similarityScore, reason: 'trivial-rewording' }
  }

  return { meaningfulRewrite: true, similarityScore, reason: 'meaningful-rewrite' }
}
