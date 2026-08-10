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
