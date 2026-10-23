'use client'
import { useState } from 'react'
import { HeartPulse, Plus, Trash2, EyeOff } from 'lucide-react'
import { PageHeader, Card, Badge, Empty, Field, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, fmtSlot, inDays, toIso, SESSION_TONE } from '../../lib/classes'

export default function CounsellorDesk() {
  const [toast, node] = useToast()
  const sessions = useRemote('/counselling/sessions')
  const slots = useRemote('/counselling/slots')
  const [when, setWhen] = useState(inDays(1))
  const [draft, setDraft] = useState({})

  if (sessions.offline) return <Card><Empty text="The counsellor desk needs the API. Start it and sign in again." /></Card>
  const reload = () => { sessions.reload(); slots.reload() }
  const addSlot = async () => { try { await api('/counselling/slots', { method: 'POST', body: { slots: [toIso(when)] } }); toast('Slot added'); reload() } catch (e) { toast(errorText(e)) } }
  const delSlot = async (s) => { try { await api(`/counselling/slots/${s.id}`, { method: 'DELETE' }); reload() } catch (e) { toast(errorText(e)) } }
  const save = async (s, patch) => { try { await api(`/counselling/sessions/${s.id}`, { method: 'PATCH', body: patch }); toast('Saved'); reload() } catch (e) { toast(errorText(e)) } }
  const d = (s) => draft[s.id] || { note: s.note, followUp: s.followUp }

  return (
    <>
      <PageHeader icon={HeartPulse} title="Counselling" subtitle="Your availability and the sessions students have booked with you" />
      {sessions.loading ? <Card><Empty text="Loading…" /></Card> : sessions.error ? <Card><Empty text={sessions.error === 'You are not set up as a counsellor' ? 'You are not set up as a counsellor. Ask an admin to enable it for your account.' : sessions.error} /></Card> : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Sessions" subtitle="Notes are private to you; follow-ups are shown to the student">
            {!sessions.data.length ? <Empty text="No bookings yet." /> : (
              <ul className="space-y-4">
                {sessions.data.map((s) => (
                  <li key={s.id} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{s.student.name} · {fmtSlot(s.startsAt)}</p>
                      <div className="flex gap-1.5">{s.anonymous && <Badge tone="gray"><EyeOff size={12} className="mr-1" />Anonymous</Badge>}<Badge tone={SESSION_TONE[s.status]}>{s.status}</Badge></div>
                    </div>
                    <p className="text-xs text-gray-500">{s.type} · {s.student.email ?? 'identity hidden'}</p>
                    {s.topic && <p className="mt-1 text-sm">{s.topic}</p>}
                    {s.status !== 'cancelled' && (
                      <div className="mt-3 space-y-2">
                        <Field label="Private note"><textarea className="input min-h-16" value={d(s).note} onChange={(e) => setDraft({ ...draft, [s.id]: { ...d(s), note: e.target.value } })} /></Field>
                        <Field label="Follow-up for the student"><input className="input" value={d(s).followUp} onChange={(e) => setDraft({ ...draft, [s.id]: { ...d(s), followUp: e.target.value } })} /></Field>
                        <div className="flex flex-wrap gap-2">
                          <button className="btn-ghost" onClick={() => save(s, { note: d(s).note, followUp: d(s).followUp })}>Save notes</button>
                          {s.status === 'requested' && <button className="btn-primary" onClick={() => save(s, { status: 'confirmed', note: d(s).note, followUp: d(s).followUp })}>Confirm</button>}
                          {s.status === 'confirmed' && <button className="btn-primary" onClick={() => save(s, { status: 'completed', note: d(s).note, followUp: d(s).followUp })}>Mark completed</button>}
                          {(s.status === 'requested' || s.status === 'confirmed') && <button className="btn-ghost text-secondary" onClick={() => save(s, { status: 'cancelled' })}>Cancel</button>}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Your availability" subtitle="Students book these slots">
            <div className="mb-3 flex gap-2"><input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} /><button className="btn-primary" aria-label="Add slot" onClick={addSlot}><Plus size={16} /></button></div>
            {!slots.data?.length ? <Empty text="No upcoming slots." /> : (
              <ul className="space-y-1.5">{slots.data.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-gray-50"><span>{fmtSlot(s.startsAt)} {s.booked && <Badge tone="green">Booked</Badge>}</span>
                  {!s.booked && <button className="rounded p-1 text-gray-400 hover:text-secondary" aria-label="Remove slot" onClick={() => delSlot(s)}><Trash2 size={14} /></button>}</li>
              ))}</ul>
            )}
          </Card>
        </div>
      )}
      {node}
    </>
  )
}
