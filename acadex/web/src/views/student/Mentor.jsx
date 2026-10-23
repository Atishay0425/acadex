'use client'
import { useState } from 'react'
import { Users, Star, Send, EyeOff, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Avatar, Tabs, Field, Modal, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, ago } from '../../lib/classes'
import { Mentorship as MockMentorship } from './Guidance'

const Stars = ({ value, onPick }) => (
  <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => (
    <button key={n} disabled={!onPick} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onPick?.(n)}><Star size={16} className={n <= (value || 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} /></button>
  ))}</div>
)

export default function Mentor() {
  const [toast, node] = useToast()
  const [tab, setTab] = useState('mentors')
  const [q, setQ] = useState('')
  const mentors = useRemote(`/mentorship/mentors${q ? `?q=${encodeURIComponent(q)}` : ''}`)
  const mine = useRemote('/mentorship/mentors/me')
  const asked = useRemote('/mentorship/questions?box=asked')
  const received = useRemote('/mentorship/questions?box=received')
  const [form, setForm] = useState({ mentorId: '', text: '', anonymous: true })
  const [edit, setEdit] = useState(null)
  const [reply, setReply] = useState({})

  if (mentors.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockMentorship /></>
  const list = mentors.data || []
  const reloadAll = () => { mentors.reload(); mine.reload(); asked.reload(); received.reload() }
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); reloadAll() } catch (e) { toast(errorText(e)) } }
  const pending = (received.data || []).filter((x) => !x.answer).length

  const ask = () => run(async () => { await api('/mentorship/questions', { method: 'POST', body: { mentorId: Number(form.mentorId || list.find((m) => !m.isMe)?.id), text: form.text, anonymous: form.anonymous } }); setForm({ ...form, text: '' }) }, 'Question sent')
  const saveProfile = () => run(async () => { await api('/mentorship/mentors/me', { method: 'PUT', body: { headline: edit.headline, year: edit.year, topics: edit.topics.split(',').map((t) => t.trim()).filter(Boolean), bio: edit.bio } }); setEdit(null) }, 'Mentor profile saved')
  const openEdit = () => setEdit({ headline: mine.data?.headline || '', year: mine.data?.year || '', topics: (mine.data?.topics || []).join(', '), bio: mine.data?.bio || '' })

  return (
    <>
      <PageHeader icon={Users} title="Senior–Junior Mentorship" subtitle="Find a mentor, ask college and career questions anonymously, and rate the answers"
        actions={<button className="btn-ghost" onClick={openEdit}>{mine.data?.isActive ? 'Edit my mentor profile' : 'Become a mentor'}</button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'mentors', label: 'Find a mentor', count: list.length }, { id: 'questions', label: 'My questions', count: asked.data?.length }, ...(mine.data?.isActive ? [{ id: 'inbox', label: 'Questions for me', count: pending || undefined }] : [])]} />

      {tab === 'mentors' && (<>
        <input className="input mb-4" placeholder="Search mentors by name, topic or company…" value={q} onChange={(e) => setQ(e.target.value)} />
        {mentors.loading ? <Empty text="Loading…" /> : !list.length ? <Empty text="No mentors yet. Be the first: use “Become a mentor”." /> : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((m) => (
              <Card key={m.id}>
                <div className="flex gap-3"><Avatar name={m.name} size={46} tone="secondary" />
                  <div className="flex-1"><p className="font-bold text-primary-dark">{m.name} {m.isMe && <Badge>You</Badge>}</p><p className="text-xs text-gray-500">{m.year}{m.department ? ` · ${m.department}` : ''}</p><p className="text-xs font-semibold text-secondary">{m.headline}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">{m.topics.map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</div></div>
                  <div className="text-right"><p className="flex items-center justify-end gap-1 font-bold"><Star size={14} className="fill-amber-400 text-amber-400" />{m.rating ?? '-'}</p><p className="text-xs text-gray-500">{m.answered} answers</p></div></div>
                {m.bio && <p className="mt-3 text-sm text-gray-600">{m.bio}</p>}
                {!m.isMe && <div className="mt-3 border-t border-gray-100 pt-3 text-right"><button className="btn-ghost" onClick={() => { setForm({ ...form, mentorId: String(m.id) }); setTab('questions') }}>Ask a question</button></div>}
              </Card>
            ))}
          </div>
        )}
      </>)}

      {tab === 'questions' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="New question">
            <Field label="Ask"><select className="input" value={form.mentorId || list.find((m) => !m.isMe)?.id || ''} onChange={(e) => setForm({ ...form, mentorId: e.target.value })}>{list.filter((m) => !m.isMe).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
            <Field label="Your question"><textarea className="input min-h-24" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
            <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.anonymous} onChange={(e) => setForm({ ...form, anonymous: e.target.checked })} /> Ask anonymously</label>
            <button className="btn-primary w-full" disabled={!list.some((m) => !m.isMe)} onClick={ask}><Send size={15} /> Send</button>
          </Card>
          <div className="space-y-3 lg:col-span-2">
            {!asked.data?.length ? <Card><Empty text="You have not asked anything yet." /></Card> : asked.data.map((x) => (
              <article key={x.id} className="card p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><span>To {x.mentor.name}</span>{x.anonymous && <Badge><EyeOff size={11} className="mr-1" />Anonymous</Badge>}<span>· {ago(x.createdAt)}</span></div>
                <p className="mt-1 font-semibold">{x.text}</p>
                {x.answer ? (<><p className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm">{x.answer}</p><div className="mt-2 flex items-center gap-2 text-xs text-gray-500">Rate this answer <Stars value={x.rating} onPick={(n) => run(() => api(`/mentorship/questions/${x.id}/rate`, { method: 'POST', body: { rating: n } }), 'Thanks for rating')} /></div></>) : <p className="mt-2 text-xs text-amber-700">Waiting for reply</p>}</article>
            ))}
          </div>
        </div>
      )}

      {tab === 'inbox' && (
        <div className="space-y-3">
          {!received.data?.length ? <Card><Empty text="No questions for you yet." /></Card> : received.data.map((x) => (
            <article key={x.id} className="card p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><span>From {x.asker.name}</span>{x.anonymous && <Badge><EyeOff size={11} className="mr-1" />Anonymous</Badge>}<span>· {ago(x.createdAt)}</span>{x.rating && <span className="flex items-center gap-1"><Star size={11} className="fill-amber-400 text-amber-400" />{x.rating}</span>}</div>
              <p className="mt-1 font-semibold">{x.text}</p>
              <textarea className="input mt-2 min-h-16" placeholder="Write your answer…" value={reply[x.id] ?? x.answer} onChange={(e) => setReply({ ...reply, [x.id]: e.target.value })} />
              <button className="btn-primary mt-2" disabled={(reply[x.id] ?? x.answer).trim().length < 2} onClick={() => run(() => api(`/mentorship/questions/${x.id}/answer`, { method: 'POST', body: { answer: reply[x.id] ?? x.answer } }), x.answer ? 'Answer updated' : 'Answer sent')}>{x.answer ? 'Update answer' : 'Send answer'}</button></article>
          ))}
        </div>
      )}

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Mentor profile"
        footer={<>{mine.data?.isActive && <button className="btn-ghost mr-auto text-secondary" onClick={() => run(async () => { await api('/mentorship/mentors/me', { method: 'DELETE' }); setEdit(null) }, 'You are no longer listed')}>Stop mentoring</button>}<button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" onClick={saveProfile}>Save</button></>}>
        {edit && <>
          <Field label="Headline"><input className="input" value={edit.headline} onChange={(e) => setEdit({ ...edit, headline: e.target.value })} placeholder="e.g. Placed at Microsoft" /></Field>
          <Field label="Year and branch"><input className="input" value={edit.year} onChange={(e) => setEdit({ ...edit, year: e.target.value })} placeholder="Final Year · CSE" /></Field>
          <Field label="Topics you can help with (comma separated, up to 6)"><input className="input" value={edit.topics} onChange={(e) => setEdit({ ...edit, topics: e.target.value })} placeholder="Placements, DSA, Resume" /></Field>
          <Field label="About you"><textarea className="input min-h-20" value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} /></Field>
        </>}
      </Modal>
      {node}
    </>
  )
}
