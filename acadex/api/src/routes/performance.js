import { Router } from 'express'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { attendanceStats, marksStats, classesNeeded, isWeak } from '../stats.js'

// GET /me/performance: the signed-in student's attendance and marks across every enrolled course.
export function performanceRouter({ pool }) {
  const r = Router()
  r.get('/performance', requireRole('student'), wrap(async (req, res) => {
    const me = req.user.id
    const courses = (await pool.query('SELECT c.id, c.code, c.title, t.name AS teacher_name FROM enrollments e JOIN courses c ON c.id = e.course_id LEFT JOIN users t ON t.id = c.teacher_id WHERE e.student_id = $1 ORDER BY c.code', [me])).rows
    const att = (await pool.query('SELECT s.course_id, r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id WHERE r.student_id = $1', [me])).rows
    const mk = (await pool.query('SELECT a.course_id, m.score, a.max_marks FROM marks m JOIN assessments a ON a.id = m.assessment_id WHERE m.student_id = $1', [me])).rows
    res.json(courses.map((c) => {
      const a = attendanceStats(att.filter((x) => x.course_id === c.id).map((x) => x.status))
      const m = marksStats(mk.filter((x) => x.course_id === c.id).map((x) => ({ score: x.score, max: x.max_marks })))
      return {
        course: { id: c.id, code: c.code, title: c.title, teacher: c.teacher_name },
        attendancePct: a.pct, marksPct: m.pct, classesNeededFor75: classesNeeded(a), weak: isWeak(a.pct, m.pct),
      }
    }))
  }))
  return r
}
