import mongoose from 'mongoose'

// Ownership is exactly one of userId (registered) or guestId (pre-signup).
// Only the summary fields are indexed/queried for lists; `result` holds the
// sanitized run response used to reopen a past analysis without re-running AI.
const analysisHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    guestId: { type: String, default: null, index: true },
    jobTitles: { type: [String], default: [] },
    topScore: { type: Number, default: null },
    overallStatus: { type: String, default: null },
    totalDurationMs: { type: Number, default: null },
    // Sanitized analyzer output (no prompts, no provider credentials, no debug
    // AI responses) — enough to restore the results view.
    result: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v
        return ret
      },
    },
  },
)

export const AnalysisHistory =
  mongoose.models.AnalysisHistory || mongoose.model('AnalysisHistory', analysisHistorySchema)
