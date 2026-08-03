const base = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) }

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
    if (typeof body === 'string' && body.trim()) {
      message = body
    } else if (body && typeof body === 'object') {
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
    throw new Error(message)
  }

  return body
}

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
