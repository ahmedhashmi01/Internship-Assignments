// Lightweight word-presence diff (NOT a full diff engine). Splits the rewritten
// text into segments, marking words that do not appear in the original as
// "added" so the UI can subtly highlight what was introduced.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'a', 'an', 'of', 'to', 'in', 'on', 'by', 'at',
  'is', 'are', 'was', 'were', 'that', 'this', 'as', 'from', 'or', 'it',
])

const normalizeWord = (word) => word.toLowerCase().replace(/[^a-z0-9]+/gu, '')

export const hasMeaningfulAdditions = (originalText = '', rewrittenText = '') =>
  splitAdditions(originalText, rewrittenText).some((segment) => segment.added)

// Returns [{ text, added }] preserving original spacing/punctuation so the
// caller can render each segment (added ones wrapped for highlight).
export const splitAdditions = (originalText = '', rewrittenText = '') => {
  if (!rewrittenText) return []
  const originalTokens = new Set(
    String(originalText).split(/\s+/u).map(normalizeWord).filter(Boolean),
  )

  // Split keeping the whitespace runs as their own segments.
  return String(rewrittenText)
    .split(/(\s+)/u)
    .filter((part) => part !== '')
    .map((part) => {
      if (/^\s+$/u.test(part)) return { text: part, added: false }
      const normalized = normalizeWord(part)
      const added =
        !!originalText &&
        normalized.length > 2 &&
        !STOPWORDS.has(normalized) &&
        !originalTokens.has(normalized)
      return { text: part, added }
    })
}
