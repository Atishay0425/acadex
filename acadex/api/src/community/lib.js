import rateLimit from 'express-rate-limit'
import { limiterStore } from '../redis.js'

export const isModerator = (u) => u.role === 'teacher' || u.role === 'admin'

export const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// "$2, $3, $4" for an IN list starting at placeholder `start`.
export const placeholders = (arr, start = 1) => arr.map((_, i) => `$${start + i}`).join(', ')

export const voteLabel = (v) => (v === 1 ? 'up' : v === -1 ? 'down' : null)

export const ANON = { id: null, name: 'Anonymous', role: null }
export const authorOf = (row, viewer, hideable = false) =>
  hideable && !(viewer.id === row.author_id || isModerator(viewer))
    ? ANON
    : { id: row.author_id, name: row.author_name, role: row.author_role }

// Per-scope limits like the Django service (post 30/hour, vote 120/min, flag 20/hour), keyed by user.
const LIMITS = { post: [60 * 60 * 1000, 30], vote: [60 * 1000, 120], flag: [60 * 60 * 1000, 20], ticket: [60 * 60 * 1000, 10], ocr: [60 * 60 * 1000, 30], upload: [60 * 60 * 1000, 40] }
export function limiter(config, scope) {
  if (!config.rateLimit) return (_q, _s, next) => next()
  const [windowMs, limit] = LIMITS[scope]
  return rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, store: limiterStore(config.redis, scope), keyGenerator: (req) => `${scope}:${req.user.id}`, validate: { keyGeneratorIpFallback: false } })
}

// Two queries for the whole page, however many rows: grouped counts, then the viewer's own votes.
export async function voteTotals(pool, table, fk, ids, userId) {
  const out = new Map(ids.map((id) => [id, { upvotes: 0, downvotes: 0, myVote: null }]))
  if (!ids.length) return out
  const counts = await pool.query(`SELECT ${fk} AS id, value, COUNT(*) AS n FROM ${table} WHERE ${fk} IN (${placeholders(ids)}) GROUP BY ${fk}, value`, ids)
  for (const r of counts.rows) out.get(r.id)[r.value === 1 ? 'upvotes' : 'downvotes'] = Number(r.n)
  const mine = await pool.query(`SELECT ${fk} AS id, value FROM ${table} WHERE voter_id = $1 AND ${fk} IN (${placeholders(ids, 2)})`, [userId, ...ids])
  for (const r of mine.rows) out.get(r.id).myVote = voteLabel(r.value)
  return out
}

export function parsePage(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  return { page, pageSize: 20 }
}

