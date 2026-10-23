import { Router } from 'express'
import { z } from 'zod'
import { HttpError, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { loadCourse, assertManage, assertEnrolledStudent } from '../courseAccess.js'

const id = z.coerce.number().int().positive()
const httpUrl = z.string().trim().max(500).url().refine((u) => /^https?:\/\//i.test(u), 'Link must start with http:// or https://')
const assignmentBody = z.object({
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(5000).default(''),
  dueAt: z.string().datetime({ offset: true }),
  maxMarks: z.number().positive().max(1000),
})
const submitBody = z.object({ content: z.string().trim().max(10000).default(''), link: httpUrl.nullable().optional() })
  .refine((b) => b.content || b.link, 'Add some text or a link')
const gradeBody = z.object({ score: z.number().min(0), feedback: z.string().trim().max(2000).default('') })

const shape = (a, extra = {}) => ({ id: a.id, title: a.title, description: a.description, dueAt: a.due_at, maxMarks: Number(a.max_marks), ...extra })
const subShape = (s) => (s ? { content: s.content, link: s.link, submittedAt: s.submitted_at, isLate: s.is_late, score: s.score == null ? null : Number(s.score), feedback: s.feedback, gradedAt: s.graded_at } : null)
const statusOf = (a, s, now = new Date()) => (s ? (s.score != null ? 'graded' : s.is_late ? 'late' : 'submitted') : new Date(a.due_at) <= now ? 'overdue' : 'pending')

// A student's assignments across their courses (optionally one course), soonest due first.
async function studentAssignments(pool, userId, courseId) {
  const rows = (await pool.query(
    `SELECT a.*, c.code, c.title AS course_title FROM assignments a JOIN courses c ON c.id = a.course_id
     JOIN enrollments e ON e.course_id = a.course_id WHERE e.student_id = $1 ${courseId ? 'AND a.course_id = $2' : ''} ORDER BY a.due_at, a.id`, courseId ? [userId, courseId] : [userId])).rows
  const subs = new Map((await pool.query('SELECT s.* FROM submissions s JOIN assignments a ON a.id = s.assignment_id JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = s.student_id WHERE s.student_id = $1', [userId])).rows.map((s) => [s.assignment_id, s]))
  return rows.map((a) => shape(a, { course: { id: a.course_id, code: a.code, title: a.course_title }, status: statusOf(a, subs.get(a.id)), submission: subShape(subs.get(a.id)) }))
}

export function myAssignmentsRouter({ pool }) {
  const r = Router()
  r.get('/', requireRole('student'), wrap(async (req, res) => res.json(await studentAssignments(pool, req.user.id))))
  return r
}

export function assignmentsRouter({ pool }) {
  const r = Router({ mergeParams: true })
  const course = (req) => loadCourse(pool, id.parse(req.params.courseId))
  async function loadAssignment(c, aid) {
    const a = (await pool.query('SELECT * FROM assignments WHERE id = $1 AND course_id = $2', [aid, c.id])).rows[0]
    if (!a) throw notFound('Assignment not found')
    return a
  }

  r.get('/', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const list = (await pool.query('SELECT * FROM assignments WHERE course_id = $1 ORDER BY due_at DESC, id DESC', [c.id])).rows
    const subs = (await pool.query('SELECT s.assignment_id, s.score FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id = $1', [c.id])).rows
    res.json(list.map((a) => {
      const mine = subs.filter((s) => s.assignment_id === a.id)
      return shape(a, { submitted: mine.length, graded: mine.filter((s) => s.score != null).length })
    }))
  }))

  r.post('/', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const b = assignmentBody.parse(req.body)
    const a = (await pool.query('INSERT INTO assignments (course_id, title, description, due_at, max_marks, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [c.id, b.title, b.description, b.dueAt, b.maxMarks, req.user.id])).rows[0]
    res.status(201).json(shape(a, { submitted: 0, graded: 0 }))
  }))

  // The signed-in student's assignments in this course. Must stay above /:aid routes.
  r.get('/mine', wrap(async (req, res) => {
    const c = await course(req); await assertEnrolledStudent(pool, req.user, c)
    res.json(await studentAssignments(pool, req.user.id, c.id))
  }))

  r.patch('/:aid', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const a = await loadAssignment(c, id.parse(req.params.aid))
    const b = assignmentBody.partial().refine((x) => Object.keys(x).length > 0, 'Nothing to update').parse(req.body)
    if (b.maxMarks != null && (await pool.query('SELECT 1 FROM submissions WHERE assignment_id = $1 AND score > $2', [a.id, b.maxMarks])).rows.length) {
      throw new HttpError(400, 'Some graded scores are higher than the new maximum')
    }
    const cols = { title: 'title', description: 'description', dueAt: 'due_at', maxMarks: 'max_marks' }
    const keys = Object.keys(b)
    const { rows } = await pool.query(`UPDATE assignments SET ${keys.map((k, i) => `${cols[k]} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [a.id, ...keys.map((k) => b[k])])
    res.json(shape(rows[0]))
  }))

  r.delete('/:aid', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const a = await loadAssignment(c, id.parse(req.params.aid))
    await pool.query('DELETE FROM assignments WHERE id = $1', [a.id])
    res.status(204).end()
  }))

  // Every enrolled student with their submission (null when nothing handed in).
  r.get('/:aid/submissions', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const a = await loadAssignment(c, id.parse(req.params.aid))
    const students = (await pool.query('SELECT u.id, u.name, u.email FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.course_id = $1 ORDER BY u.name', [c.id])).rows
    const subs = new Map((await pool.query('SELECT * FROM submissions WHERE assignment_id = $1', [a.id])).rows.map((s) => [s.student_id, s]))
    res.json({ assignment: shape(a), students: students.map((s) => ({ studentId: s.id, name: s.name, email: s.email, status: statusOf(a, subs.get(s.id)), submission: subShape(subs.get(s.id)) })) })
  }))

  r.put('/:aid/submissions/:studentId/grade', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const a = await loadAssignment(c, id.parse(req.params.aid))
    const studentId = id.parse(req.params.studentId)
    const b = gradeBody.parse(req.body)
    if (b.score > Number(a.max_marks)) throw new HttpError(400, `Score cannot exceed ${Number(a.max_marks)}`)
    const sub = (await pool.query('SELECT id FROM submissions WHERE assignment_id = $1 AND student_id = $2', [a.id, studentId])).rows[0]
    if (!sub) throw new HttpError(400, 'This student has not submitted yet')
    await pool.query('UPDATE submissions SET score = $2, feedback = $3, graded_at = now(), graded_by = $4 WHERE id = $1', [sub.id, b.score, b.feedback, req.user.id])
    res.json({ studentId, score: b.score })
  }))

  // Submit or resubmit (until it is graded). Late work is accepted and flagged.
  r.put('/:aid/submission', requireRole('student'), wrap(async (req, res) => {
    const c = await course(req); await assertEnrolledStudent(pool, req.user, c)
    const a = await loadAssignment(c, id.parse(req.params.aid))
    const b = submitBody.parse(req.body)
    const late = new Date(a.due_at) < new Date()
    const cur = (await pool.query('SELECT id, score, is_late FROM submissions WHERE assignment_id = $1 AND student_id = $2', [a.id, req.user.id])).rows[0]
    if (cur?.score != null) throw new HttpError(409, 'This submission has been graded and can no longer be changed')
    if (cur) await pool.query('UPDATE submissions SET content = $2, link = $3, submitted_at = now(), is_late = $4 WHERE id = $1', [cur.id, b.content, b.link ?? null, late])
    else await pool.query('INSERT INTO submissions (assignment_id, student_id, content, link, is_late) VALUES ($1, $2, $3, $4, $5)', [a.id, req.user.id, b.content, b.link ?? null, late])
    res.status(cur ? 200 : 201).json({ isLate: late })
  }))

  return r
}
