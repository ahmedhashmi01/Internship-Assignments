import mongoose from 'mongoose'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createHistoryService } from '../src/services/historyService.js'
import { AnalysisHistory } from '../src/models/AnalysisHistory.js'
import { User } from '../src/models/User.js'
import { GuestUsage } from '../src/models/GuestUsage.js'
import { clearTestDb, startTestDb, stopTestDb } from './helpers/testDb.js'

const history = createHistoryService()

beforeAll(startTestDb)
afterAll(stopTestDb)
afterEach(clearTestDb)

describe('Account/history consistency', () => {
  it('guest conversion is idempotent — repeated migration does not duplicate history', async () => {
    const guestId = 'guest-idem'
    const userId = new mongoose.Types.ObjectId()
    await AnalysisHistory.create({ guestId, jobTitles: ['Frontend Engineer'], result: { rankedJobs: [{ jobId: 'j1' }] } })

    const first = await history.migrateGuestToUser(guestId, userId)
    expect(first.modifiedCount).toBe(1)

    // Repeat conversions (e.g. retried signup handler) must be no-ops.
    const second = await history.migrateGuestToUser(guestId, userId)
    const third = await history.migrateGuestToUser(guestId, userId)
    expect(second.modifiedCount).toBe(0)
    expect(third.modifiedCount).toBe(0)

    expect(await AnalysisHistory.countDocuments({})).toBe(1)
    expect(await AnalysisHistory.countDocuments({ userId })).toBe(1)
    const record = await AnalysisHistory.findOne({})
    expect(record.guestId).toBeNull()
  })

  it('deleting a history record leaves the user and guest-usage records intact', async () => {
    const user = await User.create({ name: 'Ada', email: 'ada@example.com', passwordHash: 'x' })
    await GuestUsage.create({ guestId: 'guest-del', analysisCount: 1, convertedUserId: user._id })
    const record = await AnalysisHistory.create({ userId: user._id, jobTitles: ['X'], result: { rankedJobs: [{}] } })

    await history.deleteOwned(record._id.toString(), user._id.toString())

    expect(await AnalysisHistory.findById(record._id)).toBeNull()
    expect(await User.findById(user._id)).not.toBeNull()
    expect(await GuestUsage.findOne({ guestId: 'guest-del' })).not.toBeNull()
  })
})
