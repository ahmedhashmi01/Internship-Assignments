/**
 * jobInputExtractor.js
 *
 * Pure, deterministic functions that convert a raw job description and a
 * normalized resume into the concrete inputs each AI worker needs.
 *
 * No AI, no external dependencies, no side-effects.
 * All functions are exported so they can be unit-tested in isolation.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TECH_TERM_PATTERN =
  /\b(React|Angular|Vue\.?js|TypeScript|JavaScript|Python|Java|C\+\+|C#|Go|Rust|Swift|Kotlin|Ruby|PHP|Scala|Haskell|Elixir|Node\.?js|Express\.?js|Fastify|NestJS|Django|FastAPI|Flask|Spring(?:\s+Boot)?|Next\.?js|Nuxt\.?js|Svelte|AWS|Azure|GCP|Google\s+Cloud|Docker|Kubernetes|Helm|Terraform|Ansible|Jenkins|CircleCI|GitHub\s+Actions|GitLab|CI\/CD|DevOps|Agile|Scrum|Kanban|SAFe|SQL|PostgreSQL|MySQL|SQLite|MariaDB|MongoDB|Redis|Cassandra|DynamoDB|Elasticsearch|ClickHouse|Snowflake|BigQuery|dbt|Airflow|Apache\s+Spark|Hadoop|Kafka|RabbitMQ|GraphQL|REST(?:ful)?|gRPC|WebSockets|Machine\s+Learning|Deep\s+Learning|Data\s+Science|NLP|Computer\s+Vision|TensorFlow|PyTorch|scikit-learn|Pandas|NumPy|Figma|Sketch|Tailwind|SCSS|Sass|HTML|CSS|Redux|RxJS|Jest|Pytest|Cypress|Playwright|Selenium|Git|Linux|Datadog|Prometheus|Grafana|JIRA|Confluence|Salesforce|SAP|Power\s*BI|Tableau|Excel|Android|iOS|Flutter|React\s+Native)\b/gi

/** Returns deduplicated tech terms in order of first appearance. */
const extractTechTerms = (text = '') => {
  const seen = new Set()
  const result = []
  for (const match of text.matchAll(TECH_TERM_PATTERN)) {
    const term = match[0].replace(/\s+/g, ' ').trim()
    const key = term.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(term)
    }
  }
  return result
}

/** Stop-words for the capitalised-noun fallback. */
const STOP_WORDS = new Set([
  'The', 'Our', 'You', 'We', 'They', 'This', 'That', 'With', 'For', 'And',
  'Or', 'But', 'Job', 'Role', 'Team', 'Work', 'Will', 'Must', 'Have', 'Has',
  'Can', 'May', 'Are', 'Is', 'In', 'At', 'To', 'Of', 'On', 'By', 'Be', 'As',
  'An', 'Not', 'All', 'If', 'When', 'Where', 'Who', 'How', 'What', 'More',
  'Some', 'Key', 'Strong', 'Proven', 'Experience', 'Skills', 'Position',
  'Candidate', 'Minimum', 'Required', 'Excellent', 'Ability', 'Year', 'Years',
  'Degree', 'Bachelor', 'Master', 'Preferred',
])

/** Returns capitalised nouns, minus stop-words, deduplicated case-insensitively. */
const extractCapitalizedNouns = (text = '') => {
  const seen = new Set()
  const result = []
  for (const word of text.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []) {
    if (STOP_WORDS.has(word)) continue
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(word)
  }
  return result
}

// ---------------------------------------------------------------------------
// Signals that suggest "mandatory" vs "preferred" wording
// ---------------------------------------------------------------------------
const MANDATORY_SIGNALS = [
  'required', 'must have', 'must be', 'must possess', 'essential', 'minimum',
  'at least', 'you must', 'mandatory', 'need to have', 'requires',
]
const PREFERRED_SIGNALS = [
  'preferred', 'nice to have', 'bonus', 'plus', 'ideal', 'desirable',
  'advantage', 'beneficial', 'optionally', 'if possible',
]

/**
 * Given a job description and a skill name, infers the requirement type.
 * Looks at the sentence containing the skill for mandatory/preferred signals.
 * Falls back to 'preferred'.
 */
const inferRequirementType = (jobDescription, skill) => {
  // Find the sentence(s) that mention the skill (case-insensitive)
  const sentences = jobDescription.split(/[.!?\n]+/)
  const sentence = sentences.find((s) =>
    s.toLowerCase().includes(skill.toLowerCase()),
  ) || ''
  const lower = sentence.toLowerCase()

  if (MANDATORY_SIGNALS.some((sig) => lower.includes(sig))) return 'mandatory'
  if (PREFERRED_SIGNALS.some((sig) => lower.includes(sig))) return 'preferred'

  // Heuristic: first two tech terms mentioned are usually mandatory
  return 'preferred'
}

// ---------------------------------------------------------------------------
// Multi-item extraction (new in this iteration)
// ---------------------------------------------------------------------------

/**
 * Extracts up to `max` job requirements from the job description.
 * Each entry includes the skill name and its classified requirement type.
 * Case-insensitively deduplicated.
 *
 * @param {string} jobDescription
 * @param {number} [max=10]
 * @returns {Array<{ skill: string, requirementType: 'mandatory'|'preferred'|'contextual' }>}
 */
export const extractRequirements = (jobDescription = '', max = 10) => {
  const terms = extractTechTerms(jobDescription)
  const fallback = extractCapitalizedNouns(jobDescription)
  const candidates = terms.length > 0 ? terms : fallback

  // First two tech terms default to mandatory; rest to preferred unless signals say otherwise
  return candidates.slice(0, max).map((skill, index) => {
    const inferred = inferRequirementType(jobDescription, skill)
    // If no explicit signal was found in the sentence, promote first two to mandatory
    const requirementType = inferred !== 'preferred'
      ? inferred
      : index < 2 ? 'mandatory' : 'preferred'
    return { skill, requirementType }
  })
}

/**
 * Extracts up to `max` ATS keywords from the job description.
 * Returns a flat string array, case-insensitively deduplicated.
 * Includes tech terms first, then capitalised nouns as filler.
 *
 * @param {string} jobDescription
 * @param {number} [max=15]
 * @returns {string[]}
 */
export const extractKeywords = (jobDescription = '', max = 15) => {
  const terms = extractTechTerms(jobDescription)
  if (terms.length >= max) return terms.slice(0, max)

  // Fill remaining slots with capitalised nouns not already covered
  const termSet = new Set(terms.map((t) => t.toLowerCase()))
  const extra = extractCapitalizedNouns(jobDescription).filter(
    (n) => !termSet.has(n.toLowerCase()),
  )
  return [...terms, ...extra].slice(0, max)
}

const normalizePhrase = (value = '') => value.toLowerCase().replace(/\s+/gu, ' ').trim()

/**
 * Deterministically matches each keyword against resume evidence via
 * normalized (case/whitespace-insensitive) substring phrase matching — no
 * LLM call required. Mirrors the atsKeywordBatchOutputSchema item shape.
 *
 * @param {string[]} keywords
 * @param {Array<{id: string, text: string}>} evidence
 * @returns {Array<{keyword: string, status: 'matched'|'missing', evidenceId?: string, confidence: number}>}
 */
export const matchKeywordsToEvidence = (keywords = [], evidence = []) => {
  const effectiveKeywords = keywords.length > 0 ? keywords : ['relevant experience']
  const normalizedEvidence = evidence.map((item) => ({
    id: item.id,
    normalizedText: normalizePhrase(item.text || ''),
  }))

  return effectiveKeywords.map((keyword) => {
    const normalizedKeyword = normalizePhrase(keyword)
    const match = normalizedKeyword
      ? normalizedEvidence.find((entry) => entry.normalizedText.includes(normalizedKeyword))
      : undefined

    return {
      keyword,
      status: match ? 'matched' : 'missing',
      ...(match ? { evidenceId: match.id } : {}),
      confidence: match ? 0.95 : 0.2,
    }
  })
}

/**
 * Picks up to `max` evidence items most relevant to the job description,
 * ordered by descending word-overlap score. Ties broken by original index.
 * Always returns items with valid `ev-###` IDs.
 *
 * @param {string} jobDescription
 * @param {Array<{id: string, text: string}>} evidence
 * @param {number} [max=5]
 * @returns {Array<{id: string, text: string}>}
 */
export const pickTopEvidenceItems = (jobDescription = '', evidence = [], max = 5) => {
  if (!evidence.length) return []

  const jobWords = new Set((jobDescription.toLowerCase().match(/\b[a-z]{4,}\b/g) || []))

  const scored = evidence.map((item, index) => {
    const words = ((item.text || '').toLowerCase().match(/\b[a-z]{4,}\b/g) || [])
    const score = words.filter((w) => jobWords.has(w)).length
    return { item, score, index }
  })

  scored.sort((a, b) => b.score - a.score || a.index - b.index)

  return scored.slice(0, max).map((entry) => entry.item)
}

// ---------------------------------------------------------------------------
// Backward-compatible single-item exports (used by existing tests + extractor
// tests that reference these names directly)
// ---------------------------------------------------------------------------

/**
 * Returns the single most prominent technical skill in the job description.
 * @deprecated Prefer extractRequirements() for new code.
 */
export const extractPrimarySkill = (jobDescription = '') => {
  const terms = extractTechTerms(jobDescription)
  if (terms.length > 0) return terms[0]
  return extractCapitalizedNouns(jobDescription)[0] || 'technical proficiency'
}

/**
 * Returns a second distinctive keyword from the job description.
 * @deprecated Prefer extractKeywords() for new code.
 */
export const extractPrimaryKeyword = (jobDescription = '') => {
  const terms = extractTechTerms(jobDescription)
  if (terms.length > 1) return terms[1]
  if (terms.length === 1) return terms[0]
  return extractCapitalizedNouns(jobDescription)[0] || 'relevant experience'
}

/**
 * Returns the single evidence item with the highest job-description overlap.
 * @deprecated Prefer pickTopEvidenceItems() for new code.
 */
export const pickMostRelevantEvidence = (jobDescription = '', evidence = []) => {
  const results = pickTopEvidenceItems(jobDescription, evidence, 1)
  return results.length > 0 ? results[0] : null
}

/**
 * Builds a concise summary of all evidence items for the supervisor agent.
 */
export const buildEvidenceSummary = (evidence = []) =>
  evidence
    .map((item) => `[${item.id}] ${(item.text || '').slice(0, 120)}`)
    .join('\n')
