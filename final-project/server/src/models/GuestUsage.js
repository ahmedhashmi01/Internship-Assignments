import mongoose from 'mongoose'

const guestUsageSchema = new mongoose.Schema(
  {
    guestId: { type: String, required: true, unique: true, index: true },
    analysisCount: { type: Number, default: 0, min: 0 },
    firstAnalysisAt: { type: Date, default: null },
    lastAnalysisAt: { type: Date, default: null },
    convertedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

export const GuestUsage = mongoose.models.GuestUsage || mongoose.model('GuestUsage', guestUsageSchema)
