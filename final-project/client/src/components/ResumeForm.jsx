import { useState } from 'react'

function JobInput({ job, index, onChange, onRemove }) {
  return (
    <div className="p-lg bg-surface border border-on-surface hover:bg-white transition-all mb-lg">
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
        className="w-full bg-white border border-on-surface px-md py-3 font-body-md text-body-md focus:ring-0 focus:outline-none mb-md"
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
          className="w-full h-40 bg-white border border-on-surface p-md font-body-md text-body-md focus:ring-0 focus:outline-none resize-none"
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
  const [validationErrors, setValidationErrors] = useState([])

  const validate = () => {
    const errors = []

    const hasText = Boolean(resumeText.trim())
    const hasFile = Boolean(selectedFile)

    if (resumeMode === 'pdf' ? !hasFile && !hasText : !hasText) {
      errors.push('Resume text or PDF file is required.')
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
    setSelectedFile(file)
    if (file) {
      setResumeMode('pdf')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-xl pb-xl">
      {/* Progress Indicator */}
      <div className="mb-xl">
        <div className="flex items-center justify-between mb-md">
          <div className="flex items-center gap-sm">
            <span className="font-label-md text-label-md bg-on-surface text-white px-3 py-1">PHASE 01</span>
            <span className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight uppercase">Configuration &amp; Ingestion</span>
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant font-bold">33% COMPLETE</span>
        </div>
        <div className="w-full h-1 bg-surface-container-high overflow-hidden">
          <div className="w-1/3 h-full bg-on-surface transition-all duration-700" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-xl">
        {/* Section 1: Resume Input */}
        <section className="col-span-12 lg:col-span-6">
          <div className="card-premium p-xl h-full flex flex-col">
            <div className="flex items-center justify-between mb-xl">
              <div className="flex items-center gap-md">
                <div className="w-10 h-10 bg-on-surface flex items-center justify-center">
                  <span className="material-symbols-outlined text-white">description</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface section-header">Source Talent Data</h3>
              </div>
              <button
                type="button"
                className="text-on-surface-variant hover:text-on-surface font-label-md text-label-md flex items-center gap-xs border border-outline-variant px-md py-sm hover:border-on-surface transition-all uppercase font-bold"
                onClick={() => setResumeMode(resumeMode === 'paste' ? 'pdf' : 'paste')}
              >
                <span className="material-symbols-outlined text-[16px]">{resumeMode === 'paste' ? 'upload' : 'edit'}</span>
                {resumeMode === 'paste' ? 'IMPORT PDF' : 'PASTE TEXT'}
              </button>
            </div>

            {resumeMode === 'paste' ? (
              <div className="flex-1 flex flex-col">
                <label className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider">
                  Asset Description (Paste Content)
                </label>
                <div className="relative flex-1">
                  <textarea
                    className="w-full h-[460px] bg-surface border border-on-surface p-xl font-body-md text-body-md text-on-surface focus:ring-0 focus:outline-none resize-none leading-relaxed"
                    value={resumeText}
                    onChange={(event) => setResumeText(event.target.value)}
                    placeholder="Ingest the strategic profile here. Kinetic AI will identify key professional signatures, executive experience, and specialized competencies..."
                  />
                  <div className="absolute bottom-md right-md">
                    <span className="text-white text-[10px] font-bold px-3 py-1 bg-on-surface uppercase tracking-tighter" id="char-count">
                      {resumeText.length} CHARACTERS
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <label className="font-label-sm text-label-sm text-on-surface font-bold uppercase mb-xs tracking-wider">
                  Asset Upload (PDF Document)
                </label>
                <div className="p-xl bg-surface border border-on-surface flex flex-col items-center justify-center text-center h-[350px]">
                  <span className="material-symbols-outlined text-[48px] text-primary mb-md">upload_file</span>
                  <input type="file" accept="application/pdf" onChange={handleFileChange} className="mb-md" />
                  {selectedFile ? (
                    <p className="font-label-md text-label-md text-primary font-bold">Selected: {selectedFile.name}</p>
                  ) : (
                    <p className="font-body-md text-body-md text-on-surface-variant">Upload a PDF file to extract text automatically.</p>
                  )}
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
                  <span className="material-symbols-outlined text-white">target</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface section-header">Opportunity Targets</h3>
              </div>
              <span className="text-white font-label-md text-label-md bg-on-surface px-md py-sm uppercase tracking-tighter font-bold">
                {jobs.length} / 3 UNITS
              </span>
            </div>

            <div className="space-y-md flex-1">
              {jobs.map((job, index) => (
                <JobInput key={index} job={job} index={index} onChange={updateJob} onRemove={removeJob} />
              ))}

              {jobs.length < 3 ? (
                <button
                  type="button"
                  onClick={addJob}
                  className="w-full border-2 border-dashed border-on-surface py-lg flex flex-col items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all group"
                >
                  <span className="material-symbols-outlined text-[32px] mb-xs group-hover:scale-110 transition-transform">add_box</span>
                  <span className="font-label-md text-label-md font-bold uppercase tracking-widest">Register Additional Objective</span>
                </button>
              ) : null}
            </div>
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
          className="px-xl py-4 bg-white border border-on-surface text-on-surface font-label-md text-label-md font-bold uppercase tracking-widest hover:bg-surface-container-low transition-colors"
        >
          Reset Protocol
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-xl py-4 bg-on-surface text-white font-label-md text-label-md font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all flex items-center gap-md"
        >
          {submitting ? 'Ingesting…' : 'Execute Analysis'}
          <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
        </button>
      </div>
    </form>
  )
}

export default ResumeForm
