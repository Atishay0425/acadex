// Small helpers shared by the attendance and marks pages.
export const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
export const pct = (v) => (v == null ? '-' : `${v}%`)
export const errorText = (e) => (e.details && typeof e.details === 'object' && Object.values(e.details).flat()[0]) || e.message
