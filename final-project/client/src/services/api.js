const base = import.meta.env.VITE_API_URL || '/api'

const TOKEN_KEY = 'authToken'
const GUEST_KEY = 'guestId'

// ---------------------------------------------------------------------------
// Credential storage (client-side). The access token is a JWT bearer token; the
// guestId is a stable anonymous UUID used to enforce the free-analysis limit
// server-side. Both live in localStorage so a separately-deployed frontend and
// backend need no cross-origin cookies.
// ---------------------------------------------------------------------------
const safeStorage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const randomUuid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getToken() {
  return safeStorage()?.getItem(TOKEN_KEY) || null
}

export function setToken(token) {
  const store = safeStorage()
  if (!store) return
  if (token) store.setItem(TOKEN_KEY, token)
  else store.removeItem(TOKEN_KEY)
}

export function clearToken() {
  setToken(null)
}

// Lazily create and persist a guest identity on first use.
export function getGuestId() {
  const store = safeStorage()
  if (!store) return randomUuid()
  let id = store.getItem(GUEST_KEY)
  if (!id) {
    id = randomUuid()
    store.setItem(GUEST_KEY, id)
  }
  return id
}

// ---------------------------------------------------------------------------
// Core request helper — attaches auth + guest headers, normalizes errors so
// callers can branch on `error.code` (e.g. SIGNUP_REQUIRED) rather than text.
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message, { code, status, fieldErrors } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) }

  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  headers['X-Guest-Id'] = getGuestId()

  if (options.body !== undefined && !(options.body instanceof FormData) && typeof options.body !== 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    options.body = JSON.stringify(options.body)
  }

  const response = await fetch(`${base}${path}`, { ...options, headers })
  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '')

  if (!response.ok) {
    let message = 'Request failed'
    let code
    let fieldErrors
    if (typeof body === 'string' && body.trim()) {
      message = body
    } else if (body && typeof body === 'object') {
      code = body.code
      fieldErrors = body.fieldErrors
      if (Array.isArray(body.validationErrors) && body.validationErrors.length > 0) {
        message = body.validationErrors.map((item) => `${item.field}: ${item.message}`).join(' • ')
      } else if (Array.isArray(body.issues) && body.issues.length > 0) {
        message = body.issues.map((item) => `${item.path?.join('.') || 'field'}: ${item.message}`).join(' • ')
      } else if (body.message) {
        message = body.message
      } else if (body.error) {
        message = body.error
      }
    }
    throw new ApiError(message, { code, status: response.status, fieldErrors })
  }

  return body
}

// ---------------------------------------------------------------------------
// Analyzer (unchanged behavior)
// ---------------------------------------------------------------------------
export function getHealth() {
  return request('/health')
}

export function parseResume(payload) {
  if (payload instanceof File) {
    const formData = new FormData()
    formData.append('resumeFile', payload)
    return request('/resume/parse', { method: 'POST', body: formData })
  }

  return request('/resume/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { resumeText: payload },
  })
}

export function validateAnalysisInput(payload) {
  return request('/analysis/validate-input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })
}

export function runAnalysis(payload) {
  return request('/analysis/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })
}

// ---------------------------------------------------------------------------
// Export — regenerate an enhanced DOCX from the DOCX-derived structure plus the
// accepted rewrites. Returns a Blob (the generated .docx) rather than JSON, so
// it bypasses the JSON-oriented `request()` helper but reuses the same
// auth/guest headers.
// ---------------------------------------------------------------------------
export async function exportResumeDocx({ candidateName, structure, replacements } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  headers['X-Guest-Id'] = getGuestId()

  const response = await fetch(`${base}/export/resume/docx`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ candidateName, structure, replacements }),
  })

  if (!response.ok) {
    // Error responses are JSON; surface a clean message.
    const body = await response.json().catch(() => ({}))
    const message = body.message || 'Unable to generate the enhanced DOCX.'
    throw new ApiError(message, { code: body.code, status: response.status })
  }

  return response.blob()
}

// ---------------------------------------------------------------------------
// Job Posting URL Import
// ---------------------------------------------------------------------------
export function extractJob(url) {
  return request('/jobs/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { url },
  })
}

// ---------------------------------------------------------------------------
// Interview Question Generation (on-demand)
// ---------------------------------------------------------------------------
export function generateInterviewQuestions(payload) {
  return request('/interview/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })
}

// ---------------------------------------------------------------------------
// Live Job Discovery — "Find jobs that fit my profile"
// ---------------------------------------------------------------------------
export function discoverJobs(payload) {
  return request('/jobs/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export function signup({ name, email, password }) {
  return request('/auth/signup', { method: 'POST', body: { name, email, password } })
}

export function login({ email, password }) {
  return request('/auth/login', { method: 'POST', body: { email, password } })
}

export function getMe() {
  return request('/auth/me')
}

export function logout() {
  return request('/auth/logout', { method: 'POST' }).catch(() => ({ success: true }))
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------
export function getHistory() {
  return request('/history')
}

export function getHistoryItem(id) {
  return request(`/history/${id}`)
}

export function deleteHistoryItem(id) {
  return request(`/history/${id}`, { method: 'DELETE' })
}
