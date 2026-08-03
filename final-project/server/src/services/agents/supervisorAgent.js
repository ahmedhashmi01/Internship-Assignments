import { BaseAgent } from './baseAgent.js'
import { supervisorPlanSchema } from '../../schemas/workerSchemas.js'

export class SupervisorAgent extends BaseAgent {
  async run(input) {
    const prompt = await this.loadPrompt()
    const renderedPrompt = `${prompt}\n\nInput: ${JSON.stringify({ jobTitle: input.jobTitle, jobDescription: input.jobDescription, evidenceSummary: input.evidenceSummary })}`
    const value = await this.providerService.generateJsonWithRetry(renderedPrompt, supervisorPlanSchema)
    return value
  }
}
