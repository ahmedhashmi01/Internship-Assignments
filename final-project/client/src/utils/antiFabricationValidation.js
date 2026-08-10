// Client-side port of server/src/services/antiFabricationValidation.js —
// same detection rules, used to re-validate a bullet rewrite locally after a
// user edits it (Save Edit), without a round-trip to the backend.
const normalizeText = (value = '') => value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()

const extractNumbers = (value = '') => Array.from(value.matchAll(/\b\d+(?:\.\d+)?(?:%|\b)/gu)).map((match) => match[0])
const extractDates = (value = '') => Array.from(value.matchAll(/\b(19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/giu)).map((match) => match[0])
const extractCurrency = (value = '') => Array.from(value.matchAll(/\$\d+(?:,\d{3})*(?:\.\d{2})?/gu)).map((match) => match[0])
const genericWords = new Set(['the', 'and', 'for', 'with', 'built', 'responsive', 'interfaces', 'internal', 'tools', 'platform', 'delivery', 'migration', 'improved', 'adoption', 'across', 'improved', 'built', 'developed', 'delivered', 'created', 'design', 'product', 'service', 'team', 'project', 'work', 'application', 'system'])
const technicalTerms = new Set(['react', 'javascript', 'node', 'express', 'vite', 'css', 'html', 'sql', 'python', 'aws', 'azure', 'docker', 'kubernetes', 'terraform', 'postgres', 'mongodb', 'redis', 'jira', 'scrum', 'typescript', 'java', 'csharp', 'dotnet'])

const leadershipClaims = ['led', 'led the', 'owned', 'owned the', 'managed', 'managed the', 'directed', 'directed the', 'spearheaded', 'spearheaded the']

// Computes the concrete evidence behind each rule (unsupported terms, changed
// metrics, etc.). Pure and additive: `validateRewriteIntegrity` builds its flags
// from exactly these values, so exposing them does not change any rule — it only
// lets the UI surface the specific term/metric that triggered a flag.
export const computeRewriteDetails = (rewrite = {}, evidenceEntries = []) => {
  const evidenceText = evidenceEntries.map((entry) => entry?.text || '').join(' ')
  const normalizedEvidence = normalizeText(evidenceText)
  const normalizedRewrite = normalizeText(rewrite.rewrittenText || '')
  const originalText = normalizeText(rewrite.originalText || '')

  const originalMetrics = extractNumbers(rewrite.originalText || '')
  const inventedMetrics = extractNumbers(rewrite.rewrittenText || '').filter((value) => !originalMetrics.includes(value))
  const inventedDates = extractDates(rewrite.rewrittenText || '').filter((value) => !extractDates(rewrite.originalText || '').includes(value))
  const inventedCurrency = extractCurrency(rewrite.rewrittenText || '').filter((value) => !extractCurrency(rewrite.originalText || '').includes(value))

  const originalTokens = new Set(originalText.split(/\s+/u).filter(Boolean))
  const rewriteTokens = new Set(normalizedRewrite.split(/\s+/u).filter(Boolean))
  const overlap = [...rewriteTokens].filter((token) => originalTokens.has(token) || normalizedEvidence.includes(token)).length
  const hasOriginalAnchor = overlap > 0 || normalizedRewrite === originalText || normalizedRewrite.includes(originalText)

  const unsupportedTerms = []
  for (const term of rewriteTokens) {
    if (!term) continue
    if (term.length <= 2) continue
    if (genericWords.has(term)) continue
    if (normalizedEvidence.includes(term) || originalText.includes(term)) continue
    if (technicalTerms.has(term)) {
      unsupportedTerms.push(term)
      continue
    }
    if (/^[a-z]{3,}$/u.test(term) && !normalizedEvidence.includes(term)) {
      unsupportedTerms.push(term)
    }
  }

  const hasLeadershipClaim = leadershipClaims.some((claim) => normalizedRewrite.includes(claim))

  return {
    originalMetrics,
    inventedMetrics,
    inventedDates,
    inventedCurrency,
    unsupportedTerms,
    hasOriginalAnchor,
    hasLeadershipClaim,
  }
}

export const validateRewriteIntegrity = (rewrite, evidenceEntries = []) => {
  if (!rewrite.rewrittenText || !rewrite.originalText) {
    return { valid: false, flags: ['missing-rewrite-text'], riskStatus: 'high' }
  }

  const details = computeRewriteDetails(rewrite, evidenceEntries)
  const flags = []

  if (!details.hasOriginalAnchor) flags.push('rewrite-does-not-map-to-original-evidence')
  if (details.inventedMetrics.length > 0) flags.push('invented-metric')
  if (details.inventedDates.length > 0) flags.push('invented-date-or-year')
  if (details.inventedCurrency.length > 0) flags.push('invented-currency')
  if (details.unsupportedTerms.length > 0) flags.push('unsupported-skill-or-tool')
  if (details.hasLeadershipClaim) flags.push('unsupported-leadership-claim')

  return {
    valid: flags.length === 0,
    flags,
    riskStatus:
      flags.length === 0
        ? 'low'
        : flags.some((flag) => flag === 'invalid-evidence-id' || flag === 'invented-metric' || flag === 'invented-date-or-year' || flag === 'invented-currency')
          ? 'high'
          : 'medium',
  }
}

// Mirrors server/src/services/rewriteApproval.js#computeNeedsReview.
const NEEDS_REVIEW_FLAGS = new Set(['invented-metric', 'unsupported-skill-or-tool'])
export const computeNeedsReview = (flags = []) => flags.some((flag) => NEEDS_REVIEW_FLAGS.has(flag))
