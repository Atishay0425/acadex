'use client'
import { useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, TrendingUp, ShieldAlert, MessageCircleQuestion, CheckCircle2, Circle, ArrowRight, Flame } from 'lucide-react'
import { AreaChart, Area } from 'recharts'
import { Card, Stat, Badge, riskTone, Progress, ChartFrame, CartesianGrid, XAxis, YAxis, Tooltip, axisProps, chartColors } from '../../components/ui'
import { me, todayPlan, alerts, subjects, trend, doubts } from '../../data/mock'

export default function StudentDashboard() {
  const [plan, setPlan] = useState(todayPlan)
  const done = plan.filter((p) => p.done).length
  const avgAtt = Math.round(subjects.reduce((a, s) => a + s.attendance, 0) / subjects.length)
  const avgMarks = Math.round(subjects.reduce((a, s) => a + s.marks, 0) / subjects.length)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">Good morning, {me.student.name.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500">{me.student.branch} · {me.student.year} · {me.student.sem} · Mentor: {me.student.mentor}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700"><Flame size={14} /> 6-day study streak</span>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Attendance" value={`${avgAtt}%`} hint="Minimum required 75%" icon={CalendarCheck} tone={avgAtt >= 75 ? 'green' : 'secondary'} trend="-3% this month" />
        <Stat label="Average marks" value={`${avgMarks}%`} hint="Across 5 subjects" icon={TrendingUp} trend="+2% vs last test" />
        <Stat label="Risk level" value="Medium" hint="Updated today" icon={ShieldAlert} tone="amber" />
        <Stat label="Doubts solved" value="12 / 15" hint="3 awaiting reply" icon={MessageCircleQuestion} tone="primary" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Today’s study plan" subtitle={`${done} of ${plan.length} done`}
          action={<Link href="/student/planner" className="flex items-center gap-1 text-xs font-bold text-primary">Open planner <ArrowRight size={14} /></Link>}>
          <Progress value={(done / plan.length) * 100} tone="bg-primary" className="mb-4" />
          <ul className="space-y-2">
            {plan.map((p) => (
              <li key={p.id}>
                <button onClick={() => setPlan(plan.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:bg-primary-50">
                  {p.done ? <CheckCircle2 size={20} className="text-emerald-600" /> : <Circle size={20} className="text-gray-300" />}
                  <span className="w-12 text-xs font-bold text-gray-500">{p.time}</span>
                  <span className={p.done ? 'flex-1 text-gray-400 line-through' : 'flex-1 font-semibold'}>{p.title}</span>
                  <Badge tone="primary">{p.subject}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Alerts" subtitle="Early warning for you"
          action={<Link href="/student/alerts" className="text-xs font-bold text-primary">View all</Link>}>
          <ul className="space-y-3">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-lg border border-gray-100 p-3">
                <div className="mb-1 flex items-center justify-between"><Badge tone={riskTone(a.level)}>{a.level}</Badge><span className="text-xs text-gray-400">{a.when}</span></div>
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-xs text-gray-500">{a.detail}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2" title="Performance trend" subtitle="Marks and attendance, last 6 months">
          <ChartFrame height={230}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColors.primary} stopOpacity=".25" /><stop offset="100%" stopColor={chartColors.primary} stopOpacity="0" /></linearGradient>
              </defs>
              <CartesianGrid stroke="#eef0f6" vertical={false} />
              <XAxis dataKey="month" {...axisProps} /><YAxis domain={[40, 100]} {...axisProps} /><Tooltip />
              <Area type="monotone" dataKey="marks" stroke={chartColors.primary} fill="url(#g1)" strokeWidth={2.5} name="Marks %" />
              <Area type="monotone" dataKey="attendance" stroke={chartColors.secondary} fill="none" strokeWidth={2.5} name="Attendance %" />
            </AreaChart>
          </ChartFrame>
        </Card>

        <Card title="Trending doubts" action={<Link href="/student/doubts" className="text-xs font-bold text-primary">Doubt Desk</Link>}>
          <ul className="space-y-3">
            {[...doubts].sort((a, b) => b.upvotes - a.upvotes).slice(0, 3).map((d) => (
              <li key={d.id}>
                <p className="text-sm font-semibold leading-snug">{d.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">{d.subject} · ▲ {d.upvotes} {d.solved && <span className="text-emerald-700">· Solved</span>}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
