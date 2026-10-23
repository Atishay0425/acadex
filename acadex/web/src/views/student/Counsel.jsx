'use client'
import { useState } from 'react'
import { HeartHandshake, CalendarPlus, EyeOff, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Avatar, Modal, Field, Empty, useToast, cx } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, fmtSlot, SESSION_TONE } from '../../lib/classes'
import { Counselling as MockCounselling } from './Guidance'

export default function Counsel() {
  const [toast, node] = useToast()
  const counsellors = useRemote('/counselling/counsellors')
  const sessions = useRemote('/counselling/sessions')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ counsellorId: '', slotId: null, type: 'academic', topic: '', anonymous: false })

  if (sessions.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockCounselling /></>
  const list = counsellors.data || []
  const cn = list.find((c) => c.id === Number(form.counsellorId)) || list[0]
  const reload = () => { counsellors.reload(); sessions.reload() }

  const book = async () => {
    try {
      await api('/counselling/sessions', { method: 'POST', body: { slotId: form.slotId, type: form.type, topic: form.topic, anonymous: form.anonymous } })
      setOpen(false); setForm({ counsellorId: '', slotId: null, type: 'academic', topic: '', anonymous: false }); toast('Session requested'); reload()
    } catch (e) { toast(errorText(e)); reload() }
  }
  const cancel = async (s) => { try { await api(`/counselling/sessions/${s.id}/cancel`, { method: 'POST' }); toast('Session cancelled'); reload() } catch (e) { toast(errorText(e)) } }

  return (
    <>
      <PageHeader icon={HeartHandshake} title="Student Counselling" subtitle="Academic, career and personal support with follow-ups and an anonymous option"
        actions={<button className="btn-primary" disabled={!list.some((c) => c.slots.length)} onClick={() => setOpen(true)}><CalendarPlus size={16} /> Book a session</button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Your sessions">
          {sessions.loading ? <Empty text="Loading…" /> : sessions.error ? <Empty text={sessions.error} /> : !sessions.data.length ? <Empty text="No sessions yet. Book one when you want to talk." /> : (
            <ul className="space-y-3">
              {sessions.data.map((s) => (
                <li key={s.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{s.counsellor.name} · {fmtSlot(s.startsAt)}</p>
                    <div className="flex gap-1.5">{s.anonymous && <Badge tone="gray"><EyeOff size={12} className="mr-1" />Anonymous</Badge>}<Badge tone={SESSION_TONE[s.status]}>{s.status[0].toUpperCase() + s.status.slice(1)}</Badge></div>
                  </div>
                  <p className="text-xs text-gray-500">{s.type[0].toUpperCase() + s.type.slice(1)} counselling</p>
                  {s.topic && <p className="mt-1.5 text-sm">{s.topic}</p>}
                  {s.followUp && <div className="mt-2 rounded bg-primary-50 p-2 text-xs"><b className="text-primary">Follow-up:</b> {s.followUp}</div>}
                  {(s.status === 'requested' || s.status === 'confirmed') && <button className="mt-2 text-xs font-semibold text-gray-500 hover:text-secondary" onClick={() => cancel(s)}>Cancel session</button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Counsellors">
          {counsellors.loading ? <Empty text="Loading…" /> : !list.length ? <Empty text="No counsellors are available yet." /> : (
            <ul className="space-y-4">{list.map((c) => <li key={c.id} className="flex gap-3"><Avatar name={c.name} /><div><p className="font-semibold">{c.name}</p><p className="text-xs text-gray-500">{c.department}</p><p className="mt-1 text-xs">{c.slots.length ? `Next: ${c.slots.slice(0, 2).map((x) => fmtSlot(x.startsAt)).join(' · ')}` : 'No free slots right now'}</p></div></li>)}</ul>
          )}
        </Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Book a counselling session"
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={!form.slotId} onClick={book}>Request session</button></>}>
        <Field label="Counsellor"><select className="input" value={cn?.id ?? ''} onChange={(e) => setForm({ ...form, counsellorId: e.target.value, slotId: null })}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Slot"><div className="flex flex-wrap gap-2">{(cn?.slots || []).map((s) => <button key={s.id} onClick={() => setForm({ ...form, slotId: s.id })} className={cx('rounded-lg border px-3 py-1.5 text-sm font-semibold', form.slotId === s.id ? 'border-primary bg-primary-50 text-primary' : 'border-gray-200')}>{fmtSlot(s.startsAt)}</button>)}</div></Field>
        <Field label="Type"><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="academic">Academic</option><option value="career">Career</option><option value="personal">Personal</option></select></Field>
        <Field label="What would you like to discuss?"><textarea className="input min-h-20" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} /> Keep my name hidden from the counsellor</label>
      </Modal>
      {node}
    </>
  )
}
