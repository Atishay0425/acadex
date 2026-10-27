import { Router } from 'express'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { dateStr } from '../db/pool.js'
import { attendanceStats, marksStats, assignmentStats, classesNeeded, isWeak } from '../stats.js'

// GET /me/performance: the signed-in student's attendance and marks across every enrolled course.
export function performanceRouter({ pool }) {
  const r = Router()
  // GET /me/trend: attendance as it built up over time (running % after each class date, per course and overall)
  // and every graded assessment as a % in date order. Drives the graphs on the Performance Analyzer.
  r.get('/trend', requireRole('student'), wrap(async (req, res) => {
    const me = req.user.id
    const rows = (await pool.query('SELECT s.course_id, c.code, s.session_date, s.id AS sid, r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id JOIN courses c ON c.id = s.course_id WHERE r.student_id = $1 ORDER BY s.session_date, s.id', [me])).rows
    const codes = [...new Set(rows.map((x) => x.code))].sort()
    const per = new Map(), all = []
    const points = []
    for (const x of rows) {
      if (!per.has(x.code)) per.set(x.code, [])
      per.get(x.code).push(x.status); all.push(x.status)
      const date = dateStr(x.session_date)
      const point = { date, overall: attendanceStats(all).pct }
      for (const c of codes) point[c] = per.has(c) ? attendanceStats(per.get(c)).pct : null
      if (points.length && points[points.length - 1].date === date) points[points.length - 1] = point // one point per day: the state after that day's classes
      else points.push(point)
    }
    const marks = (await pool.query('SELECT a.title, c.code, a.held_on, a.created_at, m.score, a.max_marks FROM marks m JOIN assessments a ON a.id = m.assessment_id JOIN courses c ON c.id = a.course_id WHERE m.student_id = $1 ORDER BY a.id', [me])).rows
    res.json({
      courses: codes, attendance: points,
      marks: marks.map((m) => ({ date: dateStr(m.held_on ?? m.created_at).slice(0, 10), title: m.title, code: m.code, pct: Math.round((Number(m.score) / Number(m.max_marks)) * 1000) / 10 })).sort((a, b) => a.date.localeCompare(b.date)),
    })
  }))

  r.get('/performance', requireRole('student'), wrap(async (req, res) => {
    const me = req.user.id
    const courses = (await pool.query('SELECT c.id, c.code, c.title, t.name AS teacher_name FROM enrollments e JOIN courses c ON c.id = e.course_id LEFT JOIN users t ON t.id = c.teacher_id WHERE e.student_id = $1 ORDER BY c.code', [me])).rows
    const att = (await pool.query('SELECT s.course_id, r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id WHERE r.student_id = $1', [me])).rows
    const mk = (await pool.query('SELECT a.course_id, m.score, a.max_marks FROM marks m JOIN assessments a ON a.id = m.assessment_id WHERE m.student_id = $1', [me])).rows
    const asg = (await pool.query('SELECT a.course_id, a.due_at, s.id AS sid FROM assignments a JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = $1 LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = $1', [me])).rows
    res.json(courses.map((c) => {
      const a = attendanceStats(att.filter((x) => x.course_id === c.id).map((x) => x.status))
      const m = marksStats(mk.filter((x) => x.course_id === c.id).map((x) => ({ score: x.score, max: x.max_marks })))
      const g = assignmentStats(asg.filter((x) => x.course_id === c.id).map((x) => ({ due_at: x.due_at, submitted: x.sid != null })))
      return {
        course: { id: c.id, code: c.code, title: c.title, teacher: c.teacher_name },
        attendancePct: a.pct, marksPct: m.pct, classesNeededFor75: classesNeeded(a), weak: isWeak(a.pct, m.pct),
        assignmentsPct: g.pct, assignmentsSubmitted: g.submitted, assignmentsExpected: g.expected, assignmentsMissing: g.missing,
      }
    }))
  }))
  return r
}
