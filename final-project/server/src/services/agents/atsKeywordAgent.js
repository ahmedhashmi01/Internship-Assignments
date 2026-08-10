import { BaseAgent } from './baseAgent.js'
import { atsKeywordOutputSchema } from '../../schemas/workerSchemas.js'

export class AtsKeywordAgent extends BaseAgent {
  async run(input) {
    const prompt = await this.loadPrompt()
    const renderedPrompt = `${prompt}\n\nInput: ${JSON.stringify({ keyword: input.keyword, evidence: input.evidence })}`
    const value = await this.providerService.generateJsonWithRetry(renderedPrompt, atsKeywordOutputSchema)
    return value
  }
}
