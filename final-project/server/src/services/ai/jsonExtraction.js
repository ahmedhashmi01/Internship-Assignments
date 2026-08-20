import { InvalidOutputError } from './errors.js'

/**
 * Tolerant JSON extraction shared by every LLM-backed provider: strips
 * markdown code fences, preamble text, and trailing commas before parsing,
 * then falls back to extracting the first balanced {...}/[...] block.
 * Throws InvalidOutputError (reason: 'invalid-json') only when no valid
 * JSON can be recovered at all.
 */
export const extractJsonFromText = (text) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  let candidate = fenced ? fenced[1] : text

  const preambleStripped = candidate.replace(/^[^{[\r\n]*/u, '').trim()
  if (preambleStripped) candidate = preambleStripped

  const sanitized = candidate
    .trim()
    .replace(/,\s*([}\]])/gu, '$1')

  try {
    return JSON.parse(sanitized)
  } catch {
    const match = sanitized.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (match) {
      try {
        return JSON.parse(match[0].replace(/,\s*([}\]])/gu, '$1'))
      } catch {
        // fall through
      }
    }
    throw new InvalidOutputError('Invalid JSON returned by provider', {
      reason: 'invalid-json',
      text: sanitized.slice(0, 120),
      // TEMPORARY (interview json_validate_failed investigation) — the
      // complete pre-sanitization raw text, for diagnosing WHY parsing
      // failed (truncation, an unexpected wrapper shape, etc.) rather than
      // just that it failed. Never logged by default — see
      // aiDebugLog.js#logRawJsonParseFailure for the gating.
      rawText: text,
    })
  }
}
