'use client'
import { useState } from 'react'
import { Users, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Tabs, Field, Modal, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText } from '../../lib/classes'

const TONE = { pending: 'amber', approved: 'green', rejected: 'red' }

// Admins review mentor profiles before juniors can see them, and can hide or restore a listed one.
export default function Mentors() {
  const [toast, node] = useToast()
  const [tab, setTab] = useState('pending')
  const all = useRemote('/mentorship/mentors')
  const [reject, setReject] = useState(null) // { mentor, note }
  if (all.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><Card><Empty text="Mentor approvals need the API. Start it and sign in again." /></Card></>

  const list = all.data || []
  const rows = list.filter((m) => m.approval === tab)
  const count = (a) => list.filter((m) => m.approval === a).length
  const patch = async (m, body, ok) => { try { await api(`/mentorship/mentors/${m.id}`, { method: 'PATCH', body }); toast(ok); setReject(null); all.reload() } catch (e) { toast(errorText(e)) } }

  return (
    <>
      <PageHeader icon={Users} title="Mentor approvals" subtitle="A mentor profile is listed for juniors only after you approve it. Any edit by the mentor sends it back here." />
      <Tabs value={tab} onChange={setTab} tabs={['pending', 'approved', 'rejected'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), count: count(id) }))} />
      <Card pad={false}>
        {all.loading ? <Empty text="Loading…" /> : all.error ? <Empty text={all.error} /> : !rows.length ? <Empty text={`No ${tab} mentor profiles.`} /> : (
          <Table rows={rows} columns={[
            { key: 'name', label: 'Mentor', render: (m) => <div><p className="font-semibold">{m.name}</p><p className="text-xs text-gray-500">{m.year}{m.department ? ` · ${m.department}` : ''}</p></div> },
            { key: 'headline', label: 'Profile', render: (m) => <div className="max-w-md"><p className="text-sm font-semibold text-secondary">{m.headline}</p><div className="my-1 flex flex-wrap gap-1">{m.topics.map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</div>{m.bio && <p className="text-xs text-gray-600">{m.bio}</p>}{m.reviewNote && <p className="mt-1 text-xs text-secondary">Your note: {m.reviewNote}</p>}</div> },
            { key: 'status', label: 'Status', render: (m) => <div className="flex flex-col items-start gap-1"><Badge tone={TONE[m.approval]}>{m.approval}</Badge>{!m.isActive && <Badge tone="gray">Hidden</Badge>}</div> },
            { key: 'a', label: '', render: (m) => (
              <div className="flex flex-wrap justify-end gap-2">
                {m.approval !== 'approved' && <button className="btn-primary py-1" onClick={() => patch(m, { approval: 'approved' }, 'Mentor approved')}>Approve</button>}
                {m.approval !== 'rejected' && <button className="btn-ghost py-1" onClick={() => setReject({ mentor: m, note: '' })}>Ask for changes</button>}
                {m.approval === 'approved' && <button className="btn-ghost py-1" onClick={() => patch(m, { isActive: !m.isActive }, m.isActive ? 'Mentor hidden' : 'Mentor visible again')}>{m.isActive ? 'Hide' : 'Show'}</button>}
              </div>) },
          ]} />
        )}
      </Card>
      <Modal open={!!reject} onClose={() => setReject(null)} title={`Ask ${reject?.mentor.name} for changes`}
        footer={<><button className="btn-ghost" onClick={() => setReject(null)}>Cancel</button><button className="btn-primary" onClick={() => patch(reject.mentor, { approval: 'rejected', note: reject.note }, 'Sent back to the mentor')}>Send back</button></>}>
        {reject && <Field label="What should they fix? (they will see this)"><textarea className="input min-h-24" maxLength={500} value={reject.note} onChange={(e) => setReject({ ...reject, note: e.target.value })} /></Field>}
      </Modal>
      {node}
    </>
  )
}
