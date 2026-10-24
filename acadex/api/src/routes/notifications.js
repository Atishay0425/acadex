import { Router } from 'express'
import { z } from 'zod'
import { notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'

const id = z.coerce.number().int().positive()
const prefsBody = z.object({ email: z.boolean(), push: z.boolean() }).partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update')
const subBody = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(5).max(100) }) })

export function notificationsRouter({ pool, config, notify }) {
  const r = Router()
  const shape = (n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: n.is_read, createdAt: n.created_at })

  r.get('/', wrap(async (req, res) => {
    const rows = (await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 30', [req.user.id])).rows
    const unread = Number((await pool.query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1 AND is_read = FALSE', [req.user.id])).rows[0].n)
    res.json({ unread, items: rows.map(shape) })
  }))

  r.post('/read-all', wrap(async (req, res) => {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [req.user.id])
    res.status(204).end()
  }))

  r.get('/settings', wrap(async (req, res) => {
    const p = (await pool.query('SELECT email, push FROM notification_prefs WHERE user_id = $1', [req.user.id])).rows[0] ?? { email: true, push: true }
    res.json({ email: p.email, push: p.push, channels: notify.channels, vapidPublicKey: config.vapid?.publicKey || null })
  }))

  r.put('/settings', wrap(async (req, res) => {
    const b = prefsBody.parse(req.body)
    const cur = (await pool.query('SELECT email, push FROM notification_prefs WHERE user_id = $1', [req.user.id])).rows[0]
    const v = { email: b.email ?? cur?.email ?? true, push: b.push ?? cur?.push ?? true }
    if (cur) await pool.query('UPDATE notification_prefs SET email = $2, push = $3 WHERE user_id = $1', [req.user.id, v.email, v.push])
    else await pool.query('INSERT INTO notification_prefs (user_id, email, push) VALUES ($1, $2, $3)', [req.user.id, v.email, v.push])
    res.json(v)
  }))

  r.post('/push-subscription', wrap(async (req, res) => {
    const b = subBody.parse(req.body)
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [b.endpoint]) // a browser re-subscribing replaces itself
    await pool.query('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)', [req.user.id, b.endpoint, b.keys.p256dh, b.keys.auth])
    res.status(201).json({ subscribed: true })
  }))

  r.delete('/push-subscription', wrap(async (req, res) => {
    const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body)
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id])
    res.status(204).end()
  }))

  r.post('/:nid/read', wrap(async (req, res) => {
    const n = (await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *', [id.parse(req.params.nid), req.user.id])).rows[0]
    if (!n) throw notFound('Notification not found')
    res.json(shape(n))
  }))

  return r
}
