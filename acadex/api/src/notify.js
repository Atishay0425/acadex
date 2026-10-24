import nodemailer from 'nodemailer'
import webpush from 'web-push'

// Default delivery channels, built from config. Each is null when its settings are missing, which just
// means that channel is skipped. Tests pass their own fakes.
export function defaultMailer(config) {
  if (!config.smtpUrl) return null
  const transport = nodemailer.createTransport(config.smtpUrl)
  return { send: (to, subject, text) => transport.sendMail({ from: config.mailFrom, to, subject, text }) }
}
export function defaultPusher(config) {
  const v = config.vapid
  if (!v?.publicKey || !v?.privateKey) return null
  webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey)
  return { send: (sub, payload) => webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload)) }
}

// notify(userIds, { kind, title, body, link }) stores an in-app notification for each user (awaited), then
// emails and pushes them without making the request wait. A failing channel never breaks the caller.
export function createNotifier({ pool, config, mailer = defaultMailer(config), pusher = defaultPusher(config) }) {
  const pending = new Set()

  async function deliver(userId, n) {
    const prefs = (await pool.query('SELECT email, push FROM notification_prefs WHERE user_id = $1', [userId])).rows[0] ?? { email: true, push: true }
    const base = config.webUrl ?? ''
    const link = n.link ? `${base}${n.link}` : base
    if (mailer && prefs.email) {
      const u = (await pool.query('SELECT email FROM users WHERE id = $1 AND is_active = TRUE', [userId])).rows[0]
      if (u) await mailer.send(u.email, n.title, `${n.body ? `${n.body}\n\n` : ''}Open Acadex: ${link}`).catch((e) => console.error('mail failed:', e.message))
    }
    if (pusher && prefs.push) {
      for (const sub of (await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId])).rows) {
        await pusher.send(sub, { title: n.title, body: n.body, url: link }).catch(async (e) => {
          if (e.statusCode === 404 || e.statusCode === 410) await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]) // browser dropped it
          else console.error('push failed:', e.message)
        })
      }
    }
  }

  async function notify(userIds, n) {
    const ids = [...new Set(userIds.filter((x) => x != null))]
    if (!ids.length) return
    for (const id of ids) await pool.query('INSERT INTO notifications (user_id, kind, title, body, link) VALUES ($1, $2, $3, $4, $5)', [id, n.kind, n.title.slice(0, 200), (n.body ?? '').slice(0, 500), n.link ?? null])
    for (const id of ids) {
      const p = deliver(id, n).catch((e) => console.error('notify failed:', e.message)).finally(() => pending.delete(p))
      pending.add(p)
    }
  }
  notify.flush = () => Promise.allSettled([...pending])
  notify.channels = { email: Boolean(mailer), push: Boolean(pusher) }
  return notify
}
