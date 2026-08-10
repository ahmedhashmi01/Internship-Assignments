import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { User } from '../../src/models/User.js'
import { GuestUsage } from '../../src/models/GuestUsage.js'
import { AnalysisHistory } from '../../src/models/AnalysisHistory.js'

// Isolated in-memory MongoDB per test file. Never touches a developer's real
// database.
let mem

export const startTestDb = async () => {
  mem = await MongoMemoryServer.create()
  await mongoose.connect(mem.getUri())
  // Build unique indexes (email, guestId) so duplicate-key behavior — which the
  // concurrency and duplicate-email tests depend on — is actually enforced.
  await Promise.all([User.init(), GuestUsage.init(), AnalysisHistory.init()])
}

export const clearTestDb = async () => {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})))
}

export const stopTestDb = async () => {
  await mongoose.disconnect()
  if (mem) await mem.stop()
}
