'use client'
import { useState } from 'react'
import { UserCog, Plus, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Avatar, Table, Modal, Field, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText } from '../../lib/classes'
import { UsersRoles as MockUsers } from './Admin'

const ROLES = ['student', 'teacher', 'admin', 'staff']
const DESKS = ['Accounts & Fees', 'Hostel', 'Library', 'IT Services', 'Academic Office', 'Examination'] // the help-desk departments (api/src/helpdesk.js)

export default function UsersLive() {
  const [toast, node] = useToast()
  const [role, setRole] = useState('')
  const [q, setQ] = useState('')
  const users = useRemote(`/users${role || q ? `?${new URLSearchParams({ ...(role && { role }), ...(q && { q }) })}` : ''}`)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'student', department: '', deskDepartment: '', password: '' })

  if (users.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockUsers /></>
  const patch = async (u, body, ok) => { try { await api(`/users/${u.id}`, { method: 'PATCH', body }); toast(ok); users.reload() } catch (e) { toast(errorText(e)) } }
  const add = async () => {
    try { await api('/users', { method: 'POST', body: { ...form, department: form.department || undefined, deskDepartment: form.role === 'staff' ? form.deskDepartment || undefined : undefined } }); setOpen(false); setForm({ name: '', email: '', role: 'student', department: '', deskDepartment: '', password: '' }); toast('Account created'); users.reload() } catch (e) { toast(errorText(e)) }
  }

  return (
    <>
      <PageHeader icon={UserCog} title="Users & roles" subtitle="Create accounts, change roles, suspend access and choose which teachers act as counsellors"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Add user</button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-40" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}s</option>)}</select>
      </div>
      <Card pad={false}>
        {users.loading ? <Empty text="Loading…" /> : users.error ? <Empty text={users.error} /> : !users.data.length ? <Empty text="No users match." /> : (
          <Table rows={users.data} columns={[
            { key: 'name', label: 'Name', render: (r) => <div className="flex items-center gap-2"><Avatar name={r.name} size={28} /><div><p className="font-semibold">{r.name}</p><p className="text-xs text-gray-500">{r.email}</p></div></div> },
            { key: 'role', label: 'Role', render: (r) => <select aria-label={`Role for ${r.name}`} className="input w-28 py-1" value={r.role} onChange={(e) => (e.target.value === 'staff' ? patch(r, { role: 'staff', deskDepartment: DESKS[0] }, `Now help-desk staff for ${DESKS[0]}. Change the desk in the Department column.`) : patch(r, { role: e.target.value }, 'Role updated'))}>{ROLES.map((x) => <option key={x} value={x}>{x}</option>)}</select> },
            { key: 'department', label: 'Department', render: (r) => r.role === 'staff' ? <select aria-label={`Help desk for ${r.name}`} className="input w-40 py-1" value={r.deskDepartment || ''} onChange={(e) => patch(r, { deskDepartment: e.target.value }, 'Desk updated')}>{!r.deskDepartment && <option value="" disabled>Choose a desk…</option>}{DESKS.map((d) => <option key={d}>{d}</option>)}</select> : r.department || '-' },
            { key: 'counsellor', label: 'Counsellor', render: (r) => r.role === 'teacher' ? <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={r.isCounsellor} onChange={(e) => patch(r, { isCounsellor: e.target.checked }, e.target.checked ? 'Now a counsellor' : 'No longer a counsellor')} />Can counsel</label> : <span className="text-gray-300">-</span> },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'red'}>{r.isActive ? 'Active' : 'Suspended'}</Badge> },
            { key: 'a', label: '', render: (r) => <button className="btn-ghost py-1" onClick={() => patch(r, { isActive: !r.isActive }, r.isActive ? 'Account suspended' : 'Account reactivated')}>{r.isActive ? 'Suspend' : 'Activate'}</button> },
          ]} />
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Add user" footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={add}>Create account</button></>}>
        <Field label="Full name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="College email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role"><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select></Field>
          <Field label="Department"><input className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
        </div>
        {form.role === 'staff' && <Field label="Help desk they handle"><select className="input" value={form.deskDepartment} onChange={(e) => setForm({ ...form, deskDepartment: e.target.value })}><option value="">Choose a desk…</option>{DESKS.map((d) => <option key={d}>{d}</option>)}</select></Field>}
        <Field label="Temporary password (min 8 characters)"><input className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <p className="text-xs text-gray-500">Share the password with the person privately. They sign in with their email.</p>
      </Modal>
      {node}
    </>
  )
}
