import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

// Mock the API client so no real network calls happen.
vi.mock('./services/api.js', () => {
  class ApiError extends Error {
    constructor(message, { code } = {}) {
      super(message)
      this.code = code
    }
  }
  return {
    ApiError,
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
  }
})

import * as api from './services/api.js'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import App from './App.jsx'

const renderApp = () =>
  render(
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  api.getToken.mockReturnValue(null)
  api.getHealth.mockResolvedValue({ status: 'ok', provider: 'mock' })
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.body.style.overflow = ''
})

describe('Responsive navigation (mobile drawer)', () => {
  const hamburger = () => screen.getByRole('button', { name: /open navigation/i })

  it('always exposes a mobile navigation trigger (hamburger)', () => {
    renderApp()
    expect(hamburger()).toBeInTheDocument()
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false')
    expect(hamburger()).toHaveAttribute('aria-controls', 'mobile-drawer')
  })

  it('keeps the desktop sidebar collapse control present (desktop behavior intact)', () => {
    renderApp()
    expect(screen.getAllByRole('button', { name: /collapse sidebar|expand sidebar/i }).length).toBeGreaterThan(0)
    expect(document.querySelector('aside#app-sidebar')).toBeTruthy()
  })

  it('opening the trigger reveals the drawer and updates aria-expanded', () => {
    renderApp()
    // Drawer dialog is not in the accessibility tree while closed (aria-hidden).
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()

    fireEvent.click(hamburger())
    expect(hamburger()).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', { name: 'Navigation' })
    expect(dialog).toBeInTheDocument()
    // Same navigation items as the desktop sidebar are available in the drawer.
    expect(within(dialog).getByText('RESUME ENGINE')).toBeInTheDocument()
    expect(within(dialog).getByText('DELTA REPORTS')).toBeInTheDocument()
  })

  it('closes via the close button and returns focus to the trigger', () => {
    renderApp()
    fireEvent.click(hamburger())
    const dialog = screen.getByRole('dialog', { name: 'Navigation' })
    fireEvent.click(within(dialog).getByRole('button', { name: /close navigation/i }))

    expect(hamburger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(hamburger())
  })

  it('closes when a navigation destination is selected', () => {
    renderApp()
    fireEvent.click(hamburger())
    const dialog = screen.getByRole('dialog', { name: 'Navigation' })
    fireEvent.click(within(dialog).getByText('DELTA REPORTS'))

    expect(hamburger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    renderApp()
    fireEvent.click(hamburger())
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('closes when the backdrop is clicked', () => {
    renderApp()
    fireEvent.click(hamburger())
    const dialog = screen.getByRole('dialog', { name: 'Navigation' })
    // The backdrop is the sibling before the dialog panel.
    const backdrop = dialog.parentElement.querySelector('[aria-hidden="true"]')
    fireEvent.click(backdrop)
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('locks background scroll while the drawer is open and restores it on close', () => {
    renderApp()
    fireEvent.click(hamburger())
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('Theme selector accessibility across widths', () => {
  it('exposes all three themes in the desktop segmented control', () => {
    renderApp()
    expect(screen.getByRole('button', { name: /light theme/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dark theme/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /mix theme/i })).toBeInTheDocument()
  })

  it('allows selecting Mix from the compact (mobile) theme control', () => {
    renderApp()
    // Open the compact popover (present for narrow widths) and choose Mix.
    fireEvent.click(screen.getByRole('button', { name: /select theme/i }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Mix' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('mix')
  })
})
