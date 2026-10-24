// Small helpers shared by the attendance and marks pages.
export const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
export const pct = (v) => (v == null ? '-' : `${v}%`)
export const errorText = (e) => (e.details && typeof e.details === 'object' && Object.values(e.details).flat()[0]) || e.message
export const fmtSize = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
export const fmtDue = (iso) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
// <input type="datetime-local"> value for N days from now, and back to an ISO string for the API.
export const inDays = (n) => { const d = new Date(Date.now() + n * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
export const toIso = (local) => new Date(local).toISOString()
export const ACTION_LABEL = { mentor_call: 'Mentor call', reminder: 'Reminder', counselling_referral: 'Counselling referral', note: 'Note' }
export const STATUS_LABEL = { sent: 'Sent', responded: 'Student responded', closed: 'Closed' }
export const ago = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}
export const TICKET_STATUS = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' }
export const TICKET_TONE = { open: 'amber', in_progress: 'primary', resolved: 'green' }
export const PRIORITY_TONE = { high: 'red', medium: 'amber', low: 'gray' }
export const SESSION_TONE = { requested: 'amber', confirmed: 'green', completed: 'primary', cancelled: 'gray' }
export const fmtSlot = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const PROJECT_STATUS = { idea: 'Idea', changes_requested: 'Changes requested', in_progress: 'In progress', completed: 'Completed' }
export const PROJECT_TONE = { idea: 'gray', changes_requested: 'amber', in_progress: 'primary', completed: 'green' }
