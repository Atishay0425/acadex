'use client'
import { useState } from 'react'
import { Lightbulb, Plus, GitBranch, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Progress, Modal, Field, Tabs, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, PROJECT_STATUS, PROJECT_TONE } from '../../lib/classes'
import { ProjectHub as MockHub } from './Guidance'
import ProjectDetail from '../shared/ProjectDetail'

export default function Projects() {
  const [toast, node] = useToast()
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const qs = new URLSearchParams({ ...(tab === 'looking' && { looking: 'true' }), ...(tab === 'mine' && { mine: 'true' }), ...(q && { q }) }).toString()
  const list = useRemote(`/projects${qs ? `?${qs}` : ''}`)
  const teachers = useRemote('/courses?scope=all')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', stack: '', spots: 2, mentorId: '' })
  const [open, setOpen] = useState(null)

  if (list.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockHub /></>
  const mentors = [...new Map((teachers.data || []).filter((c) => c.teacher).map((c) => [c.teacher.id, c.teacher])).values()]

  const submit = async () => {
    try {
      await api('/projects', { method: 'POST', body: { title: form.title, description: form.description, stack: form.stack.split(',').map((s) => s.trim()).filter(Boolean), spots: Number(form.spots), mentorId: form.mentorId ? Number(form.mentorId) : null } })
      setAdding(false); setForm({ title: '', description: '', stack: '', spots: 2, mentorId: '' }); toast('Idea submitted for mentor review'); list.reload()
    } catch (e) { toast(errorText(e)) }
  }

  return (
    <>
      <PageHeader icon={Lightbulb} title="Project & Idea Hub" subtitle="Submit ideas, find teammates, get a faculty mentor and track progress"
        actions={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Submit idea</button>} />
      <input className="input mb-4" placeholder="Search by title, description or tech…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All projects' }, { id: 'looking', label: 'Looking for teammates' }, { id: 'mine', label: 'My projects' }]} />
      {list.loading ? <Empty text="Loading…" /> : list.error ? <Empty text={list.error} /> : !list.data.length ? <Empty text={tab === 'mine' ? 'You are not part of a project yet.' : 'No projects match.'} /> : (
        <div className="grid gap-5 md:grid-cols-2">
          {list.data.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-2"><h3 className="font-bold text-primary-dark">{p.title}</h3><Badge tone={PROJECT_TONE[p.status]}>{PROJECT_STATUS[p.status]}</Badge></div>
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{p.description}</p>
              <div className="my-3 flex flex-wrap gap-1.5">{p.stack.map((s) => <Badge key={s} tone="primary">{s}</Badge>)}</div>
              <p className="text-xs text-gray-500">Owner {p.owner.name} · Mentor {p.mentor?.name ?? 'not assigned'}{p.myRole && ` · You: ${p.myRole}`}</p>
              <div className="mt-3"><div className="mb-1 flex justify-between text-xs font-semibold"><span>Progress</span><span>{p.progress}%</span></div><Progress value={p.progress} tone="bg-primary" /></div>
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <span className="text-xs font-semibold text-secondary">{p.status === 'completed' ? 'Finished' : p.lookingFor > 0 ? `Looking for ${p.lookingFor} teammate${p.lookingFor > 1 ? 's' : ''}` : 'Team complete'}</span>
                <div className="flex gap-2">{p.repoUrl && <a className="btn-ghost" href={p.repoUrl} target="_blank" rel="noreferrer noopener"><GitBranch size={14} /> Repo</a>}<button className="btn-primary" onClick={() => setOpen(p)}>{p.myRole === 'owner' || p.myRole === 'member' ? 'Manage' : 'View'}</button></div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Submit a project idea"
        footer={<><button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" onClick={submit}>Submit</button></>}>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Tech stack (comma separated)"><input className="input" value={form.stack} onChange={(e) => setForm({ ...form, stack: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Teammates wanted"><input className="input" type="number" min="0" max="8" value={form.spots} onChange={(e) => setForm({ ...form, spots: e.target.value })} /></Field>
          <Field label="Preferred faculty mentor"><select className="input" value={form.mentorId} onChange={(e) => setForm({ ...form, mentorId: e.target.value })}><option value="">Any (a teacher will claim it)</option>{mentors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        </div>
      </Modal>
      {open && <ProjectDetail project={open} onClose={() => setOpen(null)} onChanged={list.reload} toast={toast} />}
      {node}
    </>
  )
}
