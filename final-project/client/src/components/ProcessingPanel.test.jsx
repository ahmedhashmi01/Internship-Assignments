import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import ProcessingPanel from './ProcessingPanel.jsx'

afterEach(() => {
  vi.useRealTimers()
})

describe('ProcessingPanel', () => {
  it('shows the analyzing heading, a live status message, and busy state', () => {
    render(<ProcessingPanel />)
    expect(screen.getByText('Analyzing your resume')).toBeInTheDocument()
    expect(screen.getByText(/Preparing resume evidence/i)).toBeInTheDocument()
    // aria-busy region for the live status.
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    // No fake completion percentage is shown.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('advances the status message over time', () => {
    vi.useFakeTimers()
    render(<ProcessingPanel />)
    expect(screen.getByText(/Preparing resume evidence/i)).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2300)
    })
    expect(screen.getByText(/Understanding job requirements/i)).toBeInTheDocument()
  })
})
