'use client'
import { Brain, WifiOff, Info } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import { PageHeader, Card, Stat, Badge, Empty, ChartFrame, CartesianGrid, XAxis, YAxis, Tooltip, Legend, axisProps, chartColors } from '../../components/ui'
import { useRemote } from '../../lib/acadex'
import { ModelMonitoring as MockMonitoring } from './Admin'

const COLORS = { Low: '#2e9e6b', Medium: '#e0a21c', High: '#a21d2e' }

export default function MonitoringLive() {
  const o = useRemote('/risk/overview')
  const rules = useRemote('/admin/rules')
  if (o.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockMonitoring /></>
  const d = o.data, r = rules.data?.rules
  const dist = d ? ['Low', 'Medium', 'High'].map((name) => ({ name, value: d.distribution[name.toLowerCase()] })) : []
  const responded = d ? d.interventions.responded : 0
  return (
    <>
      <PageHeader icon={Brain} title="Early warning monitoring" subtitle="How the risk score is behaving right now, and whether support is reaching the students it flags" actions={<Badge tone="primary">Rule-based score</Badge>} />
      <div className="mb-5 flex gap-2 rounded-lg bg-primary-50 p-3 text-sm text-gray-700"><Info size={16} className="mt-0.5 shrink-0 text-primary" /><p>Acadex currently scores students with the transparent rules on the Alert rules page. The trained machine-learning model in the project deck is a separate offline pipeline and is not deployed, so there are no recall or precision figures to show yet.</p></div>
      {o.loading || !d ? <Card><Empty text={o.error || 'Loading…'} /></Card> : (<>
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Students scored" value={d.total} hint={`Average score ${d.meanScore}/100`} icon={Brain} />
          <Stat label="Flagged (medium or high)" value={d.distribution.medium + d.distribution.high} hint={`${d.distribution.high} high`} icon={Brain} tone="secondary" />
          <Stat label="Flagged, no action yet" value={d.flaggedWithoutAction} hint="Needs a teacher" icon={Brain} tone="amber" />
          <Stat label="Support that got a response" value={d.interventions.total ? `${Math.round((responded / d.interventions.total) * 100)}%` : '-'} hint={`${responded} of ${d.interventions.total} actions`} icon={Brain} tone="green" />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Risk distribution" subtitle="All students today">
            {!d.total ? <Empty text="No students yet." /> : <ChartFrame height={240}><PieChart><Pie data={dist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>{dist.map((x) => <Cell key={x.name} fill={COLORS[x.name]} />)}</Pie><Tooltip /><Legend /></PieChart></ChartFrame>}
          </Card>
          <Card title="What is driving risk" subtitle="Students affected by each reason">
            <ChartFrame height={240}><BarChart data={d.driverCounts} layout="vertical" margin={{ left: 30 }}><CartesianGrid stroke="#eef0f6" horizontal={false} /><XAxis type="number" allowDecimals={false} {...axisProps} /><YAxis type="category" dataKey="label" width={130} {...axisProps} /><Tooltip /><Bar dataKey="students" name="Students" fill={chartColors.primary} radius={4} /></BarChart></ChartFrame>
          </Card>
          {r && (
            <Card className="lg:col-span-2" title="Rules in use" subtitle="Change them on the Alert rules page">
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                {[['Minimum attendance', `${r.attendanceTarget}%`], ['Marks floor', `${r.marksFloor}%`], ['Overdue assignments for full risk', r.missingFull], ['Marks drop for full risk', `${r.dropFull} pts`], ['Medium from score', r.medium], ['High from score', r.high]].map(([k, v]) => <div key={k} className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">{k}</dt><dd className="text-lg font-bold text-primary-dark">{v}</dd></div>)}
              </dl>
            </Card>
          )}
        </div>
      </>)}
    </>
  )
}
