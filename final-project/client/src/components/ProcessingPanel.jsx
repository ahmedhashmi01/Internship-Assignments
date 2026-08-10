import { useEffect, useState } from 'react'

// Purely client-side UX feedback (the backend does not stream progress). Messages
// are cycled to reassure the user that work is happening — they intentionally do
// NOT claim precise completion percentages.
const STATUS_MESSAGES = [
  'Preparing resume evidence…',
  'Understanding job requirements…',
  'Comparing your experience…',
  'Checking ATS keywords…',
  'Reviewing rewrite suggestions…',
  'Calculating final match…',
]

export default function ProcessingPanel() {
  const [messageIndex, setMessageIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    // Advance through the status messages, then hold on the final one.
    const cycle = setInterval(() => {
      setMessageIndex((current) => (current < STATUS_MESSAGES.length - 1 ? current + 1 : current))
    }, 2200)
    return () => {
      clearInterval(tick)
      clearInterval(cycle)
    }
  }, [])

  return (
    <section className="space-y-xl pb-xl animate-enter" aria-live="polite" aria-busy="true">
      <div className="panel p-xl text-center space-y-lg max-w-2xl mx-auto">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <span className="material-symbols-outlined text-[36px] animate-spin" aria-hidden="true">progress_activity</span>
        </div>

        <div className="space-y-xs">
          <h2 className="font-display text-headline-lg font-extrabold text-on-surface tracking-tight">Analyzing your resume</h2>
          <p className="font-body-md text-body-md text-on-surface-variant min-h-[1.5rem]" role="status" aria-live="polite">
            {STATUS_MESSAGES[messageIndex]}
          </p>
        </div>

        {/* Animated indeterminate dots — decorative (motion reduced via CSS). */}
        <div className="flex items-center justify-center gap-2" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-primary processing-dot" />
          <span className="w-2.5 h-2.5 rounded-full bg-primary processing-dot" />
          <span className="w-2.5 h-2.5 rounded-full bg-primary processing-dot" />
        </div>

        <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide">
          Elapsed {elapsed}s · running multi-agent analysis
        </p>
      </div>
    </section>
  )
}
