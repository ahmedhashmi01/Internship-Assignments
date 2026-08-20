import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../context/ThemeContext.jsx'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'mix', label: 'Mix', icon: 'contrast' },
]

// Theme selector. All three options stay reachable at every width:
//  - sm and up: the existing keyboard-accessible segmented control.
//  - below sm: a compact icon button that opens a popover (Light/Dark/Mix), so
//    Mix never gets pushed off-screen on narrow headers.
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const current = OPTIONS.find((option) => option.value === theme) || OPTIONS[0]

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* Segmented control (sm and up) */}
      <div role="group" aria-label="Theme" className="hidden sm:inline-flex items-center rounded-md border border-shell-border overflow-hidden">
        {OPTIONS.map((option) => {
          const active = theme === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              aria-pressed={active}
              title={`${option.label} theme`}
              className={`flex items-center justify-center px-2 py-1.5 transition-colors ${active ? 'bg-shell-accent-surface text-shell-accent' : 'text-on-shell-variant hover:text-on-shell'}`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{option.icon}</span>
              <span className="sr-only">{option.label} theme</span>
            </button>
          )
        })}
      </div>

      {/* Compact popover (below sm) */}
      <div className="relative sm:hidden" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Select theme"
          title="Theme"
          className="flex items-center justify-center h-9 w-9 rounded-md border border-shell-border text-on-shell-variant hover:text-on-shell hover:bg-shell-accent-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{current.icon}</span>
        </button>

        {open ? (
          <>
            <div className="fixed inset-0 z-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
            <div role="menu" aria-label="Theme" className="absolute right-0 mt-2 w-40 bg-surface border border-outline-variant rounded-lg shadow-lg z-modal p-xs animate-enter">
              {OPTIONS.map((option) => {
                const active = theme === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      setTheme(option.value)
                      setOpen(false)
                    }}
                    className={`w-full flex items-center gap-sm px-md py-sm rounded-md text-left font-label-md text-label-md font-bold transition-colors ${active ? 'bg-surface-container text-primary' : 'text-on-surface hover:bg-surface-container'}`}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{option.icon}</span>
                    {option.label}
                  </button>
                )
              })}
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}
