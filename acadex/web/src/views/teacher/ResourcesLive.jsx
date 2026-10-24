'use client'
import { useRef, useState } from 'react'
import { NotebookPen, Plus, Trash2, WifiOff, FileText, Link2, Paperclip, File as FileIcon, Download } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Modal, Field, Empty, useToast } from '../../components/ui'
import { PreviewButton } from '../../components/FilePreview'
import { api, useRemote, uploadFile, downloadFile } from '../../lib/acadex'
import { errorText, ago, fmtSize } from '../../lib/classes'
import { ClassResources as MockResources } from './Teacher'

export default function ResourcesLive() {
  const courses = useRemote('/courses')
  const [courseId, setCourseId] = useState(null)
  if (courses.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockResources /></>
  const list = courses.data || []
  const course = list.find((c) => c.id === courseId) || list[0]
  return (
    <>
      <PageHeader icon={NotebookPen} title="Class Resources" subtitle="Share notes and links with a class. Students can add shared notes to Smart Notes for summaries, questions and a quiz."
        actions={list.length > 1 && <select className="input w-auto" value={course.id} onChange={(e) => setCourseId(Number(e.target.value))}>{list.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>} />
      {courses.loading ? <Card><Empty text="Loading…" /></Card> : !course ? <Card><Empty text="You are not teaching any class yet." /></Card> : <ClassList key={course.id} course={course} />}
    </>
  )
}

function ClassList({ course }) {
  const [toast, node] = useToast()
  const res = useRemote(`/courses/${course.id}/resources`)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ kind: 'note', title: '', content: '', url: '' })
  const [file, setFile] = useState(null) // the chosen file for a "File" share
  const [busy, setBusy] = useState(false)
  const picker = useRef(null)
  const add = async () => {
    setBusy(true)
    try {
      let body = form.kind === 'note' ? { kind: 'note', title: form.title, content: form.content } : { kind: 'link', title: form.title, url: form.url, content: form.content }
      if (form.kind === 'file') { if (!file) throw new Error('Choose a file first'); const up = await uploadFile(file); body = { kind: 'file', title: form.title, fileId: up.id, content: form.content } }
      await api(`/courses/${course.id}/resources`, { method: 'POST', body }); setAdding(false); setFile(null); setForm({ kind: 'note', title: '', content: '', url: '' }); toast('Shared with the class'); res.reload()
    } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
  }
  const remove = async (x) => { if (!confirm(`Remove "${x.title}"? Students keep any copies they already added to Smart Notes.`)) return; try { await api(`/courses/${course.id}/resources/${x.id}`, { method: 'DELETE' }); res.reload() } catch (e) { toast(errorText(e)) } }
  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Share something</button></div>
      <Card pad={false}>
        {res.loading ? <Empty text="Loading…" /> : res.error ? <Empty text={res.error} /> : !res.data.length ? <Empty text="Nothing shared with this class yet." /> : (
          <Table rows={res.data} columns={[
            { key: 'title', label: 'Title', render: (r) => <span className="flex items-center gap-2 font-semibold">{r.kind === 'note' ? <FileText size={16} className="text-primary" /> : r.kind === 'file' ? <FileIcon size={16} className="text-primary" /> : <Link2 size={16} className="text-primary" />}{r.title}</span> },
            { key: 'kind', label: 'Type', render: (r) => (r.kind === 'note' ? 'Notes' : r.kind === 'file' ? <span className="inline-flex items-center gap-3"><button className="inline-flex items-center gap-1 text-primary" onClick={() => downloadFile(r.file.id, r.file.name).catch((e) => toast(errorText(e)))}><Download size={13} />{r.file.name} ({fmtSize(r.file.size)})</button><PreviewButton file={r.file} className="inline-flex items-center gap-1 text-primary" /></span> : 'Link') },
            { key: 'createdAt', label: 'Shared', render: (r) => ago(r.createdAt) },
            { key: 'imports', label: 'Added to Smart Notes', render: (r) => (r.kind === 'note' ? `${r.imports} of ${course.studentCount} students` : '-') },
            { key: 'a', label: '', render: (r) => <button className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label={`Remove ${r.title}`} onClick={() => remove(r)}><Trash2 size={15} /></button> },
          ]} />
        )}
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title={`Share with ${course.code}`}
        footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={add}>{busy ? 'Sharing…' : 'Share'}</button></>}>
        <Field label="Type"><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="note">Notes (text)</option><option value="link">Link</option><option value="file">File (PDF, slides, images, Word)</option></select></Field>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        {form.kind === 'file' && <Field label="File (up to 10 MB)"><input ref={picker} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.txt,.md,.csv" onChange={(e) => { setFile(e.target.files[0] || null); e.target.value = '' }} /><button type="button" className="btn-ghost w-full" onClick={() => picker.current.click()}><Paperclip size={15} /> {file ? `${file.name} (${fmtSize(file.size)})` : 'Choose a file'}</button></Field>}
        {form.kind === 'link' && <Field label="Link"><input className="input" placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></Field>}
        <Field label={form.kind === 'note' ? 'Notes' : 'Short description (optional)'}><textarea className={form.kind === 'note' ? 'input min-h-32' : 'input min-h-16'} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
      </Modal>
      {node}
    </>
  )
}
