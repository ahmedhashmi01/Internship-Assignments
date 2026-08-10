import { useEffect, useState } from 'react'
import ResumeForm from './components/ResumeForm.jsx'
import ReviewStep from './components/ReviewStep.jsx'
import ResultsPanel from './components/ResultsPanel.jsx'
import { getHealth, parseResume, runAnalysis, validateAnalysisInput } from './services/api.js'
import './App.css'

const emptyJobs = [{ title: '', description: '' }]

function App() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [step, setStep] = useState('input')
  const [resumeText, setResumeText] = useState('')
  const [jobs, setJobs] = useState(emptyJobs)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [normalizedResume, setNormalizedResume] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysisState, setAnalysisState] = useState({ status: 'idle', error: '' })

  const [fileMetadata, setFileMetadata] = useState(null)

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err) => setError(err.message || 'API unavailable'))
  }, [])

  const handleInputSubmit = async ({ resumeText: nextResumeText, jobs: nextJobs, selectedFile }) => {
    setSubmitting(true)
    setSubmitError('')
    setAnalysisState({ status: 'idle', error: '' })

    try {
      let parsedResume = null
      let textForValidation = nextResumeText

      if (selectedFile) {
        parsedResume = await parseResume(selectedFile)
        textForValidation = parsedResume?.extractedText || nextResumeText
      } else if (nextResumeText.trim()) {
        parsedResume = await parseResume(nextResumeText)
        textForValidation = parsedResume?.extractedText || nextResumeText
      }

      const validation = await validateAnalysisInput({
        resumeText: textForValidation,
        jobs: nextJobs,
      })

      if (validation.validationErrors?.length > 0) {
        const summary = validation.validationErrors.map((item) => `${item.field}: ${item.message}`).join(' • ')
        setSubmitError(summary)
        return
      }

      setResumeText(textForValidation)
      setJobs(nextJobs)
      setNormalizedResume(validation.normalizedResume || parsedResume?.normalizedResume)
      if (parsedResume?.sourceType) {
        setFileMetadata({ sourceType: parsedResume.sourceType, fileName: parsedResume.fileName })
      }
      setStep('review')
    } catch (err) {
      setSubmitError(err.message || 'Unable to process resume')
      setAnalysisState({ status: 'error', error: err.message || 'Unable to process resume' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReviewConfirm = async () => {
    setSubmitting(true)
    setSubmitError('')
    setAnalysisState({ status: 'loading', error: '' })

    try {
      const result = await runAnalysis({
        normalizedResume,
        jobs,
      })

      setAnalysisResult(result)
      setAnalysisState({ status: result?.rankedJobs?.length > 0 ? 'success' : 'empty', error: '' })
      setStep('results')
    } catch (err) {
      setSubmitError(err.message || 'Analysis failed')
      setAnalysisState({ status: 'error', error: err.message || 'Analysis failed' })
      setStep('results')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBackToInput = () => {
    setStep('input')
    setSubmitError('')
  }

  const handleStartOver = () => {
    setStep('input')
    setResumeText('')
    setJobs(emptyJobs)
    setNormalizedResume(null)
    setFileMetadata(null)
    setAnalysisResult(null)
    setSubmitError('')
    setAnalysisState({ status: 'idle', error: '' })
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface font-sans">
      {/* TopNavBar */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-xl h-20 bg-white border-b border-on-surface">
        <div className="flex items-center gap-md">
          <span className="font-display text-headline-md tracking-tighter font-extrabold text-on-surface">KINETIC AI</span>
          <span className="text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary uppercase rounded">Career Intelligence</span>
        </div>
        <nav className="hidden md:flex items-center gap-xl">
          <button
            type="button"
            className={`font-label-md text-label-md font-bold pb-1 transition-colors ${step === 'input' ? 'text-on-surface border-b-2 border-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setStep('input')}
          >
            Workflow
          </button>
          <button
            type="button"
            className={`font-label-md text-label-md font-bold pb-1 transition-colors ${step === 'review' ? 'text-on-surface border-b-2 border-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setStep('review')}
          >
            Extraction Review
          </button>
          <button
            type="button"
            className={`font-label-md text-label-md font-bold pb-1 transition-colors ${step === 'results' ? 'text-on-surface border-b-2 border-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setStep('results')}
          >
            Results Dashboard
          </button>
        </nav>
        <div className="flex items-center gap-md">
          <div className={`status ${health ? 'online' : error ? 'offline' : 'pending'}`}>
            <span className="dot" aria-hidden="true" />
            {health
              ? `API online · ${health.provider}`
              : error
                ? `API unavailable · ${error}`
                : 'Checking API...'}
          </div>
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-on-surface bg-secondary-container flex items-center justify-center font-bold text-primary">
            KA
          </div>
        </div>
      </header>

      {/* SideNavBar */}
      <aside className="fixed left-0 top-20 h-[calc(100vh-80px)] w-72 flex flex-col p-lg bg-white border-r border-on-surface z-40">
        <div className="mb-xl px-sm">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface uppercase tracking-tight">Intelligence Center</h2>
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase mt-1">Strategic Asset Analysis</p>
        </div>
        <nav className="flex-1 space-y-md">
          <button
            type="button"
            className={`w-full flex items-center justify-between px-md py-3 rounded-none text-left font-bold transition-all border border-on-surface ${step === 'input' ? 'text-on-surface bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
            onClick={() => setStep('input')}
          >
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined">description</span>
              <span className="font-label-md text-label-md uppercase">RESUME ENGINE</span>
            </div>
            {step === 'input' ? <span className="w-2 h-2 rounded-full bg-primary" /> : null}
          </button>
          <button
            type="button"
            className={`w-full flex items-center justify-between px-md py-3 rounded-none text-left font-bold transition-all border border-on-surface ${step === 'review' ? 'text-on-surface bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
            onClick={() => setStep('review')}
          >
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined">visibility</span>
              <span className="font-label-md text-label-md uppercase">EXTRACTION REVIEW</span>
            </div>
            {step === 'review' ? <span className="w-2 h-2 rounded-full bg-primary" /> : null}
          </button>
          <button
            type="button"
            className={`w-full flex items-center justify-between px-md py-3 rounded-none text-left font-bold transition-all border border-on-surface ${step === 'results' ? 'text-on-surface bg-surface-container-low' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
            onClick={() => setStep('results')}
          >
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined">analytics</span>
              <span className="font-label-md text-label-md uppercase">DELTA REPORTS</span>
            </div>
            {step === 'results' ? <span className="w-2 h-2 rounded-full bg-primary" /> : null}
          </button>
        </nav>
        <div className="mt-auto">
          <button
            type="button"
            className="w-full bg-on-surface text-white py-lg rounded-none font-label-md text-label-md hover:bg-opacity-90 transition-all flex items-center justify-center gap-sm uppercase tracking-widest font-bold"
            onClick={handleStartOver}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Analysis
          </button>
        </div>
      </aside>

      {/* Main Canvas */}
      <main className="ml-72 mt-20 p-xl h-[calc(100vh-80px-48px)] overflow-y-auto custom-scrollbar">
        <div className="max-w-[1400px] mx-auto">
          {step === 'input' ? (
            <ResumeForm
              initialResumeText={resumeText}
              initialJobs={jobs}
              onSubmit={handleInputSubmit}
              onBack={handleBackToInput}
              submitting={submitting}
              submitError={submitError}
            />
          ) : null}

          {step === 'review' ? (
            <ReviewStep
              resumeText={resumeText}
              jobs={jobs}
              fileMetadata={fileMetadata}
              onEdit={handleBackToInput}
              onConfirm={handleReviewConfirm}
              submitting={submitting}
              submitError={submitError}
            />
          ) : null}

          {step === 'results' ? (
            <ResultsPanel
              result={analysisResult}
              isLoading={analysisState.status === 'loading'}
              error={analysisState.status === 'error' ? analysisState.error : ''}
              onStartOver={handleStartOver}
            />
          ) : null}
        </div>
      </main>

      {/* Footer Shell */}
      <footer className="fixed bottom-0 left-72 right-0 flex justify-between items-center px-xl py-md z-40 bg-white border-t border-on-surface h-12">
        <div className="flex items-center gap-md">
          <span className="w-2 h-2 rounded-full bg-emerald-500 status-dot-pulse" />
          <p className="font-label-sm text-label-sm text-on-surface font-bold uppercase tracking-tighter margin-0">
            Secured Executive Session • System Operational • {health ? `Provider: ${health.provider}` : 'Offline'}
          </p>
        </div>
        <div className="flex gap-xl">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-tighter">Privacy</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-tighter">Legal</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-tighter">Support</span>
        </div>
      </footer>
    </div>
  )
}

export default App
