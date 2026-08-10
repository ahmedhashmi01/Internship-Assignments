/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState } from 'react'

export const THEMES = ['light', 'dark', 'mix']
const STORAGE_KEY = 'theme'

const readStoredTheme = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(stored) ? stored : 'light'
  } catch {
    return 'light'
  }
}

const ThemeContext = createContext(null)

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme)
  const isFirstApply = useRef(true)
  const transitionTimer = useRef(null)

  // Reflect + persist the choice. The initial attribute is set by a tiny inline
  // script in index.html (before paint) to avoid a flash of the wrong theme.
  useEffect(() => {
    const root = document.documentElement

    // Smoothly cross-fade token colors on a real switch (not the first apply,
    // and not when the user prefers reduced motion). The class is removed once
    // the transition has finished so it never affects other interactions.
    if (!isFirstApply.current && !prefersReducedMotion()) {
      root.classList.add('theme-transition')
      window.clearTimeout(transitionTimer.current)
      transitionTimer.current = window.setTimeout(() => root.classList.remove('theme-transition'), 280)
    }
    isFirstApply.current = false

    root.setAttribute('data-theme', theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [theme])

  useEffect(() => () => window.clearTimeout(transitionTimer.current), [])

  const setTheme = (next) => {
    if (THEMES.includes(next)) setThemeState(next)
  }

  return <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}
