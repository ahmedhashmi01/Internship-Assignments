import { ERROR_CODES, isAppError } from '../errors/AppError.js'

// Central error normalizer. AppErrors carry an application `code` + status;
// Mongoose/connection failures are mapped to DATABASE_UNAVAILABLE; everything
// else stays a generic 500 with a message (backward compatible with the
// previous handler, which returned `{ message }`).
export const errorHandler = (error, _req, res, _next) => {
  if (isAppError(error)) {
    return res.status(error.status).json({ code: error.code, message: error.message })
  }

  // Duplicate key (e.g. unique email/guestId) — surface as a conflict without
  // revealing which field, unless a caller already threw a specific AppError.
  if (error && error.code === 11000) {
    return res.status(409).json({ code: ERROR_CODES.EMAIL_ALREADY_EXISTS, message: 'That account could not be created.' })
  }

  // Mongoose is not connected / a DB operation timed out.
  const dbUnavailable =
    error &&
    (error.name === 'MongooseError' ||
      error.name === 'MongoNotConnectedError' ||
      error.name === 'MongoServerSelectionError' ||
      /buffering timed out|failed to connect|ECONNREFUSED/i.test(error.message || ''))
  if (dbUnavailable) {
    return res.status(503).json({ code: ERROR_CODES.DATABASE_UNAVAILABLE, message: 'Service temporarily unavailable.' })
  }

  console.error('Request processing failed')
  res.status(500).json({ code: ERROR_CODES.INTERNAL_ERROR, message: error.message || 'Unexpected error' })
}
