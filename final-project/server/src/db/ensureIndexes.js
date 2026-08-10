import { User } from '../models/User.js'
import { GuestUsage } from '../models/GuestUsage.js'
import { AnalysisHistory } from '../models/AnalysisHistory.js'

// Build the schema-declared indexes (notably the unique User.email index and
// the unique GuestUsage.guestId index) on the connected database. Without this,
// a database created after the app first ran — or one where autoIndex was
// disabled — would lack the unique constraint, allowing duplicate accounts.
export const ensureIndexes = async () => {
  await Promise.all([User.init(), GuestUsage.init(), AnalysisHistory.init()])
}
