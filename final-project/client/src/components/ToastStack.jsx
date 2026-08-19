import { useEffect, useState } from 'react'

// Tone → icon/color mapping using existing semantic tone tokens (see
// index.css) — meaning never depends on color alone, every toast also
// carries an icon and text.
const TOAST_META = {
  warning: { icon: 'warning', tone: 'tone-moderate' },
  error: { icon: 'error', tone: 'tone-rejected' },
  info: { icon: 'info', tone: 'tone-info' },
}

const DEFAULT_DURATION_MS = 6500
// Must match the CSS .toast-leave animation duration below (index.css) so the
// element unmounts exactly as its exit animation finishes, not before/after.
const LEAVE_ANIMATION_MS = 280

function ToastItem({ toast, onDismiss }) {
  const [leaving, setLeaving] = useState(false)
  const meta = TOAST_META[toast.tone] || TOAST_META.info

  // Auto-dismiss after the toast's duration.
  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), toast.durationMs ?? DEFAULT_DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast.durationMs])

  // Let the exit animation play before actually removing the toast.
  useEffect(() => {
    if (!leaving) return undefined
    const timer = setTimeout(() => onDismiss(toast.id), LEAVE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [leaving, onDismiss, toast.id])

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`w-full p-md rounded-lg border shadow-lg bg-surface-elevated flex items-start gap-sm ${meta.tone} ${leaving ? 'toast-leave' : 'toast-enter'}`}
    >
      <span className="material-symbols-outlined text-[20px] flex-none" aria-hidden="true">{meta.icon}</span>
      <p className="font-body-md text-body-md flex-1 m-0">{toast.message}</p>
      <button
        type="button"
        className="flex-none opacity-70 hover:opacity-100 transition-opacity"
        onClick={() => setLeaving(true)}
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
      </button>
    </div>
  )
}

// Fixed bottom-right toast stack. Each toast slides/fades in on mount and
// slides/fades out before being removed — respects prefers-reduced-motion
// globally (see index.css).
export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null

  return (
    // bottom-14 clears the app's fixed footer (h-10) with a small gap. Spans
    // left-md..right-md on mobile (no horizontal overflow) and releases to a
    // fixed max-width, right-aligned stack from sm: up.
    <div className="fixed bottom-14 left-md right-md sm:left-auto sm:w-full sm:max-w-sm z-modal flex flex-col-reverse gap-sm pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  )
}
