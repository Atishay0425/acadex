'use client'
import { useEffect, useState } from 'react'
import { LifeBuoy, WifiOff, Clock } from 'lucide-react'
import { PageHeader, Card, Stat, Badge, Table, Tabs, Empty, useToast } from '../../components/ui'
import { api, useRemote, session } from '../../lib/acadex'
import { errorText, ago, TICKET_STATUS, PRIORITY_TONE } from '../../lib/classes'
import TicketThread from '../shared/TicketThread'

// Department staff see only the tickets routed to their own help-desk department, reply, and resolve them.
// Re-routing stays with the admin front desk.
export default function Desk() {
  const [toast, node] = useToast()
  const [tab, setTab] = useState('open')
  const [dept, setDept] = useState('')
  useEffect(() => { setDept(session.get()?.user?.deskDepartment ?? '') }, [])
  const all = useRemote('/helpdesk/tickets')
  const [open, setOpen] = useState(null)
  if (all.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><Card><Empty text="The department desk needs the API. Start it and sign in again." /></Card></>

  const list = all.data || []
  const count = (s) => list.filter((t) => t.status === s).length
  const rows = list.filter((t) => tab === 'all' || t.status === tab)
  const set = async (t, patch) => { try { await api(`/helpdesk/tickets/${t.id}`, { method: 'PATCH', body: patch }); toast('Ticket updated'); all.reload() } catch (e) { toast(errorText(e)) } }
  const stop = (e) => e.stopPropagation()
  const doneHours = list.filter((t) => t.resolvedAt).map((t) => (new Date(t.resolvedAt) - new Date(t.createdAt)) / 3600000)
  const avg = doneHours.length ? Math.round((doneHours.reduce((a, b) => a + b, 0) / doneHours.length) * 10) / 10 : null

  return (
    <>
      <PageHeader icon={LifeBuoy} title={dept ? `${dept} desk` : 'Department desk'} subtitle="Tickets routed to your department. Reply to the student and mark them resolved. The admin front desk handles re-routing." />
      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Open" value={count('open')} hint="Not picked up yet" icon={LifeBuoy} tone="amber" />
        <Stat label="In progress" value={count('in_progress')} icon={LifeBuoy} />
        <Stat label="Resolved" value={count('resolved')} icon={LifeBuoy} tone="green" />
        <Stat label="Avg time to resolve" value={avg == null ? '-' : `${avg} h`} icon={Clock} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[...Object.entries(TICKET_STATUS).map(([id, label]) => ({ id, label, count: count(id) })), { id: 'all', label: 'All', count: list.length }]} />
      <Card pad={false}>
        {all.loading ? <Empty text="Loading…" /> : all.error ? <Empty text={all.error} /> : !rows.length ? <Empty text="No tickets here." /> : (
          <Table rows={rows} onRow={setOpen} columns={[
            { key: 'number', label: 'Ticket', render: (r) => <b className="text-primary">{r.number}</b> },
            { key: 'title', label: 'Issue', render: (r) => <div><p className="font-semibold">{r.title}</p><p className="text-xs text-gray-500">{r.student.name} · {ago(r.createdAt)}</p></div> },
            { key: 'priority', label: 'Priority', render: (r) => <span onClick={stop}><select aria-label="Priority" className="input w-28 py-1" value={r.priority} onChange={(e) => set(r, { priority: e.target.value })}>{Object.keys(PRIORITY_TONE).map((p) => <option key={p} value={p}>{p}</option>)}</select></span> },
            { key: 'status', label: 'Status', render: (r) => <span onClick={stop}><select aria-label="Status" className="input w-36 py-1" value={r.status} onChange={(e) => set(r, { status: e.target.value })}>{Object.entries(TICKET_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></span> },
          ]} />
        )}
      </Card>
      {open && <TicketThread ticket={open} onClose={() => setOpen(null)} onChanged={all.reload} toast={toast} />}
      {node}
    </>
  )
}
