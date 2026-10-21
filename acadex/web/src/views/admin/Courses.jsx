'use client'
import { useState } from 'react'
import { Library, WifiOff, Plus, Trash2 } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Modal, Field, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { courseCatalogue } from '../../data/mock'

export default function AdminCourses() {
  const [toast, node] = useToast()
  const { data, loading, offline, error, reload } = useRemote('/courses')
  const teachers = useRemote('/users?role=teacher')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ code: '', title: '', semester: '', teacherId: '' })
  const rows = offline ? courseCatalogue : data || []

  const create = async () => {
    try {
      await api('/courses', { method: 'POST', body: { code: form.code, title: form.title, semester: form.semester ? Number(form.semester) : null, teacherId: form.teacherId ? Number(form.teacherId) : null } })
      setCreating(false); setForm({ code: '', title: '', semester: '', teacherId: '' }); toast('Course created'); reload()
    } catch (e) { toast(e.details ? Object.values(e.details).flat()[0] : e.message) }
  }
  const assign = async (c, teacherId) => {
    try { await api(`/courses/${c.id}`, { method: 'PATCH', body: { teacherId: teacherId ? Number(teacherId) : null } }); toast('Teacher updated'); reload() } catch (e) { toast(e.message) }
  }
  const remove = async (c) => {
    if (!confirm(`Delete ${c.code}? Its enrolments are removed too.`)) return
    try { await api(`/courses/${c.id}`, { method: 'DELETE' }); toast('Course deleted'); reload() } catch (e) { toast(e.message) }
  }

  return (
    <>
      <PageHeader icon={Library} title="Courses" subtitle="All courses, their faculty and enrolment"
        actions={<>
          {offline && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>}
          <button className="btn-primary" disabled={offline} onClick={() => setCreating(true)}><Plus size={16} />New course</button>
        </>} />
      <Card pad={false}>
        {error ? <Empty text={error} /> : loading ? <Empty text="Loading…" /> : !rows.length ? <Empty text="No courses yet." /> : (
          <Table rows={rows} columns={[
            { key: 'code', label: 'Code', render: (c) => <span className="font-bold text-primary-dark">{c.code}</span> },
            { key: 'title', label: 'Course' },
            { key: 'teacher', label: 'Faculty', render: (c) => offline ? c.teacher?.name : (
              <select className="input py-1" value={c.teacher?.id ?? ''} onChange={(e) => assign(c, e.target.value)}>
                <option value="">Unassigned</option>
                {(teachers.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>) },
            { key: 'studentCount', label: 'Students' },
            { key: 'act', label: '', render: (c) => <button className="rounded p-1 text-gray-500 hover:bg-gray-100" disabled={offline} aria-label={`Delete ${c.code}`} onClick={() => remove(c)}><Trash2 size={15} /></button> },
          ]} />
        )}
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="New course"
        footer={<><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button><button className="btn-primary" onClick={create}>Create</button></>}>
        <Field label="Course code"><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CS601" /></Field>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Semester"><input className="input" type="number" min="1" max="12" value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} /></Field>
        <Field label="Faculty">
          <select className="input" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
            <option value="">Unassigned</option>
            {(teachers.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </Modal>
      {node}
    </>
  )
}
