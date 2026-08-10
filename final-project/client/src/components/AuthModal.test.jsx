import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('../services/api.js', () => {
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
    getMe: vi.fn(),
    signup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }
})

import * as api from '../services/api.js'
import { AuthProvider } from '../context/AuthContext.jsx'
import AuthModal from './AuthModal.jsx'

const renderModal = (props = {}) =>
  render(
    <AuthProvider>
      <AuthModal open onClose={() => {}} onAuthenticated={props.onAuthenticated || (() => {})} initialMode={props.initialMode || 'login'} intro={props.intro} />
    </AuthProvider>,
  )

const apiError = (code) => new api.ApiError('x', { code })

beforeEach(() => {
  vi.clearAllMocks()
  api.getToken.mockReturnValue(null)
})

describe('AuthModal', () => {
  it('signs in successfully and notifies the parent', async () => {
    api.login.mockResolvedValue({ token: 'tok', user: { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'user' } })
    const onAuthenticated = vi.fn()
    renderModal({ initialMode: 'login', onAuthenticated })

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
    expect(api.login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'correcthorse' })
    expect(api.setToken).toHaveBeenCalledWith('tok')
  })

  it('creates an account successfully', async () => {
    api.signup.mockResolvedValue({ token: 'tok', user: { id: 'u1', name: 'Ada', email: 'ada@example.com', role: 'user' } })
    const onAuthenticated = vi.fn()
    renderModal({ initialMode: 'signup', onAuthenticated })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'correcthorse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled())
    expect(api.signup).toHaveBeenCalledWith({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'correcthorse' })
  })

  it('shows a generic error on invalid credentials', async () => {
    api.login.mockRejectedValue(apiError('INVALID_CREDENTIALS'))
    const onAuthenticated = vi.fn()
    renderModal({ initialMode: 'login', onAuthenticated })

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpassword' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('shows a useful duplicate-account error with a Sign in action that switches to login', async () => {
    api.signup.mockRejectedValue(apiError('EMAIL_ALREADY_EXISTS'))
    renderModal({ initialMode: 'signup' })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'taken@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'correcthorse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('An account with this email already exists. Sign in instead.')
    // Not a generic message.
    expect(alert).not.toHaveTextContent(/Something went wrong/i)

    // The inline "Sign in" action switches the modal to login mode.
    fireEvent.click(within(alert).getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument()
  })

  it('validates that passwords match before calling the API', async () => {
    renderModal({ initialMode: 'signup' })

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correcthorse' } })
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'different1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.')
    expect(api.signup).not.toHaveBeenCalled()
  })
})
