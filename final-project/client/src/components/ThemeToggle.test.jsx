import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ThemeToggle from './ThemeToggle.jsx'
import { ThemeProvider } from '../context/ThemeContext.jsx'

const renderToggle = () =>
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
afterEach(() => {
  window.localStorage.clear()
})

describe('ThemeToggle', () => {
  it('defaults to light and applies + persists a Dark selection', () => {
    renderToggle()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: /dark theme/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(window.localStorage.getItem('theme')).toBe('dark')
    expect(screen.getByRole('button', { name: /dark theme/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('applies + persists a Mix selection', () => {
    renderToggle()
    fireEvent.click(screen.getByRole('button', { name: /mix theme/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('mix')
    expect(window.localStorage.getItem('theme')).toBe('mix')
  })

  it('applies + persists a Light selection', () => {
    window.localStorage.setItem('theme', 'dark')
    renderToggle()
    fireEvent.click(screen.getByRole('button', { name: /light theme/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(window.localStorage.getItem('theme')).toBe('light')
  })

  it('restores the persisted theme on load', () => {
    window.localStorage.setItem('theme', 'mix')
    renderToggle()
    expect(document.documentElement.getAttribute('data-theme')).toBe('mix')
    expect(screen.getByRole('button', { name: /mix theme/i })).toHaveAttribute('aria-pressed', 'true')
  })

  describe('compact (narrow-width) control', () => {
    it('opens a popover and lets the user select Mix', () => {
      renderToggle()
      const trigger = screen.getByRole('button', { name: /select theme/i })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(trigger)
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Mix' }))

      expect(document.documentElement.getAttribute('data-theme')).toBe('mix')
      expect(window.localStorage.getItem('theme')).toBe('mix')
    })

    it('exposes all three themes in the compact popover and closes on Escape', () => {
      renderToggle()
      fireEvent.click(screen.getByRole('button', { name: /select theme/i }))
      expect(screen.getByRole('menuitemradio', { name: 'Light' })).toBeInTheDocument()
      expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeInTheDocument()
      expect(screen.getByRole('menuitemradio', { name: 'Mix' })).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('menuitemradio', { name: 'Mix' })).not.toBeInTheDocument()
    })
  })
})
