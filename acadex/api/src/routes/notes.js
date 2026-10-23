import { Router } from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { analyse, search } from '../notes/text.js'

const id = z.coerce.number().int().positive()
// Kept under the 100 kb JSON body limit of the app.
const noteBody = z.object({
  title: z.string().trim().min(2).max(150),
  content: z.string().trim().min(80, 'Add at least a few sentences of notes').max(60000),
  courseId: z.number().int().positive().nullable().optional(),
})
const askBody = z.object({ question: z.string().trim().min(3).max(300), noteId: z.number().int().positive().optional() })

// Private study notes. Analysis (summary, key terms, questions, MCQs) is computed on save, so reads are cheap.
export function notesRouter({ pool }) {
  const r = Router()

  async function mine(user, noteId) {
    const n = (await pool.query('SELECT n.*, c.code, c.title AS course_title FROM notes n LEFT JOIN courses c ON c.id = n.course_id WHERE n.id = $1 AND n.owner_id = $2', [noteId, user.id])).rows[0]
    if (!n) throw notFound('Note not found')
    return n
  }
  const meta = (n) => ({ id: n.id, title: n.title, course: n.course_id ? { id: n.course_id, code: n.code, title: n.course_title } : null, words: n.content.split(/\s+/).length, createdAt: n.created_at, updatedAt: n.updated_at })
  const full = (n) => ({ ...meta(n), content: n.content, ...JSON.parse(n.analysis) })

  async function checkCourse(user, courseId) {
    if (courseId == null) return
    const ok = user.role === 'student'
      ? (await pool.query('SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2', [courseId, user.id])).rows.length
      : (await pool.query('SELECT 1 FROM courses WHERE id = $1', [courseId])).rows.length
    if (!ok) throw forbidden('You are not enrolled in this course')
  }

  r.get('/', wrap(async (req, res) => {
    const rows = (await pool.query('SELECT n.*, c.code, c.title AS course_title FROM notes n LEFT JOIN courses c ON c.id = n.course_id WHERE n.owner_id = $1 ORDER BY n.created_at DESC, n.id DESC', [req.user.id])).rows
    res.json(rows.map(meta))
  }))

  r.post('/', wrap(async (req, res) => {
    const b = noteBody.parse(req.body)
    await checkCourse(req.user, b.courseId)
    const { rows } = await pool.query('INSERT INTO notes (owner_id, course_id, title, content, analysis) VALUES ($1, $2, $3, $4, $5) RETURNING id', [req.user.id, b.courseId ?? null, b.title, b.content, JSON.stringify(analyse(b.content))])
    res.status(201).json(full(await mine(req.user, rows[0].id)))
  }))

  // "Ask from your notes": best matching passages from one note, or from all of the user's notes.
  r.post('/ask', wrap(async (req, res) => {
    const b = askBody.parse(req.body)
    const notes = b.noteId ? [await mine(req.user, b.noteId)] : (await pool.query('SELECT id, title, content FROM notes WHERE owner_id = $1', [req.user.id])).rows
    if (!notes.length) throw new HttpError(400, 'Add some notes first')
    const hits = search(b.question, notes)
    if (!hits.length) return res.json({ answer: null, sources: [] })
    res.json({ answer: hits[0].passage, sources: hits })
  }))

  r.get('/:noteId', wrap(async (req, res) => res.json(full(await mine(req.user, id.parse(req.params.noteId))))))

  r.patch('/:noteId', wrap(async (req, res) => {
    const n = await mine(req.user, id.parse(req.params.noteId))
    const b = noteBody.partial().refine((x) => Object.keys(x).length > 0, 'Nothing to update').parse(req.body)
    if ('courseId' in b) await checkCourse(req.user, b.courseId)
    const title = b.title ?? n.title; const content = b.content ?? n.content; const courseId = 'courseId' in b ? b.courseId : n.course_id
    await pool.query('UPDATE notes SET title = $2, content = $3, course_id = $4, analysis = $5, updated_at = now() WHERE id = $1', [n.id, title, content, courseId, JSON.stringify(b.content ? analyse(content) : JSON.parse(n.analysis))])
    res.json(full(await mine(req.user, n.id)))
  }))

  r.delete('/:noteId', wrap(async (req, res) => {
    const n = await mine(req.user, id.parse(req.params.noteId))
    await pool.query('DELETE FROM notes WHERE id = $1', [n.id])
    res.status(204).end()
  }))

  return r
}
