import { Router } from 'express'
import { z } from 'zod'
import { HttpError, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { requireRole } from '../middleware/auth.js'
import { PATHS, cleanList, suggest, match, roadmap } from '../careers.js'

const list = z.array(z.string().trim().min(1).max(40)).max(20)
const profileBody = z.object({ interests: list.default([]), skills: list.default([]), cgpa: z.number().min(0).max(10).nullable().optional() })
  .refine((b) => b.interests.length + b.skills.length > 0, 'Add at least one skill or interest')
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
const pub = (p) => ({ id: p.id, title: p.title, skills: p.skills, courses: p.courses, internships: p.internships, projects: p.projects, minCgpa: p.minCgpa })

export function careerRouter({ pool }) {
  const r = Router()
  r.use(requireRole('student'))

  async function profileOf(userId) {
    const p = (await pool.query('SELECT * FROM career_profiles WHERE user_id = $1', [userId])).rows[0]
    return p ? { interests: JSON.parse(p.interests), skills: JSON.parse(p.skills), cgpa: p.cgpa == null ? null : Number(p.cgpa) } : null
  }

  r.get('/paths', wrap(async (_req, res) => res.json(PATHS.map(pub))))
  r.get('/profile', wrap(async (req, res) => res.json(await profileOf(req.user.id))))

  r.put('/profile', wrap(async (req, res) => {
    const b = profileBody.parse(req.body)
    const v = [JSON.stringify(cleanList(b.interests)), JSON.stringify(cleanList(b.skills)), b.cgpa ?? null]
    if ((await pool.query('SELECT 1 FROM career_profiles WHERE user_id = $1', [req.user.id])).rows.length) await pool.query('UPDATE career_profiles SET interests = $2, skills = $3, cgpa = $4, updated_at = now() WHERE user_id = $1', [req.user.id, ...v])
    else await pool.query('INSERT INTO career_profiles (user_id, interests, skills, cgpa) VALUES ($1, $2, $3, $4)', [req.user.id, ...v])
    res.json(await profileOf(req.user.id))
  }))

  r.get('/suggestions', wrap(async (req, res) => {
    const profile = await profileOf(req.user.id)
    if (!profile) throw new HttpError(400, 'Save your skills and interests first')
    res.json({ profile, suggestions: suggest(profile).map((m) => ({ ...pub(m.path), score: m.score, matchedSkills: m.matchedSkills, missingSkills: m.missingSkills, matchedInterests: m.matchedInterests, cgpaOk: m.cgpaOk })) })
  }))

  r.get('/roadmap/:pathId', wrap(async (req, res) => {
    const path = PATHS.find((p) => p.id === req.params.pathId)
    if (!path) throw notFound('Career path not found')
    const profile = await profileOf(req.user.id)
    if (!profile) throw new HttpError(400, 'Save your skills and interests first')
    res.json({ path: pub(path), score: match(profile, path).score, phases: roadmap(profile, path, day.parse(req.query.today)) })
  }))

  return r
}
