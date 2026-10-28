'use client'
import { useEffect, useState } from 'react'
import { api, session, ApiError } from '../../lib/acadex'
import { Users, ShieldAlert, LifeBuoy, Activity, Brain, BarChart3, ClipboardList, UserCog, Building2, Settings, CheckCircle2, ArrowUpRight, Plus, Flag, Trash2, RefreshCw } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { PageHeader, Card, Stat, Badge, Table, Progress, Tabs, Modal, Field, Avatar, useToast, ChartFrame, CartesianGrid, XAxis, YAxis, Tooltip, Legend, axisProps, chartColors, riskTone, statusTone } from '../../components/ui'
import { weeklyEngagement, riskDistribution, branchRisk, moduleUsage, featureImportance, modelMetrics, modelTrend, tickets as seedTickets, deptLoad, interventions, users as seedUsers, departments, classStudents, posts } from '../../data/mock'

const services = [
  { n: 'Risk model API', s: 'Healthy', d: 'p95 180 ms' }, { n: 'PostgreSQL', s: 'Healthy', d: '42% storage' }, { n: 'Redis alerts queue', s: 'Healthy', d: '0 pending' },
  { n: 'OCR service', s: 'Degraded', d: 'Slow responses' }, { n: 'Email / push', s: 'Healthy', d: '99.8% delivered' },
]

/* ---------------------------------------------------------------- Analytics dashboard (Azure-style) */
export function AdminDashboard() {
  const open = seedTickets.filter((t) => t.status !== 'Resolved').length
  return (
    <>
      <PageHeader title="Analytics dashboard" subtitle="Campus-wide engagement, risk, support and model health · Updated 2 minutes ago"
        actions={<><select aria-label="Time period" className="input w-40"><option>Last 7 days</option><option>Last 30 days</option><option>This semester</option></select><button className="btn-ghost"><RefreshCw size={15} /> Refresh</button></>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Daily active students" value="1,310" hint="of 1,820 enrolled" icon={Users} trend="+8.4% vs last week" />
        <Stat label="At-risk students" value="27" hint="High risk · 5 new" icon={ShieldAlert} tone="secondary" trend="+3 this week" />
        <Stat label="Open tickets" value={open} hint="Avg resolution 1.8 days" icon={LifeBuoy} tone="amber" />
        <Stat label="Doubts answered" value="412" hint="Median reply 3.2 hrs" icon={Activity} tone="green" trend="+12%" />
        <Stat label="Model recall" value={`${Math.round(modelMetrics.recall * 100)}%`} hint="PR-AUC 0.86" icon={Brain} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Student engagement" subtitle="Daily active students, doubts and notes">
          <ChartFrame height={260}><AreaChart data={weeklyEngagement}><defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors.primary} stopOpacity=".3" /><stop offset="100%" stopColor={chartColors.primary} stopOpacity="0" /></linearGradient></defs>
            <CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="day" {...axisProps} /><YAxis {...axisProps} /><Tooltip /><Legend />
            <Area dataKey="students" name="Active students" stroke={chartColors.primary} fill="url(#ga)" strokeWidth={2.5} /><Area dataKey="notes" name="Notes uploaded" stroke={chartColors.light} fill="none" strokeWidth={2} /><Area dataKey="doubts" name="Doubts asked" stroke={chartColors.secondary} fill="none" strokeWidth={2} /></AreaChart></ChartFrame>
        </Card>
        <Card title="Risk distribution" subtitle="All branches">
          <ChartFrame height={260}><PieChart><Pie data={riskDistribution} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>{riskDistribution.map((r) => <Cell key={r.name} fill={r.color} />)}</Pie><Tooltip /><Legend /></PieChart></ChartFrame>
        </Card>
        <Card title="Risk by branch"><ChartFrame><BarChart data={branchRisk}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="branch" {...axisProps} /><YAxis {...axisProps} /><Tooltip /><Legend />
          <Bar dataKey="low" stackId="a" name="Low" fill="#2e9e6b" /><Bar dataKey="medium" stackId="a" name="Medium" fill="#e0a21c" /><Bar dataKey="high" stackId="a" name="High" fill="#a21d2e" /></BarChart></ChartFrame></Card>
        <Card title="Top drivers of risk" subtitle="Global feature importance (SHAP)"><ChartFrame><BarChart data={featureImportance} layout="vertical" margin={{ left: 40 }}><CartesianGrid stroke="#eef0f6" horizontal={false} /><XAxis type="number" {...axisProps} /><YAxis type="category" dataKey="feature" width={120} {...axisProps} /><Tooltip /><Bar dataKey="value" fill={chartColors.primary} radius={4} /></BarChart></ChartFrame></Card>
        <Card title="Service health" subtitle="Platform components" pad={false}>
          <ul className="divide-y divide-gray-100">{services.map((s) => <li key={s.n} className="flex items-center gap-3 px-5 py-3"><span className={`h-2.5 w-2.5 rounded-full ${s.s === 'Healthy' ? 'bg-emerald-500' : 'bg-amber-500'}`} /><span className="flex-1 text-sm font-semibold">{s.n}</span><span className="text-xs text-gray-500">{s.d}</span></li>)}</ul>
        </Card>
        <Card className="lg:col-span-2" title="Tickets by department" subtitle="Open vs resolved"><ChartFrame><BarChart data={deptLoad}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="dept" {...axisProps} /><YAxis {...axisProps} /><Tooltip /><Legend /><Bar dataKey="open" name="Open" fill={chartColors.secondary} radius={[4, 4, 0, 0]} /><Bar dataKey="resolved" name="Resolved" fill={chartColors.primary} radius={[4, 4, 0, 0]} /></BarChart></ChartFrame></Card>
        <Card title="Recent interventions" pad={false}>
          <ul className="divide-y divide-gray-100">{interventions.map((i) => <li key={i.id} className="px-5 py-3 text-sm"><p className="font-semibold">{i.student}</p><p className="text-xs text-gray-500">{i.action}</p><p className="text-xs text-emerald-700">{i.outcome}</p></li>)}</ul>
        </Card>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Risk & Interventions */
export function RiskInterventions() {
  const rows = [...classStudents].sort((a, b) => b.risk - a.risk)
  return (
    <>
      <PageHeader icon={ShieldAlert} title="Risk & interventions" subtitle="All at-risk students with the action taken and its outcome" />
      <div className="mb-5 grid gap-4 sm:grid-cols-3"><Stat label="Intervention uptake" value="68%" hint="Students who responded" icon={CheckCircle2} tone="green" /><Stat label="Improved after support" value="54%" hint="Attendance or marks up" icon={ArrowUpRight} /><Stat label="Avg time to first action" value="1.4 d" hint="After a high-risk flag" icon={Activity} tone="amber" /></div>
      <Card title="At-risk students" pad={false}><Table rows={rows} columns={[
        { key: 'name', label: 'Student', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.name} size={28} /><div><p className="font-semibold">{r.name}</p><p className="text-xs text-gray-500">{r.id}</p></div></div> },
        { key: 'level', label: 'Risk', render: (r) => <Badge tone={riskTone(r.level)}>{r.level} · {Math.round(r.risk * 100)}%</Badge> },
        { key: 'drivers', label: 'Main drivers', render: (r) => r.drivers.slice(0, 2).join(' · ') },
        { key: 'action', label: 'Latest action', render: (r) => interventions.find((i) => i.student === r.name)?.action || '—' },
        { key: 'outcome', label: 'Outcome', render: (r) => interventions.find((i) => i.student === r.name)?.outcome || '—' },
      ]} /></Card>
    </>
  )
}

/* ---------------------------------------------------------------- Model monitoring */
export function ModelMonitoring() {
  const m = modelMetrics
  return (
    <>
      <PageHeader icon={Brain} title="Model monitoring" subtitle="XGBoost risk model trained on OULAD, with Acadex data mapped to the same feature contract" actions={<Badge tone="green">Production · v1.4</Badge>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{[['Recall', m.recall], ['Precision', m.precision], ['F1', m.f1], ['PR-AUC', m.prauc], ['ROC-AUC', m.rocauc], ['Accuracy', m.accuracy]].map(([l, v]) => <Stat key={l} label={l} value={v.toFixed(2)} />)}</div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Recall and precision over time"><ChartFrame><LineChart data={modelTrend}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="month" {...axisProps} /><YAxis domain={[0.7, 0.9]} {...axisProps} /><Tooltip /><Legend /><Line dataKey="recall" stroke={chartColors.primary} strokeWidth={2.5} /><Line dataKey="precision" stroke={chartColors.secondary} strokeWidth={2.5} /></LineChart></ChartFrame></Card>
        <Card title="Confusion matrix" subtitle="Latest validation cohort (n = 2,400)">
          <div className="mx-auto grid max-w-xs grid-cols-2 gap-2 text-center">
            {[['True negative', 1380, 'bg-emerald-50 text-emerald-700'], ['False positive', 190, 'bg-amber-50 text-amber-700'], ['False negative', 130, 'bg-secondary-50 text-secondary'], ['True positive', 700, 'bg-primary-100 text-primary']].map(([l, v, c]) => <div key={l} className={`rounded-lg p-4 ${c}`}><p className="text-2xl font-bold">{v}</p><p className="text-xs font-semibold">{l}</p></div>)}
          </div>
          <p className="mt-3 text-center text-xs text-gray-500">Missed at-risk students (false negatives) cost the most, so recall is tracked first.</p>
        </Card>
        <Card className="lg:col-span-2" title="Global feature importance (SHAP)"><ChartFrame height={220}><BarChart data={featureImportance}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="feature" {...axisProps} /><YAxis {...axisProps} /><Tooltip /><Bar dataKey="value" fill={chartColors.primary} radius={[4, 4, 0, 0]} /></BarChart></ChartFrame></Card>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Module usage */
export function ModuleUsage() {
  return (
    <>
      <PageHeader icon={BarChart3} title="Module usage" subtitle="Are students returning? Share of active students using each Acadex module this week" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Adoption by module (%)"><ChartFrame height={340}><BarChart data={moduleUsage} layout="vertical" margin={{ left: 30 }}><CartesianGrid stroke="#eef0f6" horizontal={false} /><XAxis type="number" {...axisProps} unit="%" /><YAxis type="category" dataKey="module" width={110} {...axisProps} /><Tooltip /><Bar dataKey="value" name="Active users %" fill={chartColors.primary} radius={4} /></BarChart></ChartFrame></Card>
        <Card title="Why students return">
          <ul className="space-y-4 text-sm">{[['Today’s study plan & reminders', 74], ['Doubts answered by faculty', 62], ['Alerts on attendance & marks', 58], ['Mentors, community & projects', 41]].map(([l, v]) => <li key={l}><div className="mb-1 flex justify-between"><span>{l}</span><b>{v}%</b></div><Progress value={v} tone="bg-primary" /></li>)}</ul>
        </Card>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Tickets routing */
export function TicketRouting() {
  const [list, setList] = useState(seedTickets)
  const [tab, setTab] = useState('all')
  const [toast, node] = useToast()
  const shown = list.filter((t) => tab === 'all' || t.status === tab)
  const set = (id, patch) => { setList(list.map((t) => t.id === id ? { ...t, ...patch } : t)); toast('Ticket updated') }
  return (
    <>
      <PageHeader icon={LifeBuoy} title="Help Center routing" subtitle="Tickets are auto-routed to the right department. Re-route or resolve them here." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All', count: list.length }, { id: 'Open', label: 'Open' }, { id: 'In progress', label: 'In progress' }, { id: 'Resolved', label: 'Resolved' }]} />
      <Card pad={false}><Table rows={shown} columns={[
        { key: 'id', label: 'Ticket', render: (r) => <b className="text-primary">{r.id}</b> }, { key: 'title', label: 'Issue', render: (r) => <div><p className="font-semibold">{r.title}</p><p className="text-xs text-gray-500">{r.student} · {r.created}</p></div> },
        { key: 'priority', label: 'Priority', render: (r) => <Badge tone={{ High: 'red', Medium: 'amber', Low: 'gray' }[r.priority]}>{r.priority}</Badge> },
        { key: 'dept', label: 'Department', render: (r) => <select className="input w-44 py-1" value={r.dept} onChange={(e) => set(r.id, { dept: e.target.value })}>{departments.map((d) => <option key={d}>{d}</option>)}</select> },
        { key: 'status', label: 'Status', render: (r) => <select className="input w-36 py-1" value={r.status} onChange={(e) => set(r.id, { status: e.target.value })}>{['Open', 'In progress', 'Resolved'].map((s) => <option key={s}>{s}</option>)}</select> },
      ]} /></Card>{node}
    </>
  )
}

/* ---------------------------------------------------------------- Community moderation */
export function Moderation() {
  const [flags, setFlags] = useState(null)
  const [stats, setStats] = useState(null)
  const [online, setOnline] = useState(true)
  const [toast, node] = useToast()
  const load = async () => {
    try {
      const [f, st] = await Promise.all([api('/community/flags?status=open'), api('/community/stats')])
      setFlags(f); setStats(st); setOnline(true)
    } catch (e) {
      if (session.get() && e instanceof ApiError) { setFlags([]); return toast(e.message) } // real API answered: not an outage
      setOnline(false)
      setFlags(posts.slice(1, 3).map((p) => ({ id: p.id, type: 'post', reporter: { name: 'Student' }, reason: 'spam', status: 'open', createdAt: new Date().toISOString(), target: { type: 'post', id: p.id, text: p.text } })))
    }
  }
  useEffect(() => { load() }, [])
  const resolve = async (f, decision) => {
    if (!online) { setFlags(flags.filter((x) => x.id !== f.id)); return toast('Demo only: start the API to moderate for real') }
    try { await api(`/community/flags/${f.type}/${f.id}/resolve`, { method: 'POST', body: { decision } }); toast(decision === 'remove' ? 'Content removed' : 'Report dismissed'); load() }
    catch { toast('Could not resolve (admin/teacher login needed)') }
  }
  return (
    <>
      <PageHeader icon={ClipboardList} title="Community moderation" subtitle="Reports from students. Posts are auto-hidden after repeated reports until reviewed."
        actions={!online && <Badge tone="amber">Demo data · API offline</Badge>} />
      {stats && (
        <div className="mb-5 grid gap-4 sm:grid-cols-4">
          <Stat label="Posts" value={stats.postsTotal} hint={`${stats.postsLast7Days} this week`} icon={ClipboardList} />
          <Stat label="Solved" value={stats.solved} icon={CheckCircle2} tone="green" />
          <Stat label="Unanswered" value={stats.unanswered} icon={Activity} tone="amber" />
          <Stat label="Open reports" value={stats.openFlags} icon={Flag} tone="secondary" />
        </div>
      )}
      <Card title="Open reports" pad={false}>
        {flags && flags.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No open reports. Nice and quiet.</p> : (
          <Table rows={flags || []} columns={[
            { key: 'target', label: 'Reported content', render: (r) => <div><p className="line-clamp-1 max-w-md font-semibold">{r.target.text}</p><p className="text-xs text-gray-500">{r.target.type} #{r.target.id}</p></div> },
            { key: 'reason', label: 'Reason', render: (r) => <Badge tone="red"><Flag size={11} className="mr-1" />{r.reason}</Badge> },
            { key: 'reporter', label: 'Reported by', render: (r) => r.reporter.name },
            { key: 'a', label: '', render: (r) => <div className="flex gap-2"><button className="btn-ghost py-1" onClick={() => resolve(r, 'dismiss')}>Dismiss</button><button className="btn-ghost py-1 text-secondary" onClick={() => resolve(r, 'remove')}><Trash2 size={14} /> Remove</button></div> },
          ]} />
        )}
      </Card>{node}
    </>
  )
}

/* ---------------------------------------------------------------- Users & roles */
export function UsersRoles() {
  const [list, setList] = useState(seedUsers)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', role: 'Student', dept: 'CSE' })
  const [toast, node] = useToast()
  return (
    <>
      <PageHeader icon={UserCog} title="Users & roles" subtitle="Students, teachers, mentors and counsellors" actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Add user</button>} />
      <Card pad={false}><Table rows={list} columns={[
        { key: 'name', label: 'Name', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.name} size={28} /><div><p className="font-semibold">{r.name}</p><p className="text-xs text-gray-500">{r.id}</p></div></div> },
        { key: 'role', label: 'Role', render: (r) => <Badge tone="primary">{r.role}</Badge> }, { key: 'dept', label: 'Department' },
        { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
        { key: 'a', label: '', render: (r) => <button className="btn-ghost py-1" onClick={() => setList(list.map((x) => x.id === r.id ? { ...x, status: x.status === 'Active' ? 'Suspended' : 'Active' } : x))}>{r.status === 'Active' ? 'Suspend' : 'Activate'}</button> },
      ]} /></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Add user" footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={() => { if (!form.name) return; setList([...list, { id: 'NEW-' + (list.length + 1), ...form, status: 'Active' }]); setOpen(false); toast('Invitation sent') }}>Add</button></>}>
        <Field label="Full name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Role"><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['Student', 'Teacher', 'Mentor', 'Counsellor', 'Admin'].map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Department"><input className="input" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} /></Field>
      </Modal>{node}
    </>
  )
}

/* ---------------------------------------------------------------- Departments */
export function Departments() {
  return (
    <>
      <PageHeader icon={Building2} title="Departments" subtitle="Support teams that receive routed tickets" />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {deptLoad.map((d) => { const tot = d.open + d.resolved; return (
          <Card key={d.dept}><h3 className="font-bold text-primary-dark">{d.dept}</h3><p className="text-xs text-gray-500">SLA 2 working days</p>
            <div className="my-3 flex gap-6"><div><p className="text-2xl font-bold text-secondary">{d.open}</p><p className="text-xs text-gray-500">Open</p></div><div><p className="text-2xl font-bold text-primary">{d.resolved}</p><p className="text-xs text-gray-500">Resolved</p></div></div>
            <Progress value={(d.resolved / tot) * 100} tone="bg-primary" /><p className="mt-1 text-xs text-gray-500">{Math.round((d.resolved / tot) * 100)}% resolution rate</p></Card>
        ) })}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Alert rules */
export function AlertRules() {
  const [v, setV] = useState({ att: 75, drop: 10, miss: 2, inactive: 7 })
  const [email, setEmail] = useState(true); const [push, setPush] = useState(true); const [mentor, setMentor] = useState(true)
  const [toast, node] = useToast()
  const Row = ({ k, label, unit, max }) => (<div className="mb-5"><div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{label}</span><b className="text-primary">{v[k]}{unit}</b></div><input type="range" min="1" max={max} value={v[k]} onChange={(e) => setV({ ...v, [k]: +e.target.value })} className="w-full accent-[hsl(230,54%,34%)]" /></div>)
  const Toggle = ({ on, set, label }) => (<label className="mb-3 flex cursor-pointer items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 text-sm font-semibold">{label}<button type="button" onClick={() => set(!on)} className={`h-6 w-11 rounded-full p-0.5 transition-colors ${on ? 'bg-primary' : 'bg-gray-300'}`}><span className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} /></button></label>)
  return (
    <>
      <PageHeader icon={Settings} title="Alert rules" subtitle="Thresholds that trigger early-warning alerts" actions={<button className="btn-primary" onClick={() => toast('Rules saved')}>Save changes</button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Thresholds"><Row k="att" label="Minimum attendance" unit="%" max={100} /><Row k="drop" label="Marks drop that triggers an alert" unit=" pts" max={30} /><Row k="miss" label="Missing assignments before alert" unit="" max={6} /><Row k="inactive" label="Days of inactivity" unit=" d" max={30} /></Card>
        <Card title="Notify"><Toggle on={email} set={setEmail} label="Email the student" /><Toggle on={push} set={setPush} label="Push notification" /><Toggle on={mentor} set={setMentor} label="Alert the assigned mentor" /><p className="mt-2 text-xs text-gray-500">Privacy: only the minimum data needed to explain the risk is shared with mentors.</p></Card>
      </div>{node}
    </>
  )
}
