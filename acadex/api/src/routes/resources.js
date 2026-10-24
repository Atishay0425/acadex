import { Router } from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { loadCourse, assertManage, canManage } from '../courseAccess.js'
import { analyse } from '../notes/text.js'

const id = z.coerce.number().int().positive()
const httpUrl = z.string().trim().max(500).url().refine((u) => /^https?:\/\//i.test(u), 'Link must start with http:// or https://')
const body = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), title: z.string().trim().min(2).max(150), content: z.string().trim().min(80, 'Add at least a few sentences of notes').max(60000) }),
  z.object({ kind: z.literal('file'), title: z.string().trim().min(2).max(150), fileId: z.number().int().positive(), content: z.string().trim().max(500).default('') }),
  z.object({ kind: z.literal('link'), title: z.string().trim().min(2).max(150), url: httpUrl, content: z.string().trim().max(500).default('') }),
])

// Teachers share notes and links with a class. Students read them and can copy a shared note into their own
// Smart Notes, where the summary, questions and quiz are generated for them.
export function resourcesRouter({ pool, notify }) {
  const r = Router({ mergeParams: true })
  const course = (req) => loadCourse(pool, id.parse(req.params.courseId))
  async function allowed(user, c) {
    if (canManage(user, c)) return
    const ok = user.role === 'student' && (await pool.query('SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2', [c.id, user.id])).rows.length
    if (!ok) throw forbidden('You are not enrolled in this course')
  }
  // A shared file is stored as a link row with a file attached (the kind column only allows note or link).
  const shape = (x, imports, mine) => ({ id: x.id, title: x.title, kind: x.file_id ? 'file' : x.kind, file: x.file_id ? { id: x.file_id, name: x.file_name, size: x.file_size, mime: x.file_mime } : null, content: x.content, url: x.url, teacher: x.teacher_name, createdAt: x.created_at, ...(imports != null ? { imports } : {}), ...(mine != null ? { imported: mine } : {}) })
  const SELECT = 'SELECT x.*, u.name AS teacher_name, f.original_name AS file_name, f.size AS file_size, f.mime AS file_mime FROM resources x LEFT JOIN users u ON u.id = x.teacher_id LEFT JOIN files f ON f.id = x.file_id'

  r.get('/', wrap(async (req, res) => {
    const c = await course(req); await allowed(req.user, c)
    const rows = (await pool.query(`${SELECT} WHERE x.course_id = $1 ORDER BY x.created_at DESC, x.id DESC`, [c.id])).rows
    const imp = (await pool.query('SELECT i.resource_id, i.student_id FROM resource_imports i JOIN resources x ON x.id = i.resource_id WHERE x.course_id = $1', [c.id])).rows
    const staff = canManage(req.user, c)
    res.json(rows.map((x) => shape(x, staff ? imp.filter((i) => i.resource_id === x.id).length : null, staff ? null : imp.some((i) => i.resource_id === x.id && i.student_id === req.user.id))))
  }))

  r.post('/', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const b = body.parse(req.body)
    if (b.kind === 'file') {
      const f = (await pool.query('SELECT id FROM files WHERE id = $1 AND owner_id = $2', [b.fileId, req.user.id])).rows[0]
      if (!f) throw new HttpError(400, 'That file is not one of your uploads')
      if ((await pool.query('SELECT 1 FROM resources WHERE file_id = $1 UNION ALL SELECT 1 FROM submission_files WHERE file_id = $1', [f.id])).rows.length) throw new HttpError(400, 'That file is already attached somewhere else')
    }
    const { rows } = await pool.query('INSERT INTO resources (course_id, teacher_id, title, kind, content, url, file_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [c.id, req.user.id, b.title, b.kind === 'note' ? 'note' : 'link', b.content ?? '', b.kind === 'link' ? b.url : null, b.kind === 'file' ? b.fileId : null])
    const students = (await pool.query('SELECT student_id FROM enrollments WHERE course_id = $1', [c.id])).rows.map((x) => x.student_id)
    await notify(students, { kind: 'resource', title: `New material in ${c.code}: ${b.title}`, body: b.kind === 'link' ? b.url : b.kind === 'file' ? 'A teacher shared a file with your class.' : 'A teacher shared notes with your class.', link: '/student/resources' })
    res.status(201).json(shape((await pool.query(`${SELECT} WHERE x.id = $1`, [rows[0].id])).rows[0], 0))
  }))

  r.delete('/:rid', requireRole('teacher', 'admin'), wrap(async (req, res) => {
    const c = await course(req); assertManage(req.user, c)
    const x = (await pool.query('SELECT id FROM resources WHERE id = $1 AND course_id = $2', [id.parse(req.params.rid), c.id])).rows[0]
    if (!x) throw notFound('Resource not found')
    await pool.query('DELETE FROM resources WHERE id = $1', [x.id])
    res.status(204).end()
  }))

  // Copies a shared note into the student's own Smart Notes (once).
  r.post('/:rid/import', requireRole('student'), wrap(async (req, res) => {
    const c = await course(req); await allowed(req.user, c)
    const x = (await pool.query('SELECT * FROM resources WHERE id = $1 AND course_id = $2', [id.parse(req.params.rid), c.id])).rows[0]
    if (!x) throw notFound('Resource not found')
    if (x.kind !== 'note') throw new HttpError(400, 'Only shared notes can be added to Smart Notes')
    const done = (await pool.query('SELECT note_id FROM resource_imports WHERE resource_id = $1 AND student_id = $2', [x.id, req.user.id])).rows[0]
    if (done?.note_id && (await pool.query('SELECT 1 FROM notes WHERE id = $1', [done.note_id])).rows.length) return res.json({ noteId: done.note_id, already: true })
    const note = (await pool.query('INSERT INTO notes (owner_id, course_id, title, content, analysis) VALUES ($1, $2, $3, $4, $5) RETURNING id', [req.user.id, c.id, x.title, x.content, JSON.stringify(analyse(x.content))])).rows[0]
    await pool.query('DELETE FROM resource_imports WHERE resource_id = $1 AND student_id = $2', [x.id, req.user.id])
    await pool.query('INSERT INTO resource_imports (resource_id, student_id, note_id) VALUES ($1, $2, $3)', [x.id, req.user.id, note.id])
    res.status(201).json({ noteId: note.id, already: false })
  }))

  return r
}
