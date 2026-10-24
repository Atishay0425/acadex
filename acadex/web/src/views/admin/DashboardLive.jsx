'use client'
import { Users, ShieldAlert, LifeBuoy, Activity, MessagesSquare, WifiOff } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area } from 'recharts'
import { PageHeader, Card, Stat, Badge, Empty, ChartFrame, CartesianGrid, XAxis, YAxis, Tooltip, Legend, axisProps, chartColors } from '../../components/ui'
import { useRemote } from '../../lib/acadex'
import { ACTION_LABEL, STATUS_LABEL } from '../../lib/classes'
import { AdminDashboard as MockDashboard } from './Admin'

const COLORS = { Low: '#2e9e6b', Medium: '#e0a21c', High: '#a21d2e' }

export default function DashboardLive() {
  const risk = useRemote('/risk/overview')
  const tickets = useRemote('/helpdesk/stats')
  const community = useRemote('/community/stats')
  const users = useRemote('/users')
  const doubts = useRemote('/doubts')

  if (risk.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockDashboard /></>
  const d = risk.data, t = tickets.data, c = community.data
  const dist = d ? ['Low', 'Medium', 'High'].map((name) => ({ name, value: d.distribution[name.toLowerCase()] })) : []
  const count = (role) => (users.data || []).filter((u) => u.role === role && u.isActive).length
  const solved = (doubts.data || []).filter((x) => x.solved).length

  return (
    <>
      <PageHeader title="Analytics dashboard" subtitle="Live view of students, risk, support and community across the campus" />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Active students" value={users.data ? count('student') : '-'} hint={`${count('teacher')} teachers`} icon={Users} />
        <Stat label="High-risk students" value={d?.distribution.high ?? '-'} hint={d ? `${d.flaggedWithoutAction} flagged, no action yet` : ' '} icon={ShieldAlert} tone="secondary" />
        <Stat label="Open tickets" value={t ? t.open + t.inProgress : '-'} hint={t?.avgResolutionHours != null ? `Avg resolution ${t.avgResolutionHours} h` : 'No resolved tickets yet'} icon={LifeBuoy} tone="amber" />
        <Stat label="Doubts solved" value={doubts.data ? `${solved} / ${doubts.data.length}` : '-'} hint="All courses" icon={Activity} tone="green" />
        <Stat label="Community posts" value={c?.postsTotal ?? '-'} hint={c ? `${c.postsLast7Days} this week · ${c.openFlags} reports` : ' '} icon={MessagesSquare} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Community activity" subtitle="New posts per day, last 7 days">
          {!c?.postsPerDay.length ? <Empty text="No posts in the last 7 days." /> : (
            <ChartFrame height={240}><AreaChart data={c.postsPerDay}><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors.primary} stopOpacity=".3" /><stop offset="100%" stopColor={chartColors.primary} stopOpacity="0" /></linearGradient></defs>
              <CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="day" {...axisProps} /><YAxis allowDecimals={false} {...axisProps} /><Tooltip /><Area dataKey="posts" name="Posts" stroke={chartColors.primary} fill="url(#ga)" strokeWidth={2.5} /></AreaChart></ChartFrame>
          )}
        </Card>
        <Card title="Risk distribution" subtitle="All students">
          {!d || !d.total ? <Empty text="No students yet." /> : <ChartFrame height={240}><PieChart><Pie data={dist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>{dist.map((r) => <Cell key={r.name} fill={COLORS[r.name]} />)}</Pie><Tooltip /><Legend /></PieChart></ChartFrame>}
        </Card>
        <Card className="lg:col-span-2" title="Tickets by department" subtitle="Open vs total">
          {!t ? <Empty text="Loading…" /> : <ChartFrame><BarChart data={t.byDepartment}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="department" {...axisProps} /><YAxis allowDecimals={false} {...axisProps} /><Tooltip /><Legend />
            <Bar dataKey="open" name="Open" fill={chartColors.secondary} radius={[4, 4, 0, 0]} /><Bar dataKey="total" name="Total" fill={chartColors.primary} radius={[4, 4, 0, 0]} /></BarChart></ChartFrame>}
        </Card>
        <Card title="Latest support actions" pad={false}>
          {(() => { const rows = (d?.students || []).filter((s) => s.latestIntervention).slice(0, 5); return !rows.length ? <Empty text="No actions logged yet." /> : (
            <ul className="divide-y divide-gray-100">{rows.map((s) => <li key={s.studentId} className="px-5 py-3 text-sm"><p className="font-semibold">{s.name}</p><p className="text-xs text-gray-500">{ACTION_LABEL[s.latestIntervention.action]} · {STATUS_LABEL[s.latestIntervention.status]}</p>{s.latestIntervention.outcome && <p className="text-xs text-emerald-700">{s.latestIntervention.outcome}</p>}</li>)}</ul>
          ) })()}
        </Card>
      </div>
    </>
  )
}
