'use client'
import { useState } from 'react'
import { Inbox, Send, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Avatar, Modal, Field, Tabs, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText } from '../../lib/classes'
import { DoubtInbox as MockDoubtInbox } from './Teacher'

const COMMON = 5 // upvotes at which a doubt is flagged as common

export default function Doubts() {
  const [toast, node] = useToast()
  const [tab, setTab] = useState('open')
  const [sel, setSel] = useState(null)
  const [reply, setReply] = useState('')
  const open = useRemote('/doubts?status=open&sort=top')
  const solved = useRemote('/doubts?status=solved')

  if (open.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockDoubtInbox /></>

  const list = (tab === 'open' ? open.data : solved.data) || []
  const send = async () => {
    try {
      await api(`/doubts/${sel.id}/answer`, { method: 'PUT', body: { answer: reply } })
      toast(sel.solved ? 'Answer updated' : 'Reply sent, doubt marked solved'); setSel(null); setReply(''); open.reload(); solved.reload()
    } catch (e) { toast(errorText(e)) }
  }

  return (
    <>
      <PageHeader icon={Inbox} title="Doubt Inbox" subtitle="Doubts asked to you. Answer once, and every student in the course can search the solution later." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Needs reply', count: open.data?.length }, { id: 'solved', label: 'Solved', count: solved.data?.length }]} />
      <Card pad={false}>
        {open.loading ? <Empty text="Loading…" /> : open.error ? <Empty text={open.error} /> : !list.length ? <Empty text={tab === 'open' ? 'Inbox zero. No doubts are waiting.' : 'No solved doubts yet.'} /> : (
          <ul className="divide-y divide-gray-100">
            {list.map((d) => (
              <li key={d.id}><button onClick={() => { setSel(d); setReply(d.answer) }} className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-primary-50">
                <Avatar name={d.student.name} />
                <div className="flex-1">
                  <p className="font-semibold">{d.title}</p>
                  {d.body && <p className="line-clamp-1 text-sm text-gray-500">{d.body}</p>}
                  <p className="mt-1 text-xs text-gray-500">{d.student.name} · {d.course.code} · ▲ {d.upvotes} {d.upvotes === 1 ? 'student has' : 'students have'} the same doubt</p>
                </div>
                {d.upvotes >= COMMON && <Badge tone="red">Common doubt</Badge>}
              </button></li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.solved ? 'Edit answer' : 'Answer doubt'}
        footer={<><button className="btn-ghost" onClick={() => setSel(null)}>Cancel</button><button className="btn-primary" onClick={send}><Send size={15} /> {sel?.solved ? 'Save answer' : 'Send & mark solved'}</button></>}>
        {sel && <><p className="font-bold">{sel.title}</p><p className="mb-3 mt-1 text-sm text-gray-600">{sel.body}</p><Field label="Your answer"><textarea className="input min-h-28" value={reply} onChange={(e) => setReply(e.target.value)} /></Field></>}
      </Modal>
      {node}
    </>
  )
}
