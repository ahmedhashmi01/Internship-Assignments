import { interviewAiOutputSchema } from '../schemas/interviewSchemas.js'
import { timingLog } from '../utils/timingLog.js'

// ---------------------------------------------------------------------------
// Interview Question Generation
//
// On-demand, token-conscious generation of grounded interview questions from a
// job description + the analysis facets + resume evidence. A single model call
// (one corrective retry on malformed output) via the existing AI abstraction.
// Demo mode returns a deterministic fixture with no AI call.
// ---------------------------------------------------------------------------

const MAX_EVIDENCE_ITEMS = 15
const MAX_EVIDENCE_TEXT = 220

const pad = (n) => `iq-${String(n).padStart(3, '0')}`

// Keep the prompt small: trim evidence count + per-item length.
const compactEvidence = (evidence = []) =>
  evidence.slice(0, MAX_EVIDENCE_ITEMS).map((item) => ({
    id: item.id,
    text: String(item.text || '').slice(0, MAX_EVIDENCE_TEXT),
  }))

const buildPrompt = ({ job, analysis, resumeEvidence, count, difficulty }) => {
  const payload = {
    count,
    difficulty,
    job: { title: job.title || '', description: String(job.description || '').slice(0, 6000) },
    matchedSkills: (analysis.matchedSkills || []).slice(0, 20),
    mandatoryGaps: (analysis.mandatoryGaps || []).slice(0, 20),
    atsKeywords: (analysis.atsKeywords || []).slice(0, 20),
    resumeEvidence: compactEvidence(resumeEvidence),
  }

  return (
    'You are an expert technical interviewer. Generate targeted interview questions for a candidate ' +
    'based ONLY on the provided job description, analysis, and resume evidence.\n\n' +
    'Rules (STRICT):\n' +
    `- Return exactly ${count} questions at "${difficulty}" difficulty.\n` +
    '- Use a useful MIX of categories: "resume" (grounded in actual resume evidence), "role" ' +
    '(directly from job requirements), "gap" (missing/partial requirements), "behavioral" (only where relevant).\n' +
    '- NEVER invent candidate experience. If a skill is missing, phrase it explicitly as a gap ' +
    '(e.g. "This role requires X, but your resume does not show direct X evidence. How would you approach that?").\n' +
    '- Clearly distinguish evidenced experience, partial evidence, and missing skills.\n' +
    '- For "resume" questions, set evidenceIds to the relevant resume evidence ids you used. ' +
    'For purely "role" questions, evidenceIds may be empty.\n' +
    '- Each question needs a concise "whyThisQuestion" explaining what it probes and why.\n' +
    '- Only reference evidence ids that appear in the input.\n\n' +
    'Return ONLY JSON of the form: ' +
    '{"questions":[{"category":"resume|role|gap|behavioral","question":"...","whyThisQuestion":"...",' +
    '"evidenceIds":["ev-001"],"relatedRequirement":"..."}]}\n\n' +
    `Input: ${JSON.stringify(payload)}`
  )
}

// ------------------------------- Demo fixture -------------------------------

const buildDemoQuestions = ({ job, analysis, resumeEvidence, count, difficulty }) => {
  const ev0 = resumeEvidence[0]
  const ev1 = resumeEvidence[1]
  const gap = (analysis.mandatoryGaps || [])[0]
  const skill = (analysis.matchedSkills || [])[0] || (analysis.atsKeywords || [])[0]
  const role = job.title || 'this role'

  const pool = [
    {
      category: 'resume',
      question: ev0
        ? `Tell me about the work described in your resume ("${String(ev0.text).slice(0, 80)}") and the key decisions you made.`
        : 'Walk me through a project from your resume and the key decisions you made.',
      whyThisQuestion: 'Grounds the conversation in concrete, evidenced experience from the resume.',
      evidenceIds: ev0 ? [ev0.id] : [],
    },
    {
      category: 'role',
      question: skill
        ? `This role emphasizes ${skill}. How have you applied it in production?`
        : `What makes you a strong fit for ${role}?`,
      whyThisQuestion: `Probes direct alignment with a core requirement of ${role}.`,
      evidenceIds: [],
      relatedRequirement: skill || role,
    },
    {
      category: 'gap',
      question: gap
        ? `This role requires ${gap}, but your resume does not provide direct ${gap} evidence. How would you approach closing that gap?`
        : `Which requirement of ${role} do you consider your biggest growth area, and why?`,
      whyThisQuestion: gap
        ? `${gap} is a mandatory requirement with no direct evidence in the resume — phrased as a gap, not an assumed strength.`
        : 'Surfaces self-awareness about partial or missing requirements.',
      evidenceIds: [],
      ...(gap ? { relatedRequirement: gap } : {}),
    },
    {
      category: 'behavioral',
      question: ev1
        ? `Describe a challenge you faced during the work referenced by ${ev1.id} and how you handled it.`
        : 'Describe a time you handled a significant technical challenge and what you learned.',
      whyThisQuestion: 'Assesses collaboration and problem-solving tied to real resume evidence where possible.',
      evidenceIds: ev1 ? [ev1.id] : [],
    },
  ]

  const questions = []
  for (let i = 0; i < count; i += 1) {
    const base = pool[i % pool.length]
    questions.push({ ...base, id: pad(i + 1), difficulty })
  }
  return { questions }
}

// ------------------------------ Normalization -------------------------------

const normalize = ({ aiQuestions, count, difficulty, evidenceIds }) => {
  const validIds = new Set(evidenceIds)
  return aiQuestions.slice(0, count).map((q, index) => ({
    id: pad(index + 1),
    category: q.category,
    difficulty, // requested difficulty is authoritative
    question: q.question,
    whyThisQuestion: q.whyThisQuestion,
    // Drop any hallucinated evidence ids that aren't in the provided evidence.
    evidenceIds: (q.evidenceIds || []).filter((id) => validIds.has(id)),
    ...(q.relatedRequirement ? { relatedRequirement: q.relatedRequirement } : {}),
  }))
}

export const createInterviewService = ({ config = {}, aiService } = {}) => {
  const isDemo = String(config.aiMode || '').toLowerCase() === 'demo'

  return {
    async generateQuestions(input) {
      const count = Math.min(input.count || 5, config.interviewMaxQuestions || 10)
      const difficulty = input.difficulty || 'standard'
      const params = {
        job: input.job,
        analysis: input.analysis || {},
        resumeEvidence: input.resumeEvidence || [],
        count,
        difficulty,
      }

      // Presentation safety: no cloud call in demo mode.
      if (isDemo) {
        timingLog('interview demo fixture', { count, difficulty })
        return buildDemoQuestions(params)
      }

      if (!aiService) {
        throw new Error('Interview service is not configured with an AI provider.')
      }

      const prompt = buildPrompt(params)
      const options = { numPredict: config.interviewNumPredict || 4000 }
      const evidenceIds = params.resumeEvidence.map((item) => item.id)

      // Single call + exactly one corrective retry on malformed/invalid output.
      let value
      try {
        value = await aiService.generateJson(prompt, interviewAiOutputSchema, options)
      } catch (firstError) {
        timingLog('interview generateJson retry', { reason: firstError.name })
        const retryPrompt = `${prompt}\n\nYour previous response was invalid. Return ONLY valid JSON matching the required shape.`
        value = await aiService.generateJson(retryPrompt, interviewAiOutputSchema, options)
      }

      const questions = normalize({ aiQuestions: value.questions || [], count, difficulty, evidenceIds })
      return { questions }
    },
  }
}
