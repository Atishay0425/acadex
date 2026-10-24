// Client for the Acadex Express API (see /acadex/api). Tokens live in localStorage for this prototype;
// production should move them to httpOnly cookies set by the API.
import { useCallback, useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_ACADEX_API_URL || 'http://localhost:4000/api/v1'
const KEY = 'acadex_session'

export const session = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } },
  set(s) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked */ } },
  clear() { try { localStorage.removeItem(KEY) } catch { /* storage blocked */ } },
}

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details }
}

async function raw(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.details)
  return data
}

export async function login(email, password) {
  const d = await raw('/auth/login', { method: 'POST', body: { email, password } })
  session.set(d)
  return d.user
}

export async function logout() {
  const s = session.get()
  session.clear()
  if (s?.refreshToken) await raw('/auth/logout', { method: 'POST', body: { refreshToken: s.refreshToken } }).catch(() => {})
}

async function refresh() {
  const s = session.get()
  if (!s?.refreshToken) return null
  try { const d = await raw('/auth/refresh', { method: 'POST', body: { refreshToken: s.refreshToken } }); session.set(d); return d.accessToken } catch { session.clear(); return null }
}

export async function api(path, opts = {}) {
  const s = session.get()
  if (!s) throw new ApiError(401, 'Not signed in')
  try {
    return await raw(path, { ...opts, token: s.accessToken })
  } catch (e) {
    if (e.status !== 401) throw e
    const token = await refresh()
    if (!token) throw e
    return raw(path, { ...opts, token })
  }
}

// Sends a file as the raw request body (used for photos of questions) and returns the JSON reply.
export async function upload(path, file) {
  const s = session.get()
  if (!s) throw new ApiError(401, 'Not signed in')
  const send = (token) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': file.type, Authorization: `Bearer ${token}` }, body: file })
  let res = await send(s.accessToken)
  if (res.status === 401) { const token = await refresh(); if (token) res = await send(token) }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.details)
  return data
}

// Uploads a file (raw bytes, name in a header) and returns { id, name, mime, size } to attach to something.
export async function uploadFile(file) {
  const s = session.get()
  if (!s) throw new ApiError(401, 'Not signed in')
  const send = (token) => fetch(`${BASE}/files`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name), Authorization: `Bearer ${token}` }, body: file })
  let res = await send(s.accessToken)
  if (res.status === 401) { const token = await refresh(); if (token) res = await send(token) }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || `Upload failed (${res.status})`, data.details)
  return data
}

// Downloads an attached file through the signed-in session and saves it under its own name.
export async function downloadFile(id, name) {
  const s = session.get()
  if (!s) throw new ApiError(401, 'Not signed in')
  const get = (token) => fetch(`${BASE}/files/${id}`, { headers: { Authorization: `Bearer ${token}` } })
  let res = await get(s.accessToken)
  if (res.status === 401) { const token = await refresh(); if (token) res = await get(token) }
  if (!res.ok) throw new ApiError(res.status, 'Could not download that file')
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// Fetches an attached PDF, image or text file for showing in the page. Returns { url } (an object URL the caller
// must revoke) or { text } for text files.
export async function previewFile(id) {
  const s = session.get()
  if (!s) throw new ApiError(401, 'Not signed in')
  const get = (token) => fetch(`${BASE}/files/${id}?inline=1`, { headers: { Authorization: `Bearer ${token}` } })
  let res = await get(s.accessToken)
  if (res.status === 401) { const token = await refresh(); if (token) res = await get(token) }
  if (!res.ok) throw new ApiError(res.status, 'Could not open that file')
  if ((res.headers.get('content-type') || '').startsWith('text/')) return { text: await res.text() }
  return { url: URL.createObjectURL(await res.blob()) }
}

// Loads from the API. `offline` is true when there is no real session or the API is unreachable,
// so views can show mock data with the "Demo data" badge. Real API errors (403, 500) surface in `error`.
export function useRemote(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, offline: false, error: null })
  const load = useCallback(async () => {
    if (!path) return setState({ data: null, loading: false, offline: false, error: null }) // nothing to fetch
    if (!session.get()) return setState({ data: null, loading: false, offline: true, error: null })
    try { setState({ data: await api(path), loading: false, offline: false, error: null }) } catch (e) {
      setState({ data: null, loading: false, offline: !(e instanceof ApiError), error: e instanceof ApiError ? e.message : null })
    }
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load }
}

// The signed-in user, available after mount. Server rendering and the first client render both see null,
// so what is drawn matches and React does not warn about a hydration mismatch.
export function useSessionUser() {
  const [user, setUser] = useState(null)
  useEffect(() => { setUser(session.get()?.user ?? null) }, [])
  return user
}
