'use client'
import { useState } from 'react'
import { ShieldAlert, WifiOff, PhoneCall, MailWarning, HeartHandshake } from 'lucide-react'
import { PageHeader, Card, Badge, Avatar, Progress, Empty, Field, useToast, cx, riskTone } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { ACTION_LABEL, STATUS_LABEL, ago, errorText } from '../../lib/classes'
import { AtRisk as MockAtRisk } from './Teacher'

const BAR = { high: 'bg-secondary', medium: 'bg-amber-500', low: 'bg-emerald-500' }

export default function Risk() {
  const courses = useRemote('/courses')
  const [courseId, setCourseId] = useState(null)
  if (courses.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockAtRisk /></>
  const list = courses.data || []
  const course = list.find((c) => c.id === courseId) || list[0]
  return (
    <>
      <PageHeader icon={ShieldAlert} title="Early Warning" subtitle="Risk scores with the reasons behind them. Take an action and track whether it helped."
        actions={list.length > 1 && (
          <select className="input w-auto" value={course.id} onChange={(e) => setCourseId(Number(e.target.value))}>{list.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>
        )} />
      {courses.loading ? <Card><Empty text="Loading…" /></Card> : !course ? <Card><Empty text="You are not teaching any class yet." /></Card> : <ClassRisk key={course.id} course={course} />}
    </>
  )
}

function ClassRisk({ course }) {
  const [toast, node] = useToast()
  const board = useRemote(`/risk/courses/${course.id}`)
  const [sel, setSel] = useState(null)
  const [note, setNote] = useState('')
  const rows = board.data || []
  const cur = rows.find((s) => s.studentId === sel) || rows[0]
  const history = useRemote(cur ? `/risk/interventions?courseId=${course.id}&studentId=${cur.studentId}` : '/risk/interventions?courseId=0')

  const act = async (action) => {
    try { await api('/risk/interventions', { method: 'POST', body: { studentId: cur.studentId, courseId: course.id, action, note } }); setNote(''); toast(`${ACTION_LABEL[action]} logged for ${cur.name}`); board.reload(); history.reload() } catch (e) { toast(errorText(e)) }
  }
  const update = async (iv, body) => { try { await api(`/risk/interventions/${iv.id}`, { method: 'PATCH', body }); board.reload(); history.reload() } catch (e) { toast(errorText(e)) } }

  if (board.loading) return <Card><Empty text="Loading…" /></Card>
  if (!rows.length) return <Card><Empty text="No students are enrolled in this class yet." /></Card>
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-2" title="Students by risk" subtitle={course.code} pad={false}>
        <ul className="divide-y divide-gray-100">{rows.map((s) => (
          <li key={s.studentId}><button onClick={() => setSel(s.studentId)} className={cx('flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-primary-50', cur.studentId === s.studentId && 'bg-primary-50')}>
            <Avatar name={s.name} size={32} /><div className="flex-1"><p className="text-sm font-semibold">{s.name}</p><Progress value={s.score} tone={BAR[s.level]} className="mt-1" /></div>
            <Badge tone={riskTone(s.level)}>{s.score}</Badge></button></li>
        ))}</ul>
      </Card>
      <div className="space-y-5 lg:col-span-3">
        <Card title={cur.name} subtitle={cur.email} action={<Badge tone={riskTone(cur.level)}>{cur.level} risk · {cur.score}/100</Badge>}>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            {[['Attendance', cur.signals.attendancePct], ['Marks', cur.signals.marksPct], ['Assignments', cur.signals.assignmentsPct]].map(([l, v]) => <div key={l} className="rounded-lg bg-gray-50 p-3"><p className="text-xl font-bold text-primary-dark">{v == null ? '-' : `${v}%`}</p><p className="text-xs text-gray-500">{l}</p></div>)}
          </div>
          <p className="label">Why this score</p>
          {!cur.drivers.length ? <p className="mb-4 text-sm text-gray-500">Nothing is adding to this student's risk.</p> : <ul className="mb-4 space-y-1.5">{cur.drivers.map((d) => <li key={d.key} className="flex items-center gap-2 text-sm"><span className="h-1.5 w-1.5 rounded-full bg-secondary" />{d.detail} <span className="text-xs text-gray-400">+{d.points}</span></li>)}</ul>}
          <Field label="Note (optional)"><input className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Call on Friday after the lab" /></Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => act('mentor_call')}><PhoneCall size={15} /> Schedule mentor call</button>
            <button className="btn-ghost" onClick={() => act('reminder')}><MailWarning size={15} /> Send reminder</button>
            <button className="btn-ghost" onClick={() => act('counselling_referral')}><HeartHandshake size={15} /> Refer to counsellor</button>
          </div>
        </Card>
        <Card title="Intervention tracker" subtitle={cur.name} pad={false}>
          {!history.data?.length ? <Empty text="No actions taken yet." /> : (
            <ul className="divide-y divide-gray-100">{history.data.map((i) => (
              <li key={i.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2"><Badge tone="primary">{ACTION_LABEL[i.action]}</Badge><span className="text-xs text-gray-500">by {i.by} · {ago(i.createdAt)} · risk was {i.riskScore}</span></div>
                {i.note && <p className="text-sm">{i.note}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input w-auto py-1 text-xs" aria-label="Status" value={i.status} onChange={(e) => update(i, { status: e.target.value })}>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  <input className="input min-w-48 flex-1 py-1 text-xs" aria-label="Outcome" placeholder="Outcome (e.g. attendance +6 pts)" defaultValue={i.outcome} onBlur={(e) => e.target.value !== i.outcome && update(i, { outcome: e.target.value })} />
                </div>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
      {node}
    </div>
  )
}
