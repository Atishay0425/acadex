'use client'
import { useState } from 'react'
import { LifeBuoy, WifiOff, Clock } from 'lucide-react'
import { PageHeader, Card, Stat, Badge, Table, Tabs, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, ago, TICKET_STATUS, PRIORITY_TONE } from '../../lib/classes'
import { TicketRouting as MockTickets } from './Admin'
import TicketThread from '../shared/TicketThread'

export default function Tickets() {
  const [toast, node] = useToast()
  const [tab, setTab] = useState('all')
  const all = useRemote('/helpdesk/tickets')
  const stats = useRemote('/helpdesk/stats')
  const meta = useRemote('/helpdesk/meta')
  const [open, setOpen] = useState(null)
  if (all.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockTickets /></>

  const rows = (all.data || []).filter((t) => tab === 'all' || t.status === tab)
  const reload = () => { all.reload(); stats.reload() }
  const set = async (t, patch) => { try { await api(`/helpdesk/tickets/${t.id}`, { method: 'PATCH', body: patch }); toast('Ticket updated'); reload() } catch (e) { toast(errorText(e)) } }
  const s = stats.data
  const stop = (e) => e.stopPropagation()

  return (
    <>
      <PageHeader icon={LifeBuoy} title="Help Center routing" subtitle="Tickets are routed to the right department automatically. Re-route, reply and resolve them here." />
      {s && <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Open" value={s.open} hint="Not picked up yet" icon={LifeBuoy} tone="amber" />
        <Stat label="In progress" value={s.inProgress} icon={LifeBuoy} />
        <Stat label="Resolved" value={s.resolved} icon={LifeBuoy} tone="green" />
        <Stat label="Avg time to resolve" value={s.avgResolutionHours == null ? '-' : `${s.avgResolutionHours} h`} icon={Clock} />
      </div>}
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All', count: all.data?.length }, ...Object.entries(TICKET_STATUS).map(([id, label]) => ({ id, label, count: all.data?.filter((t) => t.status === id).length }))]} />
      <Card pad={false}>
        {all.loading ? <Empty text="Loading…" /> : all.error ? <Empty text={all.error} /> : !rows.length ? <Empty text="No tickets here." /> : (
          <Table rows={rows} onRow={setOpen} columns={[
            { key: 'number', label: 'Ticket', render: (r) => <b className="text-primary">{r.number}</b> },
            { key: 'title', label: 'Issue', render: (r) => <div><p className="font-semibold">{r.title}</p><p className="text-xs text-gray-500">{r.student.name} · {ago(r.createdAt)}</p></div> },
            { key: 'priority', label: 'Priority', render: (r) => <span onClick={stop}><select aria-label="Priority" className="input w-28 py-1" value={r.priority} onChange={(e) => set(r, { priority: e.target.value })}>{['high', 'medium', 'low'].map((p) => <option key={p} value={p}>{p}</option>)}</select></span> },
            { key: 'department', label: 'Department', render: (r) => <span onClick={stop}><select aria-label="Department" className="input w-44 py-1" value={r.department} onChange={(e) => set(r, { department: e.target.value })}>{(meta.data?.departments || [r.department]).map((d) => <option key={d}>{d}</option>)}</select></span> },
            { key: 'status', label: 'Status', render: (r) => <span onClick={stop}><select aria-label="Status" className="input w-36 py-1" value={r.status} onChange={(e) => set(r, { status: e.target.value })}>{Object.entries(TICKET_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></span> },
          ]} />
        )}
      </Card>
      {open && <TicketThread ticket={open} onClose={() => setOpen(null)} onChanged={reload} toast={toast} />}
      {node}
    </>
  )
}
