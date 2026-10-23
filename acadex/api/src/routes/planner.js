import { Router } from 'express'
import { z } from 'zod'
import { HttpError, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { dateStr, withTx } from '../db/pool.js'
import { buildSchedule, daysBetween } from '../planner.js'

const id = z.coerce.number().int().positive()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const topicTitle = z.string().trim().min(2).max(150)
const examBody = z.object({
  courseId: z.number().int().positive().nullable().optional(),
  subject: z.string().trim().min(2).max(120).optional(),
  date: day,
  topics: z.array(topicTitle).max(60).default([]),
})
const MAX_EXAMS = 20, MAX_TOPICS = 60

// A student's own exams, topic checklist and the schedule generated from them. The client sends its local
// date as ?today= so "today" matches the student's day, not the server's.
export function plannerRouter({ pool }) {
  const r = Router()
  r.use(requireRole('student'))
  const todayOf = (req) => day.default(new Date().toISOString().slice(0, 10)).parse(req.query.today)

  async function myExam(user, examId) {
    const e = (await pool.query('SELECT * FROM exams WHERE id = $1 AND student_id = $2', [examId, user.id])).rows[0]
    if (!e) throw notFound('Exam not found')
    return e
  }
  async function load(user) {
    const exams = (await pool.query('SELECT * FROM exams WHERE student_id = $1 ORDER BY exam_date, id', [user.id])).rows
    const topics = exams.length ? (await pool.query('SELECT t.* FROM study_topics t JOIN exams e ON e.id = t.exam_id WHERE e.student_id = $1 ORDER BY t.position, t.id', [user.id])).rows : []
    return exams.map((e) => ({
      id: e.id, subject: e.subject, courseId: e.course_id, date: dateStr(e.exam_date),
      topics: topics.filter((t) => t.exam_id === e.id).map((t) => ({ id: t.id, title: t.title, done: t.done })),
    }))
  }
  const withProgress = (e, today) => ({ ...e, daysLeft: daysBetween(today, e.date), total: e.topics.length, doneCount: e.topics.filter((t) => t.done).length })

  r.get('/exams', wrap(async (req, res) => {
    const today = todayOf(req)
    res.json((await load(req.user)).map((e) => withProgress(e, today)))
  }))

  r.post('/exams', wrap(async (req, res) => {
    const b = examBody.parse(req.body)
    const today = todayOf(req)
    if (b.date < today) throw new HttpError(400, 'The exam date cannot be in the past')
    let subject = b.subject, courseId = null
    if (b.courseId) {
      const c = (await pool.query('SELECT c.title FROM courses c JOIN enrollments e ON e.course_id = c.id WHERE c.id = $1 AND e.student_id = $2', [b.courseId, req.user.id])).rows[0]
      if (!c) throw new HttpError(400, 'You are not enrolled in that course')
      courseId = b.courseId; subject = subject ?? c.title
    }
    if (!subject) throw new HttpError(400, 'Choose a course or type a subject')
    if (Number((await pool.query('SELECT COUNT(*) AS n FROM exams WHERE student_id = $1', [req.user.id])).rows[0].n) >= MAX_EXAMS) throw new HttpError(400, `You can plan up to ${MAX_EXAMS} exams at a time`)
    const examId = await withTx(pool, async (client) => {
      const e = (await client.query('INSERT INTO exams (student_id, course_id, subject, exam_date) VALUES ($1, $2, $3, $4) RETURNING id', [req.user.id, courseId, subject, b.date])).rows[0]
      for (const [i, title] of b.topics.entries()) await client.query('INSERT INTO study_topics (exam_id, title, position) VALUES ($1, $2, $3)', [e.id, title, i])
      return e.id
    })
    res.status(201).json(withProgress((await load(req.user)).find((e) => e.id === examId), today))
  }))

  r.patch('/exams/:examId', wrap(async (req, res) => {
    const e = await myExam(req.user, id.parse(req.params.examId))
    const b = z.object({ subject: examBody.shape.subject, date: day }).partial().refine((x) => Object.keys(x).length > 0, 'Nothing to update').parse(req.body)
    if (b.date && b.date < todayOf(req)) throw new HttpError(400, 'The exam date cannot be in the past')
    await pool.query('UPDATE exams SET subject = $2, exam_date = $3 WHERE id = $1', [e.id, b.subject ?? e.subject, b.date ?? dateStr(e.exam_date)])
    res.json(withProgress((await load(req.user)).find((x) => x.id === e.id), todayOf(req)))
  }))

  r.delete('/exams/:examId', wrap(async (req, res) => {
    const e = await myExam(req.user, id.parse(req.params.examId))
    await pool.query('DELETE FROM exams WHERE id = $1', [e.id])
    res.status(204).end()
  }))

  r.post('/exams/:examId/topics', wrap(async (req, res) => {
    const e = await myExam(req.user, id.parse(req.params.examId))
    const { title } = z.object({ title: topicTitle }).parse(req.body)
    const n = Number((await pool.query('SELECT COUNT(*) AS n FROM study_topics WHERE exam_id = $1', [e.id])).rows[0].n)
    if (n >= MAX_TOPICS) throw new HttpError(400, `An exam can have up to ${MAX_TOPICS} topics`)
    const t = (await pool.query('INSERT INTO study_topics (exam_id, title, position) VALUES ($1, $2, $3) RETURNING id', [e.id, title, n])).rows[0]
    res.status(201).json({ id: t.id, title, done: false })
  }))

  async function myTopic(user, topicId) {
    const t = (await pool.query('SELECT t.* FROM study_topics t JOIN exams e ON e.id = t.exam_id WHERE t.id = $1 AND e.student_id = $2', [topicId, user.id])).rows[0]
    if (!t) throw notFound('Topic not found')
    return t
  }
  r.patch('/topics/:topicId', wrap(async (req, res) => {
    const t = await myTopic(req.user, id.parse(req.params.topicId))
    const b = z.object({ done: z.boolean(), title: topicTitle }).partial().refine((x) => Object.keys(x).length > 0, 'Nothing to update').parse(req.body)
    const done = b.done ?? t.done
    await pool.query('UPDATE study_topics SET title = $2, done = $3, done_at = $4 WHERE id = $1', [t.id, b.title ?? t.title, done, done ? (t.done ? t.done_at : new Date()) : null])
    res.json({ id: t.id, title: b.title ?? t.title, done })
  }))
  r.delete('/topics/:topicId', wrap(async (req, res) => {
    const t = await myTopic(req.user, id.parse(req.params.topicId))
    await pool.query('DELETE FROM study_topics WHERE id = $1', [t.id])
    res.status(204).end()
  }))

  r.get('/schedule', wrap(async (req, res) => {
    const today = todayOf(req)
    const horizon = z.coerce.number().int().min(1).max(30).default(7).parse(req.query.days)
    const exams = (await load(req.user)).filter((e) => e.date >= today)
    res.json(buildSchedule(exams, today, horizon))
  }))

  return r
}
