import { z } from 'zod'

// Minimum password length is configurable; the schema factory bakes the
// configured value in so validation and config never drift.
export const createAuthSchemas = (config) => {
  const minPasswordLength = config.minPasswordLength

  const signupSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
    email: z.string().trim().toLowerCase().email('A valid email is required'),
    password: z
      .string()
      .min(minPasswordLength, `Password must be at least ${minPasswordLength} characters`)
      .max(200, 'Password is too long'),
  })

  const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email('A valid email is required'),
    password: z.string().min(1, 'Password is required').max(200, 'Password is too long'),
  })

  return { signupSchema, loginSchema }
}
