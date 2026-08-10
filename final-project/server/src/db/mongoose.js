import mongoose from 'mongoose'

// Fail fast instead of buffering DB ops for 10s when disconnected — the
// errorHandler then maps the resulting error to DATABASE_UNAVAILABLE.
mongoose.set('bufferTimeoutMS', 2000)

export const isDbConnected = () => mongoose.connection.readyState === 1

export const connectDb = async (uri) => {
  if (!uri) return null
  if (isDbConnected()) return mongoose.connection
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
  return mongoose.connection
}

export const disconnectDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
}
