'use client'
import { useState } from 'react'
import { LifeBuoy, Plus, Send, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Tabs, Modal, Field, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, ago, TICKET_STATUS, TICKET_TONE } from '../../lib/classes'
import { HelpCenter as MockHelp } from './Track'
import TicketThread from '../shared/TicketThread'

const FAQ = [['How do I download my fee receipt?', 'Dashboard → Fees → Receipts. If it is missing, raise a Fees ticket.'], ['How long does a bonafide certificate take?', '2 working days after approval by the Academic Office.'], ['Hostel maintenance complaints', 'Raise a Hostel ticket. Urgent issues are escalated to the warden.'], ['Wi-Fi not connecting', 'Forget the network, reconnect with your enrolment number. Else raise an IT ticket.']]

export default function Help() {
  const [toast, node] = useToast()
  const tickets = useRemote('/helpdesk/tickets')
  const meta = useRemote('/helpdesk/meta')
  const [tab, setTab] = useState('mine')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ category: 'fees', title: '', details: '' })
  const [open, setOpen] = useState(null)

  if (tickets.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockHelp /></>
  const cats = meta.data?.categories || []
  const routed = cats.find((c) => c.id === form.category)?.department

  const submit = async () => {
    try { const t = await api('/helpdesk/tickets', { method: 'POST', body: form }); setAdding(false); setForm({ category: 'fees', title: '', details: '' }); toast(`${t.number} routed to ${t.department}`); tickets.reload() } catch (e) { toast(errorText(e)) }
  }
  return (
    <>
      <PageHeader icon={LifeBuoy} title="Student Help Center" subtitle="Fees, hostel, library, IT, certificates and academics, routed to the right department"
        actions={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Raise a ticket</button>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{(meta.data?.departments || []).map((d) => <div key={d} className="card px-3 py-3 text-center text-xs font-bold text-primary-dark">{d}</div>)}</div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'mine', label: 'My tickets', count: tickets.data?.length }, { id: 'faq', label: 'Quick answers' }]} />
      {tab === 'mine' ? (
        <Card pad={false}>
          {tickets.loading ? <Empty text="Loading…" /> : tickets.error ? <Empty text={tickets.error} /> : !tickets.data.length ? <Empty text="No tickets yet. Raise one when you need help." /> : (
            <Table rows={tickets.data} onRow={setOpen} columns={[
              { key: 'number', label: 'Ticket', render: (r) => <span className="font-bold text-primary">{r.number}</span> },
              { key: 'title', label: 'Issue' }, { key: 'department', label: 'Routed to' },
              { key: 'status', label: 'Status', render: (r) => <Badge tone={TICKET_TONE[r.status]}>{TICKET_STATUS[r.status]}</Badge> },
              { key: 'createdAt', label: 'Raised', render: (r) => ago(r.createdAt) },
            ]} />
          )}
        </Card>
      ) : <div className="grid gap-4 md:grid-cols-2">{FAQ.map(([q, a]) => <Card key={q} title={q}><p className="text-sm text-gray-600">{a}</p></Card>)}</div>}

      <Modal open={adding} onClose={() => setAdding(false)} title="Raise a ticket"
        footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" onClick={submit}><Send size={15} /> Submit</button></>}>
        <Field label="Category"><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        {routed && <p className="-mt-1 mb-3 text-xs text-primary">Will be routed to: <b>{routed}</b></p>}
        <Field label="Issue"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Details"><textarea className="input min-h-20" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Say what happened and what you need. Mention it if it is urgent." /></Field>
      </Modal>
      {open && <TicketThread ticket={open} onClose={() => setOpen(null)} onChanged={tickets.reload} toast={toast} />}
      {node}
    </>
  )
}
