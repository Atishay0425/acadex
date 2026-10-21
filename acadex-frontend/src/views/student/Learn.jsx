'use client'
import { useState } from 'react'
import { MessageCircleQuestion, NotebookPen, CalendarCheck, ThumbsUp, Search, Plus, CheckCircle2, FileText, Upload, Sparkles, Send, Circle, Wand2 } from 'lucide-react'
import { PageHeader, Card, Badge, Modal, Field, Tabs, Progress, Empty, useToast, cx } from '../../components/ui'
import { doubts as seedDoubts, subjects, notes as seedNotes, planner } from '../../data/mock'

/* ---------------------------------------------------------------- Faculty Doubt Desk */
export function DoubtDesk() {
  const [list, setList] = useState(seedDoubts)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ teacher: subjects[0].faculty, title: '', body: '' })
  const [toast, node] = useToast()

  const shown = list.filter((d) => (tab === 'all' || (tab === 'solved' ? d.solved : !d.solved)) && (d.title + d.subject).toLowerCase().includes(q.toLowerCase()))
  const upvote = (id) => setList(list.map((d) => d.id === id ? { ...d, upvotes: d.upvotes + 1 } : d))
  const submit = () => {
    if (!form.title.trim()) return
    const s = subjects.find((x) => x.faculty === form.teacher)
    setList([{ id: Date.now(), student: 'Aarav Sharma', teacher: form.teacher, subject: s.name, title: form.title, body: form.body, upvotes: 0, solved: false, answer: '', replies: 0, when: 'Just now' }, ...list])
    setForm({ teacher: subjects[0].faculty, title: '', body: '' }); setOpen(false); toast('Doubt sent to ' + form.teacher)
  }
  // Similar past doubts shown while typing (search past solutions)
  const similar = form.title.length > 6 ? list.filter((d) => d.solved && d.title.toLowerCase().split(' ').some((w) => w.length > 4 && form.title.toLowerCase().includes(w))).slice(0, 2) : []

  return (
    <>
      <PageHeader icon={MessageCircleQuestion} title="Faculty Doubt Desk" subtitle="Ask a specific teacher, upvote common doubts and search past solutions"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Ask a doubt</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input className="input pl-9" placeholder="Search past solutions…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All', count: list.length }, { id: 'open', label: 'Unsolved', count: list.filter((d) => !d.solved).length }, { id: 'solved', label: 'Solved', count: list.filter((d) => d.solved).length }]} />
      <div className="space-y-3">
        {shown.length === 0 && <Empty text="No doubts match." />}
        {shown.map((d) => (
          <article key={d.id} className="card flex gap-4 p-4">
            <button onClick={() => upvote(d.id)} className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-gray-200 text-primary hover:bg-primary-50">
              <ThumbsUp size={16} /><span className="mt-0.5 text-sm font-bold">{d.upvotes}</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-primary-dark">{d.title}</h3>
                {d.solved ? <Badge tone="green">Solved</Badge> : <Badge tone="amber">Awaiting reply</Badge>}
              </div>
              <p className="mt-1 text-sm text-gray-600">{d.body}</p>
              {d.answer && (
                <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm">
                  <p className="mb-0.5 flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Answer by {d.teacher}</p>{d.answer}
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500">{d.subject} · to {d.teacher} · by {d.student} · {d.when} · {d.replies} replies</p>
            </div>
          </article>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Ask a doubt"
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={submit}><Send size={15} /> Send to teacher</button></>}>
        <Field label="Ask this teacher">
          <select className="input" value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })}>
            {subjects.map((s) => <option key={s.code} value={s.faculty}>{s.faculty} · {s.name}</option>)}
          </select>
        </Field>
        <Field label="Doubt title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Why does gain ratio fix ID3 bias?" /></Field>
        {similar.length > 0 && (
          <div className="mb-3 rounded-lg bg-primary-50 p-3 text-xs">
            <p className="mb-1 font-bold text-primary">Already solved, check before asking:</p>
            {similar.map((s) => <p key={s.id}>• {s.title}</p>)}
          </div>
        )}
        <Field label="Details"><textarea className="input min-h-24" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Add context, a screenshot or a photo of the question (OCR supported)" /></Field>
        <button className="btn-ghost w-full"><Upload size={15} /> Attach image of the question</button>
      </Modal>
      {node}
    </>
  )
}

/* ---------------------------------------------------------------- Smart Notes */
export function SmartNotes() {
  const [list, setList] = useState(seedNotes)
  const [sel, setSel] = useState(seedNotes[0].id)
  const [tab, setTab] = useState('summary')
  const [chat, setChat] = useState([{ from: 'ai', text: 'Ask me anything from this note. I will answer only from your uploaded content.' }])
  const [msg, setMsg] = useState('')
  const [picked, setPicked] = useState({})
  const [toast, node] = useToast()
  const note = list.find((n) => n.id === sel)

  const upload = () => {
    const n = { id: Date.now(), name: 'CN_Unit4_Routing.pdf', subject: 'Computer Networks', pages: 28, added: 'Today', summary: 'Routing algorithms find paths through a network. Distance-vector (RIP) shares tables with neighbours; link-state (OSPF) floods topology and runs Dijkstra. BGP exchanges reachability between autonomous systems.', questions: ['Compare distance-vector and link-state routing.', 'What is the count-to-infinity problem?'], mcqs: [{ q: 'OSPF is a…', options: ['Distance-vector protocol', 'Link-state protocol', 'Path-vector protocol', 'Static protocol'], answer: 1 }] }
    setList([n, ...list]); setSel(n.id); setTab('summary'); toast('Uploaded and summarised')
  }
  const send = () => {
    if (!msg.trim()) return
    setChat([...chat, { from: 'me', text: msg }, { from: 'ai', text: `From “${note.name}”: ${note.summary.split('. ')[0]}. (Answer generated from your note using vector search.)` }]); setMsg('')
  }

  return (
    <>
      <PageHeader icon={NotebookPen} title="Smart Notes" subtitle="Upload PDFs or photos of notes and get summaries, important questions, MCQs and Q&A"
        actions={<button className="btn-primary" onClick={upload}><Upload size={16} /> Upload notes</button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Your notes" pad={false}>
          <ul className="divide-y divide-gray-100">
            {list.map((n) => (
              <li key={n.id}>
                <button onClick={() => { setSel(n.id); setPicked({}) }} className={cx('flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-primary-50', sel === n.id && 'bg-primary-50')}>
                  <FileText size={18} className="mt-0.5 text-primary" />
                  <span><span className="block text-sm font-semibold">{n.name}</span><span className="text-xs text-gray-500">{n.subject} · {n.pages} pages · {n.added}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="lg:col-span-2">
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'summary', label: 'Auto summary' }, { id: 'questions', label: 'Important questions' }, { id: 'mcq', label: 'MCQs' }, { id: 'ask', label: 'Ask from notes' }]} />
          <Card>
            {tab === 'summary' && (<><p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-secondary"><Sparkles size={14} /> AI summary of {note.name}</p><p className="leading-relaxed">{note.summary}</p></>)}
            {tab === 'questions' && <ol className="list-decimal space-y-2 pl-5">{note.questions.map((x) => <li key={x}>{x}</li>)}</ol>}
            {tab === 'mcq' && note.mcqs.map((m, i) => (
              <div key={i} className="mb-4">
                <p className="mb-2 font-semibold">{i + 1}. {m.q}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {m.options.map((o, j) => {
                    const p = picked[i]
                    const state = p == null ? '' : j === m.answer ? 'border-emerald-500 bg-emerald-50' : j === p ? 'border-secondary bg-secondary-50' : ''
                    return <button key={o} onClick={() => setPicked({ ...picked, [i]: j })} className={cx('rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50', state)}>{o}</button>
                  })}
                </div>
              </div>
            ))}
            {tab === 'ask' && (
              <>
                <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
                  {chat.map((c, i) => <div key={i} className={cx('max-w-[85%] rounded-xl px-3 py-2 text-sm', c.from === 'me' ? 'ml-auto bg-primary text-white' : 'bg-gray-100')}>{c.text}</div>)}
                </div>
                <div className="flex gap-2"><input className="input" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask from your own notes…" /><button className="btn-primary" onClick={send}><Send size={15} /></button></div>
              </>
            )}
          </Card>
        </div>
      </div>
      {node}
    </>
  )
}

/* ---------------------------------------------------------------- Study Planner */
export function StudyPlanner() {
  const [exams, setExams] = useState(planner.exams)
  const [done, setDone] = useState({ 'Machine Learning': ['Linear regression', 'Logistic regression', 'Decision trees'], 'Compiler Design': ['Lexical analysis'], 'Cloud Computing': [] })
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ subject: 'Computer Networks', date: '' })
  const [toast, node] = useToast()
  const toggle = (s, t) => setDone({ ...done, [s]: (done[s] || []).includes(t) ? done[s].filter((x) => x !== t) : [...(done[s] || []), t] })
  const days = (d) => Math.max(0, Math.ceil((new Date(d) - new Date('2026-10-13')) / 864e5))

  // naive auto-generated schedule: spread remaining topics over the days left
  const schedule = Object.entries(planner.topics).flatMap(([s, topics]) => {
    const e = exams.find((x) => x.subject === s); if (!e) return []
    const rem = topics.filter((t) => !(done[s] || []).includes(t))
    return rem.slice(0, 2).map((t, i) => ({ subject: s, topic: t, day: i === 0 ? 'Today' : 'Tomorrow', date: e.date }))
  })

  return (
    <>
      <PageHeader icon={CalendarCheck} title="Study Planner" subtitle="Add exams and subjects, get an auto-generated schedule and track completed topics"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Add exam</button>} />
      <div className="mb-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {exams.map((e) => {
          const total = planner.topics[e.subject]?.length ?? e.topics
          const d = (done[e.subject] || []).length
          const pct = planner.topics[e.subject] ? Math.round((d / total) * 100) : Math.round((e.done / e.topics) * 100)
          return (
            <div key={e.id} className="card p-4">
              <div className="flex items-start justify-between"><p className="font-bold text-primary-dark">{e.subject}</p><Badge tone={days(e.date) < 10 ? 'red' : 'primary'}>{days(e.date)} days</Badge></div>
              <p className="mb-3 text-xs text-gray-500">Exam on {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              <Progress value={pct} tone="bg-primary" /><p className="mt-1.5 text-xs text-gray-500">{pct}% topics covered</p>
            </div>
          )
        })}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Topic tracker" subtitle="Tick topics as you finish them">
          <div className="grid gap-5 sm:grid-cols-2">
            {Object.entries(planner.topics).map(([s, topics]) => (
              <div key={s}>
                <p className="mb-2 text-sm font-bold text-primary">{s}</p>
                <ul className="space-y-1">
                  {topics.map((t) => {
                    const on = (done[s] || []).includes(t)
                    return (
                      <li key={t}><button onClick={() => toggle(s, t)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-primary-50">
                        {on ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-gray-300" />}<span className={on ? 'text-gray-400 line-through' : ''}>{t}</span></button></li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Auto-generated schedule" action={<Wand2 size={16} className="text-secondary" />}>
          <ul className="space-y-3">
            {schedule.map((s, i) => (
              <li key={i} className="flex gap-3"><Badge tone={s.day === 'Today' ? 'red' : 'primary'}>{s.day}</Badge><div><p className="text-sm font-semibold">{s.topic}</p><p className="text-xs text-gray-500">{s.subject}</p></div></li>
            ))}
          </ul>
        </Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add exam"
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={() => { if (!form.date) return; setExams([...exams, { id: Date.now(), subject: form.subject, date: form.date, topics: 8, done: 0 }]); setOpen(false); toast('Exam added, schedule updated') }}>Add</button></>}>
        <Field label="Subject"><select className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>{subjects.map((s) => <option key={s.code}>{s.name}</option>)}</select></Field>
        <Field label="Exam date"><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      </Modal>
      {node}
    </>
  )
}
