'use client'
import { useEffect, useState } from 'react'
import { ClipboardCheck, WifiOff, Plus, Trash2, Save } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Modal, Field, Empty, useToast, cx } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText } from '../../lib/classes'

const KINDS = ['quiz', 'assignment', 'midterm', 'endterm', 'practical']

export default function TeacherMarks() {
  const courses = useRemote('/courses')
  const [courseId, setCourseId] = useState(null)
  const list = courses.data || []
  const course = list.find((c) => c.id === courseId) || list[0]
  return (
    <>
      <PageHeader icon={ClipboardCheck} title="Marks" subtitle="Create assessments and enter marks for your classes"
        actions={<>
          {courses.offline && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>}
          {list.length > 1 && (
            <select className="input w-auto" value={course?.id} onChange={(e) => setCourseId(Number(e.target.value))}>
              {list.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
            </select>
          )}
        </>} />
      {courses.offline ? <Card><Empty text="Marks need the API. Start it and sign in again." /></Card>
        : courses.loading ? <Card><Empty text="Loading…" /></Card>
        : !course ? <Card><Empty text="You are not teaching any class yet. Create one under My Classes." /></Card>
        : <ClassMarks key={course.id} course={course} />}
    </>
  )
}

function ClassMarks({ course }) {
  const [toast, node] = useToast()
  const assessments = useRemote(`/courses/${course.id}/assessments`)
  const [sel, setSel] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', kind: 'quiz', maxMarks: '', heldOn: '' })
  const list = assessments.data || []
  const current = list.find((a) => a.id === sel) || list[0]

  const create = async () => {
    try {
      const a = await api(`/courses/${course.id}/assessments`, { method: 'POST', body: { title: form.title, kind: form.kind, maxMarks: Number(form.maxMarks), heldOn: form.heldOn || null } })
      setCreating(false); setForm({ title: '', kind: 'quiz', maxMarks: '', heldOn: '' }); setSel(a.id); toast('Assessment created'); assessments.reload()
    } catch (e) { toast(errorText(e)) }
  }
  const remove = async (a) => {
    if (!confirm(`Delete "${a.title}" and all its marks?`)) return
    try { await api(`/courses/${course.id}/assessments/${a.id}`, { method: 'DELETE' }); setSel(null); toast('Assessment deleted'); assessments.reload() } catch (e) { toast(errorText(e)) }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-2" title="Assessments" subtitle={course.code} action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />New</button>} pad={false}>
        {assessments.loading ? <Empty text="Loading…" /> : !list.length ? <Empty text="No assessments yet. Create the first one." /> : (
          <Table rows={list} onRow={(a) => setSel(a.id)} columns={[
            { key: 'title', label: 'Assessment', render: (a) => <div className={cx(a.id === current?.id && 'text-primary')}><p className="font-semibold">{a.title}</p><p className="text-xs text-gray-500">{a.kind} · out of {a.maxMarks}</p></div> },
            { key: 'graded', label: 'Graded', render: (a) => `${a.graded}/${course.studentCount}` },
            { key: 'act', label: '', render: (a) => <button className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label={`Delete ${a.title}`} onClick={(e) => { e.stopPropagation(); remove(a) }}><Trash2 size={15} /></button> },
          ]} />
        )}
      </Card>
      {current ? <Grid key={current.id} course={course} assessment={current} onSaved={() => { assessments.reload(); toast('Marks saved') }} toast={toast} />
        : <Card className="lg:col-span-3"><Empty text="Select or create an assessment to enter marks." /></Card>}

      <Modal open={creating} onClose={() => setCreating(false)} title="New assessment"
        footer={<><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" onClick={create}>Create</button></>}>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Quiz 1" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type"><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Maximum marks"><input className="input" type="number" min="1" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} /></Field>
        </div>
        <Field label="Date (optional)"><input className="input" type="date" value={form.heldOn} onChange={(e) => setForm({ ...form, heldOn: e.target.value })} /></Field>
      </Modal>
      {node}
    </div>
  )
}

function Grid({ course, assessment, onSaved, toast }) {
  const grid = useRemote(`/courses/${course.id}/assessments/${assessment.id}/marks`)
  const [scores, setScores] = useState({})
  useEffect(() => { if (grid.data) setScores(Object.fromEntries(grid.data.marks.map((m) => [m.studentId, m.score ?? '']))) }, [grid.data])
  const rows = grid.data?.marks || []
  const max = assessment.maxMarks
  const invalid = (v) => v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > max)

  const save = async () => {
    if (rows.some((m) => invalid(scores[m.studentId]))) return toast(`Scores must be between 0 and ${max}`)
    try {
      await api(`/courses/${course.id}/assessments/${assessment.id}/marks`, { method: 'PUT', body: { marks: rows.map((m) => ({ studentId: m.studentId, score: scores[m.studentId] === '' ? null : Number(scores[m.studentId]) })) } })
      grid.reload(); onSaved()
    } catch (e) { toast(errorText(e)) }
  }

  return (
    <Card className="lg:col-span-3" title={assessment.title} subtitle={`Out of ${max}. Leave blank if not graded.`}
      action={<button className="btn-primary" disabled={!rows.length} onClick={save}><Save size={16} />Save marks</button>}>
      {grid.loading ? <Empty text="Loading…" /> : !rows.length ? <Empty text="No students are enrolled in this class yet." /> : (
        <ul className="divide-y divide-gray-100">
          {rows.map((m) => (
            <li key={m.studentId} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm"><span className="font-semibold">{m.name}</span> <span className="text-gray-500">{m.email}</span></span>
              <span className="flex items-center gap-1.5 text-sm">
                <input className={cx('input w-20 text-right', invalid(scores[m.studentId]) && 'border-secondary')} inputMode="decimal" aria-label={`Marks for ${m.name}`}
                  value={scores[m.studentId] ?? ''} onChange={(e) => setScores({ ...scores, [m.studentId]: e.target.value })} />
                <span className="text-gray-500">/ {max}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
