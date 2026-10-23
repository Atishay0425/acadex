'use client'
import { useState } from 'react'
import { GitBranch, Check, X } from 'lucide-react'
import { Modal, Badge, Progress, Field, Empty } from '../../components/ui'
import { api, useRemote, session } from '../../lib/acadex'
import { errorText, ago, PROJECT_STATUS, PROJECT_TONE } from '../../lib/classes'

const KIND = { update: 'Update', feedback: 'Mentor feedback', approved: 'Approved', changes_requested: 'Changes requested', completed: 'Completed' }

// One project for every role: students see join / manage / log progress, teachers see review actions.
export default function ProjectDetail({ project, onClose, onChanged, toast }) {
  const detail = useRemote(`/projects/${project.id}`)
  const role = session.get()?.user?.role
  const p = detail.data || project
  const owner = p.myRole === 'owner'
  const requests = useRemote(owner ? `/projects/${project.id}/requests` : null)
  const [msg, setMsg] = useState('')
  const [update, setUpdate] = useState({ body: '', progress: '' })
  const [edit, setEdit] = useState(null)

  const refresh = () => { detail.reload(); requests.reload(); onChanged() }
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); refresh() } catch (e) { toast(errorText(e)) } }
  const post = (path, body, ok) => run(() => api(`/projects/${project.id}${path}`, { method: 'POST', body }), ok)
  const isMentor = role === 'teacher' && p.mentor && p.mentor.id === session.get()?.user?.id
  const canLog = p.status === 'in_progress' && (owner || p.myRole === 'member' || isMentor)

  return (
    <Modal open onClose={onClose} title={p.title} footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={PROJECT_TONE[p.status]}>{PROJECT_STATUS[p.status]}</Badge>{p.stack.map((s) => <Badge key={s} tone="primary">{s}</Badge>)}</div>
      <p className="mb-2 text-sm text-gray-700">{p.description}</p>
      <p className="mb-3 text-xs text-gray-500">Owner {p.owner.name} · Mentor {p.mentor?.name ?? 'not assigned yet'} · Team {p.team.map((m) => m.name).join(', ') || 'no teammates yet'}</p>
      <div className="mb-1 flex justify-between text-xs font-semibold"><span>Progress</span><span>{p.progress}%</span></div><Progress value={p.progress} tone="bg-primary" />
      {p.repoUrl && <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary" href={p.repoUrl} target="_blank" rel="noreferrer noopener"><GitBranch size={13} />{p.repoUrl}</a>}

      {role === 'student' && !p.myRole && p.status !== 'completed' && p.lookingFor > 0 && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3"><Field label={`Ask to join (${p.lookingFor} spot${p.lookingFor > 1 ? 's' : ''} open)`}><input className="input" value={msg} maxLength={500} onChange={(e) => setMsg(e.target.value)} placeholder="Tell the owner what you can contribute" /></Field><button className="btn-primary" onClick={() => post('/requests', { message: msg }, 'Join request sent')}>Request to join</button></div>
      )}
      {p.myRole === 'pending' && <p className="mt-4 text-xs font-semibold text-amber-700">Your request is waiting for the owner.</p>}
      {p.myRole === 'member' && <button className="mt-4 text-xs font-semibold text-gray-500 hover:text-secondary" onClick={() => run(() => api(`/projects/${project.id}/members/me`, { method: 'DELETE' }).then(onClose), 'You left the team')}>Leave team</button>}

      {owner && requests.data?.length > 0 && (
        <div className="mt-4"><p className="label">Join requests</p><ul className="space-y-2">{requests.data.map((q) => (
          <li key={q.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 p-2 text-sm"><span><b>{q.student.name}</b> {q.message && <span className="text-gray-500">· {q.message}</span>}</span>
            <span className="flex gap-1"><button className="btn-primary px-2 py-1" aria-label={`Accept ${q.student.name}`} onClick={() => post(`/requests/${q.id}/decision`, { accept: true }, 'Teammate added')}><Check size={14} /></button><button className="btn-ghost px-2 py-1" aria-label={`Decline ${q.student.name}`} onClick={() => post(`/requests/${q.id}/decision`, { accept: false })}><X size={14} /></button></span></li>
        ))}</ul></div>
      )}

      {owner && p.status !== 'completed' && (
        <div className="mt-4">{edit ? (
          <div className="rounded-lg bg-gray-50 p-3"><Field label="Repository link"><input className="input" value={edit.repoUrl} onChange={(e) => setEdit({ ...edit, repoUrl: e.target.value })} placeholder="https://github.com/…" /></Field><Field label="Teammates wanted"><input className="input" type="number" min="0" max="8" value={edit.spots} onChange={(e) => setEdit({ ...edit, spots: e.target.value })} /></Field>
            <div className="flex gap-2"><button className="btn-primary" onClick={() => run(() => api(`/projects/${project.id}`, { method: 'PATCH', body: { repoUrl: edit.repoUrl || null, spots: Number(edit.spots) } }).then(() => setEdit(null)), 'Saved')}>Save</button><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div></div>
        ) : <button className="btn-ghost" onClick={() => setEdit({ repoUrl: p.repoUrl || '', spots: p.spots })}>Edit repo and team size</button>}</div>
      )}

      {isMentor && p.status === 'idea' && <MentorReview onDecide={(decision, note) => post('/review', { decision, note }, decision === 'approve' ? 'Approved as mentor' : 'Changes requested')} />}
      {role === 'teacher' && !p.mentor && p.status === 'idea' && <button className="btn-primary mt-4" onClick={() => post('/claim', undefined, 'You are now the mentor')}>Become the mentor</button>}

      {canLog && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3"><Field label={isMentor ? 'Feedback for the team' : 'Progress update'}><textarea className="input min-h-16" value={update.body} onChange={(e) => setUpdate({ ...update, body: e.target.value })} /></Field>
          {!isMentor && <Field label="Progress now (0-100)"><input className="input w-28" type="number" min="0" max="100" value={update.progress} onChange={(e) => setUpdate({ ...update, progress: e.target.value })} /></Field>}
          <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={update.body.trim().length < 2} onClick={() => post('/updates', { body: update.body, ...(!isMentor && update.progress !== '' ? { progress: Number(update.progress) } : {}) }, 'Logged').then(() => setUpdate({ body: '', progress: '' }))}>{isMentor ? 'Send feedback' : 'Log update'}</button>
            {(owner || isMentor) && <button className="btn-ghost" onClick={() => post('/complete', undefined, 'Project completed')}>Mark completed</button>}</div></div>
      )}

      <div className="mt-5"><p className="label">Timeline</p>
        {!detail.data?.updates?.length ? <Empty text="No updates yet." /> : <ul className="space-y-2">{detail.data.updates.map((u) => (
          <li key={u.id} className="rounded-lg bg-gray-50 p-2 text-sm"><p className="text-xs"><b>{u.author}</b> · {KIND[u.kind]} {u.progress != null && `· ${u.progress}%`} <span className="text-gray-400">· {ago(u.createdAt)}</span></p>{u.body && <p>{u.body}</p>}</li>
        ))}</ul>}</div>
    </Modal>
  )
}

function MentorReview({ onDecide }) {
  const [note, setNote] = useState('')
  return (
    <div className="mt-4 rounded-lg bg-primary-50 p-3"><Field label="Review note (required if you ask for changes)"><textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2"><button className="btn-primary" onClick={() => onDecide('approve', note)}>Approve & mentor</button><button className="btn-ghost" onClick={() => onDecide('changes', note)}>Request changes</button></div></div>
  )
}
