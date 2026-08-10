import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User } from '../models/User.js'
import { AppError, ERROR_CODES } from '../errors/AppError.js'

// A valid bcrypt hash of a random string. Compared against when the email is
// unknown so login timing does not reveal whether an account exists.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO3f9m8c8G0kQY9dR8m9m0m0m0m0m0m0a'

export const createAuthService = (config) => {
  const signToken = (user) =>
    jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    })

  const verifyToken = (token) => {
    try {
      return jwt.verify(token, config.jwtSecret)
    } catch {
      throw new AppError(ERROR_CODES.INVALID_TOKEN, 'Session expired. Please sign in again.')
    }
  }

  const signup = async ({ name, email, password }) => {
    const normalizedEmail = String(email).toLowerCase().trim()
    const existing = await User.findOne({ email: normalizedEmail }).lean()
    if (existing) {
      throw new AppError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 'An account with this email already exists.')
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds)
    let user
    try {
      user = await User.create({
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash,
        lastLoginAt: new Date(),
      })
    } catch (error) {
      // Lost a race against a concurrent signup with the same email.
      if (error.code === 11000) {
        throw new AppError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 'That account could not be created.')
      }
      throw error
    }

    return { user: user.toSafeObject(), token: signToken(user), userDoc: user }
  }

  const login = async ({ email, password }) => {
    const normalizedEmail = String(email).toLowerCase().trim()
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash')

    if (!user) {
      // Spend comparable time to a real compare, then fail generically.
      await bcrypt.compare(String(password), DUMMY_HASH)
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password.')
    }

    const ok = await bcrypt.compare(String(password), user.passwordHash)
    if (!ok) {
      throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password.')
    }

    user.lastLoginAt = new Date()
    await user.save()
    return { user: user.toSafeObject(), token: signToken(user), userDoc: user }
  }

  const getSafeUserById = async (id) => {
    let user
    try {
      user = await User.findById(id)
    } catch {
      throw new AppError(ERROR_CODES.INVALID_TOKEN, 'Session expired. Please sign in again.')
    }
    if (!user) {
      throw new AppError(ERROR_CODES.INVALID_TOKEN, 'Session expired. Please sign in again.')
    }
    return user.toSafeObject()
  }

  return { signToken, verifyToken, signup, login, getSafeUserById }
}
