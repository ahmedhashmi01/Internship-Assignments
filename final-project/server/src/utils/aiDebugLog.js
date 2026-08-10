/**
 * Debug logging for live-tracing which provider/model produced each worker
 * result and why. Gated entirely behind DEBUG_AI_RESPONSES=true — when
 * unset/false, none of these functions print anything (current logging
 * behavior, e.g. the separate DEBUG_AI_TIMING-gated [timing] logs, is
 * unaffected either way).
 *
 * Every payload here MUST already be safe to print: no API keys, no
 * Authorization headers, no raw provider response bodies, no full prompts,
 * no raw resume/job-description text. Callers redact (see redact.js) before
 * passing content in — this module does not re-derive safety, it trusts and
 * prints what it's given.
 */
import { redactDeep } from './redact.js'

export const aiDebugEnabled = () => process.env.DEBUG_AI_RESPONSES === 'true'

const printLine = (prefix, text) => {
  if (!aiDebugEnabled()) return
  console.log(`${prefix} ${text}`)
}

const printJson = (prefix, payload) => {
  if (!aiDebugEnabled()) return
  console.log(`${prefix} ${JSON.stringify(payload, null, 2)}`)
}

/** Requirement 2 — provider/model selection for a real AI call. */
export const logProviderSelection = ({ jobTitle, worker, provider, model, fallbackIndex, attempt, durationMs, retryCount, responseChars }) => {
  printLine(
    '[ai-debug]',
    `job=${jobTitle} worker=${worker} provider=${provider} model=${model} fallbackIndex=${fallbackIndex} attempt=${attempt} durationMs=${durationMs} retryCount=${retryCount} responseChars=${responseChars}`,
  )
}

/** Requirement 3 — the full parsed JSON returned by the selected model. */
export const logModelResponse = ({ jobTitle, worker, output }) => {
  printJson('[ai-response]', { job: jobTitle, worker, output: redactDeep(output) })
}

/** Requirement 4 — per-requirement skill-match diagnostics. */
export const logSkillDebug = ({ jobTitle, requirements }) => {
  printJson('[skill-debug]', { job: jobTitle, requirements: redactDeep(requirements) })
}

/** Requirement 5 — ATS keyword-matching diagnostics. */
export const logAtsDebug = ({ jobTitle, extractedKeywords, genericKeywordsRemoved, normalizedPhrases, matched, missing }) => {
  printJson('[ats-debug]', {
    job: jobTitle,
    extractedKeywords: redactDeep(extractedKeywords),
    genericKeywordsRemoved: redactDeep(genericKeywordsRemoved),
    normalizedPhrases: redactDeep(normalizedPhrases),
    matched: redactDeep(matched),
    missing: redactDeep(missing),
  })
}

/** Requirement 6 — full scoring breakdown for a ranked job. */
export const logScoreDebug = (breakdown) => {
  printJson('[score-debug]', breakdown)
}

/** Requirement 7 — a finalScore === 100 result, with the components that produced it. */
export const logScoreWarning = (details) => {
  printJson('[score-warning]', details)
}
