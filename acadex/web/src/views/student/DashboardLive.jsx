'use client'
import Link from 'next/link'
import { CalendarCheck, TrendingUp, ShieldAlert, MessageCircleQuestion, CheckCircle2, Circle, ArrowRight, WifiOff, FileText } from 'lucide-react'
import { Card, Stat, Badge, Progress, Empty, useToast, riskTone } from '../../components/ui'
import { useEffect, useState } from 'react'
import { api, useRemote, useSessionUser } from '../../lib/acadex'
import { errorText, today, fmtDue } from '../../lib/classes'
import MockDashboard from './Dashboard'

const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null }

export default function DashboardLive() {
  const [toast, node] = useToast()
  const base = today()
  const perf = useRemote('/me/performance')
  const risk = useRemote('/risk/me')
  const doubts = useRemote('/doubts')
  const top = useRemote('/doubts?sort=top')
  const sched = useRemote(`/planner/schedule?today=${base}&days=1`)
  const asg = useRemote('/me/assignments')

  const user = useSessionUser()
  const [hour, setHour] = useState(null)
  useEffect(() => setHour(new Date().getHours()), [])
  // Every hook above must run before this return, so the hook count never changes when the page flips to offline.
  if (perf.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockDashboard /></>
  const courses = perf.data || []
  const att = avg(courses.map((c) => c.attendancePct)), marks = avg(courses.map((c) => c.marksPct))
  const mine = (doubts.data || []).filter((d) => d.isMine)
  const todays = sched.data?.days?.[0]?.items || []
  const upcoming = (asg.data || []).filter((a) => a.status === 'pending' || a.status === 'overdue').slice(0, 4)
  const tick = async (item) => { try { await api(`/planner/topics/${item.topicId}`, { method: 'PATCH', body: { done: true } }); sched.reload() } catch (e) { toast(errorText(e)) } }

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-primary-dark">{hour == null ? 'Hello' : `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}`}{user ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p className="text-sm text-gray-500">{user?.department || 'Student'} · {courses.length} course{courses.length === 1 ? '' : 's'} this semester</p>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Attendance" value={att == null ? '-' : `${att}%`} hint="Minimum required 75%" icon={CalendarCheck} tone={att != null && att < 75 ? 'secondary' : 'green'} />
        <Stat label="Average marks" value={marks == null ? '-' : `${marks}%`} hint={`Across ${courses.filter((c) => c.marksPct != null).length} graded course${courses.filter((c) => c.marksPct != null).length === 1 ? '' : 's'}`} icon={TrendingUp} />
        <Stat label="Risk level" value={risk.data ? risk.data.level[0].toUpperCase() + risk.data.level.slice(1) : '-'} hint={risk.data ? `Score ${risk.data.score}/100` : ' '} icon={ShieldAlert} tone={risk.data?.level === 'high' ? 'secondary' : risk.data?.level === 'medium' ? 'amber' : 'green'} />
        <Stat label="My doubts solved" value={`${mine.filter((d) => d.solved).length} / ${mine.length}`} hint={`${mine.filter((d) => !d.solved).length} awaiting reply`} icon={MessageCircleQuestion} tone="primary" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Today’s study plan" subtitle={todays.length ? `${todays.length} topic${todays.length > 1 ? 's' : ''} to cover` : 'Nothing scheduled'}
          action={<Link href="/student/planner" className="flex items-center gap-1 text-xs font-bold text-primary">Open planner <ArrowRight size={14} /></Link>}>
          {!todays.length ? <Empty text="No topics today. Add an exam in the Study Planner to get a schedule." /> : (
            <ul className="space-y-2">{todays.map((p) => (
              <li key={p.topicId}><button onClick={() => tick(p)} aria-label={`Mark ${p.title} done`} className="flex w-full items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:bg-primary-50">
                <Circle size={20} className="text-gray-300" /><span className="flex-1 font-semibold">{p.title}</span><Badge tone="primary">{p.subject}</Badge></button></li>
            ))}</ul>
          )}
        </Card>

        <Card title="Alerts" subtitle="Early warning for you" action={<Link href="/student/alerts" className="text-xs font-bold text-primary">View all</Link>}>
          {!risk.data?.alerts.length ? <Empty text="No alerts. You are on track." /> : (
            <ul className="space-y-3">{risk.data.alerts.slice(0, 3).map((a, i) => (
              <li key={i} className="rounded-lg border border-gray-100 p-3"><Badge tone={riskTone(a.level)}>{a.level}</Badge><p className="mt-1 text-sm font-semibold">{a.title}</p><p className="text-xs text-gray-500">{a.detail}</p></li>
            ))}</ul>
          )}
        </Card>

        <Card className="lg:col-span-2" title="Assignments to hand in" action={<Link href="/student/assignments" className="text-xs font-bold text-primary">All assignments</Link>}>
          {!upcoming.length ? <Empty text="Nothing due. Nice." /> : (
            <ul className="space-y-2">{upcoming.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5"><FileText size={18} className="text-primary" />
                <div className="flex-1"><p className="text-sm font-semibold">{a.title}</p><p className="text-xs text-gray-500">{a.course.code} · due {fmtDue(a.dueAt)}</p></div>
                <Badge tone={a.status === 'overdue' ? 'red' : 'gray'}>{a.status === 'overdue' ? 'Overdue' : 'Pending'}</Badge></li>
            ))}</ul>
          )}
        </Card>

        <Card title="Trending doubts" action={<Link href="/student/doubts" className="text-xs font-bold text-primary">Doubt Desk</Link>}>
          {!top.data?.length ? <Empty text="No doubts yet." /> : (
            <ul className="space-y-3">{top.data.slice(0, 3).map((d) => (
              <li key={d.id}><p className="text-sm font-semibold leading-snug">{d.title}</p><p className="mt-0.5 text-xs text-gray-500">{d.course.code} · ▲ {d.upvotes} {d.solved && <span className="text-emerald-700">· Solved</span>}</p></li>
            ))}</ul>
          )}
        </Card>
      </div>
      {node}
    </>
  )
}
