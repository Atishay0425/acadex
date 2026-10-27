'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, ShieldAlert, Inbox, FolderKanban, WifiOff } from 'lucide-react'
import { PieChart, Pie, Cell } from 'recharts'
import { PageHeader, Card, Stat, Badge, Avatar, Table, Empty, ChartFrame, Tooltip, Legend, riskTone } from '../../components/ui'
import { api, useRemote, useSessionUser } from '../../lib/acadex'
import { TeacherDashboard as MockDashboard } from './Teacher'

const COLORS = { Low: '#2e9e6b', Medium: '#e0a21c', High: '#a21d2e' }

export default function DashboardLive() {
  const courses = useRemote('/courses')
  const doubts = useRemote('/doubts?status=open')
  const projects = useRemote('/projects?review=true')
  const [boards, setBoards] = useState(null)
  useEffect(() => {
    if (!courses.data) return
    Promise.all(courses.data.map((c) => api(`/risk/courses/${c.id}`).then((rows) => rows.map((r) => ({ ...r, course: c.code }))).catch(() => []))).then((x) => setBoards(x.flat()))
  }, [courses.data])

  const user = useSessionUser()
  // Every hook above must run before this return, so the hook count never changes when the page flips to offline.
  if (courses.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockDashboard /></>
  const list = courses.data || []
  const students = list.reduce((a, c) => a + c.studentCount, 0)
  const dist = ['Low', 'Medium', 'High'].map((name) => ({ name, value: (boards || []).filter((s) => s.level === name.toLowerCase()).length }))
  const attention = (boards || []).filter((s) => s.level !== 'low').slice(0, 5)

  return (
    <>
      <PageHeader title={user ? `Welcome, ${user.name}` : 'Welcome'} subtitle={`${user?.department || 'Teacher'} · ${list.map((c) => c.code).join(' · ') || 'no classes yet'}`} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={students} hint={`Across ${list.length} class${list.length === 1 ? '' : 'es'}`} icon={Users} />
        <Stat label="High-risk" value={boards ? dist[2].value : '-'} hint="Need outreach" icon={ShieldAlert} tone="secondary" />
        <Stat label="Open doubts" value={doubts.data?.length ?? '-'} hint="Awaiting your reply" icon={Inbox} tone="amber" />
        <Stat label="Projects to review" value={projects.data?.length ?? '-'} hint="Ideas and mentoring" icon={FolderKanban} tone="green" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Class risk distribution">
          {!boards ? <Empty text="Loading…" /> : !boards.length ? <Empty text="No students enrolled yet." /> : (
            <ChartFrame height={220}><PieChart><Pie data={dist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>{dist.map((r) => <Cell key={r.name} fill={COLORS[r.name]} />)}</Pie><Tooltip /><Legend /></PieChart></ChartFrame>
          )}
        </Card>
        <Card className="lg:col-span-2" title="Students needing attention" action={<Link href="/teacher/at-risk" className="text-xs font-bold text-primary">Open early warning</Link>} pad={false}>
          {!attention.length ? <Empty text={boards ? 'Nobody is flagged. Good news.' : 'Loading…'} /> : (
            <Table rows={attention.map((s) => ({ ...s, id: `${s.studentId}-${s.course}` }))} columns={[
              { key: 'name', label: 'Student', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.name} size={28} /><span className="font-semibold">{r.name}</span></div> },
              { key: 'course', label: 'Class' },
              { key: 'att', label: 'Attendance', render: (r) => (r.signals.attendancePct == null ? '-' : `${r.signals.attendancePct}%`) },
              { key: 'marks', label: 'Marks', render: (r) => (r.signals.marksPct == null ? '-' : `${r.signals.marksPct}%`) },
              { key: 'level', label: 'Risk', render: (r) => <Badge tone={riskTone(r.level)}>{r.level} · {r.score}</Badge> },
            ]} />
          )}
        </Card>
      </div>
    </>
  )
}
