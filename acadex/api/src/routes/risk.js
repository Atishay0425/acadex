import { Router } from 'express'
import { z } from 'zod'
import { HttpError, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { loadCourse, assertManage } from '../courseAccess.js'
import { riskFor } from '../riskData.js'

const id = z.coerce.number().int().positive()
const ACTIONS = ['mentor_call', 'reminder', 'counselling_referral', 'note']
const createBody = z.object({ studentId: z.number().int().positive(), courseId: z.number().int().positive(), action: z.enum(ACTIONS), note: z.string().trim().max(1000).default('') })
const patchBody = z.object({ status: z.enum(['sent', 'responded', 'closed']), outcome: z.string().trim().max(500) }).partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update')

const shapeIv = (i) => ({ id: i.id, studentId: i.student_id, studentName: i.student_name, courseId: i.course_id, courseCode: i.code, action: i.action, note: i.note, status: i.status, outcome: i.outcome, riskScore: i.risk_score, by: i.by_name, createdAt: i.created_at })
const IV_SELECT = 'SELECT i.*, s.name AS student_name, c.code, b.name AS by_name FROM interventions i JOIN users s ON s.id = i.student_id LEFT JOIN courses c ON c.id = i.course_id LEFT JOIN users b ON b.id = i.created_by'

// A derived "alert" list for the student: each is a concrete, fixable reason, worst first.
const alertsFrom = (courses) => courses.flatMap((c) => c.drivers.map((d) => ({ level: d.points >= 20 ? 'high' : 'medium', title: `${c.code}: ${d.label.toLowerCase()}`, detail: d.detail, points: d.points }))).sort((a, b) => b.points - a.points)

export function riskRouter({ pool }) {
  const r = Router()

  r.get('/me', requireRole('student'), wrap(async (req, res) => {
    const [me] = await riskFor(pool, { studentId: req.user.id })
    const ivs = (await pool.query(`${IV_SELECT} WHERE i.student_id = $1 ORDER BY i.created_at DESC, i.id DESC`, [req.user.id])).rows
    res.json({ score: me?.score ?? 0, level: me?.level ?? 'low', drivers: me?.drivers ?? [], signals: me?.signals ?? null, courses: me?.courses ?? [], alerts: alertsFrom(me?.courses ?? []), interventions: ivs.map(shapeIv) })
  }))

  // Students of one course ranked by risk, with their latest intervention.
  r.get('/courses/:courseId', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await loadCourse(pool, id.parse(req.params.courseId)); assertManage(req.user, c)
    const rows = await riskFor(pool, { courseId: c.id })
    const ivs = (await pool.query(`${IV_SELECT} WHERE i.course_id = $1 ORDER BY i.created_at DESC, i.id DESC`, [c.id])).rows.map(shapeIv)
    res.json(rows.map((s) => ({ studentId: s.studentId, name: s.name, email: s.email, score: s.score, level: s.level, drivers: s.drivers, signals: s.signals, latestIntervention: ivs.find((i) => i.studentId === s.studentId) ?? null })).sort((a, b) => b.score - a.score))
  }))

  r.get('/overview', requireRole('admin'), wrap(async (_req, res) => {
    const students = (await riskFor(pool)).sort((a, b) => b.score - a.score)
    const ivs = (await pool.query(`${IV_SELECT} ORDER BY i.created_at DESC, i.id DESC`)).rows.map(shapeIv)
    const dist = { low: 0, medium: 0, high: 0 }
    for (const s of students) dist[s.level]++
    const flagged = students.filter((s) => s.level !== 'low')
    const helped = new Set(ivs.map((i) => i.studentId))
    res.json({
      distribution: dist, total: students.length,
      interventions: { total: ivs.length, open: ivs.filter((i) => i.status === 'sent').length, responded: ivs.filter((i) => i.status !== 'sent').length },
      flaggedWithoutAction: flagged.filter((s) => !helped.has(s.studentId)).length,
      students: students.slice(0, 50).map((s) => ({ studentId: s.studentId, name: s.name, score: s.score, level: s.level, drivers: s.drivers.slice(0, 2), latestIntervention: ivs.find((i) => i.studentId === s.studentId) ?? null })),
    })
  }))

  // A student's interventions in one course (teacher of that course or admin).
  r.get('/interventions', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const q = z.object({ courseId: z.coerce.number().int().min(0), studentId: z.coerce.number().int().positive().optional() }).parse(req.query)
    if (!q.courseId) return res.json([])
    const c = await loadCourse(pool, q.courseId); assertManage(req.user, c)
    const rows = (await pool.query(`${IV_SELECT} WHERE i.course_id = $1 ${q.studentId ? 'AND i.student_id = $2' : ''} ORDER BY i.created_at DESC, i.id DESC`, q.studentId ? [c.id, q.studentId] : [c.id])).rows
    res.json(rows.map(shapeIv))
  }))

  r.post('/interventions', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const b = createBody.parse(req.body)
    const c = await loadCourse(pool, b.courseId); assertManage(req.user, c)
    if (!(await pool.query('SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2', [c.id, b.studentId])).rows.length) throw new HttpError(400, 'That student is not enrolled in this course')
    const [risk] = await riskFor(pool, { studentId: b.studentId })
    const row = (await pool.query('INSERT INTO interventions (student_id, course_id, action, note, risk_score, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [b.studentId, c.id, b.action, b.note, risk?.score ?? null, req.user.id])).rows[0]
    res.status(201).json(shapeIv((await pool.query(`${IV_SELECT} WHERE i.id = $1`, [row.id])).rows[0]))
  }))

  r.patch('/interventions/:ivId', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const iv = (await pool.query('SELECT * FROM interventions WHERE id = $1', [id.parse(req.params.ivId)])).rows[0]
    if (!iv) throw notFound('Intervention not found')
    if (req.user.role !== 'admin') assertManage(req.user, await loadCourse(pool, iv.course_id ?? 0).catch(() => ({ teacher_id: null })))
    const b = patchBody.parse(req.body)
    await pool.query('UPDATE interventions SET status = $2, outcome = $3 WHERE id = $1', [iv.id, b.status ?? iv.status, b.outcome ?? iv.outcome])
    res.json(shapeIv((await pool.query(`${IV_SELECT} WHERE i.id = $1`, [iv.id])).rows[0]))
  }))

  return r
}
