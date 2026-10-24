import { Router } from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { placeholders } from '../community/lib.js'

const id = z.coerce.number().int().positive()
const TYPES = ['academic', 'career', 'personal']
const slotsBody = z.object({ slots: z.array(z.string().datetime({ offset: true })).min(1).max(20) })
const bookBody = z.object({ slotId: z.number().int().positive(), type: z.enum(TYPES), topic: z.string().trim().max(1000).default(''), anonymous: z.boolean().default(false) })
const updateBody = z.object({ status: z.enum(['confirmed', 'completed', 'cancelled']), note: z.string().trim().max(5000), followUp: z.string().trim().max(2000) })
  .partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update')
const MAX_ACTIVE_BOOKINGS = 3, MAX_OPEN_SLOTS = 60
const ACTIVE = ['requested', 'confirmed']

// Counsellors are teachers an admin has flagged. Students book their free slots; an anonymous booking hides
// the student's name from the counsellor in the app. Counsellor notes stay private to the counsellor.
export function counsellingRouter({ pool, notify }) {
  const r = Router()
  const needCounsellor = (req, _res, next) => (req.user.role === 'teacher' ? pool.query('SELECT is_counsellor FROM users WHERE id = $1', [req.user.id]).then((x) => (x.rows[0]?.is_counsellor ? next() : next(forbidden('You are not set up as a counsellor')))).catch(next) : next(forbidden('You are not set up as a counsellor')))

  const sessionRows = async (where, params) => (await pool.query(
    `SELECT s.*, st.name AS student_name, st.email AS student_email, c.name AS counsellor_name FROM counselling_sessions s JOIN users st ON st.id = s.student_id JOIN users c ON c.id = s.counsellor_id ${where} ORDER BY s.starts_at DESC, s.id DESC`, params)).rows
  const forStudent = (s) => ({ id: s.id, counsellor: { id: s.counsellor_id, name: s.counsellor_name }, startsAt: s.starts_at, type: s.type, topic: s.topic, anonymous: s.is_anonymous, status: s.status, followUp: s.follow_up, createdAt: s.created_at })
  const forCounsellor = (s) => ({ id: s.id, student: s.is_anonymous ? { id: null, name: 'Anonymous student', email: null } : { id: s.student_id, name: s.student_name, email: s.student_email }, startsAt: s.starts_at, type: s.type, topic: s.topic, anonymous: s.is_anonymous, status: s.status, note: s.counsellor_note, followUp: s.follow_up, createdAt: s.created_at })

  // Counsellors with their free upcoming slots (a slot is free until an active session holds it).
  r.get('/counsellors', wrap(async (_req, res) => {
    const people = (await pool.query("SELECT id, name, department FROM users WHERE role = 'teacher' AND is_counsellor = TRUE AND is_active = TRUE ORDER BY name")).rows
    if (!people.length) return res.json([])
    const slots = (await pool.query(`SELECT sl.id, sl.counsellor_id, sl.starts_at FROM counselling_slots sl WHERE sl.starts_at > now() AND sl.counsellor_id IN (${placeholders(people.map((p) => p.id))}) AND sl.id NOT IN (SELECT slot_id FROM counselling_sessions WHERE slot_id IS NOT NULL) ORDER BY sl.starts_at`, people.map((p) => p.id))).rows
    res.json(people.map((p) => ({ id: p.id, name: p.name, department: p.department, slots: slots.filter((x) => x.counsellor_id === p.id).slice(0, 10).map((x) => ({ id: x.id, startsAt: x.starts_at })) })))
  }))

  // --- counsellor: availability
  r.get('/slots', needCounsellor, wrap(async (req, res) => {
    const rows = (await pool.query('SELECT id, starts_at FROM counselling_slots WHERE counsellor_id = $1 AND starts_at > now() ORDER BY starts_at', [req.user.id])).rows
    const taken = new Set((await pool.query('SELECT slot_id FROM counselling_sessions WHERE counsellor_id = $1 AND slot_id IS NOT NULL', [req.user.id])).rows.map((x) => x.slot_id))
    res.json(rows.map((x) => ({ id: x.id, startsAt: x.starts_at, booked: taken.has(x.id) })))
  }))

  r.post('/slots', needCounsellor, wrap(async (req, res) => {
    const { slots } = slotsBody.parse(req.body)
    if (slots.some((s) => new Date(s) <= new Date())) throw new HttpError(400, 'Slots must be in the future')
    const open = Number((await pool.query('SELECT COUNT(*) AS n FROM counselling_slots WHERE counsellor_id = $1 AND starts_at > now()', [req.user.id])).rows[0].n)
    if (open + slots.length > MAX_OPEN_SLOTS) throw new HttpError(400, `You can offer up to ${MAX_OPEN_SLOTS} upcoming slots`)
    let added = 0
    for (const s of [...new Set(slots.map((x) => new Date(x).toISOString()))]) {
      if ((await pool.query('SELECT 1 FROM counselling_slots WHERE counsellor_id = $1 AND starts_at = $2', [req.user.id, s])).rows.length) continue
      await pool.query('INSERT INTO counselling_slots (counsellor_id, starts_at) VALUES ($1, $2)', [req.user.id, s]); added++
    }
    res.status(201).json({ added })
  }))

  r.delete('/slots/:slotId', needCounsellor, wrap(async (req, res) => {
    const sl = (await pool.query('SELECT * FROM counselling_slots WHERE id = $1 AND counsellor_id = $2', [id.parse(req.params.slotId), req.user.id])).rows[0]
    if (!sl) throw notFound('Slot not found')
    if ((await pool.query('SELECT 1 FROM counselling_sessions WHERE slot_id = $1', [sl.id])).rows.length) throw new HttpError(409, 'This slot is booked. Cancel the session first.')
    await pool.query('DELETE FROM counselling_slots WHERE id = $1', [sl.id])
    res.status(204).end()
  }))

  // --- student: booking
  r.post('/sessions', requireRole('student'), wrap(async (req, res) => {
    const b = bookBody.parse(req.body)
    const sl = (await pool.query('SELECT sl.*, u.is_counsellor, u.is_active FROM counselling_slots sl JOIN users u ON u.id = sl.counsellor_id WHERE sl.id = $1', [b.slotId])).rows[0]
    if (!sl || !sl.is_counsellor || !sl.is_active) throw notFound('Slot not found')
    if (new Date(sl.starts_at) <= new Date()) throw new HttpError(400, 'That slot has already started')
    const mine = Number((await pool.query("SELECT COUNT(*) AS n FROM counselling_sessions WHERE student_id = $1 AND status IN ('requested', 'confirmed') AND starts_at > now()", [req.user.id])).rows[0].n)
    if (mine >= MAX_ACTIVE_BOOKINGS) throw new HttpError(400, `You can have up to ${MAX_ACTIVE_BOOKINGS} upcoming sessions at a time`)
    if ((await pool.query('SELECT 1 FROM counselling_sessions WHERE slot_id = $1', [sl.id])).rows.length) throw new HttpError(409, 'That slot was just taken. Pick another.')
    let row
    try {
      row = (await pool.query('INSERT INTO counselling_sessions (student_id, counsellor_id, slot_id, starts_at, type, topic, is_anonymous) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [req.user.id, sl.counsellor_id, sl.id, sl.starts_at, b.type, b.topic, b.anonymous])).rows[0]
    } catch (e) { if (e.code === '23505') throw new HttpError(409, 'That slot was just taken. Pick another.'); throw e }
    await notify([sl.counsellor_id], { kind: 'counselling', title: 'New counselling request', body: `${b.type} session on ${new Date(sl.starts_at).toUTCString()}`, link: '/teacher/counselling' })
    res.status(201).json(forStudent((await sessionRows('WHERE s.id = $1', [row.id]))[0]))
  }))

  r.get('/sessions', wrap(async (req, res) => {
    if (req.user.role === 'student') return res.json((await sessionRows('WHERE s.student_id = $1', [req.user.id])).map(forStudent))
    await new Promise((ok, no) => needCounsellor(req, res, (e) => (e ? no(e) : ok())))
    res.json((await sessionRows('WHERE s.counsellor_id = $1', [req.user.id])).map(forCounsellor))
  }))

  // Student cancels their own booking before it starts; frees the slot.
  r.post('/sessions/:sessionId/cancel', requireRole('student'), wrap(async (req, res) => {
    const s = (await pool.query('SELECT * FROM counselling_sessions WHERE id = $1 AND student_id = $2', [id.parse(req.params.sessionId), req.user.id])).rows[0]
    if (!s) throw notFound('Session not found')
    if (!ACTIVE.includes(s.status)) throw new HttpError(409, 'This session can no longer be cancelled')
    await pool.query("UPDATE counselling_sessions SET status = 'cancelled', slot_id = NULL WHERE id = $1", [s.id])
    await notify([s.counsellor_id], { kind: 'counselling', title: 'A session was cancelled', body: 'A student cancelled their booking.', link: '/teacher/counselling' })
    res.json({ status: 'cancelled' })
  }))

  // Counsellor confirms, completes or cancels, and writes a private note and a follow-up the student can read.
  r.patch('/sessions/:sessionId', needCounsellor, wrap(async (req, res) => {
    const s = (await pool.query('SELECT * FROM counselling_sessions WHERE id = $1 AND counsellor_id = $2', [id.parse(req.params.sessionId), req.user.id])).rows[0]
    if (!s) throw notFound('Session not found')
    const b = updateBody.parse(req.body)
    if (s.status === 'cancelled') throw new HttpError(409, 'This session was cancelled')
    const status = b.status ?? s.status
    await pool.query('UPDATE counselling_sessions SET status = $2, counsellor_note = $3, follow_up = $4, slot_id = $5 WHERE id = $1', [s.id, status, b.note ?? s.counsellor_note, b.followUp ?? s.follow_up, status === 'cancelled' ? null : s.slot_id])
    if (status !== s.status) await notify([s.student_id], { kind: 'counselling', title: `Your counselling session is ${status}`, body: b.followUp ?? s.follow_up, link: '/student/counselling' })
    res.json(forCounsellor((await sessionRows('WHERE s.id = $1', [s.id]))[0]))
  }))

  return r
}
