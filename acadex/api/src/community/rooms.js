import { slugify } from './lib.js'

// Course rooms mirror the course: the teacher and every enrolled student are members, nobody else.
// Calls are made from the course routes whenever a course, its teacher or its enrolment changes.

const courseSlug = (code) => `course-${slugify(code)}`

// Finds or creates the course's room (with its full member list) and returns its id.
export async function ensureCourseRoom(pool, courseId) {
  const existing = (await pool.query('SELECT id FROM rooms WHERE course_id = $1', [courseId])).rows[0]
  if (existing) return existing.id
  const c = (await pool.query('SELECT id, code, title, teacher_id FROM courses WHERE id = $1', [courseId])).rows[0]
  if (!c) return null
  const taken = (await pool.query('SELECT 1 FROM rooms WHERE slug = $1', [courseSlug(c.code)])).rows.length
  const slug = taken ? `${courseSlug(c.code)}-${c.id}` : courseSlug(c.code)
  const room = (await pool.query("INSERT INTO rooms (name, slug, kind, course_id) VALUES ($1, $2, 'course', $3) RETURNING id", [`${c.code} - ${c.title}`, slug, c.id])).rows[0]
  await syncCourseMembers(pool, room.id, c)
  return room.id
}

async function syncCourseMembers(pool, roomId, course) {
  const students = (await pool.query('SELECT student_id FROM enrollments WHERE course_id = $1', [course.id])).rows.map((r) => r.student_id)
  const members = [...new Set([...(course.teacher_id ? [course.teacher_id] : []), ...students])]
  await pool.query('DELETE FROM room_members WHERE room_id = $1', [roomId])
  if (members.length) await pool.query(`INSERT INTO room_members (room_id, user_id) VALUES ${members.map((_, i) => `($1, $${i + 2})`).join(', ')}`, [roomId, ...members])
}

// After a course is created or edited: keep the room's name and slug-independent member list in step.
export async function syncCourseRoom(pool, courseId) {
  const roomId = await ensureCourseRoom(pool, courseId)
  const c = (await pool.query('SELECT id, code, title, teacher_id FROM courses WHERE id = $1', [courseId])).rows[0]
  if (!roomId || !c) return
  await pool.query('UPDATE rooms SET name = $2 WHERE id = $1', [roomId, `${c.code} - ${c.title}`])
  await syncCourseMembers(pool, roomId, c)
}

export async function joinCourseRoom(pool, courseId, userId) {
  const roomId = await ensureCourseRoom(pool, courseId)
  if (!roomId) return
  const has = await pool.query('SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, userId])
  if (!has.rows.length) await pool.query('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [roomId, userId])
}

export async function leaveCourseRoom(pool, courseId, userId) {
  const room = (await pool.query('SELECT id FROM rooms WHERE course_id = $1', [courseId])).rows[0]
  if (room) await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, userId])
}

// Course rooms are members-only (admins see all). Returns the ids of course rooms this user may NOT see.
export async function blockedRoomIds(pool, user) {
  if (user.role === 'admin') return []
  const { rows } = await pool.query("SELECT id FROM rooms WHERE kind = 'course'")
  if (!rows.length) return []
  const mine = new Set((await pool.query('SELECT room_id FROM room_members WHERE user_id = $1', [user.id])).rows.map((r) => r.room_id))
  return rows.map((r) => r.id).filter((id) => !mine.has(id))
}

