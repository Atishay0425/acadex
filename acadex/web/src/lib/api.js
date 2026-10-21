// API client for the Acadex community service (Django REST, see /acadex-backend).
// Tokens live in localStorage for this demo. In production use httpOnly cookies set by the backend.
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

export const tokens = {
  get access() { try { return localStorage.getItem('acadex_access') } catch { return null } },
  get refresh() { try { return localStorage.getItem('acadex_refresh') } catch { return null } },
  set(a, r) { localStorage.setItem('acadex_access', a); if (r) localStorage.setItem('acadex_refresh', r) },
  clear() { localStorage.removeItem('acadex_access'); localStorage.removeItem('acadex_refresh') },
}

async function refresh() {
  if (!tokens.refresh) return false
  const res = await fetch(`${BASE}/auth/token/refresh/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: tokens.refresh }) })
  if (!res.ok) { tokens.clear(); return false }
  const d = await res.json(); tokens.set(d.access, d.refresh); return true
}

export async function api(path, { method = 'GET', body, retry = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (res.status === 401 && retry && await refresh()) return api(path, { method, body, retry: false })
  if (!res.ok) { const err = new Error(`API ${res.status}`); err.status = res.status; err.data = await res.json().catch(() => ({})); throw err }
  return res.status === 204 ? null : res.json()
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/auth/token/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
  if (!res.ok) throw new Error('login failed')
  const d = await res.json(); tokens.set(d.access, d.refresh); return d
}
