'use client'
import { useRef, useState } from 'react'
import { FileText, WifiOff, ExternalLink, Paperclip, X, Download } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Modal, Field, Empty, Tabs, useToast } from '../../components/ui'
import { PreviewButton } from '../../components/FilePreview'
import { api, useRemote, uploadFile, downloadFile } from '../../lib/acadex'
import { errorText, fmtDue, fmtSize } from '../../lib/classes'
import { myAssignments } from '../../data/mock'

const TONE = { pending: 'gray', overdue: 'red', submitted: 'primary', late: 'amber', graded: 'green' }
const LABEL = { pending: 'Not submitted', overdue: 'Overdue', submitted: 'Submitted', late: 'Submitted late', graded: 'Graded' }

export default function StudentAssignments() {
  const [toast, node] = useToast()
  const { data, loading, offline, error, reload } = useRemote('/me/assignments')
  const [tab, setTab] = useState('todo')
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState({ content: '', link: '' })
  const [attached, setAttached] = useState([]) // files already uploaded for this submission
  const [uploading, setUploading] = useState(false)
  const picker = useRef(null)
  const all = offline ? myAssignments : data || []
  const todo = all.filter((a) => a.status === 'pending' || a.status === 'overdue')
  const rows = tab === 'todo' ? todo : all

  const open = (a) => { setSel(a); setForm({ content: a.submission?.content || '', link: a.submission?.link || '' }); setAttached(a.submission?.files || []) }
  const addFiles = async (list) => {
    const room = 3 - attached.length
    if (list.length > room) toast(`You can attach up to 3 files`)
    setUploading(true)
    try { for (const f of [...list].slice(0, Math.max(room, 0))) { if (f.size > 10 * 1024 * 1024) { toast(`${f.name} is over 10 MB`); continue } setAttached((cur) => [...cur, null]); const up = await uploadFile(f).catch((e) => { toast(errorText(e)); return null }); setAttached((cur) => [...cur.filter(Boolean), ...(up ? [up] : [])]) } } finally { setUploading(false) }
  }
  const submit = async () => {
    try {
      const r = await api(`/courses/${sel.course.id}/assignments/${sel.id}/submission`, { method: 'PUT', body: { content: form.content, link: form.link || null, fileIds: attached.filter(Boolean).map((f) => f.id) } })
      toast(r.isLate ? 'Submitted (marked late)' : 'Submitted'); setSel(null); reload()
    } catch (e) { toast(errorText(e)) }
  }
  const locked = sel?.status === 'graded'

  return (
    <>
      <PageHeader icon={FileText} title="Assignments" subtitle="Hand in work, track deadlines and read feedback"
        actions={offline && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'todo', label: 'To do', count: todo.length }, { id: 'all', label: 'All', count: all.length }]} />
      <Card pad={false}>
        {error ? <Empty text={error} /> : loading ? <Empty text="Loading…" /> : !rows.length ? <Empty text={tab === 'todo' ? 'Nothing due. You are all caught up.' : 'No assignments yet.'} /> : (
          <Table rows={rows} onRow={open} columns={[
            { key: 'title', label: 'Assignment', render: (a) => <div><p className="font-semibold">{a.title}</p><p className="text-xs text-gray-500">{a.course.code} · {a.course.title}</p></div> },
            { key: 'dueAt', label: 'Due', render: (a) => fmtDue(a.dueAt) },
            { key: 'status', label: 'Status', render: (a) => <Badge tone={TONE[a.status]}>{LABEL[a.status]}</Badge> },
            { key: 'score', label: 'Score', render: (a) => (a.submission?.score != null ? `${a.submission.score} / ${a.maxMarks}` : `- / ${a.maxMarks}`) },
          ]} />
        )}
      </Card>

      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.title}
        footer={<><button className="btn-ghost" onClick={() => setSel(null)}>Close</button>{!locked && <button className="btn-primary" disabled={offline} onClick={submit}>{sel?.submission ? 'Resubmit' : 'Submit'}</button>}</>}>
        {sel && <>
          <p className="mb-1 text-xs text-gray-500">{sel.course.code} · due {fmtDue(sel.dueAt)} · out of {sel.maxMarks}</p>
          {sel.description && <p className="mb-3 text-sm text-gray-700">{sel.description}</p>}
          {sel.status === 'overdue' && <p className="mb-3 text-xs font-semibold text-secondary">This is past its due date. You can still submit; it will be marked late.</p>}
          {locked ? (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm">
              <p className="font-bold text-emerald-700">Score: {sel.submission.score} / {sel.maxMarks}</p>
              {sel.submission.feedback && <p className="mt-1 text-gray-700">{sel.submission.feedback}</p>}
              <p className="mt-2 text-xs text-gray-500">Graded work can no longer be changed.</p>
              {sel.submission.link && <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary" href={sel.submission.link} target="_blank" rel="noreferrer noopener"><ExternalLink size={12} />Your link</a>}
              {sel.submission.files?.map((f) => <div key={f.id} className="mt-1 flex items-center gap-3"><button className="flex items-center gap-1 text-xs font-semibold text-primary" onClick={() => downloadFile(f.id, f.name).catch((e) => toast(errorText(e)))}><Download size={12} />{f.name}</button><PreviewButton file={f} className="text-xs font-semibold text-primary" /></div>)}
            </div>
          ) : <>
            <Field label="Your answer"><textarea className="input min-h-24" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
            <Field label="Link (repository, document…)"><input className="input" placeholder="https://" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} /></Field>
            <input ref={picker} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.txt,.md,.csv" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            <ul className="mb-2 space-y-1">{attached.filter(Boolean).map((f) => <li key={f.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs"><span className="truncate">{f.name} <span className="text-gray-400">· {fmtSize(f.size)}</span></span><button aria-label={`Remove ${f.name}`} onClick={() => setAttached(attached.filter((x) => x?.id !== f.id))}><X size={13} /></button></li>)}</ul>
            <button className="btn-ghost w-full" disabled={uploading || attached.length >= 3} onClick={() => picker.current.click()}><Paperclip size={15} /> {uploading ? 'Uploading…' : 'Attach files (PDF, images, Word, PowerPoint, up to 3)'}</button>
          </>}
        </>}
      </Modal>
      {node}
    </>
  )
}
