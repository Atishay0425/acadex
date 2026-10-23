import { Router } from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'

const id = z.coerce.number().int().positive()
const profileBody = z.object({
  headline: z.string().trim().min(3).max(120),
  year: z.string().trim().max(60).default(''),
  topics: z.array(z.string().trim().min(2).max(40)).max(6).default([]),
  bio: z.string().trim().max(1000).default(''),
})
const askBody = z.object({ mentorId: z.number().int().positive(), text: z.string().trim().min(10).max(1500), anonymous: z.boolean().default(true) })
const MAX_PENDING = 10

// Senior-junior mentorship. Any student can opt in as a mentor; juniors ask them questions (optionally
// anonymously), mentors answer, and the asker rates helpful answers. Admins can hide a mentor profile.
export function mentorshipRouter({ pool }) {
  const r = Router()

  const mentorShape = (p, stats, me) => ({
    id: p.user_id, name: p.name, department: p.department, headline: p.headline, year: p.year_label, topics: JSON.parse(p.topics), bio: p.bio, isActive: p.is_active,
    rating: stats.count ? Math.round((stats.sum / stats.count) * 10) / 10 : null, ratingCount: stats.count, answered: stats.answered, isMe: p.user_id === me,
  })
  async function statsFor() {
    const out = new Map()
    const get = (k) => out.get(k) ?? out.set(k, { sum: 0, count: 0, answered: 0 }).get(k)
    for (const x of (await pool.query('SELECT mentor_id, rating, answered_at FROM mentor_questions WHERE answered_at IS NOT NULL')).rows) {
      const s = get(x.mentor_id); s.answered++
      if (x.rating != null) { s.sum += x.rating; s.count++ }
    }
    return { get: (k) => out.get(k) ?? { sum: 0, count: 0, answered: 0 } }
  }
  const PROFILE_SELECT = 'SELECT p.*, u.name, u.department FROM mentor_profiles p JOIN users u ON u.id = p.user_id'

  r.get('/mentors', wrap(async (req, res) => {
    const f = z.object({ q: z.string().max(80).optional(), topic: z.string().max(40).optional(), department: z.string().max(100).optional() }).parse(req.query)
    const rows = (await pool.query(`${PROFILE_SELECT} WHERE ${req.user.role === 'admin' ? 'TRUE' : 'p.is_active = TRUE'} ORDER BY u.name`)).rows
    const st = await statsFor()
    let list = rows.map((p) => mentorShape(p, st.get(p.user_id), req.user.id))
    if (f.q) list = list.filter((m) => `${m.name} ${m.headline} ${m.topics.join(' ')}`.toLowerCase().includes(f.q.toLowerCase()))
    if (f.topic) list = list.filter((m) => m.topics.some((t) => t.toLowerCase() === f.topic.toLowerCase()))
    if (f.department) list = list.filter((m) => m.department === f.department)
    res.json(list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.answered - a.answered || a.name.localeCompare(b.name)))
  }))

  r.get('/mentors/me', requireRole('student'), wrap(async (req, res) => {
    const p = (await pool.query(`${PROFILE_SELECT} WHERE p.user_id = $1`, [req.user.id])).rows[0]
    res.json(p ? mentorShape(p, (await statsFor()).get(p.user_id), req.user.id) : null)
  }))

  r.put('/mentors/me', requireRole('student'), wrap(async (req, res) => {
    const b = profileBody.parse(req.body)
    const has = (await pool.query('SELECT is_active FROM mentor_profiles WHERE user_id = $1', [req.user.id])).rows[0]
    if (has) await pool.query('UPDATE mentor_profiles SET headline = $2, year_label = $3, topics = $4, bio = $5 WHERE user_id = $1', [req.user.id, b.headline, b.year, JSON.stringify(b.topics), b.bio])
    else await pool.query('INSERT INTO mentor_profiles (user_id, headline, year_label, topics, bio) VALUES ($1, $2, $3, $4, $5)', [req.user.id, b.headline, b.year, JSON.stringify(b.topics), b.bio])
    const p = (await pool.query(`${PROFILE_SELECT} WHERE p.user_id = $1`, [req.user.id])).rows[0]
    res.json(mentorShape(p, (await statsFor()).get(req.user.id), req.user.id))
  }))

  // Stop being a mentor (the profile and past answers are kept, hidden from the list).
  r.delete('/mentors/me', requireRole('student'), wrap(async (req, res) => {
    await pool.query('UPDATE mentor_profiles SET is_active = FALSE WHERE user_id = $1', [req.user.id])
    res.status(204).end()
  }))

  r.patch('/mentors/:userId', requireRole('admin'), wrap(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body)
    const p = (await pool.query('UPDATE mentor_profiles SET is_active = $2 WHERE user_id = $1 RETURNING user_id', [id.parse(req.params.userId), isActive])).rows[0]
    if (!p) throw notFound('Mentor not found')
    res.json({ id: p.user_id, isActive })
  }))

  // --- questions
  const QSELECT = 'SELECT q.*, a.name AS asker_name, m.name AS mentor_name FROM mentor_questions q JOIN users a ON a.id = q.asker_id JOIN users m ON m.id = q.mentor_id'
  const asAsker = (q) => ({ id: q.id, mentor: { id: q.mentor_id, name: q.mentor_name }, text: q.text, anonymous: q.is_anonymous, answer: q.answer, answeredAt: q.answered_at, rating: q.rating, createdAt: q.created_at })
  const asMentor = (q) => ({ id: q.id, asker: q.is_anonymous ? { id: null, name: 'Anonymous' } : { id: q.asker_id, name: q.asker_name }, text: q.text, anonymous: q.is_anonymous, answer: q.answer, answeredAt: q.answered_at, rating: q.rating, createdAt: q.created_at })

  r.post('/questions', requireRole('student'), wrap(async (req, res) => {
    const b = askBody.parse(req.body)
    if (b.mentorId === req.user.id) throw new HttpError(400, 'You cannot ask yourself')
    const m = (await pool.query('SELECT 1 FROM mentor_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $1 AND p.is_active = TRUE AND u.is_active = TRUE', [b.mentorId])).rows[0]
    if (!m) throw notFound('Mentor not found')
    const open = Number((await pool.query('SELECT COUNT(*) AS n FROM mentor_questions WHERE asker_id = $1 AND answered_at IS NULL', [req.user.id])).rows[0].n)
    if (open >= MAX_PENDING) throw new HttpError(400, `You already have ${MAX_PENDING} unanswered questions. Wait for replies first.`)
    const { rows } = await pool.query('INSERT INTO mentor_questions (asker_id, mentor_id, text, is_anonymous) VALUES ($1, $2, $3, $4) RETURNING id', [req.user.id, b.mentorId, b.text, b.anonymous])
    res.status(201).json(asAsker((await pool.query(`${QSELECT} WHERE q.id = $1`, [rows[0].id])).rows[0]))
  }))

  r.get('/questions', requireRole('student'), wrap(async (req, res) => {
    const box = z.enum(['asked', 'received']).default('asked').parse(req.query.box)
    const col = box === 'asked' ? 'q.asker_id' : 'q.mentor_id'
    const rows = (await pool.query(`${QSELECT} WHERE ${col} = $1 ORDER BY q.created_at DESC, q.id DESC`, [req.user.id])).rows
    res.json(rows.map(box === 'asked' ? asAsker : asMentor))
  }))

  r.post('/questions/:qid/answer', requireRole('student'), wrap(async (req, res) => {
    const q = (await pool.query('SELECT * FROM mentor_questions WHERE id = $1 AND mentor_id = $2', [id.parse(req.params.qid), req.user.id])).rows[0]
    if (!q) throw notFound('Question not found')
    const { answer } = z.object({ answer: z.string().trim().min(2).max(3000) }).parse(req.body)
    await pool.query('UPDATE mentor_questions SET answer = $2, answered_at = COALESCE(answered_at, now()) WHERE id = $1', [q.id, answer])
    res.json(asMentor((await pool.query(`${QSELECT} WHERE q.id = $1`, [q.id])).rows[0]))
  }))

  r.post('/questions/:qid/rate', requireRole('student'), wrap(async (req, res) => {
    const q = (await pool.query('SELECT * FROM mentor_questions WHERE id = $1 AND asker_id = $2', [id.parse(req.params.qid), req.user.id])).rows[0]
    if (!q) throw notFound('Question not found')
    if (!q.answered_at) throw new HttpError(400, 'You can rate an answer once the mentor has replied')
    const { rating } = z.object({ rating: z.number().int().min(1).max(5) }).parse(req.body)
    await pool.query('UPDATE mentor_questions SET rating = $2 WHERE id = $1', [q.id, rating])
    res.json({ rating })
  }))

  return r
}
