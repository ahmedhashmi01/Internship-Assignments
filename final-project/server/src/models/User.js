import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Never selected by default, so it cannot leak through a stray query or
    // serialization. Login explicitly re-selects it with .select('+passwordHash').
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user'], default: 'user' },
    lastLoginAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.passwordHash
        delete ret.__v
        return ret
      },
    },
  },
)

// Defensive: guarantee the hash never rides along in any serialized user,
// independent of which query selected it.
userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    lastLoginAt: this.lastLoginAt,
  }
}

export const User = mongoose.models.User || mongoose.model('User', userSchema)
