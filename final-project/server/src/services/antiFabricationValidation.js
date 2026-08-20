const normalizeText = (value = '') => value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()

const extractNumbers = (value = '') => Array.from(value.matchAll(/\b\d+(?:\.\d+)?(?:%|\b)/gu)).map((match) => match[0])
const extractDates = (value = '') => Array.from(value.matchAll(/\b(19|20)\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/giu)).map((match) => match[0])
const extractCurrency = (value = '') => Array.from(value.matchAll(/\$\d+(?:,\d{3})*(?:\.\d{2})?/gu)).map((match) => match[0])

// Ordinary connective/descriptive/transitional vocabulary that carries no new
// factual or technical claim on its own — common rewording verbs and
// prepositions should never trip unsupported-skill-or-tool by themselves.
const genericWords = new Set([
  'the', 'and', 'for', 'with', 'built', 'responsive', 'interfaces', 'internal', 'tools', 'platform',
  'delivery', 'migration', 'improved', 'adoption', 'across', 'developed', 'delivered', 'created',
  'design', 'product', 'service', 'team', 'project', 'work', 'application', 'system',
  // Connective/prepositional rewording vocabulary.
  'using', 'via', 'through', 'utilizing', 'utilising', 'handling', 'serving', 'leveraging',
  'employing', 'applying', 'working', 'involving', 'spanning', 'covering', 'supporting',
  'enabling', 'driving', 'ensuring', 'maintaining', 'providing', 'including', 'resulting',
  'achieving', 'helping', 'contributing', 'while', 'within', 'into', 'onto', 'upon', 'during',
  'after', 'before', 'between', 'among', 'also', 'further', 'additionally', 'overall',
  // Common impact/result-framing verbs and adjectives — generic phrasing, not
  // a specific claim about a tool/skill/scope.
  'enhancing', 'enhanced', 'optimizing', 'optimized', 'streamlining', 'streamlined',
  'based', 'focused', 'focusing', 'oriented', 'centered', 'more', 'new', 'various',
  'multiple', 'several', 'key', 'core', 'main', 'primary', 'effective', 'effectively',
  'efficient', 'efficiently', 'successfully', 'successful',
])
const technicalTerms = new Set(['react', 'javascript', 'node', 'express', 'vite', 'css', 'html', 'sql', 'python', 'aws', 'azure', 'docker', 'kubernetes', 'terraform', 'postgres', 'mongodb', 'redis', 'jira', 'scrum', 'typescript', 'java', 'csharp', 'dotnet'])

// Lightweight suffix-stripping "stem" — not a real linguistic stemmer, just
// enough to recognize that a word-form variant (e.g. "migrated") refers to
// the same underlying fact already present in the source text (e.g.
// "migration"), so paraphrasing isn't mistaken for a new claim. Suffixes are
// deliberately unambiguous (no "-ation", which would over-strip "migration"
// down to "migr" instead of the "migrat" that "migrated" also stems to).
const STEM_SUFFIXES = ['ing', 'ers', 'ies', 'ion', 'ive', 'er', 'ed', 'es', 'ly', 's']
const stem = (word) => {
  for (const suffix of STEM_SUFFIXES) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length)
    }
  }
  return word
}

export const validateEvidenceId = (evidenceId, evidenceIds) => {
  const valid = Boolean(evidenceId && evidenceIds.has(evidenceId))
  return {
    valid,
    flags: valid ? [] : ['invalid-evidence-id'],
    riskStatus: valid ? 'low' : 'high',
  }
}

export const validateRewriteIntegrity = (rewrite, evidenceEntries = []) => {
  const flags = []
  const evidenceText = evidenceEntries.map((entry) => entry?.text || '').join(' ')
  const normalizedEvidence = normalizeText(evidenceText)
  const normalizedRewrite = normalizeText(rewrite.rewrittenText || '')
  const originalText = normalizeText(rewrite.originalText || '')

  if (!rewrite.rewrittenText || !rewrite.originalText) {
    return { valid: false, flags: ['missing-rewrite-text'], riskStatus: 'high' }
  }

  const originalTokens = new Set(originalText.split(/\s+/u).filter(Boolean))
  const rewriteTokens = new Set(normalizedRewrite.split(/\s+/u).filter(Boolean))
  const overlap = [...rewriteTokens].filter((token) => originalTokens.has(token) || normalizedEvidence.includes(token)).length
  const hasOriginalAnchor = overlap > 0 || normalizedRewrite === originalText || normalizedRewrite.includes(originalText)

  if (!hasOriginalAnchor) {
    flags.push('rewrite-does-not-map-to-original-evidence')
  }

  const inventedMetrics = extractNumbers(rewrite.rewrittenText).filter((value) => !extractNumbers(rewrite.originalText).includes(value))
  if (inventedMetrics.length > 0) {
    flags.push('invented-metric')
  }

  const inventedDates = extractDates(rewrite.rewrittenText).filter((value) => !extractDates(rewrite.originalText).includes(value))
  if (inventedDates.length > 0) {
    flags.push('invented-date-or-year')
  }

  const inventedCurrency = extractCurrency(rewrite.rewrittenText).filter((value) => !extractCurrency(rewrite.originalText).includes(value))
  if (inventedCurrency.length > 0) {
    flags.push('invented-currency')
  }

  // Stemmed word forms already present in the evidence/original text — lets
  // "migrated" match "migration" (a word-form variant of the same fact)
  // without treating it as a newly invented claim.
  const evidenceStems = new Set(normalizedEvidence.split(/\s+/u).filter(Boolean).map(stem))
  const originalStems = new Set(originalText.split(/\s+/u).filter(Boolean).map(stem))

  const unsupportedTerms = []
  const rewriteTerms = new Set(normalizedRewrite.split(/\s+/u))
  for (const term of rewriteTerms) {
    if (!term) continue
    if (term.length <= 2) continue
    if (genericWords.has(term)) continue
    if (normalizedEvidence.includes(term) || originalText.includes(term)) continue
    if (evidenceStems.has(stem(term)) || originalStems.has(stem(term))) continue
    if (technicalTerms.has(term)) {
      unsupportedTerms.push(term)
      continue
    }
    if (/^[a-z]{3,}$/u.test(term)) {
      unsupportedTerms.push(term)
    }
  }

  if (unsupportedTerms.length > 0) {
    flags.push('unsupported-skill-or-tool')
  }

  const leadershipClaims = ['led', 'led the', 'owned', 'owned the', 'managed', 'managed the', 'directed', 'directed the', 'spearheaded', 'spearheaded the']
  const hasLeadershipClaim = leadershipClaims.some((claim) => normalizedRewrite.includes(claim))
  if (hasLeadershipClaim) {
    flags.push('unsupported-leadership-claim')
  }

  return {
    valid: flags.length === 0,
    flags,
    riskStatus: flags.length === 0 ? 'low' : flags.some((flag) => flag === 'invalid-evidence-id' || flag === 'invented-metric' || flag === 'invented-date-or-year' || flag === 'invented-currency') ? 'high' : 'medium',
  }
}
