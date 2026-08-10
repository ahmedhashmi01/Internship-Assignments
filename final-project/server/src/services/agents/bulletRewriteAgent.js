import { BaseAgent } from './baseAgent.js'
import { bulletRewriteOutputSchema } from '../../schemas/workerSchemas.js'

export class BulletRewriteAgent extends BaseAgent {
  async run(input) {
    const prompt = await this.loadPrompt()
    const renderedPrompt = `${prompt}\n\nInput: ${JSON.stringify({ bullet: input.bullet, jobDescription: input.jobDescription, evidence: input.evidence })}`
    const value = await this.providerService.generateJsonWithRetry(renderedPrompt, bulletRewriteOutputSchema)
    return value
  }
}
