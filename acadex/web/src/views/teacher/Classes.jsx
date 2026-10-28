'use client'
import { useEffect, useState } from 'react'
import { School, WifiOff, Plus, Users, Trash2 } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Modal, Field, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { courseCatalogue } from '../../data/mock'

export default function TeacherClasses() {
  const [toast, node] = useToast()
  const { data, loading, offline, error, reload } = useRemote('/courses')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ code: '', title: '', semester: '' })
  const [roster, setRoster] = useState(null)
  const rows = offline ? courseCatalogue.slice(0, 2) : data || []

  const create = async () => {
    try {
      await api('/courses', { method: 'POST', body: { code: form.code, title: form.title, semester: form.semester ? Number(form.semester) : null } })
      setCreating(false); setForm({ code: '', title: '', semester: '' }); toast('Class created'); reload()
    } catch (e) { toast(e.details ? Object.values(e.details).flat()[0] : e.message) }
  }

  return (
    <>
      <PageHeader icon={School} title="My Classes" subtitle="Courses you teach and their rosters"
        actions={<>
          {offline && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>}
          <button className="btn-primary" disabled={offline} onClick={() => setCreating(true)}><Plus size={16} />New class</button>
        </>} />
      <Card pad={false}>
        {error ? <Empty text={error} /> : loading ? <Empty text="Loading…" /> : !rows.length ? <Empty text="You are not teaching any class yet. Create one or ask an admin to assign you." /> : (
          <Table rows={rows} columns={[
            { key: 'code', label: 'Code', render: (c) => <span className="font-bold text-primary-dark">{c.code}</span> },
            { key: 'title', label: 'Course' },
            { key: 'semester', label: 'Sem', render: (c) => c.semester ?? '-' },
            { key: 'studentCount', label: 'Students' },
            { key: 'act', label: '', render: (c) => <button className="btn-ghost" disabled={offline} onClick={() => setRoster(c)}><Users size={15} />Roster</button> },
          ]} />
        )}
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New class"
        footer={<><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" onClick={create}>Create</button></>}>
        <Field label="Course code"><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CS601" /></Field>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Semester"><input className="input" type="number" min="1" max="12" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} /></Field>
      </Modal>
      {roster && <RosterModal course={roster} onClose={() => { setRoster(null); reload() }} toast={toast} />}
      {node}
    </>
  )
}

function RosterModal({ course, onClose, toast }) {
  const students = useRemote(`/courses/${course.id}/students`)
  const everyone = useRemote('/users?role=student')
  const [pick, setPick] = useState('')
  const enrolledIds = new Set((students.data || []).map((s) => s.id))
  const candidates = (everyone.data || []).filter((u) => !enrolledIds.has(u.id))
  useEffect(() => { setPick(candidates[0]?.id ?? '') }, [students.data, everyone.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    try { await api(`/courses/${course.id}/students`, { method: 'POST', body: { studentId: Number(pick) } }); students.reload() } catch (e) { toast(e.message) }
  }
  const remove = async (id) => {
    try { await api(`/courses/${course.id}/students/${id}`, { method: 'DELETE' }); students.reload() } catch (e) { toast(e.message) }
  }

  return (
    <Modal open onClose={onClose} title={`${course.code} roster`} footer={<button className="btn-ghost" onClick={onClose}>Done</button>}>
      <div className="mb-4 flex gap-2">
        <select aria-label="Student to add" className="input" value={pick} onChange={(e) => setPick(e.target.value)} disabled={!candidates.length}>
          {candidates.length ? candidates.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>) : <option>No more students to add</option>}
        </select>
        <button className="btn-primary" disabled={!candidates.length} onClick={add}>Add</button>
      </div>
      {!students.data?.length ? <Empty text="No students enrolled yet." /> : (
        <ul className="divide-y divide-gray-100">
          {students.data.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span><span className="font-semibold">{s.name}</span> <span className="text-gray-500">{s.email}</span></span>
              <button className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label={`Remove ${s.name}`} onClick={() => remove(s.id)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
