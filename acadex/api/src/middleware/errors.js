import { ZodError } from 'zod'
import { HttpError } from '../errors.js'

// Async route handlers can throw; Express 4 needs them forwarded to next().
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) { const flat = err.flatten(); return res.status(400).json({ error: flat.formErrors[0] ?? 'Invalid input', details: flat.fieldErrors }) }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details })
  if (err.code === '23505') return res.status(409).json({ error: 'Already exists' })
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too large to send. Use a smaller file or shorter text.' })
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' })
  console.error(err)
  res.status(500).json({ error: 'Server error' })
}
