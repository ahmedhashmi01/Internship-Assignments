import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

// Mock the API so App renders without network. (Same shape as App.auth.test.jsx.)
vi.mock('./services/api.js', () => ({
  ApiError: class extends Error {},
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  getGuestId: vi.fn(() => 'guest-test'),
  getHealth: vi.fn(() => Promise.resolve({ status: 'ok', provider: 'mock' })),
  parseResume: vi.fn(),
  validateAnalysisInput: vi.fn(),
  runAnalysis: vi.fn(),
  signup: vi.fn(),
  login: vi.fn(),
  getMe: vi.fn(),
  logout: vi.fn(),
  getHistory: vi.fn(() => Promise.resolve({ history: [] })),
  getHistoryItem: vi.fn(),
  deleteHistoryItem: vi.fn(),
}))

import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

// Regression guard for the "white block above the footer" bug. The cause was
// main's `mt-20` margin collapsing through #root, inflating document height by
// 80px and letting the document scroll while the fixed footer stayed pinned —
// exposing the background above it. The fix positions the scroll region (main)
// and the sidebar by top/bottom insets (no collapsing margin, no static
// viewport-height calc), and sizes the shell with `dvh`. These assertions lock
// that structure in without any brittle pixel geometry.
describe('App shell structure (footer-gap regression)', () => {
  let container
  beforeEach(() => {
    ;({ container } = render(
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>,
    ))
  })

  it('positions main by top/bottom insets, not a collapsing margin or viewport-height calc', () => {
    const main = document.querySelector('main')
    expect(main).toBeTruthy()
    expect(main.className).toContain('fixed')
    expect(main.className).toContain('top-20') // clears the fixed header
    expect(main.className).toContain('bottom-12') // single footer-height offset
    // The margin that used to collapse and inflate the document must be gone.
    expect(main.className).not.toContain('mt-20')
    // No static viewport-height calc that desyncs from the dynamic viewport.
    expect(main.className).not.toMatch(/100svh|100vh/)
  })

  it('has exactly one fixed footer pinned to the bottom (no duplicate spacer)', () => {
    const footers = document.querySelectorAll('footer')
    expect(footers).toHaveLength(1)
    expect(footers[0].className).toContain('fixed')
    expect(footers[0].className).toContain('bottom-0')
  })

  it('sizes the shell with the dynamic viewport unit (dvh), not 100vh', () => {
    const shell = container.firstElementChild
    expect(shell.className).toContain('min-h-[100dvh]')
    expect(shell.className).not.toContain('min-h-screen')
  })

  it('offsets the sidebar by insets too (no 100vh height calc)', () => {
    const aside = document.querySelector('aside')
    expect(aside.className).toContain('top-20')
    expect(aside.className).toContain('bottom-12')
    expect(aside.className).not.toMatch(/100vh/)
  })
})
