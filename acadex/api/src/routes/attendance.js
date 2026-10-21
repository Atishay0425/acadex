import { Router } from 'express'
import { z } from 'zod'
import { HttpError, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { loadCourse, assertManage, assertEnrolledStudent, assertAllEnrolled } from '../courseAccess.js'
import { withTx, dateStr } from '../db/pool.js'
import { attendanceStats, classesNeeded } from '../stats.js'

const id = z.coerce.number().int().positive()
const STATUSES = ['present', 'absent', 'late', 'excused']
const records = z.array(z.object({ studentId: z.number().int().positive(), status: z.enum(STATUSES) })).min(1)
  .refine((r) => new Set(r.map((x) => x.studentId)).size === r.length, 'Duplicate student in records')
const sessionBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  topic: z.string().trim().max(200).nullable().optional(),
  records,
})
const putBody = z.object({ topic: z.string().trim().max(200).nullable().optional(), records })

export function attendanceRouter({ pool }) {
  const r = Router({ mergeParams: true })
  const course = (req) => loadCourse(pool, id.parse(req.params.courseId))

  async function loadSession(c, sessionId) {
    const s = (await pool.query('SELECT * FROM attendance_sessions WHERE id = $1 AND course_id = $2', [sessionId, c.id])).rows[0]
    if (!s) throw notFound('Session not found')
    return s
  }
  const insertRecords = (client, sessionId, recs) =>
    Promise.all(recs.map((x) => client.query('INSERT INTO attendance_records (session_id, student_id, status) VALUES ($1, $2, $3)', [sessionId, x.studentId, x.status])))

  r.get('/', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const sessions = (await pool.query('SELECT * FROM attendance_sessions WHERE course_id = $1 ORDER BY session_date DESC', [c.id])).rows
    const recs = (await pool.query('SELECT r.session_id, r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id WHERE s.course_id = $1', [c.id])).rows
    res.json(sessions.map((s) => {
      const mine = recs.filter((x) => x.session_id === s.id)
      const count = (st) => mine.filter((x) => x.status === st).length
      return { id: s.id, date: dateStr(s.session_date), topic: s.topic, present: count('present'), late: count('late'), absent: count('absent'), excused: count('excused') }
    }))
  }))

  r.post('/', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const b = sessionBody.parse(req.body)
    await assertAllEnrolled(pool, c, b.records.map((x) => x.studentId))
    const dup = await pool.query('SELECT 1 FROM attendance_sessions WHERE course_id = $1 AND session_date = $2', [c.id, b.date])
    if (dup.rows.length) throw new HttpError(409, 'Attendance for this date is already recorded. Edit that session instead.')
    const sessionId = await withTx(pool, async (client) => {
      const s = (await client.query('INSERT INTO attendance_sessions (course_id, session_date, topic, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [c.id, b.date, b.topic ?? null, req.user.id])).rows[0]
      await insertRecords(client, s.id, b.records)
      return s.id
    })
    res.status(201).json({ id: sessionId, date: b.date })
  }))

  // Per-student attendance for every enrolled student.
  r.get('/summary', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const students = (await pool.query('SELECT u.id, u.name, u.email FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.course_id = $1 ORDER BY u.name', [c.id])).rows
    const recs = (await pool.query('SELECT r.student_id, r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id WHERE s.course_id = $1', [c.id])).rows
    res.json(students.map((s) => {
      const st = attendanceStats(recs.filter((x) => x.student_id === s.id).map((x) => x.status))
      return { studentId: s.id, name: s.name, email: s.email, attended: st.attended, total: st.total, pct: st.pct }
    }))
  }))

  // The signed-in student's own attendance in this course.
  r.get('/me', wrap(async (req, res) => {
    const c = await course(req); await assertEnrolledStudent(pool, req.user, c)
    const rows = (await pool.query(
      'SELECT s.id, s.session_date, s.topic, r.status FROM attendance_sessions s JOIN attendance_records r ON r.session_id = s.id WHERE s.course_id = $1 AND r.student_id = $2 ORDER BY s.session_date DESC', [c.id, req.user.id])).rows
    const st = attendanceStats(rows.map((x) => x.status))
    res.json({ ...st, classesNeededFor75: classesNeeded(st), sessions: rows.map((x) => ({ id: x.id, date: dateStr(x.session_date), topic: x.topic, status: x.status })) })
  }))

  r.get('/:sessionId', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const s = await loadSession(c, id.parse(req.params.sessionId))
    const recs = (await pool.query('SELECT r.student_id, u.name, r.status FROM attendance_records r JOIN users u ON u.id = r.student_id WHERE r.session_id = $1 ORDER BY u.name', [s.id])).rows
    res.json({ id: s.id, date: dateStr(s.session_date), topic: s.topic, records: recs.map((x) => ({ studentId: x.student_id, name: x.name, status: x.status })) })
  }))

  // Replaces the whole session's statuses (and optionally its topic).
  r.put('/:sessionId', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const s = await loadSession(c, id.parse(req.params.sessionId))
    const b = putBody.parse(req.body)
    await assertAllEnrolled(pool, c, b.records.map((x) => x.studentId))
    await withTx(pool, async (client) => {
      if ('topic' in b) await client.query('UPDATE attendance_sessions SET topic = $2 WHERE id = $1', [s.id, b.topic ?? null])
      await client.query('DELETE FROM attendance_records WHERE session_id = $1', [s.id])
      await insertRecords(client, s.id, b.records)
    })
    res.json({ id: s.id })
  }))

  r.delete('/:sessionId', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const s = await loadSession(c, id.parse(req.params.sessionId))
    await pool.query('DELETE FROM attendance_sessions WHERE id = $1', [s.id])
    res.status(204).end()
  }))

  return r
}
