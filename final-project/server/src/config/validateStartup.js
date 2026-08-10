// Startup guards for production. These run only when NODE_ENV=production so that
// development/test can keep running statelessly with defaults. They fail loudly
// rather than silently degrading (e.g. disabling the guest limit or history).

const DEFAULT_SECRET = 'dev-insecure-secret-change-me'
const MIN_SECRET_LENGTH = 32

// Obvious placeholders that must never be accepted as a real production secret.
const PLACEHOLDER_SECRETS = new Set([
  '',
  DEFAULT_SECRET,
  'changeme',
  'change-me',
  'secret',
  'jwt-secret',
  'your-secret',
  'placeholder',
])

export const isWeakJwtSecret = (secret) => {
  const value = String(secret || '')
  if (PLACEHOLDER_SECRETS.has(value.toLowerCase())) return true
  if (value.length < MIN_SECRET_LENGTH) return true
  return false
}

// Throws an Error describing every startup misconfiguration found (so operators
// see all problems at once). No secret material is ever included in the message.
export const validateStartupConfig = ({ config, nodeEnv }) => {
  if (nodeEnv !== 'production') return

  const problems = []

  if (!config.mongodbUri) {
    problems.push(
      'MONGODB_URI is required in production (auth, history, and the guest limit depend on it).',
    )
  }

  if (isWeakJwtSecret(config.jwtSecret)) {
    problems.push(
      `JWT_SECRET is missing, a known placeholder, or too short (min ${MIN_SECRET_LENGTH} chars) — set a strong, random secret.`,
    )
  }

  if (problems.length > 0) {
    throw new Error(`Invalid production configuration:\n- ${problems.join('\n- ')}`)
  }
}
