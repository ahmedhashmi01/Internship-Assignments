import { useEffect, useState } from 'react'
import { deleteHistoryItem, getHistory, getHistoryItem } from '../services/api.js'

const formatDate = (value) => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return '—'
  }
}

const formatDuration = (ms) => {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

// Skeleton rows shown while history is loading — same shape as the real
// rows (title bar + meta line + two action-button placeholders), so the
// section never reads as blank/frozen while waiting on the request.
const HISTORY_SKELETON_ROWS = 3

export default function HistoryPanel({ onOpen }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Which row is busy, and which action — so only the clicked button shows
  // "Opening…"/"Deleting…" while the other stays quietly disabled.
  const [busy, setBusy] = useState(null) // { id, action: 'open' | 'delete' } | null

  useEffect(() => {
    let active = true
    // First statement is the await, so no setState runs synchronously in the
    // effect body (state updates happen only in async continuations).
    ;(async () => {
      try {
        const res = await getHistory()
        if (active) setRecords(res.history || [])
      } catch {
        if (active) setError('Unable to load your history. Please try again.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const handleOpen = async (id) => {
    setBusy({ id, action: 'open' })
    setError('')
    try {
      // Reopening restores the stored result — it never re-runs the AI analysis.
      const res = await getHistoryItem(id)
      onOpen?.(res.record)
    } catch {
      setError('Unable to open this analysis.')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (id) => {
    setBusy({ id, action: 'delete' })
    setError('')
    try {
      await deleteHistoryItem(id)
      setRecords((prev) => prev.filter((r) => r._id !== id))
    } catch {
      setError('Unable to delete this analysis.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel p-lg md:p-xl animate-enter" aria-label="Analysis history">
      <header className="mb-lg">
        <h2 className="font-display text-headline-md font-extrabold text-on-surface tracking-tight">History</h2>
        <p className="text-body-sm text-on-surface-variant mt-1">Your saved analyses. Reopening restores the results without re-running AI.</p>
      </header>

      {error ? (
        <div role="alert" className="mb-md px-md py-2.5 rounded-md bg-error-container text-on-error-container border border-error text-body-sm font-medium">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-md" role="status" aria-live="polite" aria-busy="true">
          <p className="text-body-sm text-on-surface-variant font-bold flex items-center gap-xs">
            <span className="material-symbols-outlined text-[18px] status-dot-pulse" aria-hidden="true">history</span>
            Loading your saved analyses…
          </p>
          <ul className="space-y-md" aria-hidden="true">
            {Array.from({ length: HISTORY_SKELETON_ROWS }).map((_, index) => (
              <li key={index} className="metric-card !flex-row items-center justify-between gap-md flex-wrap status-dot-pulse">
                <div className="min-w-0 flex-1 space-y-xs">
                  <div className="h-4 w-1/2 rounded bg-surface-container-high" />
                  <div className="h-3 w-3/4 rounded bg-surface-container-high" />
                </div>
                <div className="flex items-center gap-sm flex-none">
                  <div className="h-8 w-16 rounded bg-surface-container-high" />
                  <div className="h-8 w-16 rounded bg-surface-container-high" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : records.length === 0 ? (
        <div className="border border-dashed border-outline-variant rounded-md p-xl text-center">
          <p className="text-body-md text-on-surface-variant">No saved analyses yet.</p>
          <p className="text-body-sm text-on-surface-variant mt-1">Run an analysis and it will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-md" role="list">
          {records.map((record) => (
            <li key={record._id} className="metric-card !flex-row items-center justify-between gap-md flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-on-surface truncate">
                  {record.jobTitles?.length ? record.jobTitles.join(', ') : 'Untitled analysis'}
                </p>
                <p className="text-label-sm text-on-surface-variant mt-1 flex flex-wrap gap-x-lg gap-y-1">
                  <span>{formatDate(record.createdAt)}</span>
                  <span>Top score: <span className="font-bold text-on-surface">{record.topScore ?? '—'}</span></span>
                  <span className="uppercase tracking-wide">{record.overallStatus || '—'}</span>
                  <span>{formatDuration(record.totalDurationMs)}</span>
                </p>
              </div>
              <div className="flex items-center gap-sm flex-none">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleOpen(record._id)}
                  disabled={busy?.id === record._id}
                  aria-busy={busy?.id === record._id && busy.action === 'open'}
                >
                  {busy?.id === record._id && busy.action === 'open' ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] status-dot-pulse" aria-hidden="true">progress_activity</span>
                      Opening…
                    </>
                  ) : (
                    'Open'
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-error"
                  onClick={() => handleDelete(record._id)}
                  disabled={busy?.id === record._id}
                  aria-busy={busy?.id === record._id && busy.action === 'delete'}
                  aria-label={`Delete analysis from ${formatDate(record.createdAt)}`}
                >
                  {busy?.id === record._id && busy.action === 'delete' ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] status-dot-pulse" aria-hidden="true">progress_activity</span>
                      Deleting…
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
