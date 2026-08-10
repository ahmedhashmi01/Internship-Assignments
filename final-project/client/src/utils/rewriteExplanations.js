import { computeRewriteDetails } from './antiFabricationValidation.js'

// Human-readable explanation for each raw validation code. The primary UI shows
// these — never the raw code. (Raw codes are kept for the technical-details
// disclosure and JSON export only.)
export const FLAG_MESSAGES = {
  'unsupported-skill-or-tool': 'Added skill or tool is not supported by the selected resume evidence.',
  'invented-metric': 'The rewrite introduces or changes a metric that is not supported by the original evidence.',
  'unsupported-leadership-claim': 'The rewrite adds a leadership or ownership claim that is not supported by the resume evidence.',
  'invented-date-or-year': 'The rewrite introduces a date or year that is not present in the original evidence.',
  'invented-currency': 'The rewrite introduces a monetary amount that is not present in the original evidence.',
  'rewrite-does-not-map-to-original-evidence': 'The rewrite could not be traced back to the original bullet or resume evidence.',
  'missing-rewrite-text': 'The rewrite is missing the required original or rewritten text.',
}

// Short, friendly labels for the Anti-Fabrication Verification summary chips.
export const FLAG_SHORT_LABELS = {
  'unsupported-skill-or-tool': 'Unsupported skill/tool',
  'invented-metric': 'Modified or unsupported metric',
  'unsupported-leadership-claim': 'Unsupported leadership claim',
  'invented-date-or-year': 'Unsupported date',
  'invented-currency': 'Unsupported amount',
  'rewrite-does-not-map-to-original-evidence': 'Not traceable to evidence',
  'missing-rewrite-text': 'Missing text',
}

const GENERIC_MESSAGE = 'This rewrite may include information that is not supported by the resume evidence.'

export const humanizeFlag = (code) => FLAG_MESSAGES[code] || GENERIC_MESSAGE
export const shortLabelForFlag = (code) => FLAG_SHORT_LABELS[code] || 'Needs review'

// Builds a specific, factual detail string for a flag when the validator can
// identify the exact term/metric — otherwise returns '' (the caller then shows
// only the generic human-readable message). Never invents explanations.
const detailForFlag = (code, details) => {
  switch (code) {
    case 'unsupported-skill-or-tool':
      return details.unsupportedTerms.length ? `Unsupported addition: ${details.unsupportedTerms.join(', ')}` : ''
    case 'invented-metric': {
      if (!details.inventedMetrics.length) return ''
      const original = details.originalMetrics.length ? `Original evidence: ${details.originalMetrics.join(', ')} → ` : ''
      return `${original}Rewrite: ${details.inventedMetrics.join(', ')}`
    }
    case 'invented-date-or-year':
      return details.inventedDates.length ? `Unsupported date: ${details.inventedDates.join(', ')}` : ''
    case 'invented-currency':
      return details.inventedCurrency.length ? `Unsupported amount: ${details.inventedCurrency.join(', ')}` : ''
    default:
      return ''
  }
}

// Flags that represent a fabricated hard fact — always high risk. A semantic
// rewording (a generic added word, tense/grammar change, restructuring) is only
// "review". This distinguishes severity WITHOUT weakening the anti-fabrication
// detection itself (the same flags are still produced).
const HIGH_RISK_FLAGS = new Set([
  'invented-metric',
  'invented-date-or-year',
  'invented-currency',
  'unsupported-leadership-claim',
])

// Returns 'safe' | 'review' | 'highRisk'. All three allow acceptance; severity
// only controls the strength of the warning and whether a confirmation is shown.
export const classifyRewriteSeverity = (flags = [], context = {}) => {
  if (!Array.isArray(flags) || flags.length === 0) return 'safe'
  if (flags.some((flag) => HIGH_RISK_FLAGS.has(flag))) return 'highRisk'

  // An unsupported *tool/technology* (e.g. an invented "TypeScript"/"AWS") is a
  // fabricated skill → high risk. A generic unsupported word (e.g. "development",
  // "currently") is a low-risk semantic rewording → review.
  if (flags.includes('unsupported-skill-or-tool')) {
    const details = computeRewriteDetails(
      { originalText: context.originalText, rewrittenText: context.rewrittenText },
      context.evidenceEntries || [],
    )
    if (details.unsupportedTechnicalTerms && details.unsupportedTechnicalTerms.length > 0) return 'highRisk'
  }

  return 'review'
}

// Copy for the single yellow "Review Required" card, by severity.
export const SEVERITY_COPY = {
  review: {
    title: 'Review recommended',
    body: 'AI-generated rewrites may introduce wording that is not directly present in your resume. Review this suggestion before accepting it.',
    secondary: 'Potentially unsupported wording detected.',
  },
  highRisk: {
    title: 'Review required',
    body: 'This suggestion may contain a specific fact — a skill, metric, date, amount, or claim — that is not supported by your resume evidence. Verify it before accepting.',
    secondary: 'Potentially fabricated detail detected.',
  },
}

// Maps a list of raw flags to { code, message, detail } for display. `context`
// is { originalText, rewrittenText, evidenceEntries }; when absent, only the
// generic human-readable message is produced (no invented specifics).
export const explainFlags = (flags = [], context = {}) => {
  const hasContext = context.originalText != null || context.rewrittenText != null
  const details = hasContext
    ? computeRewriteDetails(
        { originalText: context.originalText, rewrittenText: context.rewrittenText },
        context.evidenceEntries || [],
      )
    : null

  return flags.map((code) => ({
    code,
    message: humanizeFlag(code),
    detail: details ? detailForFlag(code, details) : '',
  }))
}
