import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// Fully mock the API client so no real network calls happen.
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
    getHealth: vi.fn(),
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

const renderApp = () => render(
  <ThemeProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ThemeProvider>,
)

const signupRequired = () => Object.assign(new Error('signup'), { code: 'SIGNUP_REQUIRED' })

const usableResult = {
  jobs: [],
  rankedJobs: [{ jobId: 'j1', jobTitle: 'Senior Frontend Engineer', jobDescription: 'd', score: 82, scoreDrivers: [], recommendationLabel: 'good fit', mandatoryGaps: [], status: 'succeeded', rank: 1, result: { workers: [] } }],
  failedJobs: [],
  recurringGaps: [],
  partial: false,
  overallStatus: 'complete',
  totalDurationMs: 10,
  providerValidation: null,
}

// Drive the resume form → review step.
const goToReview = () => {
  fireEvent.change(screen.getByPlaceholderText(/Ingest the strategic profile/i), {
    target: { value: 'Experienced React developer with JavaScript and Node.' },
  })
  fireEvent.change(screen.getByPlaceholderText(/Chief Product Officer/i), {
    target: { value: 'Senior Frontend Engineer' },
  })
  fireEvent.change(screen.getByPlaceholderText(/Paste strategic objectives/i), {
    target: { value: 'Build and lead React interfaces for the platform.' },
  })
  fireEvent.click(screen.getByRole('button', { name: /Execute Analysis/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getToken.mockReturnValue(null)
  api.getHealth.mockResolvedValue({ status: 'ok', provider: 'mock' })
  api.getGuestId.mockReturnValue('guest-test')
  api.parseResume.mockResolvedValue({ extractedText: 'Experienced React developer', normalizedResume: { originalText: 'x', evidence: [] } })
  api.validateAnalysisInput.mockResolvedValue({ validationErrors: [], normalizedResume: { originalText: 'x', evidence: [] }, jobs: [{ title: 'Senior Frontend Engineer', description: 'Build and lead React interfaces for the platform.' }] })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('Guest experience', () => {
  it('shows the free-analysis messaging and guest auth buttons', async () => {
    renderApp()
    expect(await screen.findByText(/1 free analysis available/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('opens the auth modal from the header', async () => {
    renderApp()
    await screen.findByText(/1 free analysis available/i)
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/Email/i)).toBeInTheDocument()
  })

  it('runs the first analysis without login and shows results', async () => {
    api.runAnalysis.mockResolvedValueOnce(usableResult)
    renderApp()
    await screen.findByText(/1 free analysis available/i)
    goToReview()
    fireEvent.click(await screen.findByRole('button', { name: /Run AI Match Analysis/i }))

    await waitFor(() => expect(api.runAnalysis).toHaveBeenCalledTimes(1))
    // No auth modal appeared.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('SIGNUP_REQUIRED interception', () => {
  it('opens the auth UI, preserves inputs, and does not navigate away', async () => {
    api.runAnalysis.mockRejectedValueOnce(signupRequired())
    renderApp()
    await screen.findByText(/1 free analysis available/i)
    goToReview()
    const runBtn = await screen.findByRole('button', { name: /Run AI Match Analysis/i })
    fireEvent.click(runBtn)

    // Auth modal opens...
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // ...and the review step (with the entered job title) is still present.
    expect(screen.getAllByText('Senior Frontend Engineer').length).toBeGreaterThan(0)
  })

  it('lets the user sign up and then retry the analysis to completion', async () => {
    api.runAnalysis.mockRejectedValueOnce(signupRequired()).mockResolvedValueOnce(usableResult)
    api.signup.mockResolvedValue({ token: 'tok', user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' } })
    renderApp()
    await screen.findByText(/1 free analysis available/i)
    goToReview()
    fireEvent.click(await screen.findByRole('button', { name: /Run AI Match Analysis/i }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Ada Lovelace' } })
    fireEvent.change(within(dialog).getByLabelText(/Email/i), { target: { value: 'ada@example.com' } })
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'correcthorse' } })
    fireEvent.change(within(dialog).getByLabelText(/Confirm password/i), { target: { value: 'correcthorse' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create account' }))

    // Authenticated state updates: name shows, modal closes, hint appears.
    expect(await screen.findByText("You're signed in — run the analysis to continue.")).toBeInTheDocument()
    expect(api.setToken).toHaveBeenCalledWith('tok')

    // Explicit retry now succeeds.
    fireEvent.click(screen.getByRole('button', { name: /Run AI Match Analysis/i }))
    await waitFor(() => expect(api.runAnalysis).toHaveBeenCalledTimes(2))
  })
})

describe('Authenticated session', () => {
  beforeEach(() => {
    api.getToken.mockReturnValue('tok')
    api.getMe.mockResolvedValue({ user: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'user' } })
  })

  it('restores the session and shows authenticated header controls', async () => {
    renderApp()
    // Sign out lives inside the account menu (opened from the avatar).
    fireEvent.click(await screen.findByRole('button', { name: /account menu/i }))
    expect(await screen.findByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument()
    // No guest messaging or guest buttons.
    expect(screen.queryByText(/1 free analysis available/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument()
  })

  it('shows only the first name in the compact header, but the full name in the account menu', async () => {
    renderApp()
    const menuButton = await screen.findByRole('button', { name: /account menu/i })
    // The header trigger shows "Ada", never the full "Ada Lovelace".
    expect(menuButton).toHaveTextContent('Ada')
    expect(menuButton).not.toHaveTextContent('Ada Lovelace')

    // The expanded account menu still shows the full name for clear identity confirmation.
    fireEvent.click(menuButton)
    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('logs out and returns to the guest state', async () => {
    api.logout.mockResolvedValue({ success: true })
    renderApp()
    fireEvent.click(await screen.findByRole('button', { name: /account menu/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /sign out/i }))

    await waitFor(() => expect(api.clearToken).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })
})

describe('Login', () => {
  it('updates authenticated state on successful login', async () => {
    api.login.mockResolvedValue({ token: 'tok', user: { id: 'u1', name: 'Grace Hopper', email: 'grace@example.com', role: 'user' } })
    renderApp()
    await screen.findByText(/1 free analysis available/i)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Email/i), { target: { value: 'grace@example.com' } })
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'correcthorse' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('button', { name: /account menu/i })).toBeInTheDocument()
    expect(api.setToken).toHaveBeenCalledWith('tok')
  })
})
