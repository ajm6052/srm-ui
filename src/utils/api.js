// Base URL of the Go REST API. Configured per environment via VITE_API_BASE_URL
// (see .env.example); falls back to the local server's default port.
import { i18n } from '@i18n'

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:2020'

// Where the access token lives. The auth store owns writing it; the request
// helper reads it here rather than importing the store, which would create a
// cycle (the store imports this module).
export const TOKEN_KEY = 'srm.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // localStorage unavailable (private mode) — token simply won't persist.
  }
}

// ApiError carries the HTTP status alongside a human-readable message so callers
// (and the router's 401 handling) can branch on `status` without re-parsing.
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Core request helper. Attaches the bearer token when present, JSON-encodes the
// body, and turns non-2xx responses into a typed ApiError. The backend answers
// errors as `{ "message": "..." }` (Echo's HTTPError shape); we surface that text.
async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(BASE_URL + path)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      // Skip empty params so `?status=` is omitted rather than sent blank.
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }

  const headers = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // Connection refused / DNS / CORS — no HTTP status to read.
    throw new ApiError(i18n.global.t('toast.networkError'), 0)
  }

  if (response.status === 204) return null

  let payload = null
  const text = await response.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    const message =
      (payload && (payload.message || payload.error)) ||
      `Request failed (${response.status})`
    throw new ApiError(message, response.status)
  }

  return payload
}

// Thin verb helpers so call sites read like the resource ("api.get('/api/jobs')").
export const api = {
  get: (path, params) => request(path, { method: 'GET', params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
}

// Open a Server-Sent Events stream with auth and reconnection. EventSource can't
// send an Authorization header (and we won't put the token in the URL), so this
// reads the stream via fetch + ReadableStream and parses SSE frames itself.
// `onMessage` receives { event, data } per frame (data JSON-parsed when possible);
// heartbeat comments are ignored. Reconnects with exponential backoff until the
// returned stop() is called. Safe to call in a non-browser context (no-op).
export function streamSSE(path, { onMessage } = {}) {
  if (typeof fetch === 'undefined' || typeof AbortController === 'undefined') {
    return () => {}
  }
  let stopped = false
  let controller = null
  let backoff = 1000

  function parseFrame(raw) {
    let event = 'message'
    const dataLines = []
    for (const line of raw.split('\n')) {
      if (line.startsWith(':')) continue // comment / heartbeat
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    }
    if (!dataLines.length) return
    let data = dataLines.join('\n')
    try {
      data = JSON.parse(data)
    } catch {
      // leave as string
    }
    onMessage?.({ event, data })
  }

  async function run() {
    while (!stopped) {
      controller = new AbortController()
      try {
        const headers = { Accept: 'text/event-stream' }
        const token = getToken()
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch(BASE_URL + path, { headers, signal: controller.signal })
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
        backoff = 1000 // healthy connection resets the backoff
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!stopped) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let sep
          // Frames are separated by a blank line; tolerate \r\n too.
          while ((sep = buffer.search(/\r?\n\r?\n/)) >= 0) {
            const end = sep + (buffer[sep] === '\r' ? 4 : 2)
            parseFrame(buffer.slice(0, sep))
            buffer = buffer.slice(end)
          }
        }
      } catch {
        // network drop / abort — retry after backoff unless stopped
      }
      if (stopped) break
      await new Promise((r) => setTimeout(r, backoff))
      backoff = Math.min(backoff * 2, 30000)
    }
  }

  run()
  return function stop() {
    stopped = true
    if (controller) controller.abort()
  }
}

// Fetch a file endpoint with auth and hand the browser a download. Used for
// non-JSON responses (CSV export) where `request` would mis-handle the body.
// The caller supplies the saved filename; errors surface as a typed ApiError so
// call sites report them the same way as any other request.
export async function download(path, filename, { params } = {}) {
  const url = new URL(BASE_URL + path)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
  }

  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(url.toString(), { method: 'GET', headers })
  } catch {
    throw new ApiError(i18n.global.t('toast.networkError'), 0)
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const payload = JSON.parse(await response.text())
      message = payload.message || payload.error || message
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(message, response.status)
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the click's navigation has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
