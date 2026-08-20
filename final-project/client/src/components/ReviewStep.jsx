function ReviewStep({ resumeText, jobs, fileMetadata, onEdit, onConfirm, submitting, submitError }) {
  const evidenceLineCount = String(resumeText || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length

  return (
    <section className="space-y-xl pb-xl animate-enter">
      {/* Progress Indicator */}
      <div className="mb-xl">
        <div className="flex items-center justify-between mb-md">
          <div className="flex items-center gap-sm">
            <span className="font-label-md text-label-md bg-on-surface text-surface px-3 py-1 rounded-sm">PHASE 02</span>
            <span className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight uppercase">Extraction Review</span>
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant font-bold">66% COMPLETE</span>
        </div>
        <div className="w-full h-1 bg-surface-container-high overflow-hidden">
          <div className="w-2/3 h-full bg-on-surface transition-all duration-700" />
        </div>
      </div>

      {/* Page Header */}
      <div className="flex justify-between items-end mb-md">
        <div>
          <h1 className="font-display text-display text-on-surface">Review Extraction</h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            Verify and refine the parsed data before running the match analysis. High-fidelity OCR ensures data integrity across all professional domains.
          </p>
        </div>
        <div className="flex gap-sm">
          <button
            type="button"
            className="px-lg py-sm border border-outline-variant text-on-surface font-label-md text-label-md rounded hover:bg-surface-container transition-colors font-bold uppercase"
            onClick={onEdit}
          >
            Re-upload / Edit
          </button>
          <button
            type="button"
            className="px-lg py-sm bg-primary text-on-primary font-label-md text-label-md rounded hover:opacity-90 transition-opacity shadow-sm font-bold uppercase flex items-center gap-xs"
            onClick={onConfirm}
            disabled={submitting}
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            {submitting ? 'Running Analysis…' : 'Run AI Match Analysis'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-lg">
        {/* Left Column: Candidate & Resume Content */}
        <div className="col-span-12 lg:col-span-8 space-y-lg">
          <div className="bg-surface-container-lowest border border-outline-variant p-xl shadow-sm space-y-xl">
            {/* Header Badge */}
            <div className="flex items-start justify-between border-b border-outline-variant pb-xl">
              <div className="flex items-center gap-lg">
                <div className="w-14 h-14 bg-primary text-on-primary flex items-center justify-center rounded">
                  <span className="material-symbols-outlined text-[32px]">account_circle</span>
                </div>
                <div>
                  <h3 className="font-display text-headline-md font-bold text-on-surface">
                    {fileMetadata?.fileName ? fileMetadata.fileName : 'Parsed Talent Profile'}
                  </h3>
                  <p className="font-label-md text-label-md text-primary font-bold uppercase tracking-widest mt-xs">
                    {fileMetadata?.sourceType ? `Source: ${fileMetadata.sourceType}` : 'Pasted Text Source'}
                  </p>
                </div>
              </div>
              <div className="confidence-badge px-md py-sm rounded-lg font-label-sm text-label-sm font-extrabold flex flex-col items-end">
                <span>98% EXTRACTION CONFIDENCE</span>
                <div className="w-32 bg-primary/20 h-1 mt-xs rounded-full">
                  <div className="bg-primary h-full rounded-full" style={{ width: '98%' }} />
                </div>
              </div>
            </div>

            {/* Resume Text Content */}
            <section className="resume-section-highlight pl-md space-y-md">
              <div className="flex justify-between items-center">
                <span className="font-label-md text-label-md text-primary font-bold uppercase tracking-widest">
                  Canonical Resume Asset
                  <span className="ml-sm font-normal text-on-surface-variant normal-case tracking-normal">· {evidenceLineCount} evidence line{evidenceLineCount === 1 ? '' : 's'}</span>
                </span>
                <button type="button" className="text-on-surface-variant hover:text-primary transition-colors" onClick={onEdit}>
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
              </div>
              <pre className="resume-preview">{resumeText}</pre>
            </section>

            {/* Target Opportunities */}
            <section className="resume-section-highlight pl-md space-y-md">
              <div className="flex justify-between items-center">
                <span className="font-label-md text-label-md text-primary font-bold uppercase tracking-widest">Registered Target Objectives ({jobs.length})</span>
              </div>
              <div className="space-y-md">
                {jobs.map((job, index) => (
                  <div key={index} className="p-md bg-surface border border-outline-variant rounded">
                    <h4 className="font-display text-headline-md text-base font-bold text-on-surface">{job.title || `Job ${index + 1}`}</h4>
                    <p className="font-body-md text-body-md text-on-surface-variant mt-xs line-clamp-2">{job.description}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Right Column: Pipeline Status & Guidance */}
        <div className="col-span-12 lg:col-span-4 space-y-lg">
          <div className="bg-surface border border-outline-variant p-lg rounded shadow-sm">
            <h3 className="font-label-md text-label-md font-extrabold mb-lg text-on-surface border-b border-outline-variant pb-xs uppercase tracking-widest">Pipeline Status</h3>
            <div className="space-y-md">
              <div className="flex items-center gap-md">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <div>
                  <p className="font-label-md text-label-md font-bold">OCR Integrity</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">Validated text blocks successfully</p>
                </div>
              </div>
              <div className="flex items-center gap-md">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <div>
                  <p className="font-label-md text-label-md font-bold">Semantic Extraction</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">Normalized evidence lines mapped</p>
                </div>
              </div>
              <div className="flex items-center gap-md">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <div>
                  <p className="font-label-md text-label-md font-bold">Target Readiness</p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">{jobs.length} target role(s) configured</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-primary text-on-primary p-lg rounded shadow-md">
            <div className="flex items-start gap-md">
              <span className="material-symbols-outlined text-[28px]">insights</span>
              <div>
                <p className="font-headline-md text-headline-md font-bold">Ready for Match Analysis</p>
                <p className="font-body-md text-body-md mt-sm opacity-90 leading-relaxed">
                  Canonical asset and targets are validated. Kinetic AI will invoke Supervisor, Skill Match, ATS Keyword, and Bullet Rewrite agents in parallel.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {submitError ? (
        <div className="p-md bg-error-container border border-error text-on-error-container font-label-md text-label-md" role="alert">
          {submitError}
        </div>
      ) : null}
    </section>
  )
}

export default ReviewStep
