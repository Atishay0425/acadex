import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { HttpError } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { authenticate } from '../middleware/auth.js'

const email = z.string().trim().toLowerCase().email()
const password = z.string().min(8).max(128)
const loginBody = z.object({ email, password: z.string().min(1).max(128) })
const registerBody = z.object({ email, password, name: z.string().trim().min(2).max(100), department: z.string().trim().max(100).optional() })
const refreshBody = z.object({ refreshToken: z.string().min(1) })

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, department: u.department, isCounsellor: Boolean(u.is_counsellor) })
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
// Compared against when the email is unknown so a miss costs the same time as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

export function authRouter({ pool, config }) {
  const r = Router()
  const limiter = config.rateLimit ? rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }) : (_q, _s, n) => n()

  async function issueTokens(user) {
    const accessToken = jwt.sign({ role: user.role, name: user.name }, config.jwtSecret, { subject: String(user.id), expiresIn: config.accessTtl })
    const refreshToken = crypto.randomBytes(48).toString('hex')
    const expires = new Date(Date.now() + config.refreshDays * 86400000)
    await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [user.id, sha256(refreshToken), expires])
    return { accessToken, refreshToken, user: publicUser(user) }
  }

  // Self-registration only ever creates students. Staff accounts are created by an admin.
  r.post('/register', limiter, wrap(async (req, res) => {
    const b = registerBody.parse(req.body)
    const hash = await bcrypt.hash(b.password, 10)
    const { rows } = await pool.query(
      "INSERT INTO users (email, name, role, department, password_hash) VALUES ($1, $2, 'student', $3, $4) RETURNING *",
      [b.email, b.name, b.department ?? null, hash])
    res.status(201).json(await issueTokens(rows[0]))
  }))

  r.post('/login', limiter, wrap(async (req, res) => {
    const b = loginBody.parse(req.body)
    const user = (await pool.query('SELECT * FROM users WHERE email = $1', [b.email])).rows[0]
    const ok = await bcrypt.compare(b.password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !ok || !user.is_active) throw new HttpError(401, 'Invalid email or password')
    res.json(await issueTokens(user))
  }))

  // Refresh tokens are single use: each refresh revokes the old one and issues a new pair.
  r.post('/refresh', limiter, wrap(async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body)
    const row = (await pool.query('SELECT * FROM refresh_tokens WHERE token_hash = $1', [sha256(refreshToken)])).rows[0]
    if (!row || row.revoked || new Date(row.expires_at) < new Date()) throw new HttpError(401, 'Invalid refresh token')
    await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id])
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [row.user_id])).rows[0]
    if (!user || !user.is_active) throw new HttpError(401, 'Invalid refresh token')
    res.json(await issueTokens(user))
  }))

  r.post('/logout', wrap(async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body)
    await pool.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [sha256(refreshToken)])
    res.status(204).end()
  }))

  r.get('/me', authenticate(config), wrap(async (req, res) => {
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id])).rows[0]
    if (!user || !user.is_active) throw new HttpError(401, 'Account disabled')
    res.json(publicUser(user))
  }))

  return r
}
