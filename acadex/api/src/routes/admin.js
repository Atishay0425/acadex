import { Router } from 'express'
import { z } from 'zod'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { DEFAULT_RULES, RULE_LIMITS } from '../risk.js'
import { loadRiskRules, saveRiskRules } from '../settings.js'
import { riskFor } from '../riskData.js'

const intIn = ([lo, hi]) => z.number().int().min(lo).max(hi)
const rulesBody = z.object(Object.fromEntries(Object.entries(RULE_LIMITS).map(([k, lim]) => [k, intIn(lim)]))).strict()
  .refine((r) => r.medium < r.high, { message: 'The medium cut-off must be lower than the high cut-off' })

export function adminRouter({ pool, cache }) {
  const r = Router()
  r.use(requireRole('admin'))

  // Share of active students who did something in each module during the last N days.
  r.get('/usage', wrap(async (req, res) => {
    const days = z.coerce.number().int().min(1).max(90).default(7).parse(req.query.days)
    return res.json(await cache.cached(`admin:usage:${days}`, 60, () => usage(days)))
  }))

  async function usage(days) {
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const students = new Set((await pool.query("SELECT id FROM users WHERE role = 'student' AND is_active = TRUE")).rows.map((x) => x.id))
    const ids = async (sql) => new Set((await pool.query(sql, [since])).rows.map((x) => x.id).filter((id) => students.has(id)))
    const union = (...sets) => new Set(sets.flatMap((s) => [...s]))
    const modules = [
      ['Doubt Desk', await ids('SELECT student_id AS id FROM doubts WHERE created_at >= $1')],
      ['Smart Notes', await ids('SELECT owner_id AS id FROM notes WHERE updated_at >= $1')],
      ['Study Planner', union(await ids('SELECT student_id AS id FROM exams WHERE created_at >= $1'), await ids('SELECT e.student_id AS id FROM study_topics t JOIN exams e ON e.id = t.exam_id WHERE t.done_at >= $1'))],
      ['Assignments', await ids('SELECT student_id AS id FROM submissions WHERE submitted_at >= $1')],
      ['Community', union(await ids('SELECT author_id AS id FROM posts WHERE created_at >= $1'), await ids('SELECT author_id AS id FROM answers WHERE created_at >= $1'), await ids('SELECT author_id AS id FROM comments WHERE created_at >= $1'))],
      ['Help Center', union(await ids('SELECT student_id AS id FROM tickets WHERE created_at >= $1'), await ids('SELECT author_id AS id FROM ticket_messages WHERE created_at >= $1'))],
      ['Counselling', await ids('SELECT student_id AS id FROM counselling_sessions WHERE created_at >= $1')],
      ['Mentorship', union(await ids('SELECT asker_id AS id FROM mentor_questions WHERE created_at >= $1'), await ids('SELECT mentor_id AS id FROM mentor_questions WHERE answered_at >= $1'))],
      ['Project Hub', union(await ids('SELECT owner_id AS id FROM projects WHERE created_at >= $1'), await ids('SELECT student_id AS id FROM project_requests WHERE created_at >= $1'), await ids('SELECT author_id AS id FROM project_updates WHERE created_at >= $1'))],
      ['Career Guidance', await ids('SELECT user_id AS id FROM career_profiles WHERE updated_at >= $1')],
    ]
    const activeAnywhere = union(...modules.map((m) => m[1]))
    return {
      days, students: students.size, activeStudents: activeAnywhere.size,
      modules: modules.map(([module, set]) => ({ module, users: set.size, pct: students.size ? Math.round((set.size / students.size) * 100) : 0 })).sort((a, b) => b.pct - a.pct || a.module.localeCompare(b.module)),
    }
  }

  r.get('/rules', wrap(async (_req, res) => res.json({ rules: await loadRiskRules(pool), defaults: DEFAULT_RULES, limits: RULE_LIMITS })))

  // Saves the early-warning rules and reports what they would do to today's students, so the effect is visible.
  r.put('/rules', wrap(async (req, res) => {
    const rules = rulesBody.parse(req.body)
    await saveRiskRules(pool, rules, req.user.id)
    await cache.del('risk:overview')
    const dist = { low: 0, medium: 0, high: 0 }
    for (const s of await riskFor(pool)) dist[s.level]++
    res.json({ rules, distribution: dist })
  }))

  return r
}
