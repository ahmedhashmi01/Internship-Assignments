import { BaseAgent } from './baseAgent.js'
import { matchKeywordsToEvidence, normalizePhrase } from '../jobInputExtractor.js'
import { atsKeywordBatchOutputSchema } from '../../schemas/workerSchemas.js'
import { logAtsDebug } from '../../utils/aiDebugLog.js'

// Deterministic replacement for the former LLM-based ATS worker — normalized
// phrase matching against resume evidence, validated against the same batch
// output schema the LLM path used so downstream consumers see no shape change.
export class AtsKeywordAgent extends BaseAgent {
  async run(input) {
    const items = matchKeywordsToEvidence(input.keywords, input.evidence)
    const validated = atsKeywordBatchOutputSchema.parse({ items })

    logAtsDebug({
      jobTitle: input.jobTitle,
      extractedKeywords: input.keywords || [],
      // The current deterministic extractor (jobInputExtractor.js) does not
      // apply a distinct "generic term" filter at this stage — stop-words
      // are already excluded upstream, before keywords ever reach this
      // worker — so there is nothing further removed here to report.
      genericKeywordsRemoved: [],
      normalizedPhrases: (input.keywords || []).map((keyword) => ({ keyword, normalized: normalizePhrase(keyword) })),
      matched: validated.items.filter((item) => item.status === 'matched').map((item) => ({ keyword: item.keyword, evidenceId: item.evidenceId })),
      missing: validated.items.filter((item) => item.status === 'missing').map((item) => item.keyword),
    })

    return { keywordMatches: validated.items }
  }
}
