// Small helpers shared by the attendance and marks pages.
export const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
export const pct = (v) => (v == null ? '-' : `${v}%`)
export const errorText = (e) => (e.details && typeof e.details === 'object' && Object.values(e.details).flat()[0]) || e.message
export const fmtDue = (iso) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
// <input type="datetime-local"> value for N days from now, and back to an ISO string for the API.
export const inDays = (n) => { const d = new Date(Date.now() + n * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
export const toIso = (local) => new Date(local).toISOString()
