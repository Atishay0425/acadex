// The only place attendance and marks percentages are defined. Routes and tests use these.

export const ATTENDANCE_TARGET = 75
export const MARKS_WEAK_BELOW = 60

const round1 = (n) => Math.round(n * 10) / 10

// present + late count as attended, absent counts against, excused is ignored. No countable sessions -> null.
export function attendanceStats(statuses) {
  const attended = statuses.filter((s) => s === 'present' || s === 'late').length
  const total = attended + statuses.filter((s) => s === 'absent').length
  return { attended, total, pct: total ? round1((attended / total) * 100) : null }
}

// Sum of scores over sum of max marks, only for assessments the student has a mark for. Nothing graded -> null.
export function marksStats(entries) {
  const score = entries.reduce((a, e) => a + Number(e.score), 0)
  const max = entries.reduce((a, e) => a + Number(e.max), 0)
  return { score, max, pct: max ? round1((score / max) * 100) : null }
}

// How many consecutive classes must be attended to reach the target (0 when already there).
export function classesNeeded({ attended, total }, target = ATTENDANCE_TARGET) {
  if (!total || attended / total >= target / 100) return 0
  return Math.ceil((target * total - 100 * attended) / (100 - target))
}

export const isWeak = (attendancePct, marksPct) =>
  (attendancePct != null && attendancePct < ATTENDANCE_TARGET) || (marksPct != null && marksPct < MARKS_WEAK_BELOW)

// Assignments a student is expected to have handed in: past their due date, or already submitted.
// rows: [{ due_at, submitted }]. Nothing expected yet -> pct null.
export function assignmentStats(rows, now = new Date()) {
  const expected = rows.filter((r) => r.submitted || new Date(r.due_at) <= now)
  const submitted = expected.filter((r) => r.submitted).length
  return { expected: expected.length, submitted, missing: expected.length - submitted, pct: expected.length ? round1((submitted / expected.length) * 100) : null }
}
