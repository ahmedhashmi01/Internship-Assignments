import { AnalysisHistory } from '../models/AnalysisHistory.js'
import { AppError, ERROR_CODES } from '../errors/AppError.js'

// Recursively drop debug-only fields before persisting. `debugModelOutput` is
// raw model text attached to worker results when DEBUG_AI_RESPONSES is on — it
// must never be stored (privacy) and is not needed to reopen results.
const DEBUG_KEYS = new Set(['debugModelOutput'])

const stripDebug = (value) => {
  if (Array.isArray(value)) return value.map(stripDebug)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, val] of Object.entries(value)) {
      if (DEBUG_KEYS.has(key)) continue
      out[key] = stripDebug(val)
    }
    return out
  }
  return value
}

export const sanitizeResult = (result) => (result == null ? null : stripDebug(result))

// A usable analysis is one that produced at least one ranked job — the same
// definition the frontend uses (rankedJobs.length > 0).
export const isUsableResult = (result) => Array.isArray(result?.rankedJobs) && result.rankedJobs.length > 0

export const buildHistoryDoc = ({ userId = null, guestId = null, jobs, result }) => {
  const rankedJobs = Array.isArray(result?.rankedJobs) ? result.rankedJobs : []
  const jobTitles =
    Array.isArray(jobs) && jobs.length > 0
      ? jobs.map((job) => job.title).filter(Boolean)
      : rankedJobs.map((job) => job.jobTitle).filter(Boolean)
  const topScore = rankedJobs.length > 0 ? Math.max(...rankedJobs.map((job) => job.score ?? 0)) : null

  return {
    userId,
    guestId,
    jobTitles,
    topScore,
    overallStatus: result?.overallStatus ?? null,
    totalDurationMs: result?.totalDurationMs ?? null,
    result: sanitizeResult(result),
  }
}

const notFound = () => new AppError(ERROR_CODES.HISTORY_NOT_FOUND, 'Analysis not found.')

export const createHistoryService = () => {
  const save = (doc) => AnalysisHistory.create(doc)

  // List summaries only (no heavy `result` payload) for the current user.
  const listForUser = (userId) =>
    AnalysisHistory.find({ userId }).sort({ createdAt: -1 }).select('-result').lean()

  const getOwned = async (id, userId) => {
    let record
    try {
      record = await AnalysisHistory.findOne({ _id: id, userId })
    } catch {
      // Malformed ObjectId — treat as not found rather than a 500.
      throw notFound()
    }
    if (!record) throw notFound()
    return record
  }

  const deleteOwned = async (id, userId) => {
    let result
    try {
      result = await AnalysisHistory.deleteOne({ _id: id, userId })
    } catch {
      throw notFound()
    }
    if (result.deletedCount === 0) throw notFound()
    return true
  }

  // Reassign a converting guest's records to their new account in place — no
  // duplication. Ownership moves fully to userId and guest ownership is cleared.
  const migrateGuestToUser = async (guestId, userId) => {
    if (!guestId) return { modifiedCount: 0 }
    const result = await AnalysisHistory.updateMany(
      { guestId, userId: null },
      { $set: { userId, guestId: null } },
    )
    return { modifiedCount: result.modifiedCount ?? 0 }
  }

  return { save, listForUser, getOwned, deleteOwned, migrateGuestToUser }
}
