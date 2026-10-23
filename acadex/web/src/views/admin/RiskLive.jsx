'use client'
import { ShieldAlert, WifiOff, CheckCircle2, Activity, Users } from 'lucide-react'
import { PageHeader, Card, Stat, Badge, Avatar, Table, Empty, riskTone } from '../../components/ui'
import { useRemote } from '../../lib/acadex'
import { ACTION_LABEL, STATUS_LABEL } from '../../lib/classes'
import { RiskInterventions as MockRisk } from './Admin'

export default function RiskLive() {
  const o = useRemote('/risk/overview')
  if (o.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockRisk /></>
  const d = o.data
  return (
    <>
      <PageHeader icon={ShieldAlert} title="Risk & interventions" subtitle="Every student's score with the main reasons, and the latest action taken" />
      {o.loading || !d ? <Card><Empty text={o.error || 'Loading…'} /></Card> : (<>
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="High risk" value={d.distribution.high} hint={`${d.distribution.medium} medium · ${d.distribution.low} low`} icon={ShieldAlert} tone="secondary" />
          <Stat label="Flagged, no action yet" value={d.flaggedWithoutAction} hint="Medium or high risk" icon={Users} tone="amber" />
          <Stat label="Actions taken" value={d.interventions.total} hint={`${d.interventions.open} awaiting a response`} icon={Activity} />
          <Stat label="Student responded" value={d.interventions.responded} hint="Or closed" icon={CheckCircle2} tone="green" />
        </div>
        <Card title="Students by risk" subtitle="Top 50" pad={false}>
          {!d.students.length ? <Empty text="No enrolled students yet." /> : (
            <Table rows={d.students.map((s) => ({ ...s, id: s.studentId }))} columns={[
              { key: 'name', label: 'Student', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.name} size={28} /><span className="font-semibold">{r.name}</span></div> },
              { key: 'score', label: 'Risk', render: (r) => <Badge tone={riskTone(r.level)}>{r.level} · {r.score}</Badge> },
              { key: 'drivers', label: 'Main drivers', render: (r) => r.drivers.map((x) => x.label).join(' · ') || '-' },
              { key: 'action', label: 'Latest action', render: (r) => r.latestIntervention ? `${ACTION_LABEL[r.latestIntervention.action]} (${STATUS_LABEL[r.latestIntervention.status]})` : '-' },
              { key: 'outcome', label: 'Outcome', render: (r) => r.latestIntervention?.outcome || '-' },
            ]} />
          )}
        </Card>
      </>)}
    </>
  )
}
