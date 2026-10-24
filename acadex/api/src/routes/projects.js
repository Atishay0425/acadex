import { Router } from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'

const id = z.coerce.number().int().positive()
const httpUrl = z.string().trim().max(300).url().refine((u) => /^https?:\/\//i.test(u), 'Link must start with http:// or https://')
const projectBody = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().max(3000).default(''),
  stack: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  spots: z.number().int().min(0).max(8).default(2),
  mentorId: z.number().int().positive().nullable().optional(),
  repoUrl: httpUrl.nullable().optional(),
})
const updateBody = z.object({ body: z.string().trim().min(2).max(2000), progress: z.number().int().min(0).max(100).optional() })
const MAX_OWNED = 5

// Project & Idea Hub: students post ideas, others ask to join, a faculty mentor reviews and guides, and the
// team logs progress. Everything is visible to signed-in users so ideas can find teammates.
export function projectsRouter({ pool, notify }) {
  const r = Router()

  async function load(user, projectId) {
    const p = (await pool.query('SELECT * FROM projects WHERE id = $1', [projectId])).rows[0]
    if (!p) throw notFound('Project not found')
    return p
  }
  const isOwner = (u, p) => p.owner_id === u.id
  const isMentor = (u, p) => u.role === 'teacher' && p.mentor_id === u.id
  const inList = (ids) => ids.map((_, i) => `$${i + 1}`).join(', ')

  async function shape(user, rows) {
    if (!rows.length) return []
    const ids = rows.map((p) => p.id)
    const people = new Set(rows.flatMap((p) => [p.owner_id, p.mentor_id].filter(Boolean)))
    const members = (await pool.query(`SELECT m.project_id, u.id, u.name FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id IN (${inList(ids)}) ORDER BY u.name`, ids)).rows
    members.forEach((m) => people.add(m.id))
    const names = new Map((await pool.query(`SELECT id, name FROM users WHERE id IN (${inList([...people])})`, [...people])).rows.map((u) => [u.id, u.name]))
    const mine = new Map((await pool.query(`SELECT project_id, status FROM project_requests WHERE student_id = $1 AND project_id IN (${ids.map((_, i) => `$${i + 2}`).join(', ')})`, [user.id, ...ids])).rows.map((x) => [x.project_id, x.status]))
    return rows.map((p) => {
      const team = members.filter((m) => m.project_id === p.id).map((m) => ({ id: m.id, name: m.name }))
      const role = isOwner(user, p) ? 'owner' : team.some((m) => m.id === user.id) ? 'member' : isMentor(user, p) ? 'mentor' : mine.get(p.id) === 'pending' ? 'pending' : null
      return {
        id: p.id, title: p.title, description: p.description, stack: JSON.parse(p.stack), owner: { id: p.owner_id, name: names.get(p.owner_id) }, mentor: p.mentor_id ? { id: p.mentor_id, name: names.get(p.mentor_id) } : null,
        status: p.status, progress: p.progress, spots: p.spots, lookingFor: Math.max(0, p.spots - team.length), team, repoUrl: p.repo_url, myRole: role, updatedAt: p.updated_at,
      }
    })
  }
  const one = async (user, pid) => (await shape(user, [await load(user, pid)]))[0]

  async function checkMentor(mentorId) {
    if (mentorId == null) return
    const t = (await pool.query("SELECT 1 FROM users WHERE id = $1 AND role = 'teacher' AND is_active = TRUE", [mentorId])).rows[0]
    if (!t) throw new HttpError(400, 'mentorId must be a teacher')
  }

  r.get('/', wrap(async (req, res) => {
    const f = z.object({ status: z.enum(['idea', 'changes_requested', 'in_progress', 'completed']).optional(), q: z.string().max(80).optional(), looking: z.enum(['true']).optional(), mine: z.enum(['true']).optional(), review: z.enum(['true']).optional() }).parse(req.query)
    const where = []; const params = []
    if (f.status) { params.push(f.status); where.push(`status = $${params.length}`) }
    if (f.q) { params.push(`%${f.q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`); where.push(`(lower(title) LIKE $${params.length} OR lower(description) LIKE $${params.length} OR lower(stack) LIKE $${params.length})`) }
    if (f.mine) { params.push(req.user.id); where.push(`(owner_id = $${params.length} OR id IN (SELECT project_id FROM project_members WHERE user_id = $${params.length}))`) }
    if (f.review) {
      if (req.user.role === 'student') throw forbidden()
      params.push(req.user.id); where.push(req.user.role === 'admin' ? "status IN ('idea', 'changes_requested')" : `(mentor_id = $${params.length} OR (mentor_id IS NULL AND status = 'idea'))`)
    }
    let rows = (await pool.query(`SELECT * FROM projects ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC, id DESC`, params)).rows
    let list = await shape(req.user, rows)
    if (f.looking) list = list.filter((p) => p.lookingFor > 0 && p.status !== 'completed')
    res.json(list)
  }))

  r.post('/', requireRole('student'), wrap(async (req, res) => {
    const b = projectBody.parse(req.body)
    await checkMentor(b.mentorId)
    const owned = Number((await pool.query("SELECT COUNT(*) AS n FROM projects WHERE owner_id = $1 AND status <> 'completed'", [req.user.id])).rows[0].n)
    if (owned >= MAX_OWNED) throw new HttpError(400, `You can run up to ${MAX_OWNED} active projects`)
    const { rows } = await pool.query('INSERT INTO projects (owner_id, mentor_id, title, description, stack, spots, repo_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [req.user.id, b.mentorId ?? null, b.title, b.description, JSON.stringify(b.stack), b.spots, b.repoUrl ?? null])
    res.status(201).json(await one(req.user, rows[0].id))
  }))

  r.get('/:pid', wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    const updates = (await pool.query('SELECT u.*, a.name AS author_name FROM project_updates u JOIN users a ON a.id = u.author_id WHERE u.project_id = $1 ORDER BY u.created_at DESC, u.id DESC', [p.id])).rows
    res.json({ ...(await shape(req.user, [p]))[0], updates: updates.map((u) => ({ id: u.id, kind: u.kind, body: u.body, progress: u.progress, author: u.author_name, createdAt: u.created_at })) })
  }))

  // The owner edits their project. Editing after "changes requested" sends it back for review.
  r.patch('/:pid', requireRole('student'), wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    if (!isOwner(req.user, p)) throw forbidden()
    if (p.status === 'completed') throw new HttpError(409, 'Completed projects cannot be edited')
    const b = projectBody.partial().refine((x) => Object.keys(x).length > 0, 'Nothing to update').parse(req.body)
    if ('mentorId' in b) { await checkMentor(b.mentorId); if (p.status === 'in_progress') throw new HttpError(409, 'Ask the mentor to hand over; the mentor cannot change once the project is running') }
    const team = Number((await pool.query('SELECT COUNT(*) AS n FROM project_members WHERE project_id = $1', [p.id])).rows[0].n)
    if (b.spots != null && b.spots < team) throw new HttpError(400, `You already have ${team} teammate${team === 1 ? '' : 's'}`)
    const v = { title: b.title ?? p.title, description: b.description ?? p.description, stack: b.stack ? JSON.stringify(b.stack) : p.stack, spots: b.spots ?? p.spots, mentor_id: 'mentorId' in b ? b.mentorId : p.mentor_id, repo_url: 'repoUrl' in b ? b.repoUrl : p.repo_url, status: p.status === 'changes_requested' ? 'idea' : p.status }
    await pool.query('UPDATE projects SET title = $2, description = $3, stack = $4, spots = $5, mentor_id = $6, repo_url = $7, status = $8, updated_at = now() WHERE id = $1', [p.id, v.title, v.description, v.stack, v.spots, v.mentor_id, v.repo_url, v.status])
    res.json(await one(req.user, p.id))
  }))

  r.delete('/:pid', wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    if (!isOwner(req.user, p) && req.user.role !== 'admin') throw forbidden()
    await pool.query('DELETE FROM projects WHERE id = $1', [p.id])
    res.status(204).end()
  }))

  // --- mentor review
  r.post('/:pid/claim', requireRole('teacher'), wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    if (p.mentor_id || p.status !== 'idea') throw new HttpError(409, 'This idea already has a mentor')
    await pool.query('UPDATE projects SET mentor_id = $2, updated_at = now() WHERE id = $1', [p.id, req.user.id])
    res.json(await one(req.user, p.id))
  }))

  r.post('/:pid/review', requireRole('teacher'), wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    if (!isMentor(req.user, p)) throw forbidden('Only the project mentor can review it')
    if (p.status !== 'idea') throw new HttpError(409, 'Only ideas awaiting review can be reviewed')
    const b = z.object({ decision: z.enum(['approve', 'changes']), note: z.string().trim().max(2000).default('') }).refine((x) => x.decision === 'approve' || x.note.length >= 3, 'Say what should change').parse(req.body)
    const status = b.decision === 'approve' ? 'in_progress' : 'changes_requested'
    await pool.query('UPDATE projects SET status = $2, progress = $3, updated_at = now() WHERE id = $1', [p.id, status, b.decision === 'approve' ? Math.max(p.progress, 5) : p.progress])
    await pool.query('INSERT INTO project_updates (project_id, author_id, kind, body) VALUES ($1, $2, $3, $4)', [p.id, req.user.id, b.decision === 'approve' ? 'approved' : 'changes_requested', b.note])
    await notify([p.owner_id], { kind: 'project', title: b.decision === 'approve' ? `${p.title} was approved` : `Changes requested on ${p.title}`, body: b.note, link: '/student/projects' })
    res.json(await one(req.user, p.id))
  }))

  // Owner or team logs progress; the mentor logs feedback (same endpoint, kind follows the author).
  r.post('/:pid/updates', wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    const member = (await pool.query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [p.id, req.user.id])).rows.length > 0
    const mentor = isMentor(req.user, p)
    if (!isOwner(req.user, p) && !member && !mentor) throw forbidden()
    if (p.status !== 'in_progress') throw new HttpError(409, 'Progress can be logged once the mentor has approved the project')
    const b = updateBody.parse(req.body)
    await pool.query('INSERT INTO project_updates (project_id, author_id, kind, body, progress) VALUES ($1, $2, $3, $4, $5)', [p.id, req.user.id, mentor ? 'feedback' : 'update', b.body, mentor ? null : b.progress ?? null])
    if (!mentor && b.progress != null) await pool.query('UPDATE projects SET progress = $2, updated_at = now() WHERE id = $1', [p.id, b.progress])
    if (mentor) await notify([p.owner_id], { kind: 'project', title: `Mentor feedback on ${p.title}`, body: b.body, link: '/student/projects' })
    res.status(201).json(await one(req.user, p.id))
  }))

  r.post('/:pid/complete', wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    if (!isOwner(req.user, p) && !isMentor(req.user, p)) throw forbidden()
    if (p.status !== 'in_progress') throw new HttpError(409, 'Only running projects can be completed')
    await pool.query("UPDATE projects SET status = 'completed', progress = 100, updated_at = now() WHERE id = $1", [p.id])
    await pool.query("INSERT INTO project_updates (project_id, author_id, kind, body, progress) VALUES ($1, $2, 'completed', 'Marked as completed', 100)", [p.id, req.user.id])
    res.json(await one(req.user, p.id))
  }))

  // --- teammates
  r.post('/:pid/requests', requireRole('student'), wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    if (isOwner(req.user, p)) throw new HttpError(400, 'This is your own project')
    if (p.status === 'completed') throw new HttpError(409, 'This project is completed')
    if ((await pool.query('SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2', [p.id, req.user.id])).rows.length) throw new HttpError(409, 'You are already on this team')
    const team = Number((await pool.query('SELECT COUNT(*) AS n FROM project_members WHERE project_id = $1', [p.id])).rows[0].n)
    if (p.spots - team <= 0) throw new HttpError(409, 'The team is complete')
    if ((await pool.query('SELECT 1 FROM project_requests WHERE project_id = $1 AND student_id = $2', [p.id, req.user.id])).rows.length) throw new HttpError(409, 'You already asked to join this project')
    const { message } = z.object({ message: z.string().trim().max(500).default('') }).parse(req.body)
    await pool.query('INSERT INTO project_requests (project_id, student_id, message) VALUES ($1, $2, $3)', [p.id, req.user.id, message])
    await notify([p.owner_id], { kind: 'project', title: `${req.user.name} wants to join ${p.title}`, body: message, link: '/student/projects' })
    res.status(201).json({ status: 'pending' })
  }))

  r.get('/:pid/requests', requireRole('student'), wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    if (!isOwner(req.user, p)) throw forbidden()
    const rows = (await pool.query("SELECT q.id, q.message, q.created_at, u.id AS uid, u.name FROM project_requests q JOIN users u ON u.id = q.student_id WHERE q.project_id = $1 AND q.status = 'pending' ORDER BY q.created_at", [p.id])).rows
    res.json(rows.map((x) => ({ id: x.id, student: { id: x.uid, name: x.name }, message: x.message, createdAt: x.created_at })))
  }))

  r.post('/:pid/requests/:rid/decision', requireRole('student'), wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    if (!isOwner(req.user, p)) throw forbidden()
    const q = (await pool.query("SELECT * FROM project_requests WHERE id = $1 AND project_id = $2 AND status = 'pending'", [id.parse(req.params.rid), p.id])).rows[0]
    if (!q) throw notFound('Request not found')
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body)
    if (accept) {
      const team = Number((await pool.query('SELECT COUNT(*) AS n FROM project_members WHERE project_id = $1', [p.id])).rows[0].n)
      if (p.spots - team <= 0) throw new HttpError(409, 'The team is complete')
      await pool.query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)', [p.id, q.student_id])
    }
    await pool.query('UPDATE project_requests SET status = $2 WHERE id = $1', [q.id, accept ? 'accepted' : 'declined'])
    await notify([q.student_id], { kind: 'project', title: accept ? `You joined ${p.title}` : `Your request to join ${p.title} was declined`, link: '/student/projects' })
    res.json(await one(req.user, p.id))
  }))

  r.delete('/:pid/members/me', requireRole('student'), wrap(async (req, res) => {
    const p = await load(req.user, id.parse(req.params.pid))
    await pool.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [p.id, req.user.id])
    await pool.query('DELETE FROM project_requests WHERE project_id = $1 AND student_id = $2', [p.id, req.user.id])
    res.status(204).end()
  }))

  return r
}
