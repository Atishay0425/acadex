'use client'
import { useState } from 'react'
import { LineChart as LineIcon, BellRing, LifeBuoy, Plus, Lightbulb, AlertTriangle, Send, Route, WifiOff } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend } from 'recharts'
import { PageHeader, Card, Badge, Progress, Modal, Field, Table, Tabs, Stat, useToast, ChartFrame, CartesianGrid, XAxis, YAxis, Tooltip, axisProps, chartColors, riskTone, statusTone } from '../../components/ui'
import { subjects as mockSubjects, trend, alerts, tickets, departments } from '../../data/mock'
import { useRemote } from '../../lib/acadex'

/* ---------------------------------------------------------------- Performance Analyzer */
export function PerformanceAnalyzer() {
  const remote = useRemote('/me/performance')
  const online = !remote.offline
  // Shape API rows like the mock subjects so one UI handles both
  const live = (remote.data || []).map((p) => ({ code: p.course.code, name: p.course.title, faculty: p.course.teacher || 'Unassigned', attendance: p.attendancePct, marks: p.marksPct, need: p.classesNeededFor75, weak: p.weak, assignments: p.assignmentsExpected ? `${p.assignmentsSubmitted}/${p.assignmentsExpected}` : '-', missing: p.assignmentsMissing }))
  const subjects = online ? live : mockSubjects
  const isWeak = (s) => (online ? s.weak : s.marks < 60 || s.attendance < 75)
  const weak = subjects.filter(isWeak)
  const graded = subjects.filter((s) => s.marks != null)
  const best = [...graded].sort((a, b) => b.marks - a.marks)[0]
  const radar = subjects.map((s) => ({ subject: s.name.split(' ')[0], marks: s.marks ?? 0, attendance: s.attendance ?? 0 }))
  const tips = online
    ? [
        ...live.filter((s) => s.need > 0).map((s) => `${s.name}: attend the next ${s.need} classes in a row to reach 75% attendance.`),
        ...live.filter((s) => s.missing > 0).map((s) => `${s.name}: ${s.missing} assignment${s.missing > 1 ? 's are' : ' is'} overdue. Hand ${s.missing > 1 ? 'them' : 'it'} in from Assignments.`),
        ...live.filter((s) => s.marks != null && s.marks < 60).map((s) => `${s.name}: marks are at ${s.marks}%. Ask your teacher or post in the Doubt Desk.`),
        ...(best && !isWeak(best) ? [`${best.name} is your strongest subject at ${best.marks}%.`] : []),
      ]
    : [
        'Cloud Computing: attend the next 6 lectures to cross 75% attendance. You can miss 0 more classes.',
        'Compiler Design: revise LR parsing; marks dropped 9 points since mid-sem 1.',
        'Machine Learning is your strongest subject. Use it to anchor your project idea.',
      ]
  const cell = (v) => (v == null ? <span className="text-xs text-gray-400">No data yet</span> : <div className="w-32"><span className="text-xs font-bold">{v}%</span><Progress value={v} /></div>)
  return (
    <>
      <PageHeader icon={LineIcon} title="Performance Analyzer" subtitle="Attendance, marks and assignments together, with weak subjects and personal suggestions"
        actions={!online && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Weak subjects" value={weak.length} hint={weak.map((w) => w.name).join(', ') || 'None'} icon={AlertTriangle} tone="secondary" />
        <Stat label="Best subject" value={online ? best?.name ?? '-' : 'Software Eng.'} hint={online ? (best ? `${best.marks}% marks` : 'No marks yet') : '81% marks · 92% attendance'} icon={LineIcon} tone="green" />
        {online ? <Stat label="Courses tracked" value={subjects.length} hint="Enrolled this semester" icon={Route} /> : <Stat label="Predicted CGPA" value="7.6" hint="If current trend continues" icon={Route} />}
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {!online && (
          <Card title="Trend" subtitle="Marks vs attendance">
            <ChartFrame><LineChart data={trend}><CartesianGrid stroke="#eef0f6" vertical={false} /><XAxis dataKey="month" {...axisProps} /><YAxis domain={[40, 100]} {...axisProps} /><Tooltip /><Legend />
              <Line dataKey="marks" name="Marks %" stroke={chartColors.primary} strokeWidth={2.5} dot={{ r: 3 }} /><Line dataKey="attendance" name="Attendance %" stroke={chartColors.secondary} strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ChartFrame>
          </Card>
        )}
        <Card title="Subject balance" className={online ? 'lg:col-span-2' : undefined}>
          <ChartFrame><RadarChart data={radar}><PolarGrid stroke="#e5e7eb" /><PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} /><Tooltip />
            <Radar dataKey="marks" name="Marks" stroke={chartColors.primary} fill={chartColors.primary} fillOpacity={0.25} /><Radar dataKey="attendance" name="Attendance" stroke={chartColors.secondary} fill={chartColors.secondary} fillOpacity={0.15} /><Legend /></RadarChart></ChartFrame>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Subject-wise breakdown" pad={false}>
          <Table columns={[
            { key: 'name', label: 'Subject', render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-gray-500">{r.faculty}</p></div> },
            { key: 'attendance', label: 'Attendance', render: (r) => cell(r.attendance) },
            { key: 'marks', label: 'Marks', render: (r) => cell(r.marks) },
            { key: 'assignments', label: 'Assignments' },
            { key: 'status', label: 'Status', render: (r) => (isWeak(r) ? <Badge tone="red">Weak</Badge> : <Badge tone="green">On track</Badge>) },
          ]} rows={subjects} />
        </Card>
        <Card title="Personal suggestions">
          {tips.length ? <ul className="space-y-3">{tips.map((t) => <li key={t} className="flex gap-2 text-sm"><Lightbulb size={16} className="mt-0.5 shrink-0 text-amber-600" />{t}</li>)}</ul> : <p className="text-sm text-gray-500">Nothing to flag yet. Suggestions appear once attendance and marks are recorded.</p>}
        </Card>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- Early Warning (student view) */
export function EarlyWarning() {
  const drivers = [{ f: 'Attendance trend', v: 38 }, { f: 'Assignments missing', v: 27 }, { f: 'Marks drop', v: 21 }, { f: 'Days since activity', v: 14 }]
  return (
    <>
      <PageHeader icon={BellRing} title="Early Warning" subtitle="Low attendance, falling marks and missing assignments, flagged early and shared with your mentor" />
      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card title="Your risk level">
          <div className="text-center"><p className="text-4xl font-bold text-amber-600">34%</p><Badge tone="amber">Medium risk</Badge><p className="mt-3 text-xs text-gray-500">Chance of falling behind this semester. Mentor Dr. Neha Verma has been notified.</p></div>
        </Card>
        <Card className="lg:col-span-2" title="Why was I flagged?" subtitle="Top drivers behind your score (explainable model)">
          <ChartFrame height={180}><BarChart data={drivers} layout="vertical" margin={{ left: 30 }}><CartesianGrid stroke="#eef0f6" horizontal={false} /><XAxis type="number" {...axisProps} unit="%" /><YAxis type="category" dataKey="f" width={130} {...axisProps} /><Tooltip /><Bar dataKey="v" name="Contribution %" fill={chartColors.primary} radius={4} /></BarChart></ChartFrame>
        </Card>
      </div>
      <Card title="Active alerts">
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
              <div><div className="mb-1 flex items-center gap-2"><Badge tone={riskTone(a.level)}>{a.level}</Badge><span className="text-xs text-gray-400">{a.when}</span></div><p className="font-semibold">{a.title}</p><p className="text-sm text-gray-500">{a.detail}</p></div>
              <button className="btn-ghost">Create recovery plan</button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------- Student Help Center */
export function HelpCenter() {
  const [list, setList] = useState(tickets)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('mine')
  const [form, setForm] = useState({ category: 'Fees', title: '', details: '' })
  const [toast, node] = useToast()
  const routeTo = { Fees: 'Accounts & Fees', Hostel: 'Hostel', Library: 'Library', IT: 'IT Services', Certificates: 'Academic Office', Academics: 'Examination' }
  const mine = list.filter((t) => t.student === 'Aarav Sharma')

  const submit = () => {
    if (!form.title.trim()) return
    setList([{ id: 'TK-' + (1043 + list.length), student: 'Aarav Sharma', category: form.category, title: form.title, dept: routeTo[form.category], status: 'Open', priority: 'Medium', created: 'Today' }, ...list])
    setOpen(false); setForm({ category: 'Fees', title: '', details: '' }); toast(`Ticket routed to ${routeTo[form.category]}`)
  }
  return (
    <>
      <PageHeader icon={LifeBuoy} title="Student Help Center" subtitle="Fees, hostel, library, IT, certificates and academics, auto-routed to the right department"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Raise a ticket</button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {departments.map((d) => <div key={d} className="card px-3 py-3 text-center text-xs font-bold text-primary-dark">{d}</div>)}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'mine', label: 'My tickets', count: mine.length }, { id: 'faq', label: 'Quick answers' }]} />
      {tab === 'mine' ? (
        <Card pad={false}><Table rows={mine} columns={[
          { key: 'id', label: 'Ticket', render: (r) => <span className="font-bold text-primary">{r.id}</span> },
          { key: 'title', label: 'Issue' }, { key: 'category', label: 'Category' },
          { key: 'dept', label: 'Routed to' },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge> },
          { key: 'created', label: 'Raised' },
        ]} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {[['How do I download my fee receipt?', 'Dashboard → Fees → Receipts. If it is missing, raise a Fees ticket.'], ['How long does a bonafide certificate take?', '2 working days after approval by the Academic Office.'], ['Hostel maintenance complaints', 'Raise a Hostel ticket. Urgent issues are escalated to the warden.'], ['Wi-Fi not connecting', 'Forget the network, reconnect with your enrolment number. Else raise an IT ticket.']].map(([q, a]) => (
            <Card key={q} title={q}><p className="text-sm text-gray-600">{a}</p></Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Raise a ticket"
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={submit}><Send size={15} /> Submit</button></>}>
        <Field label="Category"><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.keys(routeTo).map((c) => <option key={c}>{c}</option>)}</select></Field>
        <p className="-mt-1 mb-3 text-xs text-primary">Will be routed to: <b>{routeTo[form.category]}</b></p>
        <Field label="Issue"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Details"><textarea className="input min-h-20" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field>
      </Modal>
      {node}
    </>
  )
}
