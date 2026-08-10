import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

// Map normalized backend error codes to user-safe copy. Never surface raw
// technical/backend messages.
const friendlyError = (err) => {
  switch (err?.code) {
    case 'EMAIL_ALREADY_EXISTS':
      return 'An account with that email already exists. Try signing in.'
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password.'
    case 'VALIDATION_ERROR':
      return err.message || 'Please check the details you entered.'
    case 'DATABASE_UNAVAILABLE':
      return 'Service temporarily unavailable. Please try again shortly.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

const inputClass =
  'w-full px-md py-2.5 rounded-md border border-outline-variant bg-surface-elevated text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none transition-colors'

export default function AuthModal({ open, onClose, initialMode = 'login', onAuthenticated, intro }) {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const firstFieldRef = useRef(null)

  // Mounted only while open (parent controls this), so focus-on-mount and the
  // ESC handler need no open/state syncing — fresh useState on each open.
  useEffect(() => {
    firstFieldRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!open) return null

  const isSignup = mode === 'signup'
  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const clientValidate = () => {
    if (isSignup && !form.name.trim()) return 'Name is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'A valid email is required.'
    if (isSignup && form.password.length < 8) return 'Password must be at least 8 characters.'
    if (!form.password) return 'Password is required.'
    if (isSignup && form.password !== form.confirm) return 'Passwords do not match.'
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clientError = clientValidate()
    if (clientError) {
      setError(clientError)
      return
    }
    setSubmitting(true)
    setError('')
    try {
      if (isSignup) {
        await signup({ name: form.name.trim(), email: form.email.trim(), password: form.password })
      } else {
        await login({ email: form.email.trim(), password: form.password })
      }
      onAuthenticated?.()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-md bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className="panel w-full max-w-md p-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <div className="flex items-start justify-between gap-md mb-lg">
          <div>
            <h2 id="auth-modal-title" className="font-display text-headline-md font-extrabold text-on-surface tracking-tight">
              {isSignup ? 'Create account' : 'Sign in'}
            </h2>
            {intro ? <p className="text-body-sm text-on-surface-variant mt-1">{intro}</p> : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-md px-md py-2.5 rounded-md bg-error-container text-on-error-container border border-error text-body-sm font-medium"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-md" noValidate>
          {isSignup ? (
            <label className="block">
              <span className="block text-label-sm font-bold uppercase tracking-wide text-on-surface-variant mb-1">Name</span>
              <input
                ref={firstFieldRef}
                type="text"
                className={inputClass}
                value={form.name}
                onChange={update('name')}
                autoComplete="name"
                placeholder="Ada Lovelace"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="block text-label-sm font-bold uppercase tracking-wide text-on-surface-variant mb-1">Email</span>
            <input
              ref={isSignup ? undefined : firstFieldRef}
              type="email"
              className={inputClass}
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="block text-label-sm font-bold uppercase tracking-wide text-on-surface-variant mb-1">Password</span>
            <input
              type="password"
              className={inputClass}
              value={form.password}
              onChange={update('password')}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
            />
          </label>

          {isSignup ? (
            <label className="block">
              <span className="block text-label-sm font-bold uppercase tracking-wide text-on-surface-variant mb-1">Confirm password</span>
              <input
                type="password"
                className={inputClass}
                value={form.confirm}
                onChange={update('confirm')}
                autoComplete="new-password"
                placeholder="Re-enter password"
              />
            </label>
          ) : null}

          <button type="submit" className="btn btn-primary w-full" disabled={submitting} aria-busy={submitting}>
            {submitting ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="text-body-sm text-on-surface-variant mt-lg text-center">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="font-bold text-primary hover:underline"
            onClick={() => {
              setError('')
              setMode(isSignup ? 'login' : 'signup')
            }}
          >
            {isSignup ? 'Sign in' : 'Create account'}
          </button>
        </p>
      </div>
    </div>
  )
}
