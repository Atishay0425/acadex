import { Router } from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { syncCourseRoom, joinCourseRoom, leaveCourseRoom } from '../community/rooms.js'
import { COURSE_SELECT as SELECT, loadCourse, assertManage } from '../courseAccess.js'

const id = z.coerce.number().int().positive()
const courseBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Use 2-20 letters, digits or dashes, e.g. CS101'),
  title: z.string().trim().min(2).max(150),
  department: z.string().trim().max(100).nullable().optional(),
  semester: z.number().int().min(1).max(12).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  teacherId: z.number().int().positive().nullable().optional(),
})
const addStudentBody = z.object({ studentId: z.number().int().positive() })

export function coursesRouter({ pool }) {
  const r = Router()

  const shape = (c, counts, enrolled) => ({
    id: c.id, code: c.code, title: c.title, department: c.department, semester: c.semester, description: c.description,
    teacher: c.teacher_id ? { id: c.teacher_id, name: c.teacher_name } : null,
    studentCount: counts.get(c.id) ?? 0,
    ...(enrolled ? { enrolled: enrolled.has(c.id) } : {}),
  })

  async function counts() {
    const rows = (await pool.query('SELECT course_id, COUNT(*) AS n FROM enrollments GROUP BY course_id')).rows
    return new Map(rows.map((x) => [x.course_id, Number(x.n)]))
  }

  const load = (courseId) => loadCourse(pool, courseId)

  async function assertTeacher(teacherId) {
    if (teacherId == null) return
    const t = (await pool.query('SELECT role FROM users WHERE id = $1', [teacherId])).rows[0]
    if (!t || t.role !== 'teacher') throw new HttpError(400, 'teacherId must be a teacher account')
  }

  // ?scope=mine (default): enrolled courses for students, taught courses for teachers, everything for admins.
  // ?scope=all: the full catalogue, with an `enrolled` flag for students.
  r.get('/', wrap(async (req, res) => {
    const scope = z.enum(['mine', 'all']).default('mine').parse(req.query.scope)
    const { rows } = await pool.query(`${SELECT} ORDER BY c.code`)
    const enrolled = req.user.role === 'student'
      ? new Set((await pool.query('SELECT course_id FROM enrollments WHERE student_id = $1', [req.user.id])).rows.map((x) => x.course_id))
      : null
    let list = rows
    if (scope === 'mine' && req.user.role === 'student') list = rows.filter((c) => enrolled.has(c.id))
    if (scope === 'mine' && req.user.role === 'teacher') list = rows.filter((c) => c.teacher_id === req.user.id)
    const n = await counts()
    res.json(list.map((c) => shape(c, n, enrolled)))
  }))

  r.post('/', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const b = courseBody.parse(req.body)
    const teacherId = req.user.role === 'teacher' ? req.user.id : b.teacherId ?? null
    await assertTeacher(teacherId)
    const { rows } = await pool.query(
      'INSERT INTO courses (code, title, department, semester, description, teacher_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [b.code, b.title, b.department ?? null, b.semester ?? null, b.description ?? null, teacherId])
    await syncCourseRoom(pool, rows[0].id)
    res.status(201).json(shape(await load(rows[0].id), new Map()))
  }))

  r.get('/:courseId', wrap(async (req, res) => {
    const c = await load(id.parse(req.params.courseId))
    const enrolled = req.user.role === 'student'
      ? new Set((await pool.query('SELECT course_id FROM enrollments WHERE student_id = $1 AND course_id = $2', [req.user.id, c.id])).rows.map((x) => x.course_id))
      : null
    res.json(shape(c, await counts(), enrolled))
  }))

  r.patch('/:courseId', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await load(id.parse(req.params.courseId))
    assertManage(req.user, c)
    const b = courseBody.partial().parse(req.body)
    // Only admins can reassign a course to another teacher.
    if ('teacherId' in b) {
      if (req.user.role !== 'admin') throw forbidden('Only an admin can reassign a course')
      await assertTeacher(b.teacherId)
    }
    const cols = { code: 'code', title: 'title', department: 'department', semester: 'semester', description: 'description', teacherId: 'teacher_id' }
    const keys = Object.keys(b)
    if (keys.length) {
      await pool.query(`UPDATE courses SET ${keys.map((k, i) => `${cols[k]} = $${i + 2}`).join(', ')} WHERE id = $1`, [c.id, ...keys.map((k) => b[k])])
    }
    if (keys.length) await syncCourseRoom(pool, c.id)
    res.json(shape(await load(c.id), await counts()))
  }))

  r.delete('/:courseId', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await load(id.parse(req.params.courseId))
    assertManage(req.user, c)
    await pool.query('DELETE FROM courses WHERE id = $1', [c.id])
    res.status(204).end()
  }))

  // Student self-service.
  r.post('/:courseId/enroll', requireRole('student'), wrap(async (req, res) => {
    const c = await load(id.parse(req.params.courseId))
    const dup = await pool.query('SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2', [c.id, req.user.id])
    if (!dup.rows.length) await pool.query('INSERT INTO enrollments (course_id, student_id) VALUES ($1, $2)', [c.id, req.user.id])
    await joinCourseRoom(pool, c.id, req.user.id)
    res.status(dup.rows.length ? 200 : 201).json(shape(c, await counts(), new Set([c.id])))
  }))

  r.delete('/:courseId/enroll', requireRole('student'), wrap(async (req, res) => {
    const c = await load(id.parse(req.params.courseId))
    await pool.query('DELETE FROM enrollments WHERE course_id = $1 AND student_id = $2', [c.id, req.user.id])
    await leaveCourseRoom(pool, c.id, req.user.id)
    res.status(204).end()
  }))

  // Roster, visible to course staff only.
  r.get('/:courseId/students', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await load(id.parse(req.params.courseId))
    assertManage(req.user, c)
    const { rows } = await pool.query(
      'SELECT u.id, u.name, u.email, u.department FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.course_id = $1 ORDER BY u.name', [c.id])
    res.json(rows)
  }))

  r.post('/:courseId/students', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await load(id.parse(req.params.courseId))
    assertManage(req.user, c)
    const { studentId } = addStudentBody.parse(req.body)
    const s = (await pool.query('SELECT role FROM users WHERE id = $1', [studentId])).rows[0]
    if (!s || s.role !== 'student') throw new HttpError(400, 'studentId must be a student account')
    const dup = await pool.query('SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2', [c.id, studentId])
    if (!dup.rows.length) await pool.query('INSERT INTO enrollments (course_id, student_id) VALUES ($1, $2)', [c.id, studentId])
    await joinCourseRoom(pool, c.id, studentId)
    res.status(dup.rows.length ? 200 : 201).json({ courseId: c.id, studentId })
  }))

  r.delete('/:courseId/students/:studentId', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await load(id.parse(req.params.courseId))
    assertManage(req.user, c)
    const sid = id.parse(req.params.studentId)
    await pool.query('DELETE FROM enrollments WHERE course_id = $1 AND student_id = $2', [c.id, sid])
    await leaveCourseRoom(pool, c.id, sid)
    res.status(204).end()
  }))

  return r
}
