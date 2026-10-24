'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { api, session } from '../lib/acadex'
import { ago } from '../lib/classes'

const keyToBytes = (b64) => { const pad = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))) }

// Bell with unread count, a list of recent notifications, and per-user email and browser-push switches.
export default function NotificationBell() {
  const router = useRouter()
  const [live, setLive] = useState(false)
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ unread: 0, items: [] })
  const [settings, setSettings] = useState(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => { try { setData(await api('/notifications')) } catch { /* offline or signed out */ } }, [])
  useEffect(() => {
    if (!session.get()) return
    setLive(true); load()
    const t = setInterval(load, 30000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  if (!live) return <button className="relative rounded p-2 hover:bg-white/10" aria-label="Notifications"><Bell size={18} /></button>

  const toggle = async () => { const next = !open; setOpen(next); if (next) { load(); try { setSettings(await api('/notifications/settings')) } catch { /* ignore */ } } }
  const openItem = async (n) => { setOpen(false); if (!n.read) { await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {}); load() } if (n.link) router.push(n.link) }
  const readAll = async () => { await api('/notifications/read-all', { method: 'POST' }).catch(() => {}); load() }
  const setPref = async (patch) => { try { setSettings({ ...settings, ...(await api('/notifications/settings', { method: 'PUT', body: patch })) }) } catch (e) { setNote(e.message) } }

  const enablePush = async () => {
    setNote('')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setNote('This browser does not support push notifications.')
      if (!settings?.vapidPublicKey) return setNote('Browser push is not set up on this server yet.')
      if ((await Notification.requestPermission()) !== 'granted') return setNote('Notifications are blocked in your browser settings.')
      const reg = await navigator.serviceWorker.register('/sw.js')
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(settings.vapidPublicKey) }))
      await api('/notifications/push-subscription', { method: 'POST', body: sub.toJSON() })
      await setPref({ push: true }); setNote('Browser push is on for this device.')
    } catch (e) { setNote(e.message || 'Could not turn on push.') }
  }

  return (
    <div className="relative">
      <button className="relative rounded p-2 hover:bg-white/10" aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`} onClick={toggle}>
        <Bell size={18} />
        {data.unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold text-white">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white text-ink shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2"><p className="text-sm font-bold">Notifications</p>{data.unread > 0 && <button className="text-xs font-semibold text-primary" onClick={readAll}>Mark all read</button>}</div>
          <ul className="max-h-80 overflow-y-auto">
            {!data.items.length && <li className="px-3 py-6 text-center text-sm text-gray-500">Nothing yet.</li>}
            {data.items.map((n) => (
              <li key={n.id}><button onClick={() => openItem(n)} className={`block w-full px-3 py-2 text-left hover:bg-primary-50 ${n.read ? '' : 'bg-primary-50/60'}`}>
                <p className="flex items-start gap-1.5 text-sm font-semibold">{!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary" />}<span>{n.title}</span></p>
                {n.body && <p className="line-clamp-2 text-xs text-gray-500">{n.body}</p>}<p className="text-[11px] text-gray-400">{ago(n.createdAt)}</p>
              </button></li>
            ))}
          </ul>
          {settings && (
            <div className="space-y-1.5 border-t border-gray-100 bg-gray-50 px-3 py-2 text-xs">
              <label className="flex items-center justify-between"><span>Email me{!settings.channels.email && <span className="text-gray-400"> (not set up on this server)</span>}</span><input type="checkbox" checked={settings.email} onChange={(e) => setPref({ email: e.target.checked })} /></label>
              <label className="flex items-center justify-between"><span>Browser push{!settings.channels.push && <span className="text-gray-400"> (not set up on this server)</span>}</span>
                <input type="checkbox" checked={settings.push} onChange={(e) => (e.target.checked ? enablePush() : setPref({ push: false }))} /></label>
              {note && <p className="text-gray-600">{note}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
