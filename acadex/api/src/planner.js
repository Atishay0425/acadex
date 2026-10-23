// Study schedule engine. Dates are 'YYYY-MM-DD' strings so no time zone can shift a day.

export const MAX_PER_DAY = 3 // beyond this many new topics a day, an exam is flagged as at risk

const toDay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const addDays = (s, n) => new Date(toDay(s) + n * 86400000).toISOString().slice(0, 10)
export const daysBetween = (from, to) => Math.round((toDay(to) - toDay(from)) / 86400000)

// Spreads each exam's unfinished topics evenly over the days before its date (all on today when the exam is
// today or past). exams: [{ id, subject, date, topics: [{ id, title, done }] }].
export function buildSchedule(exams, today, horizon = 7) {
  const byDate = new Map()
  const summary = []
  for (const e of [...exams].sort((a, b) => a.date.localeCompare(b.date))) {
    const remaining = e.topics.filter((t) => !t.done)
    const daysLeft = daysBetween(today, e.date)
    const window = Math.max(1, daysLeft) // study days available: today up to the day before the exam
    const perDay = remaining.length ? Math.ceil(remaining.length / window) : 0
    summary.push({ examId: e.id, remaining: remaining.length, daysLeft, perDay, atRisk: remaining.length > 0 && (daysLeft <= 0 || perDay > MAX_PER_DAY) })
    remaining.forEach((t, i) => {
      const date = addDays(today, Math.floor((i * window) / remaining.length))
      if (!byDate.has(date)) byDate.set(date, [])
      byDate.get(date).push({ examId: e.id, subject: e.subject, topicId: t.id, title: t.title })
    })
  }
  const days = []
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i)
    days.push({ date, items: byDate.get(date) ?? [] })
  }
  return { days, exams: summary }
}
