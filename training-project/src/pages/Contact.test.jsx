import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Contact from './Contact'

describe('Contact form', () => {
  it('renders the initial form state', () => {
    render(<Contact />)
    expect(screen.getByRole('heading', { name: /contact us/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/what is this about\?/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
    expect(screen.getByText(/0\/10 words/i)).toBeInTheDocument()
  })

  it('shows validation errors and keeps the submit button disabled for invalid input', async () => {
    const user = userEvent.setup()
    render(<Contact />)

    await user.type(screen.getByPlaceholderText(/your name/i), 'A')
    await user.type(screen.getByPlaceholderText(/you@example.com/i), 'invalid-email')
    await user.type(screen.getByPlaceholderText(/what is this about\?/i), 'Hi')
    await user.type(screen.getByPlaceholderText(/write your message here/i), 'one two three four five six seven eight nine')
    await user.click(screen.getByRole('button', { name: /send message/i }))

    expect(await screen.findByText(/name must be at least 2 characters/i)).toBeInTheDocument()
    expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument()
    expect(screen.getByText(/subject must be at least 3 characters/i)).toBeInTheDocument()
    expect(screen.getByText(/message must contain at least 10 words/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
  })

  it('submits successfully when the form is valid', async () => {
    const user = userEvent.setup()
    render(<Contact />)

    await user.type(screen.getByPlaceholderText(/your name/i), 'Jane Doe')
    await user.type(screen.getByPlaceholderText(/you@example.com/i), 'jane@example.com')
    await user.type(screen.getByPlaceholderText(/what is this about\?/i), 'Project Inquiry')
    await user.type(
      screen.getByPlaceholderText(/write your message here/i),
      'This is a detailed message with enough words to satisfy the validation requirement.',
    )

    const submitButton = screen.getByRole('button', { name: /send message/i })
    expect(submitButton).toBeEnabled()

    await user.click(submitButton)

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()

    await waitFor(
      () => {
        expect(screen.getByText(/thanks! your message has been sent successfully/i)).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
    expect(screen.getByPlaceholderText(/your name/i)).toHaveValue('')
  })
})
