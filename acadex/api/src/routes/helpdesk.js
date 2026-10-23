import { Router } from 'express'
import { z } from 'zod'
import { forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { limiter } from '../community/lib.js'
import { CATEGORIES, DEPARTMENTS, departmentFor, suggestPriority, ticketNumber } from '../helpdesk.js'

const id = z.coerce.number().int().positive()
const createBody = z.object({ category: z.enum(CATEGORIES.map((c) => c.id)), title: z.string().trim().min(5).max(150), details: z.string().trim().max(3000).default('') })
const messageBody = z.object({ body: z.string().trim().min(1).max(3000) })
const patchBody = z.object({ department: z.enum(DEPARTMENTS), status: z.enum(['open', 'in_progress', 'resolved']), priority: z.enum(['low', 'medium', 'high']) })
  .partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update')

const SELECT = 'SELECT t.*, u.name AS student_name FROM tickets t JOIN users u ON u.id = t.student_id'
const shape = (t) => ({
  id: t.id, number: ticketNumber(t.id), student: { id: t.student_id, name: t.student_name }, category: t.category, department: t.department,
  title: t.title, details: t.details, priority: t.priority, status: t.status, createdAt: t.created_at, updatedAt: t.updated_at, resolvedAt: t.resolved_at,
})

// Students raise tickets; admins (the front desk) route, answer and resolve them.
export function helpdeskRouter({ pool, config }) {
  const r = Router()
  const create = limiter({ ...config }, 'ticket')

  async function visible(user, ticketId) {
    const t = (await pool.query(`${SELECT} WHERE t.id = $1`, [ticketId])).rows[0]
    if (!t || (user.role !== 'admin' && t.student_id !== user.id)) throw notFound('Ticket not found')
    return t
  }
  const messages = async (ticketId) => (await pool.query('SELECT m.id, m.body, m.created_at, u.id AS author_id, u.name, u.role FROM ticket_messages m JOIN users u ON u.id = m.author_id WHERE m.ticket_id = $1 ORDER BY m.created_at, m.id', [ticketId])).rows
    .map((m) => ({ id: m.id, body: m.body, createdAt: m.created_at, author: { id: m.author_id, name: m.name, role: m.role } }))

  r.get('/meta', wrap(async (_req, res) => res.json({ categories: CATEGORIES, departments: DEPARTMENTS })))

  r.get('/tickets', wrap(async (req, res) => {
    if (req.user.role === 'teacher') throw forbidden()
    const f = z.object({ status: z.enum(['open', 'in_progress', 'resolved']).optional(), department: z.enum(DEPARTMENTS).optional() }).parse(req.query)
    const where = []; const params = []
    if (req.user.role === 'student') { params.push(req.user.id); where.push(`t.student_id = $${params.length}`) }
    if (f.status) { params.push(f.status); where.push(`t.status = $${params.length}`) }
    if (f.department) { params.push(f.department); where.push(`t.department = $${params.length}`) }
    const rows = (await pool.query(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.created_at DESC, t.id DESC`, params)).rows
    res.json(rows.map(shape))
  }))

  r.post('/tickets', requireRole('student'), create, wrap(async (req, res) => {
    const b = createBody.parse(req.body)
    const { rows } = await pool.query('INSERT INTO tickets (student_id, category, department, title, details, priority) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [req.user.id, b.category, departmentFor(b.category), b.title, b.details, suggestPriority(`${b.title} ${b.details}`)])
    res.status(201).json(shape(await visible(req.user, rows[0].id)))
  }))

  r.get('/tickets/:ticketId', wrap(async (req, res) => {
    const t = await visible(req.user, id.parse(req.params.ticketId))
    res.json({ ...shape(t), messages: await messages(t.id) })
  }))

  // A staff reply moves an open ticket to in progress; a student reply on a resolved ticket reopens it.
  r.post('/tickets/:ticketId/messages', wrap(async (req, res) => {
    if (req.user.role === 'teacher') throw forbidden()
    const t = await visible(req.user, id.parse(req.params.ticketId))
    const { body } = messageBody.parse(req.body)
    await pool.query('INSERT INTO ticket_messages (ticket_id, author_id, body) VALUES ($1, $2, $3)', [t.id, req.user.id, body])
    const next = req.user.role === 'admin' ? (t.status === 'open' ? 'in_progress' : t.status) : (t.status === 'resolved' ? 'open' : t.status)
    await pool.query('UPDATE tickets SET status = $2, resolved_at = $3, updated_at = now() WHERE id = $1', [t.id, next, next === 'resolved' ? t.resolved_at : null])
    res.status(201).json({ messages: await messages(t.id), status: next })
  }))

  r.patch('/tickets/:ticketId', requireRole('admin'), wrap(async (req, res) => {
    const t = await visible(req.user, id.parse(req.params.ticketId))
    const b = patchBody.parse(req.body)
    const status = b.status ?? t.status
    const resolvedAt = status === 'resolved' ? (t.status === 'resolved' ? t.resolved_at : new Date()) : null
    await pool.query('UPDATE tickets SET department = $2, status = $3, priority = $4, resolved_at = $5, updated_at = now() WHERE id = $1', [t.id, b.department ?? t.department, status, b.priority ?? t.priority, resolvedAt])
    res.json(shape(await visible(req.user, t.id)))
  }))

  r.get('/stats', requireRole('admin'), wrap(async (_req, res) => {
    const rows = (await pool.query('SELECT department, status, created_at, resolved_at FROM tickets')).rows
    const resolved = rows.filter((x) => x.resolved_at)
    const hours = resolved.length ? resolved.reduce((a, x) => a + (new Date(x.resolved_at) - new Date(x.created_at)) / 3600000, 0) / resolved.length : null
    res.json({
      total: rows.length, open: rows.filter((x) => x.status === 'open').length, inProgress: rows.filter((x) => x.status === 'in_progress').length, resolved: resolved.length,
      avgResolutionHours: hours == null ? null : Math.round(hours * 10) / 10,
      byDepartment: DEPARTMENTS.map((d) => ({ department: d, open: rows.filter((x) => x.department === d && x.status !== 'resolved').length, total: rows.filter((x) => x.department === d).length })),
    })
  }))

  return r
}
