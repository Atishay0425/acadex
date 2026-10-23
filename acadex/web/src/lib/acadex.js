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
