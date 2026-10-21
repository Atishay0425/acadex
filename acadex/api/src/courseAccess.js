import { HttpError, forbidden, notFound } from './errors.js'

export const COURSE_SELECT = 'SELECT c.*, t.name AS teacher_name FROM courses c LEFT JOIN users t ON t.id = c.teacher_id'

export async function loadCourse(pool, courseId) {
  const c = (await pool.query(`${COURSE_SELECT} WHERE c.id = $1`, [courseId])).rows[0]
  if (!c) throw notFound('Course not found')
  return c
}

// Course staff = the course's teacher or any admin.
export const canManage = (user, c) => user.role === 'admin' || (user.role === 'teacher' && c.teacher_id === user.id)
export function assertManage(user, c) { if (!canManage(user, c)) throw forbidden() }

export async function assertEnrolledStudent(pool, user, c) {
  if (user.role !== 'student') throw forbidden()
  const row = await pool.query('SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2', [c.id, user.id])
  if (!row.rows.length) throw forbidden('You are not enrolled in this course')
}

// Every id must be enrolled in the course; returns the enrolled id set.
export async function assertAllEnrolled(pool, c, studentIds) {
  const { rows } = await pool.query('SELECT student_id FROM enrollments WHERE course_id = $1', [c.id])
  const enrolled = new Set(rows.map((r) => r.student_id))
  const bad = studentIds.filter((id) => !enrolled.has(id))
  if (bad.length) throw new HttpError(400, 'Some students are not enrolled in this course', { studentIds: bad })
  return enrolled
}
