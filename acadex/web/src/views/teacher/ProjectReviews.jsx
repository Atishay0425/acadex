'use client'
import { useState } from 'react'
import { FolderKanban, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Progress, Tabs, Empty, useToast } from '../../components/ui'
import { useRemote, session } from '../../lib/acadex'
import { PROJECT_STATUS, PROJECT_TONE } from '../../lib/classes'
import { ProjectReviews as MockReviews } from './Teacher'
import ProjectDetail from '../shared/ProjectDetail'

export default function ProjectReviews() {
  const [toast, node] = useToast()
  const [tab, setTab] = useState('review')
  const review = useRemote('/projects?review=true')
  const running = useRemote('/projects?status=in_progress')
  const [open, setOpen] = useState(null)
  if (review.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockReviews /></>
  const meId = session.get()?.user?.id
  const mine = (running.data || []).filter((p) => p.mentor?.id === meId)
  const list = tab === 'review' ? review.data : mine
  const reload = () => { review.reload(); running.reload() }
  return (
    <>
      <PageHeader icon={FolderKanban} title="Project Reviews" subtitle="Ideas awaiting a faculty mentor and projects you are guiding" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'review', label: 'To review', count: review.data?.length }, { id: 'mine', label: 'I am mentoring', count: mine.length }]} />
      {review.loading ? <Empty text="Loading…" /> : review.error ? <Empty text={review.error} /> : !list?.length ? <Empty text={tab === 'review' ? 'No ideas are waiting for review.' : 'You are not mentoring a running project yet.'} /> : (
        <div className="grid gap-5 md:grid-cols-2">
          {list.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between"><h3 className="font-bold text-primary-dark">{p.title}</h3><Badge tone={PROJECT_TONE[p.status]}>{PROJECT_STATUS[p.status]}</Badge></div>
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{p.description}</p>
              <p className="mt-2 text-xs text-gray-500">By {p.owner.name} · {p.stack.join(', ')} · {p.mentor ? `Mentor ${p.mentor.name}` : 'No mentor yet'}</p>
              <div className="mt-3"><Progress value={p.progress} tone="bg-primary" /></div>
              <div className="mt-3"><button className="btn-primary" onClick={() => setOpen(p)}>{p.status === 'idea' ? 'Review' : 'Open'}</button></div>
            </Card>
          ))}
        </div>
      )}
      {open && <ProjectDetail project={open} onClose={() => setOpen(null)} onChanged={reload} toast={toast} />}
      {node}
    </>
  )
}
