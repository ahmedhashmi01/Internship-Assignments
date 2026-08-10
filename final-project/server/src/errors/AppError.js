// Normalized application error codes. The frontend acts on `code`, never on
// fragile message text. Keep messages generic — they must not leak whether an
// email exists, nor any backend/provider internals.
export const ERROR_CODES = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  SIGNUP_REQUIRED: 'SIGNUP_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  HISTORY_NOT_FOUND: 'HISTORY_NOT_FOUND',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
}

const DEFAULT_STATUS = {
  [ERROR_CODES.AUTH_REQUIRED]: 401,
  [ERROR_CODES.SIGNUP_REQUIRED]: 403,
  [ERROR_CODES.INVALID_CREDENTIALS]: 401,
  [ERROR_CODES.EMAIL_ALREADY_EXISTS]: 409,
  [ERROR_CODES.INVALID_TOKEN]: 401,
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.HISTORY_NOT_FOUND]: 404,
  [ERROR_CODES.DATABASE_UNAVAILABLE]: 503,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
}

export class AppError extends Error {
  constructor(code, message, status) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status || DEFAULT_STATUS[code] || 500
  }
}

export const isAppError = (error) => error instanceof AppError
