import { BaseAgent } from './baseAgent.js'

// Deterministic replacement for the former LLM-based supervisor call — the
// plan/status text is a fixed description of what the two remaining LLM
// workers (skillMatch, bulletRewrite) and the deterministic ATS matcher are
// about to do, so no model reasoning is required to produce it.
export class SupervisorAgent extends BaseAgent {
  async run(input) {
    const evidenceLineCount = (input.evidenceSummary || '')
      .split('\n')
      .filter((line) => line.trim().length > 0).length
    const jobTitle = input.jobTitle || 'the target role'

    return {
      plan: [
        `Extract requirements and ATS keywords for "${jobTitle}"`,
        `Match ${evidenceLineCount} resume evidence line(s) against extracted requirements (skill-match)`,
        'Match extracted keywords against resume evidence via deterministic phrase matching (ATS)',
        'Generate evidence-grounded bullet rewrites for the most relevant experience',
      ],
      rationale: `Deterministic plan for "${jobTitle}": ${evidenceLineCount} evidence line(s) available. No LLM call is used for planning.`,
    }
  }
}
