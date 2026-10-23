'use client'
import { BellRing, WifiOff } from 'lucide-react'
import { BarChart, Bar } from 'recharts'
import { PageHeader, Card, Badge, Empty, ChartFrame, CartesianGrid, XAxis, YAxis, Tooltip, axisProps, chartColors, riskTone } from '../../components/ui'
import { useRemote } from '../../lib/acadex'
import { ACTION_LABEL, STATUS_LABEL, ago } from '../../lib/classes'
import { EarlyWarning as MockEarlyWarning } from './Track'

const COLOR = { high: 'text-secondary', medium: 'text-amber-600', low: 'text-emerald-600' }

export default function Warning() {
  const risk = useRemote('/risk/me')
  if (risk.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockEarlyWarning /></>
  const d = risk.data
  return (
    <>
      <PageHeader icon={BellRing} title="Early Warning" subtitle="Low attendance, falling marks and missing assignments, flagged early so you and your teachers can act" />
      {risk.loading || !d ? <Card><Empty text={risk.error || 'Loading…'} /></Card> : (<>
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <Card title="Your risk score">
            <div className="text-center">
              <p className={`text-4xl font-bold ${COLOR[d.level]}`}>{d.score}<span className="text-lg">/100</span></p>
              <Badge tone={riskTone(d.level)}>{d.level[0].toUpperCase() + d.level.slice(1)} risk</Badge>
              <p className="mt-3 text-xs text-gray-500">{d.level === 'low' ? 'You are on track. Keep it up.' : 'Higher means more chance of falling behind. Each reason below shows how to bring it down.'}</p>
            </div>
          </Card>
          <Card className="lg:col-span-2" title="Why this score?" subtitle="Points each reason adds (a transparent rule-based score, not a black box)">
            {!d.drivers.length ? <Empty text="Nothing is adding to your risk." /> : (
              <ChartFrame height={180}><BarChart data={d.drivers.map((x) => ({ f: x.label, v: x.points }))} layout="vertical" margin={{ left: 30 }}><CartesianGrid stroke="#eef0f6" horizontal={false} /><XAxis type="number" {...axisProps} /><YAxis type="category" dataKey="f" width={130} {...axisProps} /><Tooltip /><Bar dataKey="v" name="Points" fill={chartColors.primary} radius={4} /></BarChart></ChartFrame>
            )}
          </Card>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Active alerts">
            {!d.alerts.length ? <Empty text="No alerts. Nothing needs attention." /> : (
              <ul className="space-y-3">{d.alerts.map((a, i) => (
                <li key={i} className="rounded-lg border border-gray-100 p-3"><Badge tone={riskTone(a.level)}>{a.level}</Badge><p className="mt-1 font-semibold">{a.title}</p><p className="text-sm text-gray-500">{a.detail}</p></li>
              ))}</ul>
            )}
          </Card>
          <Card title="Support from your teachers">
            {!d.interventions.length ? <Empty text="No support actions yet." /> : (
              <ul className="space-y-3">{d.interventions.map((i) => (
                <li key={i.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone="primary">{ACTION_LABEL[i.action]}</Badge><Badge tone={i.status === 'sent' ? 'amber' : 'green'}>{STATUS_LABEL[i.status]}</Badge><span className="text-xs text-gray-400">{i.courseCode} · {i.by} · {ago(i.createdAt)}</span></div>
                  {i.note && <p className="mt-1 text-sm">{i.note}</p>}{i.outcome && <p className="mt-1 text-xs text-emerald-700">Outcome: {i.outcome}</p>}
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
      </>)}
    </>
  )
}
