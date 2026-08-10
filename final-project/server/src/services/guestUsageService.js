import { GuestUsage } from '../models/GuestUsage.js'
import { AppError, ERROR_CODES } from '../errors/AppError.js'

// Guest allowance enforcement.
//
// The allowance is consumed with a reserve-before / release-on-failure pattern
// so that (a) concurrent requests can never both slip past the limit, and
// (b) a failed/unusable analysis does not permanently burn the allowance.
//
// reserve() is a single atomic findOneAndUpdate:
//   filter  { guestId, analysisCount < limit }   → only matches when a slot is free
//   update  $inc analysisCount, upsert:true       → creates the doc on first use
// If the guest is already at the limit, the filter cannot match an existing
// doc, so upsert attempts a second insert for the same guestId and the unique
// index rejects it (E11000) — which we translate into SIGNUP_REQUIRED. No AI
// provider is ever called on that path.
export const createGuestUsageService = (config) => {
  const limit = config.guestAnalysisLimit

  const reserve = async (guestId) => {
    const now = new Date()
    try {
      return await GuestUsage.findOneAndUpdate(
        { guestId, analysisCount: { $lt: limit } },
        {
          $inc: { analysisCount: 1 },
          $set: { lastAnalysisAt: now },
          $setOnInsert: { firstAnalysisAt: now },
        },
        { returnDocument: 'after', upsert: true },
      )
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError(
          ERROR_CODES.SIGNUP_REQUIRED,
          'Create an account to continue analyzing resumes.',
        )
      }
      throw error
    }
  }

  // Return the reserved slot; guarded so it can never drive the count negative.
  const release = async (guestId) => {
    await GuestUsage.findOneAndUpdate(
      { guestId, analysisCount: { $gt: 0 } },
      { $inc: { analysisCount: -1 } },
    )
  }

  const markConverted = async (guestId, userId) => {
    if (!guestId) return null
    return GuestUsage.findOneAndUpdate(
      { guestId },
      { $set: { convertedUserId: userId } },
      { returnDocument: 'after' },
    )
  }

  const getUsage = (guestId) => GuestUsage.findOne({ guestId }).lean()

  return { reserve, release, markConverted, getUsage, limit }
}
