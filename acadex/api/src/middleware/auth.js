import jwt from 'jsonwebtoken'
import { HttpError, forbidden } from '../errors.js'

export const authenticate = (config) => (req, _res, next) => {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return next(new HttpError(401, 'Authentication required'))
  try {
    const p = jwt.verify(header.slice(7), config.jwtSecret)
    req.user = { id: Number(p.sub), role: p.role, name: p.name }
    next()
  } catch {
    next(new HttpError(401, 'Invalid or expired token'))
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(forbidden())
