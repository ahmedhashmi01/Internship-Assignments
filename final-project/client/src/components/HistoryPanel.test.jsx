import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../services/api.js', () => ({
  getHistory: vi.fn(),
  getHistoryItem: vi.fn(),
  deleteHistoryItem: vi.fn(),
  runAnalysis: vi.fn(),
}))

import * as api from '../services/api.js'
import HistoryPanel from './HistoryPanel.jsx'

const sampleRecords = [
  {
    _id: 'rec-1',
    jobTitles: ['Senior Frontend Engineer'],
    topScore: 82,
    overallStatus: 'complete',
    totalDurationMs: 1200,
    createdAt: '2026-08-01T12:00:00.000Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.getHistory.mockResolvedValue({ history: sampleRecords })
})

describe('HistoryPanel', () => {
  it('renders the authenticated user\'s saved analyses', async () => {
    render(<HistoryPanel onOpen={() => {}} />)
    expect(await screen.findByText('Senior Frontend Engineer')).toBeInTheDocument()
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.getByText(/complete/i)).toBeInTheDocument()
  })

  it('opens a record without triggering an AI analysis', async () => {
    const fullRecord = { _id: 'rec-1', result: { rankedJobs: [{ jobId: 'j1' }] } }
    api.getHistoryItem.mockResolvedValue({ record: fullRecord })
    const onOpen = vi.fn()

    render(<HistoryPanel onOpen={onOpen} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(fullRecord))
    expect(api.getHistoryItem).toHaveBeenCalledWith('rec-1')
    // Reopening must never call the analyzer.
    expect(api.runAnalysis).not.toHaveBeenCalled()
  })

  it('deletes the user\'s own record and removes it from the list', async () => {
    api.deleteHistoryItem.mockResolvedValue({ success: true })

    render(<HistoryPanel onOpen={() => {}} />)
    await screen.findByText('Senior Frontend Engineer')
    fireEvent.click(screen.getByRole('button', { name: /Delete analysis/i }))

    await waitFor(() => expect(api.deleteHistoryItem).toHaveBeenCalledWith('rec-1'))
    await waitFor(() => expect(screen.queryByText('Senior Frontend Engineer')).not.toBeInTheDocument())
  })

  it('shows an empty state when there is no history', async () => {
    api.getHistory.mockResolvedValue({ history: [] })
    render(<HistoryPanel onOpen={() => {}} />)
    expect(await screen.findByText(/No saved analyses yet/i)).toBeInTheDocument()
  })
})
