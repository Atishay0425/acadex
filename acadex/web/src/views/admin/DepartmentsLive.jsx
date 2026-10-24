'use client'
import { Building2, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Progress, Empty } from '../../components/ui'
import { useRemote } from '../../lib/acadex'
import { Departments as MockDepartments } from './Admin'

export default function DepartmentsLive() {
  const s = useRemote('/helpdesk/stats')
  if (s.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockDepartments /></>
  return (
    <>
      <PageHeader icon={Building2} title="Departments" subtitle="Support teams that receive routed tickets, with their live workload" />
      {s.loading || !s.data ? <Card><Empty text={s.error || 'Loading…'} /></Card> : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {s.data.byDepartment.map((d) => (
            <Card key={d.department}>
              <h3 className="font-bold text-primary-dark">{d.department}</h3>
              <p className="text-xs text-gray-500">{d.avgResolutionHours == null ? 'No resolved tickets yet' : `Average time to resolve ${d.avgResolutionHours} h`}</p>
              <div className="my-3 flex gap-6"><div><p className="text-2xl font-bold text-secondary">{d.open}</p><p className="text-xs text-gray-500">Open</p></div><div><p className="text-2xl font-bold text-primary">{d.resolved}</p><p className="text-xs text-gray-500">Resolved</p></div></div>
              <Progress value={d.total ? (d.resolved / d.total) * 100 : 0} tone="bg-primary" /><p className="mt-1 text-xs text-gray-500">{d.total ? `${Math.round((d.resolved / d.total) * 100)}% resolution rate` : 'No tickets yet'}</p>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-gray-500">The six departments and the category each one receives are fixed in the system. Re-route a single ticket from Help Center routing.</p>
    </>
  )
}
