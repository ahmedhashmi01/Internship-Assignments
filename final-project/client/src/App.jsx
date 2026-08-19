import { useEffect, useRef, useState } from 'react'
import ResumeForm from './components/ResumeForm.jsx'
import ReviewStep from './components/ReviewStep.jsx'
import ResultsPanel from './components/ResultsPanel.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import AuthModal from './components/AuthModal.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
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

// Compact header identity — first name only (the account menu popover below
// still shows the full name + email for unambiguous identity confirmation).
const firstNameOf = (name) => (name ? name.trim().split(/\s+/)[0] : 'User')

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
  // DOCX-only: ordered structural blocks retained for enhanced-DOCX export.
  const [resumeStructure, setResumeStructure] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysisState, setAnalysisState] = useState({ status: 'idle', error: '' })
  const [fileMetadata, setFileMetadata] = useState(null)
  const [authModal, setAuthModal] = useState({ open: false, mode: 'login', intro: '' })
  const [postAuthHint, setPostAuthHint] = useState('')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  // Off-canvas mobile navigation drawer (shown below the lg breakpoint, where
  // the fixed sidebar is not in the layout).
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const drawerCloseRef = useRef(null)
  // Scroll container for the main canvas — used to glide to the top when the
  // step changes (e.g. moving into the Delta Reports view after analysis).
  const mainRef = useRef(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return window.localStorage.getItem('sidebarOpen') !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem('sidebarOpen', String(sidebarOpen))
    } catch {
      // ignore storage failures
    }
  }, [sidebarOpen])

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err) => setError(err.message || 'API unavailable'))
  }, [])

  // Smoothly return to the top of the canvas whenever the step changes, so the
  // transition into the Delta Reports (results) view reads as a real navigation.
  useEffect(() => {
    // Guard: jsdom (tests) doesn't implement Element.scrollTo.
    if (typeof mainRef.current?.scrollTo === 'function') {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [step])

  // Mobile drawer: Escape closes it, background scroll is locked while open, and
  // focus moves into the drawer on open and back to the menu button on close.
  useEffect(() => {
    if (!drawerOpen) return undefined
    drawerCloseRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      menuButtonRef.current?.focus()
    }
  }, [drawerOpen])

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
      // Retain the DOCX structure (if any) so the results step can regenerate an
      // enhanced DOCX with the accepted rewrites applied.
      setResumeStructure(parsedResume?.structure || null)
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
    // Move to the Delta Reports view right away — it renders the processing
    // panel while the analysis runs, so the user follows the work in place.
    setStep('results')

    try {
      const result = await runAnalysis({ normalizedResume, jobs })

      setAnalysisResult(result)
      setAnalysisState({ status: result?.rankedJobs?.length > 0 ? 'success' : 'empty', error: '' })
    } catch (err) {
      // Guest allowance exhausted — prompt sign-up WITHOUT losing the inputs and
      // WITHOUT navigating away or auto-rerunning the analysis.
      if (err?.code === 'SIGNUP_REQUIRED') {
        setAnalysisState({ status: 'idle', error: '' })
        setSubmitError('')
        // Return to the review step so the preserved inputs and retry button
        // are available once they've signed up.
        setStep('review')
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
    setResumeStructure(null)
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
    setUserMenuOpen(false)
    await logout()
    handleStartOver()
  }

  const handleOpenHistory = (record) => {
    const result = record?.result || null
    setAnalysisResult(result)
    setNormalizedResume(null)
    // History records don't retain the source DOCX structure, so enhanced-DOCX
    // export is only offered from an active analysis.
    setResumeStructure(null)
    setAnalysisState({ status: result?.rankedJobs?.length > 0 ? 'success' : 'empty', error: '' })
    setStep('results')
  }

  const showGuestFreeBanner = !initializing && !isAuthenticated && step === 'input'
  const showGuestUsedBanner =
    !initializing && !isAuthenticated && step === 'results' && analysisResult?.rankedJobs?.length > 0

  const navTabClass = (target) =>
    `font-label-md text-label-md font-bold pb-1 transition-colors ${
      step === target ? 'text-on-shell border-b-2 border-on-shell' : 'text-on-shell-variant hover:text-on-shell'
    }`

  // Single navigation source shared by the desktop sidebar and the mobile
  // drawer, so there are never two nav definitions to keep in sync.
  const navItems = [
    { step: 'input', icon: 'description', label: 'RESUME ENGINE' },
    { step: 'review', icon: 'visibility', label: 'EXTRACTION REVIEW' },
    { step: 'results', icon: 'analytics', label: 'DELTA REPORTS' },
    ...(isAuthenticated ? [{ step: 'history', icon: 'history', label: 'HISTORY' }] : []),
  ]

  const renderNavButton = (item, onNavigate) => (
    <button
      key={item.step}
      type="button"
      aria-current={step === item.step ? 'page' : undefined}
      className={`w-full flex items-center justify-between px-md py-3 rounded-md text-left font-bold transition-all border ${step === item.step ? 'bg-shell-accent-surface text-shell-accent border-shell-accent' : 'border-transparent text-on-shell-variant hover:text-on-shell hover:bg-shell-accent-surface'}`}
      onClick={() => {
        setStep(item.step)
        onNavigate?.()
      }}
    >
      <div className="flex items-center gap-md">
        <span className="material-symbols-outlined">{item.icon}</span>
        <span className="font-label-md text-label-md uppercase">{item.label}</span>
      </div>
      {step === item.step ? <span className="w-2 h-2 rounded-full bg-shell-accent" /> : null}
    </button>
  )

  return (
    <div className="min-h-[100dvh] bg-surface text-on-surface font-sans">
      {/* TopNavBar */}
      <header className="fixed top-0 w-full z-header flex justify-between items-center gap-md px-md md:px-xl h-20 bg-shell border-b border-shell-border">
        <div className="flex items-center gap-sm md:gap-md min-w-0">
          {/* Mobile navigation trigger (below lg, where the fixed sidebar is not
              in the layout). Opens the off-canvas drawer. */}
          <button
            ref={menuButtonRef}
            type="button"
            className="lg:hidden flex-none flex items-center justify-center h-9 w-9 rounded-md text-on-shell-variant hover:text-on-shell hover:bg-shell-accent-surface transition-colors"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>
          {/* Sidebar collapse toggle (desktop only — a collapse control is
              meaningless where the sidebar isn't in the layout). */}
          <button
            type="button"
            className="hidden lg:flex flex-none items-center justify-center h-9 w-9 rounded-md text-on-shell-variant hover:text-on-shell hover:bg-shell-accent-surface transition-colors"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className="material-symbols-outlined text-[20px]">{sidebarOpen ? 'left_panel_close' : 'left_panel_open'}</span>
          </button>
          <img src={logo} alt="" aria-hidden="true" className="h-10 w-10 flex-none object-contain" />
          <span className="hidden sm:inline font-display text-headline-md tracking-tighter font-extrabold text-on-shell whitespace-nowrap">KINETIC AI</span>
        </div>
        <nav className="hidden lg:flex items-center gap-xl">
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
          {/* Compact status pill — a dot plus a short word; the full provider
              detail lives in the tooltip so the header stays uncluttered. */}
          <div
            className={`status ${health ? 'online' : error ? 'offline' : 'pending'} !px-2 !py-1`}
            role="status"
            aria-live="polite"
            title={health ? `API online · ${health.provider}` : error ? `API unavailable · ${error}` : 'Checking API…'}
          >
            <span className="dot" aria-hidden="true" />
            <span className="hidden lg:inline">{health ? 'Online' : error ? 'Offline' : 'Checking…'}</span>
          </div>

          <ThemeToggle />

          {initializing ? null : isAuthenticated ? (
            <div className="relative flex-none">
              <button
                type="button"
                className="flex items-center gap-sm min-w-0 rounded-full pl-1 pr-2 py-1 hover:bg-shell-accent-surface transition-colors"
                onClick={() => setUserMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Account menu"
                title={user?.email}
              >
                <span
                  className="w-9 h-9 flex-none rounded-full overflow-hidden border-2 border-shell-border bg-shell-accent-surface flex items-center justify-center font-bold text-shell-accent"
                  aria-hidden="true"
                >
                  {initialsOf(user?.name)}
                </span>
                <span className="hidden lg:block min-w-0 max-w-[140px] truncate text-label-md font-bold text-on-shell">
                  {firstNameOf(user?.name)}
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-shell-variant flex-none">
                  {userMenuOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {userMenuOpen ? (
                <>
                  {/* Click-away overlay to dismiss the menu. */}
                  <div className="fixed inset-0 z-header" onClick={() => setUserMenuOpen(false)} aria-hidden="true" />
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 bg-surface border border-outline-variant rounded-lg shadow-lg z-header p-sm animate-enter"
                  >
                    <div className="px-md py-sm border-b border-outline-variant mb-xs">
                      <p className="font-label-md text-label-md font-bold text-on-surface truncate">{user?.name}</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant truncate">{user?.email}</p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full flex items-center gap-sm px-md py-sm rounded-md text-left font-label-md text-label-md font-bold text-on-surface hover:bg-surface-container transition-colors"
                      onClick={handleLogout}
                    >
                      <span className="material-symbols-outlined text-[18px]">logout</span>
                      Sign out
                    </button>
                  </div>
                </>
              ) : (
                null
              )}
            </div>
          ) : (
            <div className="flex items-center gap-sm">
              <button type="button" className="btn btn-shell-ghost btn-sm" onClick={() => openAuth('login')}>
                Sign in
              </button>
              {/* Wrapper controls visibility so the .btn display rule can't
                  override `hidden` — signup stays reachable via the Sign-in
                  modal and the guest banners on narrow screens. */}
              <span className="hidden sm:inline-flex">
                <button type="button" className="btn btn-shell-primary btn-sm" onClick={() => openAuth('signup')}>
                  Create account
                </button>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* SideNavBar — desktop only; on smaller screens the flow is driven by
          the in-content step actions and the top-nav tabs (md+). */}
      <aside
        id="app-sidebar"
        inert={!sidebarOpen}
        className={`fixed left-0 top-20 bottom-10 w-72 hidden lg:flex flex-col p-lg bg-shell border-r border-shell-border z-sidebar transition-transform duration-300 ease-in-out ${sidebarOpen ? 'lg:translate-x-0' : 'lg:-translate-x-full'}`}
      >
        <div className="mb-xl px-sm flex items-start justify-between gap-sm">
          <div className="min-w-0">
            <h2 className="font-headline-md text-headline-md font-bold text-on-shell uppercase tracking-tight">Intelligence Center</h2>
            <p className="font-label-sm text-label-sm text-on-shell-variant uppercase mt-1">Strategic Asset Analysis</p>
          </div>
          <button
            type="button"
            className="btn btn-shell-ghost btn-sm flex-none"
            onClick={() => setSidebarOpen(false)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
        </div>
        <nav className="flex-1 space-y-md">
          {navItems.map((item) => renderNavButton(item))}
        </nav>
        <div className="mt-auto">
          <button
            type="button"
            className="btn btn-shell-primary w-full py-lg rounded-md font-label-md text-label-md uppercase tracking-widest font-bold"
            onClick={handleStartOver}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Analysis
          </button>
        </div>
      </aside>

      {/* Mobile navigation drawer (below lg). Reuses the same navItems as the
          desktop sidebar. Backdrop + slide animation; Escape / backdrop / a
          nav selection close it (see the drawer effect above). */}
      <div className={`lg:hidden fixed inset-0 z-modal ${drawerOpen ? '' : 'pointer-events-none'}`} aria-hidden={!drawerOpen}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ease-in-out ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
        <div
          id="mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={`absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-shell border-r border-shell-border flex flex-col p-lg shadow-xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="mb-xl flex items-start justify-between gap-sm">
            <div className="flex items-center gap-sm min-w-0">
              <img src={logo} alt="" aria-hidden="true" className="h-9 w-9 flex-none object-contain" />
              <div className="min-w-0">
                <h2 className="font-headline-md text-headline-md font-bold text-on-shell uppercase tracking-tight truncate">Intelligence Center</h2>
                <p className="font-label-sm text-label-sm text-on-shell-variant uppercase mt-1">Strategic Asset Analysis</p>
              </div>
            </div>
            <button
              ref={drawerCloseRef}
              type="button"
              className="btn btn-shell-ghost btn-sm flex-none"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              title="Close navigation"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <nav className="flex-1 space-y-md overflow-y-auto">
            {navItems.map((item) => renderNavButton(item, () => setDrawerOpen(false)))}
          </nav>
          <div className="mt-auto">
            <button
              type="button"
              className="btn btn-shell-primary w-full py-lg rounded-md font-label-md text-label-md uppercase tracking-widest font-bold"
              onClick={() => {
                handleStartOver()
                setDrawerOpen(false)
              }}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Analysis
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas */}
      <main ref={mainRef} className={`fixed top-20 bottom-10 left-0 right-0 p-md md:p-xl overflow-y-auto overflow-x-hidden custom-scrollbar transition-[left] duration-300 ease-in-out ${sidebarOpen ? 'lg:left-72' : 'lg:left-0'}`}>
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
              resumeStructure={resumeStructure}
              candidateName={fileMetadata?.fileName}
              isLoading={analysisState.status === 'loading'}
              error={analysisState.status === 'error' ? analysisState.error : ''}
              onStartOver={handleStartOver}
            />
          ) : null}

          {step === 'history' ? <HistoryPanel onOpen={handleOpenHistory} /> : null}
        </div>
      </main>

      {/* Footer Shell — minimal: just the live status, nothing decorative. */}
      <footer className="fixed bottom-0 left-0 right-0 flex items-center px-md md:px-xl z-header bg-shell border-t border-shell-border h-10">
        <div className="flex items-center gap-sm min-w-0">
          <span className="w-1.5 h-1.5 flex-none rounded-full bg-success status-dot-pulse" aria-hidden="true" />
          <p className="font-label-sm text-label-sm text-on-shell-variant font-bold uppercase tracking-tighter m-0 truncate">
            {health ? `Provider: ${health.provider}` : 'Offline'}
          </p>
        </div>
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
