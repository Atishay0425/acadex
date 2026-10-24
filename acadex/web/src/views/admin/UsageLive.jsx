'use client'
import { useState } from 'react'
import { BarChart3, WifiOff } from 'lucide-react'
import { BarChart, Bar } from 'recharts'
import { PageHeader, Card, Stat, Badge, Empty, ChartFrame, CartesianGrid, XAxis, YAxis, Tooltip, axisProps, chartColors } from '../../components/ui'
import { useRemote } from '../../lib/acadex'
import { ModuleUsage as MockUsage } from './Admin'

export default function UsageLive() {
  const [days, setDays] = useState(7)
  const u = useRemote(`/admin/usage?days=${days}`)
  if (u.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockUsage /></>
  const d = u.data
  return (
    <>
      <PageHeader icon={BarChart3} title="Module usage" subtitle="Are students returning? Share of students who used each Acadex module in the chosen period"
        actions={<select className="input w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select>} />
      {u.loading || !d ? <Card><Empty text={u.error || 'Loading…'} /></Card> : (<>
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <Stat label="Students" value={d.students} hint="Active accounts" icon={BarChart3} />
          <Stat label="Used any module" value={d.activeStudents} hint={d.students ? `${Math.round((d.activeStudents / d.students) * 100)}% of students` : ' '} icon={BarChart3} tone="green" />
          <Stat label="Most used" value={d.modules[0]?.pct ? d.modules[0].module : '-'} hint={d.modules[0]?.pct ? `${d.modules[0].pct}% of students` : 'No activity yet'} icon={BarChart3} tone="amber" />
        </div>
        <Card title="Adoption by module (%)" subtitle="Students who did something in the module during the period">
          <ChartFrame height={340}><BarChart data={d.modules} layout="vertical" margin={{ left: 30 }}><CartesianGrid stroke="#eef0f6" horizontal={false} /><XAxis type="number" domain={[0, 100]} {...axisProps} unit="%" /><YAxis type="category" dataKey="module" width={120} {...axisProps} /><Tooltip /><Bar dataKey="pct" name="Students %" fill={chartColors.primary} radius={4} /></BarChart></ChartFrame>
          <p className="mt-2 text-xs text-gray-500">Counts creating or changing something (asking, posting, submitting, booking, saving). Reading alone is not tracked.</p>
        </Card>
      </>)}
    </>
  )
}
