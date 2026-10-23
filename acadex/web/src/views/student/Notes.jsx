'use client'
import { useRef, useState } from 'react'
import { NotebookPen, Sparkles, FileText, Plus, Send, Trash2, WifiOff, Upload } from 'lucide-react'
import { PageHeader, Card, Badge, Modal, Field, Tabs, Empty, useToast, cx } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText } from '../../lib/classes'
import { SmartNotes as MockSmartNotes } from './Learn'

const MAX_CHARS = 60000

export default function Notes() {
  const [toast, node] = useToast()
  const list = useRemote('/notes')
  const courses = useRemote('/courses')
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', courseId: '' })
  const file = useRef(null)

  if (list.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockSmartNotes /></>

  const notes = list.data || []
  const current = notes.find((n) => n.id === sel) || notes[0]

  const readFile = async (f) => {
    if (!f) return
    if (f.size > 200 * 1024) return toast('Files must be 200 KB or smaller (text or markdown)')
    const text = await f.text()
    setForm((x) => ({ ...x, content: text.slice(0, MAX_CHARS), title: x.title || f.name.replace(/\.[^.]+$/, '') }))
  }
  const save = async () => {
    try {
      const n = await api('/notes', { method: 'POST', body: { title: form.title, content: form.content, courseId: form.courseId ? Number(form.courseId) : null } })
      setAdding(false); setForm({ title: '', content: '', courseId: '' }); setSel(n.id); toast('Saved and summarised'); list.reload()
    } catch (e) { toast(errorText(e)) }
  }
  const remove = async (n) => {
    if (!confirm(`Delete "${n.title}"?`)) return
    try { await api(`/notes/${n.id}`, { method: 'DELETE' }); setSel(null); toast('Note deleted'); list.reload() } catch (e) { toast(errorText(e)) }
  }

  return (
    <>
      <PageHeader icon={NotebookPen} title="Smart Notes" subtitle="Paste or upload your notes and get a summary, practice questions, MCQs and answers from your own content"
        actions={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add notes</button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Your notes" pad={false}>
          {list.loading ? <Empty text="Loading…" /> : list.error ? <Empty text={list.error} /> : !notes.length ? <Empty text="No notes yet. Add your first one." /> : (
            <ul className="divide-y divide-gray-100">
              {notes.map((n) => (
                <li key={n.id} className={cx('flex items-start gap-1 hover:bg-primary-50', current?.id === n.id && 'bg-primary-50')}>
                  <button onClick={() => setSel(n.id)} className="flex flex-1 items-start gap-3 px-5 py-3 text-left">
                    <FileText size={18} className="mt-0.5 shrink-0 text-primary" />
                    <span><span className="block text-sm font-semibold">{n.title}</span><span className="text-xs text-gray-500">{n.course?.code ?? 'General'} · {n.words} words</span></span>
                  </button>
                  <button className="mr-3 mt-3 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-secondary" aria-label={`Delete ${n.title}`} onClick={() => remove(n)}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="lg:col-span-2">
          {current ? <NoteTools key={current.id} note={current} toast={toast} /> : <Card><Empty text="Select a note to see its summary, questions and quiz." /></Card>}
        </div>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add notes"
        footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" onClick={save}>Save and summarise</button></>}>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ML Unit 3: Decision trees" /></Field>
        <Field label="Course (optional)">
          <select className="input" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            <option value="">General</option>
            {(courses.data || []).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
          </select>
        </Field>
        <Field label={`Notes (${form.content.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()} characters)`}>
          <textarea className="input min-h-40" value={form.content} maxLength={MAX_CHARS} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Paste your notes here, at least a few sentences." />
        </Field>
        <input ref={file} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(e) => { readFile(e.target.files[0]); e.target.value = '' }} />
        <button className="btn-ghost w-full" onClick={() => file.current.click()}><Upload size={15} /> Load a .txt or .md file</button>
      </Modal>
      {node}
    </>
  )
}

function NoteTools({ note, toast }) {
  const detail = useRemote(`/notes/${note.id}`)
  const [tab, setTab] = useState('summary')
  const [picked, setPicked] = useState({})
  const [chat, setChat] = useState([{ from: 'bot', text: 'Ask me anything from this note. I answer only from your own content.' }])
  const [msg, setMsg] = useState('')
  const d = detail.data

  const send = async () => {
    const question = msg.trim()
    if (question.length < 3) return
    setChat((c) => [...c, { from: 'me', text: question }]); setMsg('')
    try {
      const r = await api('/notes/ask', { method: 'POST', body: { question, noteId: note.id } })
      setChat((c) => [...c, { from: 'bot', text: r.answer ? `From “${note.title}”: ${r.answer}` : 'I could not find that in this note. Try different words.' }])
    } catch (e) { toast(errorText(e)) }
  }

  if (detail.loading || !d) return <Card><Empty text="Loading…" /></Card>
  return (
    <>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'summary', label: 'Summary' }, { id: 'questions', label: 'Important questions' }, { id: 'mcq', label: 'MCQs', count: d.mcqs.length }, { id: 'ask', label: 'Ask from notes' }]} />
      <Card>
        {tab === 'summary' && (<>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-secondary"><Sparkles size={14} /> Key sentences from {d.title}</p>
          <p className="leading-relaxed">{d.summary || 'Add a little more text to get a summary.'}</p>
          {d.keyTerms.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{d.keyTerms.map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</div>}
        </>)}
        {tab === 'questions' && (d.questions.length ? <ol className="list-decimal space-y-2 pl-5">{d.questions.map((x) => <li key={x}>{x}</li>)}</ol> : <Empty text="Not enough text to suggest questions." />)}
        {tab === 'mcq' && (d.mcqs.length ? d.mcqs.map((m, i) => (
          <div key={i} className="mb-4">
            <p className="mb-2 font-semibold">{i + 1}. {m.q}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {m.options.map((o, j) => {
                const p = picked[i]
                const state = p == null ? '' : j === m.answer ? 'border-emerald-500 bg-emerald-50' : j === p ? 'border-secondary bg-secondary-50' : ''
                return <button key={o} onClick={() => p == null && setPicked({ ...picked, [i]: j })} className={cx('rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50', state)}>{o}</button>
              })}
            </div>
          </div>
        )) : <Empty text="This note needs more repeated key terms to build a quiz." />)}
        {tab === 'ask' && (<>
          <div className="mb-3 max-h-72 space-y-2 overflow-y-auto">
            {chat.map((c, i) => <div key={i} className={cx('max-w-[85%] rounded-xl px-3 py-2 text-sm', c.from === 'me' ? 'ml-auto bg-primary text-white' : 'bg-gray-100')}>{c.text}</div>)}
          </div>
          <div className="flex gap-2"><input className="input" value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask from your own notes…" /><button className="btn-primary" onClick={send} aria-label="Send"><Send size={15} /></button></div>
        </>)}
      </Card>
    </>
  )
}
