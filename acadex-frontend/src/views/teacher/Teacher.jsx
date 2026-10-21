'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Users, ShieldAlert, Inbox, TrendingUp, BarChart3, NotebookPen, HeartHandshake, FolderKanban, Send, Upload, FileText, CheckCircle2, MailWarning, PhoneCall } from 'lucide-react'
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { PageHeader, Card, Stat, Badge, Avatar, Table, Progress, Tabs, Modal, Field, useToast, ChartFrame, CartesianGrid, XAxis, YAxis, Tooltip, Legend, axisProps, chartColors, riskTone, statusTone, cx } from '../../components/ui'
import { me, doubts as seedDoubts, classStudents, riskDistribution, interventions, projects, trend } from '../../data/mock'

/* ---------------------------------------------------------------- Dashboard */
export function TeacherDashboard() {
  const high = classStudents.filter((s) => s.level === 'High')
  const open = seedDoubts.filter((d) => !d.solved).length
  return (
    <>
      <PageHeader title={`Welcome, ${me.teacher.name}`} subtitle={`${me.teacher.dept} · ${me.teacher.subjects.join(' · ')}`} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value="227" hint="Across 2 subjects" icon={Users} />
        <Stat label="High-risk" value={riskDistribution[2].value} hint="Need outreach" icon={ShieldAlert} tone="secondary" trend="+3 this week" />
        <Stat label="Open doubts" value={open} hint="Awaiting your reply" icon={Inbox} tone="amber" />
        <Stat label="Avg attendance" value="78%" hint="Class average" icon={TrendingUp} tone="green" trend="-2% vs last month" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Class risk distribution">
          <ChartFrame height={220}><PieChart><Pie data={riskDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>{riskDistribution.map((r) => <Cell key={r.name} fill={r.color} />)}</Pie><Tooltip /><Legend /></PieChart></ChartFrame>
        </Card>
        <Card className="lg:col-span-2" title="Students needing attention" action={<Link href="/teacher/at-risk" className="text-xs font-bold text-primary">Open early warning</Link>} pad={false}>
          <Table rows={high.concat(classStudents.filter((s) => s.level === 'Medium').slice(0, 2))} columns={[
            { key: 'name', label: 'Student', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.name} size={28} /><span className="font-semibold">{r.name}</span></div> },
            { key: 'attendance', label: 'Attendance', render: (r) => `${r.attendance}%` },
            { key: 'marks', label: 'Marks', render: (r) => `${r.marks}%` },
            { key: 'level', label: 'Risk', render: (r) => <Badge tone={riskTone(r.level)}>{r.level} · {Math.round(r.risk * 100)}%</Badge> },
          ]} />
        </Card>
        <Card className="lg:col-span-2" title="Class performance trend"><ChartFrame><LineChart data={trend}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="month" {...axisProps} /><YAxis domain={[40, 100]} {...axisProps} /><Tooltip /><Legend />
          <Line dataKey="marks" name="Avg marks %" stroke={chartColors.primary} strokeWidth={2.5} /><Line dataKey="attendance" name="Avg attendance %" stroke={chartColors.secondary} strokeWidth={2.5} /></LineChart></ChartFrame></Card>
        <Card title="Recent interventions">
          <ul className="space-y-3">{interventions.map((i) => <li key={i.id} className="text-sm"><p className="font-semibold">{i.student}</p><p className="text-xs text-gray-500">{i.action} · {i.when}</p></li>)}</ul>
        </Card>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Doubt Inbox */
export function DoubtInbox() {
  const [list, setList] = useState(seedDoubts)
  const [tab, setTab] = useState('open')
  const [sel, setSel] = useState(null)
  const [reply, setReply] = useState('')
  const [toast, node] = useToast()
  const shown = list.filter((d) => (tab === 'open' ? !d.solved : d.solved))
  const send = () => { if (!reply.trim()) return; setList(list.map((d) => d.id === sel.id ? { ...d, solved: true, answer: reply, replies: d.replies + 1 } : d)); setSel(null); setReply(''); toast('Reply sent, doubt marked solved') }
  return (
    <>
      <PageHeader icon={Inbox} title="Doubt Inbox" subtitle="Doubts asked to you. Answer once, and every student can search the solution later." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Needs reply', count: list.filter((d) => !d.solved).length }, { id: 'solved', label: 'Solved', count: list.filter((d) => d.solved).length }]} />
      <Card pad={false}>
        <ul className="divide-y divide-gray-100">
          {shown.map((d) => (
            <li key={d.id}><button onClick={() => { setSel(d); setReply(d.answer) }} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-primary-50">
              <Avatar name={d.student} />
              <div className="flex-1"><p className="font-semibold">{d.title}</p><p className="line-clamp-1 text-sm text-gray-500">{d.body}</p><p className="mt-1 text-xs text-gray-500">{d.student} · {d.subject} · {d.when} · ▲ {d.upvotes} students have the same doubt</p></div>
              {d.upvotes >= 10 && <Badge tone="red">Common doubt</Badge>}
            </button></li>
          ))}
        </ul>
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} title="Answer doubt" footer={<><button className="btn-ghost" onClick={() => setSel(null)}>Cancel</button><button className="btn-primary" onClick={send}><Send size={15} /> Send & mark solved</button></>}>
        {sel && <><p className="font-bold">{sel.title}</p><p className="mb-3 mt-1 text-sm text-gray-600">{sel.body}</p><Field label="Your answer"><textarea className="input min-h-28" value={reply} onChange={(e) => setReply(e.target.value)} /></Field></>}
      </Modal>
      {node}
    </>
  )
}

/* ---------------------------------------------------------------- Class Resources */
export function ClassResources() {
  const [files, setFiles] = useState([{ n: 'ML_Unit3_DecisionTrees.pdf', s: 'Machine Learning', d: '12 Oct', dl: 184 }, { n: 'DS_Trees_Practice.pdf', s: 'Data Structures', d: '9 Oct', dl: 142 }])
  const [toast, node] = useToast()
  return (
    <>
      <PageHeader icon={NotebookPen} title="Class Resources" subtitle="Share notes with your classes. Students can run Smart Notes on them." actions={<button className="btn-primary" onClick={() => { setFiles([{ n: 'ML_Unit4_SVM.pdf', s: 'Machine Learning', d: 'Today', dl: 0 }, ...files]); toast('Uploaded and indexed for Smart Notes') }}><Upload size={16} /> Upload</button>} />
      <Card pad={false}><Table rows={files.map((f, i) => ({ ...f, id: i }))} columns={[
        { key: 'n', label: 'File', render: (r) => <span className="flex items-center gap-2 font-semibold"><FileText size={16} className="text-primary" />{r.n}</span> }, { key: 's', label: 'Subject' }, { key: 'd', label: 'Shared' }, { key: 'dl', label: 'Opened by', render: (r) => `${r.dl} students` },
      ]} /></Card>{node}
    </>
  )
}

/* ---------------------------------------------------------------- Class Performance */
export function ClassPerformance() {
  const hist = [{ b: '<40', n: 12 }, { b: '40-50', n: 28 }, { b: '50-60', n: 46 }, { b: '60-70', n: 62 }, { b: '70-80', n: 49 }, { b: '80+', n: 30 }]
  return (
    <>
      <PageHeader icon={BarChart3} title="Class Performance" subtitle="Machine Learning · CSE 3rd Year · Section A" />
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card title="Marks distribution"><ChartFrame><BarChart data={hist}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="b" {...axisProps} /><YAxis {...axisProps} /><Tooltip /><Bar dataKey="n" name="Students" fill={chartColors.primary} radius={[4, 4, 0, 0]} /></BarChart></ChartFrame></Card>
        <Card title="Trend"><ChartFrame><LineChart data={trend}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="month" {...axisProps} /><YAxis domain={[40, 100]} {...axisProps} /><Tooltip /><Legend /><Line dataKey="marks" name="Marks %" stroke={chartColors.primary} strokeWidth={2.5} /><Line dataKey="attendance" name="Attendance %" stroke={chartColors.secondary} strokeWidth={2.5} /></LineChart></ChartFrame></Card>
      </div>
      <Card title="Students" pad={false}><Table rows={classStudents} columns={[
        { key: 'name', label: 'Student', render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-gray-500">{r.id}</p></div> },
        { key: 'attendance', label: 'Attendance', render: (r) => <div className="w-28"><span className="text-xs font-bold">{r.attendance}%</span><Progress value={r.attendance} /></div> },
        { key: 'marks', label: 'Marks', render: (r) => <div className="w-28"><span className="text-xs font-bold">{r.marks}%</span><Progress value={r.marks} /></div> },
        { key: 'assignments', label: 'Assignments', render: (r) => `${r.assignments}%` },
        { key: 'level', label: 'Risk', render: (r) => <Badge tone={riskTone(r.level)}>{r.level}</Badge> },
      ]} /></Card>
    </>
  )
}

/* ---------------------------------------------------------------- Early Warning (teacher) */
export function AtRisk() {
  const [sel, setSel] = useState(classStudents.find((s) => s.level === 'High'))
  const [log, setLog] = useState(interventions)
  const [toast, node] = useToast()
  const act = (action) => { setLog([{ id: Date.now(), student: sel.name, action, by: me.teacher.name, status: 'Sent', outcome: 'Pending', when: 'Just now' }, ...log]); toast(`${action}: logged for ${sel.name}`) }
  const sorted = [...classStudents].sort((a, b) => b.risk - a.risk)
  return (
    <>
      <PageHeader icon={ShieldAlert} title="Early Warning" subtitle="Risk scores with the reasons behind them. Choose an action and track whether it helped." />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2" title="Students by risk" pad={false}>
          <ul className="divide-y divide-gray-100">{sorted.map((s) => (
            <li key={s.id}><button onClick={() => setSel(s)} className={cx('flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-primary-50', sel.id === s.id && 'bg-primary-50')}>
              <Avatar name={s.name} size={32} /><div className="flex-1"><p className="text-sm font-semibold">{s.name}</p><Progress value={s.risk * 100} tone={s.level === 'High' ? 'bg-secondary' : s.level === 'Medium' ? 'bg-amber-500' : 'bg-emerald-500'} className="mt-1" /></div>
              <Badge tone={riskTone(s.level)}>{Math.round(s.risk * 100)}%</Badge></button></li>
          ))}</ul>
        </Card>
        <div className="space-y-5 lg:col-span-3">
          <Card title={sel.name} subtitle={sel.id} action={<Badge tone={riskTone(sel.level)}>{sel.level} risk · {Math.round(sel.risk * 100)}%</Badge>}>
            <div className="mb-4 grid grid-cols-3 gap-3 text-center">{[['Attendance', sel.attendance], ['Marks', sel.marks], ['Assignments', sel.assignments]].map(([l, v]) => <div key={l} className="rounded-lg bg-gray-50 p-3"><p className="text-xl font-bold text-primary-dark">{v}%</p><p className="text-xs text-gray-500">{l}</p></div>)}</div>
            <p className="label">Why this score (top drivers)</p>
            <ul className="mb-4 space-y-1.5">{sel.drivers.map((d) => <li key={d} className="flex items-center gap-2 text-sm"><span className="h-1.5 w-1.5 rounded-full bg-secondary" />{d}</li>)}</ul>
            <p className="label">Take action</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => act('Mentor call scheduled')}><PhoneCall size={15} /> Schedule mentor call</button>
              <button className="btn-ghost" onClick={() => act('Reminder sent')}><MailWarning size={15} /> Send reminder</button>
              <button className="btn-ghost" onClick={() => act('Counselling referral')}><HeartHandshake size={15} /> Refer to counsellor</button>
            </div>
          </Card>
          <Card title="Intervention tracker" pad={false}><Table rows={log} columns={[
            { key: 'student', label: 'Student' }, { key: 'action', label: 'Action' }, { key: 'status', label: 'Status', render: (r) => <Badge tone="primary">{r.status}</Badge> }, { key: 'outcome', label: 'Outcome' }, { key: 'when', label: 'When' },
          ]} /></Card>
        </div>
      </div>
      {node}
    </>
  )
}

/* ---------------------------------------------------------------- Mentees & Counselling */
export function Mentees() {
  const mentees = classStudents.slice(0, 5)
  const [notes, setNotes] = useState({ 'EN22CS301078': 'Discussed attendance. Family issue at home. Follow up next week.' })
  const [sel, setSel] = useState(mentees[2])
  return (
    <>
      <PageHeader icon={HeartHandshake} title="Mentees & Counselling" subtitle="Your assigned mentees, private notes and follow-ups" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Assigned mentees" pad={false}><ul className="divide-y divide-gray-100">{mentees.map((m) => <li key={m.id}><button onClick={() => setSel(m)} className={cx('flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-primary-50', sel.id === m.id && 'bg-primary-50')}><Avatar name={m.name} size={32} /><span className="flex-1 text-sm font-semibold">{m.name}</span><Badge tone={riskTone(m.level)}>{m.level}</Badge></button></li>)}</ul></Card>
        <Card className="lg:col-span-2" title={`Notes · ${sel.name}`} subtitle="Visible only to you and the counsellor">
          <textarea className="input mb-3 min-h-32" value={notes[sel.id] || ''} onChange={(e) => setNotes({ ...notes, [sel.id]: e.target.value })} placeholder="Add a private note or follow-up…" />
          <div className="flex gap-2"><button className="btn-primary">Save note</button><button className="btn-ghost">Add follow-up reminder</button></div>
        </Card>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Project Reviews */
export function ProjectReviews() {
  const [list, setList] = useState(projects.filter((p) => p.mentor === me.teacher.name || p.status === 'Idea'))
  const [toast, node] = useToast()
  return (
    <>
      <PageHeader icon={FolderKanban} title="Project Reviews" subtitle="Ideas awaiting a faculty mentor and projects you are guiding" />
      <div className="grid gap-5 md:grid-cols-2">
        {list.map((p) => (
          <Card key={p.id}><div className="flex items-start justify-between"><h3 className="font-bold text-primary-dark">{p.title}</h3><Badge tone={statusTone(p.status)}>{p.status}</Badge></div>
            <p className="mt-1 text-sm text-gray-600">{p.description}</p><p className="mt-2 text-xs text-gray-500">By {p.owner} · {p.stack.join(', ')}</p>
            <div className="mt-3"><Progress value={p.progress} tone="bg-primary" /></div>
            <div className="mt-3 flex gap-2">{p.status === 'Idea' ? <><button className="btn-primary" onClick={() => { setList(list.map((x) => x.id === p.id ? { ...x, status: 'In progress', progress: 5 } : x)); toast('Approved as mentor') }}><CheckCircle2 size={15} /> Approve & mentor</button><button className="btn-ghost">Request changes</button></> : <button className="btn-ghost">Review progress</button>}</div>
          </Card>
        ))}
      </div>{node}
    </>
  )
}
