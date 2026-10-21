import { Router } from 'express'
import { z } from 'zod'
import { HttpError, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { loadCourse, assertManage, assertEnrolledStudent, assertAllEnrolled } from '../courseAccess.js'
import { withTx, dateStr } from '../db/pool.js'
import { marksStats } from '../stats.js'

const id = z.coerce.number().int().positive()
const KINDS = ['quiz', 'assignment', 'midterm', 'endterm', 'practical']
const assessmentBody = z.object({
  title: z.string().trim().min(2).max(150),
  kind: z.enum(KINDS),
  maxMarks: z.number().positive().max(1000),
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional(),
})
const marksBody = z.object({
  marks: z.array(z.object({ studentId: z.number().int().positive(), score: z.number().min(0).nullable() })).min(1)
    .refine((m) => new Set(m.map((x) => x.studentId)).size === m.length, 'Duplicate student in marks'),
})

const shape = (a, graded = 0) => ({ id: a.id, title: a.title, kind: a.kind, maxMarks: Number(a.max_marks), heldOn: a.held_on ? dateStr(a.held_on) : null, graded })

export function marksRouter({ pool }) {
  const r = Router({ mergeParams: true })
  const course = (req) => loadCourse(pool, id.parse(req.params.courseId))

  async function loadAssessment(c, aid) {
    const a = (await pool.query('SELECT * FROM assessments WHERE id = $1 AND course_id = $2', [aid, c.id])).rows[0]
    if (!a) throw notFound('Assessment not found')
    return a
  }

  r.get('/assessments', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const list = (await pool.query('SELECT * FROM assessments WHERE course_id = $1 ORDER BY id', [c.id])).rows
    const graded = (await pool.query('SELECT m.assessment_id FROM marks m JOIN assessments a ON a.id = m.assessment_id WHERE a.course_id = $1', [c.id])).rows
    res.json(list.map((a) => shape(a, graded.filter((g) => g.assessment_id === a.id).length)))
  }))

  r.post('/assessments', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const b = assessmentBody.parse(req.body)
    const a = (await pool.query('INSERT INTO assessments (course_id, title, kind, max_marks, held_on) VALUES ($1, $2, $3, $4, $5) RETURNING *', [c.id, b.title, b.kind, b.maxMarks, b.heldOn ?? null])).rows[0]
    res.status(201).json(shape(a))
  }))

  r.patch('/assessments/:aid', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const a = await loadAssessment(c, id.parse(req.params.aid))
    const b = assessmentBody.partial().refine((x) => Object.keys(x).length > 0, 'Nothing to update').parse(req.body)
    if (b.maxMarks != null) {
      const over = await pool.query('SELECT 1 FROM marks WHERE assessment_id = $1 AND score > $2', [a.id, b.maxMarks])
      if (over.rows.length) throw new HttpError(400, 'Some recorded scores are higher than the new maximum')
    }
    const cols = { title: 'title', kind: 'kind', maxMarks: 'max_marks', heldOn: 'held_on' }
    const keys = Object.keys(b)
    const { rows } = await pool.query(`UPDATE assessments SET ${keys.map((k, i) => `${cols[k]} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [a.id, ...keys.map((k) => b[k])])
    res.json(shape(rows[0]))
  }))

  r.delete('/assessments/:aid', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const a = await loadAssessment(c, id.parse(req.params.aid))
    await pool.query('DELETE FROM assessments WHERE id = $1', [a.id])
    res.status(204).end()
  }))

  // Every enrolled student with their score (null when not graded yet).
  r.get('/assessments/:aid/marks', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const a = await loadAssessment(c, id.parse(req.params.aid))
    const students = (await pool.query('SELECT u.id, u.name, u.email FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.course_id = $1 ORDER BY u.name', [c.id])).rows
    const scores = new Map((await pool.query('SELECT student_id, score FROM marks WHERE assessment_id = $1', [a.id])).rows.map((m) => [m.student_id, Number(m.score)]))
    res.json({ assessment: shape(a, scores.size), marks: students.map((s) => ({ studentId: s.id, name: s.name, email: s.email, score: scores.get(s.id) ?? null })) })
  }))

  // Bulk set: a number sets the score, null clears it. Students not listed are left alone.
  r.put('/assessments/:aid/marks', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const a = await loadAssessment(c, id.parse(req.params.aid))
    const { marks } = marksBody.parse(req.body)
    await assertAllEnrolled(pool, c, marks.map((m) => m.studentId))
    const tooHigh = marks.filter((m) => m.score != null && m.score > Number(a.max_marks))
    if (tooHigh.length) throw new HttpError(400, `Scores cannot exceed ${Number(a.max_marks)}`, { studentIds: tooHigh.map((m) => m.studentId) })
    await withTx(pool, async (client) => {
      for (const m of marks) {
        await client.query('DELETE FROM marks WHERE assessment_id = $1 AND student_id = $2', [a.id, m.studentId])
        if (m.score != null) await client.query('INSERT INTO marks (assessment_id, student_id, score) VALUES ($1, $2, $3)', [a.id, m.studentId, m.score])
      }
    })
    res.json({ updated: marks.length })
  }))

  r.get('/marks/summary', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const students = (await pool.query('SELECT u.id, u.name, u.email FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.course_id = $1 ORDER BY u.name', [c.id])).rows
    const rows = (await pool.query('SELECT m.student_id, m.score, a.max_marks FROM marks m JOIN assessments a ON a.id = m.assessment_id WHERE a.course_id = $1', [c.id])).rows
    res.json(students.map((s) => {
      const st = marksStats(rows.filter((x) => x.student_id === s.id).map((x) => ({ score: x.score, max: x.max_marks })))
      return { studentId: s.id, name: s.name, email: s.email, ...st }
    }))
  }))

  r.get('/marks/me', wrap(async (req, res) => {
    const c = await course(req); await assertEnrolledStudent(pool, req.user, c)
    const list = (await pool.query('SELECT * FROM assessments WHERE course_id = $1 ORDER BY id', [c.id])).rows
    const mine = new Map((await pool.query('SELECT m.assessment_id, m.score FROM marks m JOIN assessments a ON a.id = m.assessment_id WHERE a.course_id = $1 AND m.student_id = $2', [c.id, req.user.id])).rows.map((m) => [m.assessment_id, Number(m.score)]))
    const st = marksStats(list.filter((a) => mine.has(a.id)).map((a) => ({ score: mine.get(a.id), max: a.max_marks })))
    res.json({ ...st, assessments: list.map((a) => ({ ...shape(a), score: mine.get(a.id) ?? null })) })
  }))

  return r
}
