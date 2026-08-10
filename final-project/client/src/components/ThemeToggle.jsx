import { useTheme } from '../context/ThemeContext.jsx'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: 'light_mode' },
  { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  { value: 'mix', label: 'Mix', icon: 'contrast' },
]

// Keyboard-accessible segmented control. Uses shell tokens so it reads on the
// app shell in every theme.
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <div role="group" aria-label="Theme" className="inline-flex items-center rounded-md border border-shell-border overflow-hidden">
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
  )
}
