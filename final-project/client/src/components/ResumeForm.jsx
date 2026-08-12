import { useState } from 'react'
import { extractJob } from '../services/api.js'

// Dev convenience — lets you skip retyping resume/job text during manual testing.
const SAMPLE_RESUME_TEXT = `Senior Frontend Engineer with 6 years of experience building scalable React applications.
Led migration of a legacy Angular application to React and TypeScript, improving load times by 40%.
Built a reusable component library adopted across 5 product teams.
Implemented CI/CD pipelines using GitHub Actions and Docker.
Mentored 4 junior engineers and led weekly code reviews.
Designed REST APIs in Node.js and Express serving 2M+ daily requests.
Integrated automated testing with Jest and React Testing Library, raising coverage from 45% to 85%.
Collaborated with product and design teams to ship features in two-week sprints.
Optimized PostgreSQL queries, reducing average response time by 30%.
Presented technical roadmaps to executive stakeholders on a quarterly basis.`

const SAMPLE_JOBS = [
  {
    title: 'Senior Frontend Engineer',
    description: `We are looking for a Senior Frontend Engineer to join our platform team.

Requirements:
- 5+ years of experience with React and TypeScript (required)
- Experience building and maintaining component libraries (required)
- Strong understanding of REST API integration
- Experience with CI/CD pipelines and Docker (preferred)
- Familiarity with automated testing (Jest, React Testing Library) (preferred)
- Experience mentoring junior engineers (nice to have)
- Excellent communication skills for cross-functional collaboration`,
  },
  {
    title: 'Backend Engineer (Node.js)',
    description: `We are hiring a Backend Engineer to help scale our core services.

Requirements:
- Strong experience with Node.js and Express (required)
- Experience designing and optimizing REST APIs (required)
- Experience with PostgreSQL and query optimization (preferred)
- Experience with GitHub Actions or similar CI/CD tooling (preferred)
- Familiarity with containerization (Docker, Kubernetes) (nice to have)
- Experience with Python or Go (nice to have)`,
  },
]

function JobInput({ job, index, onChange, onRemove }) {
  return (
    <div className="p-lg bg-surface border border-outline-variant rounded-md hover:bg-surface-elevated transition-all mb-lg">
      <div className="flex justify-between items-center mb-md">
        <label className="font-label-sm text-label-sm text-on-surface font-bold uppercase tracking-wider">
          Deployment Designation (Job Title #{index + 1})
        </label>
        {index > 0 ? (
          <button
            type="button"
            className="text-error font-label-sm text-label-sm font-bold uppercase hover:underline flex items-center gap-xs"
            onClick={() => onRemove(index)}
            aria-label={`Remove job ${index + 1}`}
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Remove Unit
          </button>
        ) : null}
      </div>
      <input
        className="w-full bg-surface-elevated border border-outline-variant rounded-md px-md py-3 font-body-md text-body-md focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 mb-md"
        value={job.title}
        onChange={(event) => onChange(index, 'title', event.target.value)}
        placeholder="e.g. Chief Product Officer / Senior Frontend Engineer"
        type="text"
      />
      <div>
        <label className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider">
          Mission Parameters (Description)
        </label>
        <textarea
          className="w-full h-40 bg-surface-elevated border border-outline-variant rounded-md p-md font-body-md text-body-md focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 resize-none"
          value={job.description}
          onChange={(event) => onChange(index, 'description', event.target.value)}
          placeholder="Paste strategic objectives, qualifications, and core requirements..."
        />
      </div>
    </div>
  )
}

function ResumeForm({ initialResumeText, initialJobs, onSubmit, onBack, submitting, submitError }) {
  const [resumeText, setResumeText] = useState(initialResumeText || '')
  const [jobs, setJobs] = useState(initialJobs.length > 0 ? initialJobs : [{ title: '', description: '' }])
  const [resumeMode, setResumeMode] = useState('paste')
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [validationErrors, setValidationErrors] = useState([])
  // Job input source: 'manual' (existing) or 'url' (import from a posting URL).
  const [jobMode, setJobMode] = useState('manual')
  const [jobUrl, setJobUrl] = useState('')
  const [urlExtract, setUrlExtract] = useState({ status: 'idle', error: '' })
  const [extractedJob, setExtractedJob] = useState(null)

  const validate = () => {
    const errors = []

    const hasText = Boolean(resumeText.trim())
    const hasFile = Boolean(selectedFile)

    if (resumeMode === 'pdf' ? !hasFile && !hasText : !hasText) {
      errors.push('Resume text, a PDF, or a DOCX file is required.')
    }

    if (fileError) {
      errors.push(fileError)
    }

    jobs.forEach((job, index) => {
      if (!job.title.trim()) {
        errors.push(`Job ${index + 1} title is required.`)
      }
      if (!job.description.trim()) {
        errors.push(`Job ${index + 1} description is required.`)
      }
    })

    if (jobs.length > 3) {
      errors.push('You can submit up to 3 jobs.')
    }

    setValidationErrors(errors)
    return errors.length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) {
      return
    }

    await onSubmit({ resumeText, jobs, selectedFile, resumeMode })
  }

  const addJob = () => {
    if (jobs.length >= 3) {
      return
    }

    setJobs([...jobs, { title: '', description: '' }])
  }

  const updateJob = (index, field, value) => {
    setJobs((current) => current.map((job, jobIndex) => (jobIndex === index ? { ...job, [field]: value } : job)))
  }

  const removeJob = (index) => {
    setJobs((current) => current.filter((_, jobIndex) => jobIndex !== index))
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null
    if (file) {
      const name = (file.name || '').toLowerCase()
      const isSupported = name.endsWith('.pdf') || name.endsWith('.docx')
      if (!isSupported) {
        // Reject unsupported types (including .docm) before upload.
        setSelectedFile(null)
        setFileError('Unsupported file type. Supported formats: PDF, DOCX.')
        event.target.value = ''
        return
      }
      setFileError('')
      setResumeMode('pdf')
    }
    setSelectedFile(file)
  }

  const handleExtractJob = async () => {
    if (urlExtract.status === 'extracting') return // ignore duplicate clicks
    if (!jobUrl.trim()) {
      setUrlExtract({ status: 'error', error: 'Enter a job posting URL to import.' })
      return
    }

    setUrlExtract({ status: 'extracting', error: '' })
    try {
      const job = await extractJob(jobUrl.trim())
      setExtractedJob({
        title: job.title || '',
        company: job.company || '',
        location: job.location || '',
        description: job.description || '',
      })
      setUrlExtract({ status: 'success', error: '' })
    } catch (err) {
      setExtractedJob(null)
      setUrlExtract({
        status: 'error',
        error: 'Could not extract this job posting automatically. Please paste the job description manually.',
      })
    }
  }

  const updateExtractedField = (field, value) => {
    setExtractedJob((current) => ({ ...(current || {}), [field]: value }))
  }

  // Apply the reviewed/edited extraction into the (existing) manual job list so
  // the rest of the workflow runs unchanged.
  const useExtractedJob = () => {
    if (!extractedJob) return
    setJobs([{ title: extractedJob.title || '', description: extractedJob.description || '' }])
    setJobMode('manual')
    setValidationErrors([])
  }

  const loadSampleData = () => {
    setResumeText(SAMPLE_RESUME_TEXT)
    setJobs(SAMPLE_JOBS.map((job) => ({ ...job })))
    setResumeMode('paste')
    setSelectedFile(null)
    setFileError('')
    setValidationErrors([])
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-xl pb-xl animate-enter">
      {/* Page heading */}
      <div className="space-y-xs">
        <h1 className="font-display text-display text-on-surface">Workflow</h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
          Provide your resume and up to three target roles. Kinetic AI extracts your evidence and matches it against each job — no data leaves this analysis.
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="mb-xl">
        <div className="flex items-center justify-between mb-md">
          <div className="flex items-center gap-sm">
            <span className="font-label-md text-label-md bg-on-surface text-surface px-3 py-1">PHASE 01</span>
            <span className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight uppercase">Configuration &amp; Ingestion</span>
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant font-bold">33% COMPLETE</span>
        </div>
        <div className="w-full h-1 bg-surface-container-high overflow-hidden">
          <div className="w-1/3 h-full bg-on-surface transition-all duration-700" />
        </div>
      </div>

      <div className="flex justify-end mb-md">
        <button
          type="button"
          className="text-on-surface-variant hover:text-on-surface font-label-md text-label-md flex items-center gap-xs border border-outline-variant px-md py-sm hover:border-on-surface transition-all uppercase font-bold"
          onClick={loadSampleData}
        >
          <span className="material-symbols-outlined text-[16px]">bolt</span>
          Load Sample Data
        </button>
      </div>

      <div className="grid grid-cols-12 gap-xl">
        {/* Section 1: Resume Input */}
        <section className="col-span-12 lg:col-span-6">
          <div className="card-premium p-xl h-full flex flex-col">
            <div className="flex items-center justify-between mb-xl">
              <div className="flex items-center gap-md">
                <div className="w-10 h-10 bg-on-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-surface">description</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface section-header">Source Talent Data</h3>
              </div>
              <button
                type="button"
                className="text-on-surface-variant hover:text-on-surface font-label-md text-label-md flex items-center gap-xs border border-outline-variant px-md py-sm hover:border-on-surface transition-all uppercase font-bold"
                onClick={() => setResumeMode(resumeMode === 'paste' ? 'pdf' : 'paste')}
              >
                <span className="material-symbols-outlined text-[16px]">{resumeMode === 'paste' ? 'upload' : 'edit'}</span>
                {resumeMode === 'paste' ? 'IMPORT FILE' : 'PASTE TEXT'}
              </button>
            </div>

            {resumeMode === 'paste' ? (
              <div className="flex-1 flex flex-col">
                <label className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider">
                  Asset Description (Paste Content)
                </label>
                <div className="relative flex-1">
                  <textarea
                    className="w-full h-[460px] bg-surface border border-outline-variant rounded-md p-xl font-body-md text-body-md text-on-surface focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 resize-none leading-relaxed"
                    value={resumeText}
                    onChange={(event) => setResumeText(event.target.value)}
                    placeholder="Ingest the strategic profile here. Kinetic AI will identify key professional signatures, executive experience, and specialized competencies..."
                  />
                  <div className="absolute bottom-md right-md">
                    <span className="text-surface text-[10px] font-bold px-3 py-1 bg-on-surface uppercase tracking-tighter" id="char-count">
                      {resumeText.length} CHARACTERS
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <label className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider">
                  Asset Upload (PDF or DOCX Document)
                </label>
                <div className="p-xl bg-surface border border-outline-variant rounded-md flex flex-col items-center justify-center text-center h-[350px]">
                  <span className="material-symbols-outlined text-[48px] text-primary mb-md">upload_file</span>
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={handleFileChange}
                    className="mb-md"
                  />
                  {selectedFile ? (
                    <p className="font-label-md text-label-md text-primary font-bold">Selected: {selectedFile.name}</p>
                  ) : (
                    <p className="font-body-md text-body-md text-on-surface-variant">Upload a resume to extract text automatically.</p>
                  )}
                  <p className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider mt-md">
                    Supported formats: PDF, DOCX
                  </p>
                  {fileError ? (
                    <p className="font-label-md text-label-md text-error font-bold mt-sm" role="alert">
                      {fileError}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Opportunity Targets */}
        <section className="col-span-12 lg:col-span-6">
          <div className="card-premium p-xl h-full flex flex-col">
            <div className="flex items-center justify-between mb-xl">
              <div className="flex items-center gap-md">
                <div className="w-10 h-10 bg-on-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-surface">target</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface section-header">Opportunity Targets</h3>
              </div>
              <span className="text-surface font-label-md text-label-md bg-on-surface px-md py-sm uppercase tracking-tighter font-bold">
                {jobs.length} / 3 UNITS
              </span>
            </div>

            {/* Job source toggle: Manual Entry vs URL Import */}
            <div className="flex gap-xs mb-lg p-1 bg-surface border border-outline-variant rounded-md" role="tablist" aria-label="Job input mode">
              <button
                type="button"
                role="tab"
                aria-selected={jobMode === 'manual'}
                className={`flex-1 px-md py-2 rounded font-label-md text-label-md font-bold uppercase tracking-wider transition-colors ${jobMode === 'manual' ? 'bg-on-surface text-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setJobMode('manual')}
              >
                Manual Entry
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={jobMode === 'url'}
                className={`flex-1 px-md py-2 rounded font-label-md text-label-md font-bold uppercase tracking-wider transition-colors ${jobMode === 'url' ? 'bg-on-surface text-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setJobMode('url')}
              >
                URL Import
              </button>
            </div>

            {jobMode === 'url' ? (
              <div className="space-y-md flex-1">
                <div>
                  <label htmlFor="job-url" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">
                    Job Posting URL
                  </label>
                  <div className="flex flex-col sm:flex-row gap-sm">
                    <input
                      id="job-url"
                      type="url"
                      inputMode="url"
                      className="flex-1 bg-surface-elevated border border-outline-variant rounded-md px-md py-3 font-body-md text-body-md focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                      value={jobUrl}
                      onChange={(event) => setJobUrl(event.target.value)}
                      placeholder="https://company.com/careers/senior-engineer"
                    />
                    <button
                      type="button"
                      onClick={handleExtractJob}
                      disabled={urlExtract.status === 'extracting'}
                      aria-busy={urlExtract.status === 'extracting'}
                      className="px-lg py-3 bg-on-surface text-surface font-label-md text-label-md font-bold uppercase tracking-wider hover:bg-opacity-90 transition-all flex items-center justify-center gap-xs disabled:opacity-60"
                    >
                      <span className={`material-symbols-outlined text-[18px] ${urlExtract.status === 'extracting' ? 'animate-spin' : ''}`}>
                        {urlExtract.status === 'extracting' ? 'progress_activity' : 'travel_explore'}
                      </span>
                      {urlExtract.status === 'extracting' ? 'Extracting…' : 'Extract Job'}
                    </button>
                  </div>
                  {urlExtract.status === 'extracting' ? (
                    <p className="font-label-md text-label-md text-on-surface-variant mt-sm flex items-center gap-xs" role="status" aria-live="polite">
                      Extracting job details...
                    </p>
                  ) : null}
                </div>

                {urlExtract.status === 'error' ? (
                  <div className="p-md bg-error-container border border-error text-on-error-container rounded-md space-y-sm" role="alert">
                    <p className="font-body-md text-body-md m-0">{urlExtract.error}</p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setJobMode('manual')
                        setUrlExtract({ status: 'idle', error: '' })
                      }}
                    >
                      Use Manual Entry
                    </button>
                  </div>
                ) : null}

                {extractedJob && urlExtract.status === 'success' ? (
                  <div className="space-y-md p-lg bg-surface border border-outline-variant rounded-md animate-enter">
                    <p className="font-label-sm text-label-sm text-success font-bold uppercase tracking-wider flex items-center gap-xs">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      Extracted — review and edit before analysis
                    </p>
                    <div>
                      <label htmlFor="ex-title" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Job Title</label>
                      <input id="ex-title" type="text" className="w-full bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary" value={extractedJob.title} onChange={(e) => updateExtractedField('title', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                      <div>
                        <label htmlFor="ex-company" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Company</label>
                        <input id="ex-company" type="text" className="w-full bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary" value={extractedJob.company} onChange={(e) => updateExtractedField('company', e.target.value)} />
                      </div>
                      <div>
                        <label htmlFor="ex-location" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Location</label>
                        <input id="ex-location" type="text" className="w-full bg-surface-elevated border border-outline-variant rounded-md px-md py-2 font-body-md text-body-md focus:outline-none focus:border-primary" value={extractedJob.location} onChange={(e) => updateExtractedField('location', e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="ex-desc" className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider block">Job Description</label>
                      <textarea id="ex-desc" className="w-full h-40 bg-surface-elevated border border-outline-variant rounded-md p-md font-body-md text-body-md focus:outline-none focus:border-primary resize-none" value={extractedJob.description} onChange={(e) => updateExtractedField('description', e.target.value)} />
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={useExtractedJob}>
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check</span>
                      Use This Job
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-md flex-1">
                {jobs.map((job, index) => (
                  <JobInput key={index} job={job} index={index} onChange={updateJob} onRemove={removeJob} />
                ))}

                {jobs.length < 3 ? (
                  <button
                    type="button"
                    onClick={addJob}
                    className="w-full border-2 border-dashed border-outline-variant rounded-md py-lg flex flex-col items-center justify-center text-on-surface-variant hover:text-on-surface hover:border-primary hover:bg-surface-container transition-all group"
                  >
                    <span className="material-symbols-outlined text-[32px] mb-xs group-hover:scale-110 transition-transform">add_box</span>
                    <span className="font-label-md text-label-md font-bold uppercase tracking-widest">Register Additional Objective</span>
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>

      {validationErrors.length > 0 ? (
        <div className="p-md bg-error-container border border-error text-on-error-container font-label-md text-label-md" role="alert">
          <ul className="list-disc pl-md">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {submitError ? (
        <div className="p-md bg-error-container border border-error text-on-error-container font-label-md text-label-md" role="alert">
          {submitError}
        </div>
      ) : null}

      {/* Footer Action Bar */}
      <div className="col-span-12 flex justify-end items-center gap-xl pt-lg pb-xl">
        <button
          type="button"
          onClick={onBack}
          className="px-xl py-4 bg-surface-elevated border border-outline-variant rounded-md text-on-surface font-label-md text-label-md font-bold uppercase tracking-widest hover:bg-surface-container-low transition-colors"
        >
          Reset Protocol
        </button>
        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="px-xl py-4 bg-on-surface text-surface font-label-md text-label-md font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all flex items-center gap-md disabled:opacity-60"
        >
          {submitting ? 'Ingesting…' : 'Execute Analysis'}
          <span className={`material-symbols-outlined text-[20px] ${submitting ? 'animate-spin' : ''}`}>{submitting ? 'progress_activity' : 'arrow_forward'}</span>
        </button>
      </div>
    </form>
  )
}

export default ResumeForm
