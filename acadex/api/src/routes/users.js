import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { HttpError, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { publicUser } from './auth.js'
import { DEPARTMENTS } from '../helpdesk.js'

const roleEnum = z.enum(['student', 'teacher', 'admin', 'staff'])
const deskDepartment = z.enum(DEPARTMENTS)
const createBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(100),
  role: roleEnum,
  department: z.string().trim().max(100).optional(),
  deskDepartment: deskDepartment.optional(), // required for staff: the help-desk department whose tickets they handle
  password: z.string().min(8).max(128),
}).refine((b) => (b.role === 'staff') === Boolean(b.deskDepartment), 'Staff need a help-desk department, and only staff can have one')
const patchBody = z.object({
  name: z.string().trim().min(2).max(100),
  department: z.string().trim().max(100).nullable(),
  role: roleEnum,
  isActive: z.boolean(),
  isCounsellor: z.boolean(),
  deskDepartment: deskDepartment.nullable(),
}).partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update')

export function usersRouter({ pool }) {
  const r = Router()

  // Admins see everyone. Teachers only need students (to build class rosters).
  r.get('/', requireRole('admin', 'teacher'), wrap(async (req, res) => {
    const role = req.user.role === 'teacher' ? 'student' : roleEnum.optional().parse(req.query.role)
    const q = z.string().max(100).optional().parse(req.query.q)
    const where = []
    const params = []
    if (role) { params.push(role); where.push(`role = $${params.length}`) }
    if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(lower(name) LIKE $${params.length} OR lower(email) LIKE $${params.length})`) }
    const sql = `SELECT * FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`
    const { rows } = await pool.query(sql, params)
    res.json(rows.map((u) => ({ ...publicUser(u), isActive: u.is_active })))
  }))

  r.post('/', requireRole('admin'), wrap(async (req, res) => {
    const b = createBody.parse(req.body)
    const hash = await bcrypt.hash(b.password, 10)
    const { rows } = await pool.query(
      'INSERT INTO users (email, name, role, department, desk_department, password_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [b.email, b.name, b.role, b.department ?? null, b.deskDepartment ?? null, hash])
    res.status(201).json(publicUser(rows[0]))
  }))

  r.patch('/:id', requireRole('admin'), wrap(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id)
    const b = patchBody.parse(req.body)
    const cols = { name: 'name', department: 'department', role: 'role', isActive: 'is_active', isCounsellor: 'is_counsellor', deskDepartment: 'desk_department' }
    const cur = (await pool.query('SELECT role, desk_department FROM users WHERE id = $1', [id])).rows[0]
    if (!cur) throw notFound('User not found')
    const role = b.role ?? cur.role
    const desk = b.deskDepartment !== undefined ? b.deskDepartment : cur.desk_department
    if (role === 'staff' ? !desk : b.deskDepartment) throw new HttpError(400, 'Staff need a help-desk department, and only staff can have one')
    if (role !== 'staff' && cur.desk_department && b.deskDepartment === undefined) b.deskDepartment = null // leaving the staff role clears the department
    if (b.isCounsellor && (b.role ?? cur.role) !== 'teacher') throw new HttpError(400, 'Only teachers can be counsellors')
    if (b.role && b.role !== 'teacher') b.isCounsellor = false
    const sets = Object.keys(b).map((k, i) => `${cols[k]} = $${i + 2}`)
    const { rows } = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, ...Object.values(b)])
    if (!rows[0]) throw notFound('User not found')
    res.json(publicUser(rows[0]))
  }))

  return r
}
