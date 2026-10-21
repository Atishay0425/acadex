import { ZodError } from 'zod'
import { HttpError } from '../errors.js'

// Async route handlers can throw; Express 4 needs them forwarded to next().
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid input', details: err.flatten().fieldErrors })
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details })
  if (err.code === '23505') return res.status(409).json({ error: 'Already exists' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' })
  console.error(err)
  res.status(500).json({ error: 'Server error' })
}
