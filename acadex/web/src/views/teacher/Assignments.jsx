'use client'
import { useEffect, useState } from 'react'
import { FileText, WifiOff, Plus, Trash2, ExternalLink, Download } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Modal, Field, Empty, useToast, cx } from '../../components/ui'
import { PreviewButton } from '../../components/FilePreview'
import { api, useRemote, downloadFile } from '../../lib/acadex'
import { errorText, fmtDue, inDays, toIso, fmtSize } from '../../lib/classes'

const TONE = { pending: 'gray', overdue: 'red', submitted: 'primary', late: 'amber', graded: 'green' }
const LABEL = { pending: 'Not submitted', overdue: 'Missing', submitted: 'Submitted', late: 'Late', graded: 'Graded' }

export default function TeacherAssignments() {
  const courses = useRemote('/courses')
  const [courseId, setCourseId] = useState(null)
  const list = courses.data || []
  const course = list.find((c) => c.id === courseId) || list[0]
  return (
    <>
      <PageHeader icon={FileText} title="Assignments" subtitle="Set work, see who has handed in, and grade it"
        actions={<>
          {courses.offline && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>}
          {list.length > 1 && (
            <select aria-label="Class" className="input w-auto" value={course?.id} onChange={(e) => setCourseId(Number(e.target.value))}>
              {list.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
            </select>
          )}
        </>} />
      {courses.offline ? <Card><Empty text="Assignments need the API. Start it and sign in again." /></Card>
        : courses.loading ? <Card><Empty text="Loading…" /></Card>
        : !course ? <Card><Empty text="You are not teaching any class yet. Create one under My Classes." /></Card>
        : <ClassAssignments key={course.id} course={course} />}
    </>
  )
}

function ClassAssignments({ course }) {
  const [toast, node] = useToast()
  const assignments = useRemote(`/courses/${course.id}/assignments`)
  const [sel, setSel] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', dueAt: inDays(7), maxMarks: '' })
  const list = assignments.data || []
  const current = list.find((a) => a.id === sel) || list[0]

  const create = async () => {
    try {
      const a = await api(`/courses/${course.id}/assignments`, { method: 'POST', body: { title: form.title, description: form.description, dueAt: toIso(form.dueAt), maxMarks: Number(form.maxMarks) } })
      setCreating(false); setForm({ title: '', description: '', dueAt: inDays(7), maxMarks: '' }); setSel(a.id); toast('Assignment created'); assignments.reload()
    } catch (e) { toast(errorText(e)) }
  }
  const remove = async (a) => {
    if (!confirm(`Delete "${a.title}" and all its submissions?`)) return
    try { await api(`/courses/${course.id}/assignments/${a.id}`, { method: 'DELETE' }); setSel(null); toast('Assignment deleted'); assignments.reload() } catch (e) { toast(errorText(e)) }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-2" title="Assignments" subtitle={course.code} action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />New</button>} pad={false}>
        {assignments.loading ? <Empty text="Loading…" /> : !list.length ? <Empty text="No assignments yet. Create the first one." /> : (
          <Table rows={list} onRow={(a) => setSel(a.id)} columns={[
            { key: 'title', label: 'Assignment', render: (a) => <div className={cx(a.id === current?.id && 'text-primary')}><p className="font-semibold">{a.title}</p><p className="text-xs text-gray-500">Due {fmtDue(a.dueAt)} · out of {a.maxMarks}</p></div> },
            { key: 'submitted', label: 'In', render: (a) => `${a.submitted}/${course.studentCount}` },
            { key: 'act', label: '', render: (a) => <button className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label={`Delete ${a.title}`} onClick={(e) => { e.stopPropagation(); remove(a) }}><Trash2 size={15} /></button> },
          ]} />
        )}
      </Card>
      {current ? <Submissions key={current.id} course={course} assignment={current} toast={toast} onGraded={assignments.reload} />
        : <Card className="lg:col-span-3"><Empty text="Select or create an assignment to see submissions." /></Card>}

      <Modal open={creating} onClose={() => setCreating(false)} title="New assignment"
        footer={<><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" onClick={create}>Create</button></>}>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lab 1" /></Field>
        <Field label="Instructions"><textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Due"><input className="input" type="datetime-local" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></Field>
          <Field label="Maximum marks"><input className="input" type="number" min="1" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} /></Field>
        </div>
      </Modal>
      {node}
    </div>
  )
}

function Submissions({ course, assignment, toast, onGraded }) {
  const subs = useRemote(`/courses/${course.id}/assignments/${assignment.id}/submissions`)
  const [draft, setDraft] = useState({})
  useEffect(() => { if (subs.data) setDraft(Object.fromEntries(subs.data.students.map((s) => [s.studentId, { score: s.submission?.score ?? '', feedback: s.submission?.feedback ?? '' }]))) }, [subs.data])
  const max = assignment.maxMarks

  const grade = async (s) => {
    const d = draft[s.studentId]
    const score = Number(d.score)
    if (d.score === '' || Number.isNaN(score) || score < 0 || score > max) return toast(`Score must be between 0 and ${max}`)
    try { await api(`/courses/${course.id}/assignments/${assignment.id}/submissions/${s.studentId}/grade`, { method: 'PUT', body: { score, feedback: d.feedback } }); toast(`Graded ${s.name}`); subs.reload(); onGraded() } catch (e) { toast(errorText(e)) }
  }

  return (
    <Card className="lg:col-span-3" title={assignment.title} subtitle={`Due ${fmtDue(assignment.dueAt)} · out of ${max}`} pad={false}>
      {subs.loading ? <Empty text="Loading…" /> : !subs.data?.students.length ? <Empty text="No students are enrolled in this class yet." /> : (
        <ul className="divide-y divide-gray-100">
          {subs.data.students.map((s) => (
            <li key={s.studentId} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{s.name}</span>
                <Badge tone={TONE[s.status]}>{LABEL[s.status]}</Badge>
              </div>
              {s.submission ? (
                <>
                  {s.submission.content && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{s.submission.content}</p>}
                  {s.submission.link && <a className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary" href={s.submission.link} target="_blank" rel="noreferrer noopener"><ExternalLink size={12} />{s.submission.link}</a>}
                  {s.submission.files?.length > 0 && <div className="mt-1 flex flex-wrap gap-2">{s.submission.files.map((f) => <span key={f.id} className="inline-flex items-center gap-1"><button className="inline-flex items-center gap-1 rounded bg-primary-50 px-2 py-1 text-xs font-semibold text-primary" onClick={() => downloadFile(f.id, f.name).catch((e) => toast(errorText(e)))}><Download size={12} />{f.name} · {fmtSize(f.size)}</button><PreviewButton file={f} className="rounded bg-primary-50 px-2 py-1 text-xs font-semibold text-primary" /></span>)}</div>}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input className="input w-20 text-right" inputMode="decimal" aria-label={`Score for ${s.name}`} placeholder="Score" value={draft[s.studentId]?.score ?? ''} onChange={(e) => setDraft({ ...draft, [s.studentId]: { ...draft[s.studentId], score: e.target.value } })} />
                    <span className="text-sm text-gray-500">/ {max}</span>
                    <input className="input min-w-48 flex-1" aria-label={`Feedback for ${s.name}`} placeholder="Feedback (optional)" value={draft[s.studentId]?.feedback ?? ''} onChange={(e) => setDraft({ ...draft, [s.studentId]: { ...draft[s.studentId], feedback: e.target.value } })} />
                    <button className="btn-primary" onClick={() => grade(s)}>{s.submission.score != null ? 'Update grade' : 'Grade'}</button>
                  </div>
                </>
              ) : <p className="mt-1 text-xs text-gray-500">Nothing handed in yet.</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
