import { useEffect, useState } from 'react'
import ResumeForm from './components/ResumeForm.jsx'
import ReviewStep from './components/ReviewStep.jsx'
import ResultsPanel from './components/ResultsPanel.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import AuthModal from './components/AuthModal.jsx'
import { useAuth } from './context/AuthContext.jsx'
import { getHealth, parseResume, runAnalysis, validateAnalysisInput } from './services/api.js'
import logo from './assets/gemini-svg.svg'
import './App.css'

const emptyJobs = [{ title: '', description: '' }]

const initialsOf = (name) =>
  name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('') || 'U'
    : 'U'

function App() {
  const { user, isAuthenticated, initializing, logout } = useAuth()
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
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login', intro: '' })
  const [postAuthHint, setPostAuthHint] = useState('')

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err) => setError(err.message || 'API unavailable'))
  }, [])

  const openAuth = (mode, intro = '') => setAuthModal({ open: true, mode, intro })

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
    setPostAuthHint('')
    setAnalysisState({ status: 'loading', error: '' })

    try {
      const result = await runAnalysis({ normalizedResume, jobs })

      setAnalysisResult(result)
      setAnalysisState({ status: result?.rankedJobs?.length > 0 ? 'success' : 'empty', error: '' })
      setStep('results')
    } catch (err) {
      // Guest allowance exhausted — prompt sign-up WITHOUT losing the inputs and
      // WITHOUT navigating away or auto-rerunning the analysis.
      if (err?.code === 'SIGNUP_REQUIRED') {
        setAnalysisState({ status: 'idle', error: '' })
        setSubmitError('')
        openAuth('signup', 'Create an account to continue analyzing resumes. Your inputs are saved.')
        return
      }
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
    setPostAuthHint('')
    setAnalysisState({ status: 'idle', error: '' })
  }

  const handleAuthenticated = () => {
    setAuthModal((current) => ({ ...current, open: false }))
    setSubmitError('')
    // If they were mid-flow on the review step, invite an explicit retry.
    if (step === 'review') {
      setPostAuthHint("You're signed in — run the analysis to continue.")
    }
  }

  const handleLogout = async () => {
    await logout()
    handleStartOver()
  }

  const handleOpenHistory = (record) => {
    const result = record?.result || null
    setAnalysisResult(result)
    setNormalizedResume(null)
    setAnalysisState({ status: result?.rankedJobs?.length > 0 ? 'success' : 'empty', error: '' })
    setStep('results')
  }

  const showGuestFreeBanner = !initializing && !isAuthenticated && step === 'input'
  const showGuestUsedBanner =
    !initializing && !isAuthenticated && step === 'results' && analysisResult?.rankedJobs?.length > 0

  const navTabClass = (target) =>
    `font-label-md text-label-md font-bold pb-1 transition-colors ${
      step === target ? 'text-on-surface border-b-2 border-on-surface' : 'text-on-surface-variant hover:text-on-surface'
    }`

  return (
    <div className="min-h-[100dvh] bg-surface text-on-surface font-sans">
      {/* TopNavBar */}
      <header className="fixed top-0 w-full z-header flex justify-between items-center gap-md px-md md:px-xl h-20 bg-surface-elevated border-b border-on-surface">
        <div className="flex items-center gap-sm md:gap-md min-w-0">
          <img src={logo} alt="" aria-hidden="true" className="h-10 w-10 flex-none object-contain" />
          <span className="font-display text-headline-md tracking-tighter font-extrabold text-on-surface whitespace-nowrap">KINETIC AI</span>
          <span className="hidden sm:inline text-xs font-bold px-2 py-0.5 bg-primary/10 text-primary uppercase rounded">Career Intelligence</span>
        </div>
        <nav className="hidden md:flex items-center gap-xl">
          <button type="button" className={navTabClass('input')} onClick={() => setStep('input')}>
            Workflow
          </button>
          <button type="button" className={navTabClass('review')} onClick={() => setStep('review')}>
            Extraction Review
          </button>
          <button type="button" className={navTabClass('results')} onClick={() => setStep('results')}>
            Results Dashboard
          </button>
          {isAuthenticated ? (
            <button type="button" className={navTabClass('history')} onClick={() => setStep('history')}>
              History
            </button>
          ) : null}
        </nav>
        <div className="flex items-center gap-sm md:gap-md min-w-0">
          <div
            className={`status ${health ? 'online' : error ? 'offline' : 'pending'} hidden lg:inline-flex max-w-[32vw] lg:max-w-none`}
            role="status"
            aria-live="polite"
          >
            <span className="dot" aria-hidden="true" />
            {health ? `API online · ${health.provider}` : error ? `API unavailable · ${error}` : 'Checking API...'}
          </div>

          {initializing ? null : isAuthenticated ? (
            <div className="flex items-center gap-sm md:gap-md min-w-0">
              <div
                className="w-10 h-10 flex-none rounded-full overflow-hidden border-2 border-on-surface bg-secondary-container flex items-center justify-center font-bold text-primary"
                title={user?.email}
                aria-hidden="true"
              >
                {initialsOf(user?.name)}
              </div>
              <span className="hidden lg:block min-w-0 max-w-[160px] truncate text-label-md font-bold text-on-surface" title={user?.email}>
                {user?.name}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-sm">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => openAuth('login')}>
                Sign in
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openAuth('signup')}>
                Create account
              </button>
            </div>
          )}
        </div>
      </header>

      {/* SideNavBar — desktop only; on smaller screens the flow is driven by
          the in-content step actions and the top-nav tabs (md+). */}
      <aside className="fixed left-0 top-20 bottom-12 w-72 hidden lg:flex flex-col p-lg bg-surface-elevated border-r border-on-surface z-sidebar">
        <div className="mb-xl px-sm">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface uppercase tracking-tight">Intelligence Center</h2>
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase mt-1">Strategic Asset Analysis</p>
        </div>
        <nav className="flex-1 space-y-md">
          <button
            type="button"
            className={`w-full flex items-center justify-between px-md py-3 rounded-md text-left font-bold transition-all border ${step === 'input' ? 'bg-primary/10 text-primary border-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
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
            className={`w-full flex items-center justify-between px-md py-3 rounded-md text-left font-bold transition-all border ${step === 'review' ? 'bg-primary/10 text-primary border-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
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
            className={`w-full flex items-center justify-between px-md py-3 rounded-md text-left font-bold transition-all border ${step === 'results' ? 'bg-primary/10 text-primary border-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
            onClick={() => setStep('results')}
          >
            <div className="flex items-center gap-md">
              <span className="material-symbols-outlined">analytics</span>
              <span className="font-label-md text-label-md uppercase">DELTA REPORTS</span>
            </div>
            {step === 'results' ? <span className="w-2 h-2 rounded-full bg-primary" /> : null}
          </button>
          {isAuthenticated ? (
            <button
              type="button"
              className={`w-full flex items-center justify-between px-md py-3 rounded-md text-left font-bold transition-all border ${step === 'history' ? 'bg-primary/10 text-primary border-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
              onClick={() => setStep('history')}
            >
              <div className="flex items-center gap-md">
                <span className="material-symbols-outlined">history</span>
                <span className="font-label-md text-label-md uppercase">HISTORY</span>
              </div>
              {step === 'history' ? <span className="w-2 h-2 rounded-full bg-primary" /> : null}
            </button>
          ) : null}
        </nav>
        <div className="mt-auto">
          <button
            type="button"
            className="w-full bg-on-surface text-white py-lg rounded-md font-label-md text-label-md hover:bg-opacity-90 transition-all flex items-center justify-center gap-sm uppercase tracking-widest font-bold"
            onClick={handleStartOver}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Analysis
          </button>
        </div>
      </aside>

      {/* Main Canvas */}
      <main className="fixed top-20 bottom-12 left-0 lg:left-72 right-0 p-md md:p-xl overflow-y-auto overflow-x-hidden custom-scrollbar">
        <div className="max-w-[1400px] mx-auto">
          {showGuestFreeBanner ? (
            <div className="mb-lg px-md py-2.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-body-sm font-medium flex items-center gap-sm">
              <span className="material-symbols-outlined text-[18px]">bolt</span>
              <span>1 free analysis available — no account required.</span>
            </div>
          ) : null}

          {showGuestUsedBanner ? (
            <div className="mb-lg px-md py-3 rounded-md bg-surface-container-low border border-outline-variant text-on-surface text-body-sm flex flex-wrap items-center justify-between gap-sm">
              <span>Free analysis used. Create an account to save your history and continue analyzing.</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openAuth('signup')}>
                Create account
              </button>
            </div>
          ) : null}

          {postAuthHint && step === 'review' ? (
            <div className="mb-lg px-md py-2.5 rounded-md bg-surface-container-low border border-success text-success text-body-sm font-medium">
              {postAuthHint}
            </div>
          ) : null}

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
              normalizedResume={normalizedResume}
              isLoading={analysisState.status === 'loading'}
              error={analysisState.status === 'error' ? analysisState.error : ''}
              onStartOver={handleStartOver}
            />
          ) : null}

          {step === 'history' ? <HistoryPanel onOpen={handleOpenHistory} /> : null}
        </div>
      </main>

      {/* Footer Shell */}
      <footer className="fixed bottom-0 left-0 right-0 flex justify-between items-center gap-md px-md md:px-xl py-md z-header bg-surface-elevated border-t border-on-surface h-12">
        <div className="flex items-center gap-sm md:gap-md min-w-0">
          <span className="w-2 h-2 flex-none rounded-full bg-success status-dot-pulse" />
          <p className="font-label-sm text-label-sm text-on-surface font-bold uppercase tracking-tighter m-0 truncate">
            <span className="hidden md:inline">Secured Executive Session • System Operational • </span>{health ? `Provider: ${health.provider}` : 'Offline'}
          </p>
        </div>
        <nav aria-label="Footer" className="hidden sm:flex gap-lg md:gap-xl flex-none">
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-tighter">Privacy</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-tighter">Legal</span>
          <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-tighter">Support</span>
        </nav>
      </footer>

      {authModal.open ? (
        <AuthModal
          key={authModal.mode}
          open
          initialMode={authModal.mode}
          intro={authModal.intro}
          onClose={() => setAuthModal((current) => ({ ...current, open: false }))}
          onAuthenticated={handleAuthenticated}
        />
      ) : null}
    </div>
  )
}

export default App
