import { BaseAgent } from './baseAgent.js'
import { skillMatchOutputSchema } from '../../schemas/workerSchemas.js'

export class SkillMatchAgent extends BaseAgent {
  async run(input) {
    const prompt = await this.loadPrompt()
    const renderedPrompt = `${prompt}\n\nInput: ${JSON.stringify({ skill: input.skill, evidence: input.evidence })}`
    const value = await this.providerService.generateJsonWithRetry(renderedPrompt, skillMatchOutputSchema)
    return value
  }
}
