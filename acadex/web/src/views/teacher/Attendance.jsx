'use client'
import { useEffect, useState } from 'react'
import { CalendarCheck, WifiOff, Trash2, Save } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Empty, Field, useToast, cx } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { today, errorText } from '../../lib/classes'

const STATUSES = [
  { id: 'present', label: 'Present', on: 'bg-green-600 text-white border-green-600' },
  { id: 'late', label: 'Late', on: 'bg-amber-500 text-white border-amber-500' },
  { id: 'absent', label: 'Absent', on: 'bg-secondary text-white border-secondary' },
  { id: 'excused', label: 'Excused', on: 'bg-gray-500 text-white border-gray-500' },
]

export default function TeacherAttendance() {
  const courses = useRemote('/courses')
  const [courseId, setCourseId] = useState(null)
  const list = courses.data || []
  const course = list.find((c) => c.id === courseId) || list[0]
  return (
    <>
      <PageHeader icon={CalendarCheck} title="Attendance" subtitle="Take attendance for a class and correct past sessions"
        actions={<>
          {courses.offline && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>}
          {list.length > 1 && (
            <select className="input w-auto" value={course?.id} onChange={(e) => setCourseId(Number(e.target.value))}>
              {list.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
            </select>
          )}
        </>} />
      {courses.offline ? <Card><Empty text="Attendance needs the API. Start it and sign in again." /></Card>
        : courses.loading ? <Card><Empty text="Loading…" /></Card>
        : !course ? <Card><Empty text="You are not teaching any class yet. Create one under My Classes." /></Card>
        : <ClassAttendance key={course.id} course={course} />}
    </>
  )
}

function ClassAttendance({ course }) {
  const [toast, node] = useToast()
  const roster = useRemote(`/courses/${course.id}/students`)
  const sessions = useRemote(`/courses/${course.id}/attendance`)
  const [date, setDate] = useState(today())
  const [topic, setTopic] = useState('')
  const [status, setStatus] = useState({})
  const [editing, setEditing] = useState(null)
  const students = roster.data || []

  const reset = () => { setEditing(null); setDate(today()); setTopic(''); setStatus(Object.fromEntries(students.map((s) => [s.id, 'present']))) }
  useEffect(() => { if (roster.data && editing == null) setStatus(Object.fromEntries(roster.data.map((s) => [s.id, 'present']))) }, [roster.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (s) => {
    try {
      const d = await api(`/courses/${course.id}/attendance/${s.id}`)
      setEditing(d.id); setDate(d.date); setTopic(d.topic || '')
      setStatus({ ...Object.fromEntries(students.map((x) => [x.id, 'absent'])), ...Object.fromEntries(d.records.map((r) => [r.studentId, r.status])) })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) { toast(errorText(e)) }
  }
  const save = async () => {
    const records = students.map((s) => ({ studentId: s.id, status: status[s.id] || 'present' }))
    try {
      if (editing) await api(`/courses/${course.id}/attendance/${editing}`, { method: 'PUT', body: { topic: topic || null, records } })
      else await api(`/courses/${course.id}/attendance`, { method: 'POST', body: { date, topic: topic || null, records } })
      toast(editing ? 'Session updated' : 'Attendance saved'); reset(); sessions.reload()
    } catch (e) { toast(errorText(e)) }
  }
  const remove = async (s) => {
    if (!confirm(`Delete attendance for ${s.date}?`)) return
    try { await api(`/courses/${course.id}/attendance/${s.id}`, { method: 'DELETE' }); if (editing === s.id) reset(); toast('Session deleted'); sessions.reload() } catch (e) { toast(errorText(e)) }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3" title={editing ? `Editing ${date}` : 'Take attendance'} subtitle={`${course.code} · ${students.length} students`}
        action={<button className="btn-ghost" onClick={() => setStatus(Object.fromEntries(students.map((s) => [s.id, 'present'])))}>Mark all present</button>}>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Date"><input className="input" type="date" value={date} disabled={!!editing} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Topic (optional)"><input className="input" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} /></Field>
        </div>
        {roster.loading ? <Empty text="Loading…" /> : !students.length ? <Empty text="No students are enrolled in this class yet. Add them from My Classes." /> : (
          <ul className="divide-y divide-gray-100">
            {students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm font-semibold">{s.name}</span>
                <div className="flex gap-1" role="group" aria-label={`Status for ${s.name}`}>
                  {STATUSES.map((st) => (
                    <button key={st.id} aria-pressed={status[s.id] === st.id} onClick={() => setStatus({ ...status, [s.id]: st.id })}
                      className={cx('rounded-lg border px-2.5 py-1 text-xs font-semibold', status[s.id] === st.id ? st.on : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50')}>{st.label}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          {editing && <button className="btn-ghost" onClick={reset}>Cancel edit</button>}
          <button className="btn-primary" disabled={!students.length} onClick={save}><Save size={16} />{editing ? 'Update session' : 'Save attendance'}</button>
        </div>
      </Card>

      <Card className="lg:col-span-2" title="Past sessions" pad={false}>
        {sessions.loading ? <Empty text="Loading…" /> : !sessions.data?.length ? <Empty text="No attendance taken yet." /> : (
          <Table rows={sessions.data} onRow={open} columns={[
            { key: 'date', label: 'Date', render: (s) => <div><p className="font-semibold">{s.date}</p><p className="text-xs text-gray-500">{s.topic || 'No topic'}</p></div> },
            { key: 'present', label: 'P / L / A', render: (s) => `${s.present} / ${s.late} / ${s.absent}` },
            { key: 'act', label: '', render: (s) => <button className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label={`Delete ${s.date}`} onClick={(e) => { e.stopPropagation(); remove(s) }}><Trash2 size={15} /></button> },
          ]} />
        )}
      </Card>
      {node}
    </div>
  )
}
