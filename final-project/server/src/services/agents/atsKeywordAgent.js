import { BaseAgent } from './baseAgent.js'
import { matchKeywordsToEvidence } from '../jobInputExtractor.js'
import { atsKeywordBatchOutputSchema } from '../../schemas/workerSchemas.js'

// Deterministic replacement for the former LLM-based ATS worker — normalized
// phrase matching against resume evidence, validated against the same batch
// output schema the LLM path used so downstream consumers see no shape change.
export class AtsKeywordAgent extends BaseAgent {
  async run(input) {
    const items = matchKeywordsToEvidence(input.keywords, input.evidence)
    const validated = atsKeywordBatchOutputSchema.parse({ items })

    return { keywordMatches: validated.items }
  }
}
