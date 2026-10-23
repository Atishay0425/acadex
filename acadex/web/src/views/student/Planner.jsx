'use client'
import { useState } from 'react'
import { CalendarCheck, Plus, CheckCircle2, Circle, Wand2, Trash2, WifiOff, AlertTriangle } from 'lucide-react'
import { PageHeader, Card, Badge, Progress, Modal, Field, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, today } from '../../lib/classes'
import { StudyPlanner as MockStudyPlanner } from './Learn'

const dayLabel = (date, base) => {
  const n = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${base}T00:00:00Z`)) / 86400000)
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export default function Planner() {
  const [toast, node] = useToast()
  const base = today()
  const exams = useRemote(`/planner/exams?today=${base}`)
  const schedule = useRemote(`/planner/schedule?today=${base}&days=7`)
  const courses = useRemote('/courses')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ courseId: '', subject: '', date: '', topics: '' })
  const [newTopic, setNewTopic] = useState({})

  if (exams.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockStudyPlanner /></>

  const list = (exams.data || []).filter((e) => e.daysLeft >= 0)
  const reload = () => { exams.reload(); schedule.reload() }
  const run = async (fn) => { try { await fn(); reload() } catch (e) { toast(errorText(e)) } }

  const addExam = () => run(async () => {
    await api(`/planner/exams?today=${base}`, { method: 'POST', body: { courseId: form.courseId ? Number(form.courseId) : null, subject: form.subject || undefined, date: form.date, topics: form.topics.split('\n').map((t) => t.trim()).filter(Boolean) } })
    setAdding(false); setForm({ courseId: '', subject: '', date: '', topics: '' }); toast('Exam added, schedule updated')
  })
  const toggle = (t) => run(() => api(`/planner/topics/${t.id}`, { method: 'PATCH', body: { done: !t.done } }))
  const addTopic = (e) => run(async () => { await api(`/planner/exams/${e.id}/topics`, { method: 'POST', body: { title: newTopic[e.id] } }); setNewTopic({ ...newTopic, [e.id]: '' }) })
  const removeExam = (e) => { if (confirm(`Remove the ${e.subject} exam and its topics?`)) run(() => api(`/planner/exams/${e.id}`, { method: 'DELETE' })) }
  const risk = new Map((schedule.data?.exams || []).map((s) => [s.examId, s]))
  const planned = (schedule.data?.days || []).filter((d) => d.items.length)

  return (
    <>
      <PageHeader icon={CalendarCheck} title="Study Planner" subtitle="Add exams and topics, get a day-by-day schedule and tick topics off as you go"
        actions={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add exam</button>} />
      {exams.loading ? <Card><Empty text="Loading…" /></Card> : exams.error ? <Card><Empty text={exams.error} /></Card> : !list.length ? <Card><Empty text="No upcoming exams. Add one to get a study schedule." /></Card> : (<>
        <div className="mb-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {list.map((e) => {
            const pct = e.total ? Math.round((e.doneCount / e.total) * 100) : 0
            const rk = risk.get(e.id)
            return (
              <div key={e.id} className="card p-4">
                <div className="flex items-start justify-between gap-2"><p className="font-bold text-primary-dark">{e.subject}</p><Badge tone={e.daysLeft < 10 ? 'red' : 'primary'}>{e.daysLeft === 0 ? 'Today' : `${e.daysLeft} days`}</Badge></div>
                <p className="mb-3 text-xs text-gray-500">Exam on {new Date(`${e.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</p>
                <Progress value={pct} tone="bg-primary" /><p className="mt-1.5 text-xs text-gray-500">{e.total ? `${e.doneCount}/${e.total} topics covered` : 'No topics yet'}</p>
                {rk?.atRisk && <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-secondary"><AlertTriangle size={12} />{rk.daysLeft <= 0 ? 'Exam today' : `${rk.perDay} topics a day needed`}</p>}
              </div>
            )
          })}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Topic tracker" subtitle="Tick topics as you finish them">
            <div className="grid gap-5 sm:grid-cols-2">
              {list.map((e) => (
                <div key={e.id}>
                  <p className="mb-2 flex items-center justify-between text-sm font-bold text-primary">{e.subject}
                    <button className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-secondary" aria-label={`Remove ${e.subject}`} onClick={() => removeExam(e)}><Trash2 size={14} /></button></p>
                  <ul className="space-y-1">
                    {e.topics.map((t) => (
                      <li key={t.id}><button onClick={() => toggle(t)} aria-pressed={t.done} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-primary-50">
                        {t.done ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-gray-300" />}<span className={t.done ? 'text-gray-400 line-through' : ''}>{t.title}</span></button></li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-1.5">
                    <input className="input py-1 text-xs" placeholder="Add a topic" value={newTopic[e.id] || ''} onChange={(ev) => setNewTopic({ ...newTopic, [e.id]: ev.target.value })} onKeyDown={(ev) => ev.key === 'Enter' && (newTopic[e.id] || '').trim().length >= 2 && addTopic(e)} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Auto-generated schedule" subtitle="Next 7 days" action={<Wand2 size={16} className="text-secondary" />}>
            {!planned.length ? <Empty text="Nothing scheduled. Add topics to your exams." /> : (
              <ul className="space-y-4">
                {planned.map((d) => (
                  <li key={d.date}>
                    <Badge tone={d.date === base ? 'red' : 'primary'}>{dayLabel(d.date, base)}</Badge>
                    <ul className="mt-1.5 space-y-1.5">{d.items.map((i) => <li key={i.topicId} className="text-sm"><span className="font-semibold">{i.title}</span> <span className="text-xs text-gray-500">{i.subject}</span></li>)}</ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </>)}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add exam"
        footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={!form.date} onClick={addExam}>Add</button></>}>
        <Field label="Course">
          <select className="input" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            <option value="">Other subject (type below)</option>
            {(courses.data || []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
          </select>
        </Field>
        {!form.courseId && <Field label="Subject"><input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Engineering Maths" /></Field>}
        <Field label="Exam date"><input type="date" className="input" min={base} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Topics (one per line, optional)"><textarea className="input min-h-28" value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} placeholder={'Linear regression\nDecision trees\nClustering'} /></Field>
      </Modal>
      {node}
    </>
  )
}
