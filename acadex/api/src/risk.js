// Early-warning score. A transparent rule-based baseline built from the signals Acadex already holds, so every
// point of risk can be explained to the student. The deck's trained model is a separate offline pipeline and
// is not wired in here. Weights add up to 100.
import { ATTENDANCE_TARGET, MARKS_WEAK_BELOW, attendanceStats, marksStats, assignmentStats } from './stats.js'

export const WEIGHTS = { attendance: 35, marks: 30, assignments: 20, trend: 15 }
export const LEVELS = { high: 60, medium: 30 }
// What admins can tune from the Alert rules page. The weights above stay fixed so scores remain comparable.
export const DEFAULT_RULES = { attendanceTarget: ATTENDANCE_TARGET, marksFloor: MARKS_WEAK_BELOW, missingFull: 3, dropFull: 30, high: LEVELS.high, medium: LEVELS.medium }
export const RULE_LIMITS = { attendanceTarget: [50, 95], marksFloor: [30, 80], missingFull: [1, 6], dropFull: [10, 60], high: [40, 90], medium: [10, 60] }
const clamp = (x) => Math.min(1, Math.max(0, x))
const round1 = (n) => Math.round(n * 10) / 10

export const levelOf = (score, rules = DEFAULT_RULES) => (score >= rules.high ? 'high' : score >= rules.medium ? 'medium' : 'low')

// attendance: statuses[]; marks: [{ score, max }] in the order they were held; assignments: [{ due_at, submitted }].
export function assess({ statuses = [], marks = [], assignments = [] }, now = new Date(), rules = DEFAULT_RULES) {
  const att = attendanceStats(statuses)
  const mk = marksStats(marks)
  const asg = assignmentStats(assignments, now)
  const drivers = []
  const add = (key, points, label, detail) => { if (points > 0) drivers.push({ key, label, points: Math.round(points), detail }) }

  // Full points at 40 points below the target, so 75% costs nothing and 35% costs everything.
  if (att.pct != null) add('attendance', clamp((rules.attendanceTarget - att.pct) / 40) * WEIGHTS.attendance, 'Low attendance', `Attendance is ${att.pct}%, below the ${rules.attendanceTarget}% minimum`)
  if (mk.pct != null) add('marks', clamp((rules.marksFloor - mk.pct) / 40) * WEIGHTS.marks, 'Low marks', `Marks are ${mk.pct}%, below ${rules.marksFloor}%`)
  if (asg.missing > 0) add('assignments', clamp(asg.missing / rules.missingFull) * WEIGHTS.assignments, 'Missing assignments', `${asg.missing} assignment${asg.missing > 1 ? 's are' : ' is'} overdue`)
  if (marks.length >= 2) {
    const pcts = marks.map((m) => (Number(m.score) / Number(m.max)) * 100)
    const last = pcts[pcts.length - 1]
    const earlier = pcts.slice(0, -1).reduce((a, b) => a + b, 0) / (pcts.length - 1)
    if (earlier - last > 0) add('trend', clamp((earlier - last - 5) / (rules.dropFull - 5)) * WEIGHTS.trend, 'Marks falling', `Latest score is ${round1(earlier - last)} points below the earlier average`)
  }
  drivers.sort((a, b) => b.points - a.points)
  const score = Math.min(100, drivers.reduce((a, d) => a + d.points, 0))
  return { score, level: levelOf(score, rules), drivers, signals: { attendancePct: att.pct, marksPct: mk.pct, assignmentsPct: asg.pct, assignmentsMissing: asg.missing } }
}
