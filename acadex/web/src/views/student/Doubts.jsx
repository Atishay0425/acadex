'use client'
import { useEffect, useRef, useState } from 'react'
import { MessageCircleQuestion, ThumbsUp, Search, Plus, CheckCircle2, Send, WifiOff, Trash2, Camera } from 'lucide-react'
import { PageHeader, Card, Badge, Modal, Field, Tabs, Empty, useToast } from '../../components/ui'
import { api, upload, useRemote } from '../../lib/acadex'
import { errorText } from '../../lib/classes'
import { DoubtDesk as MockDoubtDesk } from './Learn'

const useDebounced = (v, ms = 250) => {
  const [x, setX] = useState(v)
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t) }, [v, ms])
  return x
}
const ago = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

export default function Doubts() {
  const [toast, node] = useToast()
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const search = useDebounced(q)
  const qs = new URLSearchParams({ ...(tab !== 'all' && { status: tab }), ...(search && { search }) }).toString()
  const doubts = useRemote(`/doubts${qs ? `?${qs}` : ''}`)
  const counts = useRemote('/doubts')
  const courses = useRemote('/courses')
  const [asking, setAsking] = useState(false)
  const [form, setForm] = useState({ courseId: '', title: '', body: '' })
  const photo = useRef(null)
  const [reading, setReading] = useState(false)
  const [ocrNote, setOcrNote] = useState(null)
  const title = useDebounced(form.title, 400)
  const similar = useRemote(`/doubts/similar?title=${encodeURIComponent(asking ? title : '')}`)

  if (doubts.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockDoubtDesk /></>

  const all = counts.data || []
  const list = doubts.data || []
  const enrolled = courses.data || []
  const reloadAll = () => { doubts.reload(); counts.reload() }

  const upvote = async (d) => {
    try { await api(`/doubts/${d.id}/upvote`, { method: 'POST' }); reloadAll() } catch (e) { toast(errorText(e)) }
  }
  // Reads a photo of the question and puts the text into the form for the student to check and edit.
  const readPhoto = async (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast('Photos must be 5 MB or smaller')
    setReading(true); setOcrNote(null)
    try {
      const r = await upload('/doubts/ocr', file)
      setForm((f) => ({ ...f, title: f.title || r.text.split('\n').find(Boolean).slice(0, 200), body: r.text }))
      setOcrNote(r.lowConfidence ? 'The photo was hard to read. Please check every word.' : `Read from your photo (${r.confidence}% sure). Check it before sending.`)
    } catch (e) { toast(errorText(e)) } finally { setReading(false) }
  }
  const submit = async () => {
    try {
      const d = await api('/doubts', { method: 'POST', body: { courseId: Number(form.courseId || enrolled[0]?.id), title: form.title, body: form.body } })
      setAsking(false); setOcrNote(null); setForm({ courseId: '', title: '', body: '' }); toast(`Doubt sent to ${d.teacher.name}`); reloadAll()
    } catch (e) { toast(errorText(e)) }
  }
  const withdraw = async (d) => {
    if (!confirm('Withdraw this doubt?')) return
    try { await api(`/doubts/${d.id}`, { method: 'DELETE' }); toast('Doubt withdrawn'); reloadAll() } catch (e) { toast(errorText(e)) }
  }

  return (
    <>
      <PageHeader icon={MessageCircleQuestion} title="Faculty Doubt Desk" subtitle="Ask your course teacher, upvote common doubts and search past solutions"
        actions={<button className="btn-primary" disabled={!enrolled.length} onClick={() => setAsking(true)}><Plus size={16} /> Ask a doubt</button>} />
      <div className="relative mb-4 min-w-[240px]">
        <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
        <input className="input pl-9" placeholder="Search doubts and answers…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All', count: all.length }, { id: 'open', label: 'Unsolved', count: all.filter((d) => !d.solved).length }, { id: 'solved', label: 'Solved', count: all.filter((d) => d.solved).length }]} />
      <div className="space-y-3">
        {doubts.loading ? <Empty text="Loading…" /> : doubts.error ? <Empty text={doubts.error} /> : !list.length ? <Empty text={enrolled.length ? 'No doubts match. Be the first to ask.' : 'Enrol in a course to ask and read doubts.'} /> : list.map((d) => (
          <article key={d.id} className="card flex gap-4 p-4">
            <button onClick={() => upvote(d)} disabled={d.isMine} aria-pressed={d.myUpvote} aria-label="I have the same doubt"
              className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border text-primary hover:bg-primary-50 disabled:cursor-default disabled:hover:bg-transparent ${d.myUpvote ? 'border-primary bg-primary-50' : 'border-gray-200'}`}>
              <ThumbsUp size={16} /><span className="mt-0.5 text-sm font-bold">{d.upvotes}</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-primary-dark">{d.title}</h3>
                {d.solved ? <Badge tone="green">Solved</Badge> : <Badge tone="amber">Awaiting reply</Badge>}
              </div>
              {d.body && <p className="mt-1 text-sm text-gray-600">{d.body}</p>}
              {d.answer && (
                <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">
                  <p className="mb-0.5 flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Answer by {d.teacher?.name}</p>{d.answer}
                </div>
              )}
              <p className="mt-2 flex flex-wrap items-center gap-x-1 text-xs text-gray-500">
                {d.course.code} · to {d.teacher?.name ?? 'unassigned'} · by {d.isMine ? 'you' : d.student.name} · {ago(d.createdAt)}
                {d.isMine && !d.solved && <button className="ml-2 inline-flex items-center gap-1 font-semibold hover:text-secondary" onClick={() => withdraw(d)}><Trash2 size={12} />Withdraw</button>}
              </p>
            </div>
          </article>
        ))}
      </div>

      <Modal open={asking} onClose={() => setAsking(false)} title="Ask a doubt"
        footer={<><button className="btn-ghost" onClick={() => setAsking(false)}>Cancel</button><button className="btn-primary" onClick={submit}><Send size={15} /> Send to teacher</button></>}>
        <Field label="Ask the teacher of">
          <select className="input" value={form.courseId || enrolled[0]?.id || ''} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            {enrolled.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}{c.teacher ? ` (${c.teacher.name})` : ' (no teacher yet)'}</option>)}
          </select>
        </Field>
        <Field label="Doubt title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Why does gain ratio fix ID3 bias?" /></Field>
        {similar.data?.length > 0 && (
          <div className="mb-3 rounded-lg bg-primary-50 p-3 text-xs">
            <p className="mb-1 font-bold text-primary">Already solved, check before asking:</p>
            {similar.data.map((s) => <p key={s.id}>• {s.title}</p>)}
          </div>
        )}
        <Field label="Details"><textarea className="input min-h-24" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Add context so the teacher can answer in one go" /></Field>
        <input ref={photo} type="file" accept="image/png,image/jpeg,image/webp,image/bmp" className="hidden" onChange={(e) => { readPhoto(e.target.files[0]); e.target.value = '' }} />
        <button className="btn-ghost w-full" disabled={reading} onClick={() => photo.current.click()}><Camera size={15} /> {reading ? 'Reading the photo…' : 'Attach a photo of the question'}</button>
        {ocrNote && <p className="mt-2 text-xs font-semibold text-primary">{ocrNote}</p>}
      </Modal>
      {node}
    </>
  )
}
