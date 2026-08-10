import { analysisRequestSchema } from '../schemas/analysisSchemas.js'

const normalizeText = (value = '') => {
  return value.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

const splitResumeLines = (value = '') => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export const normalizeResume = (resumeText) => {
  const cleanedText = normalizeText(resumeText)
  const lines = splitResumeLines(cleanedText)
  const evidence = lines.map((line, index) => ({
    id: `ev-${String(index + 1).padStart(3, '0')}`,
    text: line,
  }))

  return {
    originalText: lines.join('\n'),
    evidence,
  }
}

export const validateAnalysisInput = ({ resumeText, jobs = [] }, config) => {
  const parsed = analysisRequestSchema.safeParse({ resumeText, jobs })
  const trimmedResume = typeof resumeText === 'string' ? resumeText.trim() : ''
  const normalizedResume = trimmedResume ? normalizeResume(trimmedResume) : { originalText: '', evidence: [] }

  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path[0] || 'request',
      message: issue.message,
    }))

    return {
      errors,
      normalizedResume,
      jobs: Array.isArray(jobs) ? jobs.map((job) => ({
        title: typeof job?.title === 'string' ? job.title.trim() : '',
        description: typeof job?.description === 'string' ? job.description.trim() : '',
      })) : [],
    }
  }

  if (trimmedResume.length > config.maxResumeTextLength) {
    return {
      errors: [{ field: 'resumeText', message: 'Resume text exceeds the maximum length' }],
      normalizedResume,
      jobs: parsed.data.jobs.map((job) => ({
        title: job.title.trim(),
        description: job.description.trim(),
      })),
    }
  }

  return {
    errors: [],
    normalizedResume,
    jobs: parsed.data.jobs.map((job) => ({
      title: job.title.trim(),
      description: job.description.trim(),
    })),
  }
}
