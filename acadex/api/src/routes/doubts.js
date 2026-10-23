import { Router } from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { placeholders } from '../community/lib.js'

const id = z.coerce.number().int().positive()
const askBody = z.object({ courseId: z.number().int().positive(), title: z.string().trim().min(5).max(200), body: z.string().trim().max(5000).default('') })
const answerBody = z.object({ answer: z.string().trim().min(1).max(10000) })

const SELECT = `SELECT d.*, u.name AS student_name, c.code, c.title AS course_title, c.teacher_id, t.name AS teacher_name
  FROM doubts d JOIN users u ON u.id = d.student_id JOIN courses c ON c.id = d.course_id LEFT JOIN users t ON t.id = c.teacher_id`

// Doubts live in a course: the enrolled students, the course teacher and admins can see them.
export function doubtsRouter({ pool }) {
  const r = Router()

  async function visibleCourseIds(user) {
    if (user.role === 'admin') return null // everything
    const sql = user.role === 'teacher' ? 'SELECT id FROM courses WHERE teacher_id = $1' : 'SELECT course_id AS id FROM enrollments WHERE student_id = $1'
    return (await pool.query(sql, [user.id])).rows.map((x) => x.id)
  }

  async function shape(user, rows) {
    const ids = rows.map((d) => d.id)
    const counts = new Map(); const mine = new Set()
    if (ids.length) {
      for (const x of (await pool.query(`SELECT doubt_id, COUNT(*) AS n FROM doubt_upvotes WHERE doubt_id IN (${placeholders(ids)}) GROUP BY doubt_id`, ids)).rows) counts.set(x.doubt_id, Number(x.n))
      for (const x of (await pool.query(`SELECT doubt_id FROM doubt_upvotes WHERE user_id = $1 AND doubt_id IN (${placeholders(ids, 2)})`, [user.id, ...ids])).rows) mine.add(x.doubt_id)
    }
    return rows.map((d) => ({
      id: d.id, course: { id: d.course_id, code: d.code, title: d.course_title }, teacher: d.teacher_id ? { id: d.teacher_id, name: d.teacher_name } : null,
      student: { id: d.student_id, name: d.student_name }, title: d.title, body: d.body, solved: d.answered_at != null, answer: d.answer, answeredAt: d.answered_at,
      upvotes: counts.get(d.id) ?? 0, myUpvote: mine.has(d.id), isMine: d.student_id === user.id, createdAt: d.created_at,
    }))
  }

  async function visibleDoubt(user, doubtId) {
    const d = (await pool.query(`${SELECT} WHERE d.id = $1`, [doubtId])).rows[0]
    if (!d) throw notFound('Doubt not found')
    const allowed = await visibleCourseIds(user)
    if (allowed && !allowed.includes(d.course_id)) throw notFound('Doubt not found')
    return d
  }

  const canAnswer = (user, d) => user.role === 'admin' || (user.role === 'teacher' && d.teacher_id === user.id)

  r.get('/', wrap(async (req, res) => {
    const f = z.object({ course: z.coerce.number().int().positive().optional(), status: z.enum(['open', 'solved']).optional(), search: z.string().max(100).optional(), sort: z.enum(['new', 'top']).default('new') }).parse(req.query)
    const allowed = await visibleCourseIds(req.user)
    if (allowed && !allowed.length) return res.json([])
    const where = []; const params = []
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)) }
    if (allowed) { params.push(...allowed); where.push(`d.course_id IN (${placeholders(allowed, 1)})`) }
    if (f.course) add('d.course_id = ?', f.course)
    if (f.status) where.push(f.status === 'solved' ? 'd.answered_at IS NOT NULL' : 'd.answered_at IS NULL')
    if (f.search) { params.push(`%${f.search.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`); const n = `$${params.length}`; where.push(`(lower(d.title) LIKE ${n} OR lower(d.body) LIKE ${n} OR lower(d.answer) LIKE ${n})`) }
    const rows = (await pool.query(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.created_at DESC, d.id DESC`, params)).rows
    const out = await shape(req.user, rows)
    res.json(f.sort === 'top' ? out.sort((a, b) => b.upvotes - a.upvotes) : out)
  }))

  // "Already solved, check before asking": up to 3 solved doubts sharing a longer word with the title.
  r.get('/similar', wrap(async (req, res) => {
    const title = z.string().max(200).default('').parse(req.query.title)
    const words = [...new Set(title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4))].slice(0, 6)
    const allowed = await visibleCourseIds(req.user)
    if (!words.length || (allowed && !allowed.length)) return res.json([])
    const params = []; const likes = words.map((w) => { params.push(`%${w}%`); return `lower(d.title) LIKE $${params.length}` })
    let scope = ''
    if (allowed) { scope = `AND d.course_id IN (${placeholders(allowed, params.length + 1)})`; params.push(...allowed) }
    const rows = (await pool.query(`${SELECT} WHERE d.answered_at IS NOT NULL AND (${likes.join(' OR ')}) ${scope} ORDER BY d.created_at DESC LIMIT 3`, params)).rows
    res.json(await shape(req.user, rows))
  }))

  r.post('/', requireRole('student'), wrap(async (req, res) => {
    const b = askBody.parse(req.body)
    const c = (await pool.query('SELECT c.id, c.teacher_id FROM courses c JOIN enrollments e ON e.course_id = c.id WHERE c.id = $1 AND e.student_id = $2', [b.courseId, req.user.id])).rows[0]
    if (!c) throw forbidden('You are not enrolled in this course')
    if (!c.teacher_id) throw new HttpError(400, 'This course has no teacher assigned yet')
    const { rows } = await pool.query('INSERT INTO doubts (course_id, student_id, title, body) VALUES ($1, $2, $3, $4) RETURNING id', [b.courseId, req.user.id, b.title, b.body])
    res.status(201).json((await shape(req.user, [await visibleDoubt(req.user, rows[0].id)]))[0])
  }))

  r.get('/:doubtId', wrap(async (req, res) => {
    res.json((await shape(req.user, [await visibleDoubt(req.user, id.parse(req.params.doubtId))]))[0])
  }))

  // Toggle "I have the same doubt".
  r.post('/:doubtId/upvote', wrap(async (req, res) => {
    const d = await visibleDoubt(req.user, id.parse(req.params.doubtId))
    if (d.student_id === req.user.id) throw new HttpError(400, 'You cannot upvote your own doubt.')
    const has = (await pool.query('SELECT 1 FROM doubt_upvotes WHERE doubt_id = $1 AND user_id = $2', [d.id, req.user.id])).rows.length
    if (has) await pool.query('DELETE FROM doubt_upvotes WHERE doubt_id = $1 AND user_id = $2', [d.id, req.user.id])
    else await pool.query('INSERT INTO doubt_upvotes (doubt_id, user_id) VALUES ($1, $2)', [d.id, req.user.id])
    const n = Number((await pool.query('SELECT COUNT(*) AS n FROM doubt_upvotes WHERE doubt_id = $1', [d.id])).rows[0].n)
    res.json({ upvotes: n, myUpvote: !has })
  }))

  // Answering marks the doubt solved; the teacher can edit the answer later.
  r.put('/:doubtId/answer', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const d = await visibleDoubt(req.user, id.parse(req.params.doubtId))
    if (!canAnswer(req.user, d)) throw forbidden()
    const { answer } = answerBody.parse(req.body)
    await pool.query('UPDATE doubts SET answer = $2, answered_by = $3, answered_at = now() WHERE id = $1', [d.id, answer, req.user.id])
    res.json((await shape(req.user, [await visibleDoubt(req.user, d.id)]))[0])
  }))

  // The asker can withdraw an unanswered doubt; the course teacher or an admin can remove any.
  r.delete('/:doubtId', wrap(async (req, res) => {
    const d = await visibleDoubt(req.user, id.parse(req.params.doubtId))
    const own = d.student_id === req.user.id && d.answered_at == null
    if (!own && !canAnswer(req.user, d)) throw forbidden()
    await pool.query('DELETE FROM doubts WHERE id = $1', [d.id])
    res.status(204).end()
  }))

  return r
}
