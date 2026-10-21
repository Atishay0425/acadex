'use client'
import { useState } from 'react'
import { ListChecks, WifiOff, CalendarCheck, ClipboardCheck, Target } from 'lucide-react'
import { PageHeader, Card, Badge, Stat, Table, Tabs, Progress, Empty } from '../../components/ui'
import { useRemote } from '../../lib/acadex'
import { pct } from '../../lib/classes'
import { subjects } from '../../data/mock'

const STATUS_TONE = { present: 'green', late: 'amber', absent: 'red', excused: 'gray' }

export default function StudentRecords() {
  const perf = useRemote('/me/performance')
  const [courseId, setCourseId] = useState(null)
  const list = perf.data || []
  const course = list.find((p) => p.course.id === courseId) || list[0]
  return (
    <>
      <PageHeader icon={ListChecks} title="Attendance & Marks" subtitle="Your attendance record and marks, course by course"
        actions={<>
          {perf.offline && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>}
          {list.length > 1 && (
            <select className="input w-auto" value={course.course.id} onChange={(e) => setCourseId(Number(e.target.value))}>
              {list.map((p) => <option key={p.course.id} value={p.course.id}>{p.course.code} · {p.course.title}</option>)}
            </select>
          )}
        </>} />
      {perf.offline ? (
        <Card pad={false}><Table rows={subjects} columns={[
          { key: 'name', label: 'Course', render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-gray-500">{r.code}</p></div> },
          { key: 'attendance', label: 'Attendance', render: (r) => <div className="w-32"><span className="text-xs font-bold">{r.attendance}%</span><Progress value={r.attendance} /></div> },
          { key: 'marks', label: 'Marks', render: (r) => <div className="w-32"><span className="text-xs font-bold">{r.marks}%</span><Progress value={r.marks} /></div> },
        ]} /></Card>
      ) : perf.loading ? <Card><Empty text="Loading…" /></Card>
        : perf.error ? <Card><Empty text={perf.error} /></Card>
        : !course ? <Card><Empty text="You are not enrolled in any course yet. Join one under My Courses." /></Card>
        : <CourseRecords key={course.course.id} course={course} />}
    </>
  )
}

function CourseRecords({ course }) {
  const [tab, setTab] = useState('attendance')
  const id = course.course.id
  const att = useRemote(`/courses/${id}/attendance/me`)
  const mk = useRemote(`/courses/${id}/marks/me`)
  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat icon={CalendarCheck} label="Attendance" value={pct(course.attendancePct)} hint={att.data ? `${att.data.attended} of ${att.data.total} classes` : ' '} tone={course.attendancePct != null && course.attendancePct < 75 ? 'secondary' : 'green'} />
        <Stat icon={ClipboardCheck} label="Marks" value={pct(course.marksPct)} hint={mk.data ? `${mk.data.score} of ${mk.data.max} marks graded so far` : ' '} tone={course.marksPct != null && course.marksPct < 60 ? 'secondary' : 'primary'} />
        <Stat icon={Target} label="To reach 75%" value={course.classesNeededFor75 ? `${course.classesNeededFor75} classes` : 'On target'} hint={course.classesNeededFor75 ? 'Attend this many in a row' : 'Keep it up'} tone={course.classesNeededFor75 ? 'amber' : 'green'} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'attendance', label: 'Attendance', count: att.data?.sessions.length }, { id: 'marks', label: 'Marks', count: mk.data?.assessments.length }]} />
      <Card pad={false}>
        {tab === 'attendance' ? (
          !att.data?.sessions.length ? <Empty text="No attendance recorded yet." /> : (
            <Table rows={att.data.sessions} columns={[
              { key: 'date', label: 'Date' },
              { key: 'topic', label: 'Topic', render: (s) => s.topic || '-' },
              { key: 'status', label: 'Status', render: (s) => <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge> },
            ]} />
          )
        ) : (
          !mk.data?.assessments.length ? <Empty text="No assessments yet." /> : (
            <Table rows={mk.data.assessments} columns={[
              { key: 'title', label: 'Assessment', render: (a) => <div><p className="font-semibold">{a.title}</p><p className="text-xs text-gray-500">{a.kind}{a.heldOn ? ` · ${a.heldOn}` : ''}</p></div> },
              { key: 'score', label: 'Score', render: (a) => (a.score == null ? <span className="text-gray-400">Not graded</span> : `${a.score} / ${a.maxMarks}`) },
              { key: 'p', label: '%', render: (a) => (a.score == null ? '-' : `${Math.round((a.score / a.maxMarks) * 1000) / 10}%`) },
            ]} />
          )
        )}
      </Card>
    </>
  )
}
