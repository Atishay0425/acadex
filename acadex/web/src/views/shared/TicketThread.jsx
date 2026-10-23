'use client'
import { useState } from 'react'
import { Send } from 'lucide-react'
import { Modal, Badge, Empty } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, ago, TICKET_STATUS, TICKET_TONE } from '../../lib/classes'

// Conversation on one ticket, used by the student and the admin Help Center pages.
export default function TicketThread({ ticket, onClose, onChanged, toast }) {
  const thread = useRemote(`/helpdesk/tickets/${ticket.id}`)
  const [body, setBody] = useState('')
  const t = thread.data
  const send = async () => {
    if (!body.trim()) return
    try { await api(`/helpdesk/tickets/${ticket.id}/messages`, { method: 'POST', body: { body } }); setBody(''); thread.reload(); onChanged() } catch (e) { toast(errorText(e)) }
  }
  return (
    <Modal open onClose={onClose} title={`${ticket.number} · ${ticket.title}`} footer={<button className="btn-ghost" onClick={onClose}>Close</button>}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <Badge tone={TICKET_TONE[t?.status ?? ticket.status]}>{TICKET_STATUS[t?.status ?? ticket.status]}</Badge> {ticket.department} · {ticket.student.name} · {ago(ticket.createdAt)}
      </div>
      {ticket.details && <p className="mb-4 rounded-lg bg-gray-50 p-3 text-sm">{ticket.details}</p>}
      {thread.loading ? <Empty text="Loading…" /> : (
        <ul className="mb-4 space-y-2">
          {t.messages.length === 0 && <li className="text-sm text-gray-500">No replies yet.</li>}
          {t.messages.map((m) => (
            <li key={m.id} className={`rounded-lg p-3 text-sm ${m.author.role === 'admin' ? 'bg-primary-50' : 'bg-gray-50'}`}>
              <p className="mb-0.5 text-xs font-bold text-primary-dark">{m.author.name} <span className="font-normal text-gray-400">· {m.author.role === 'admin' ? 'Help desk' : 'Student'} · {ago(m.createdAt)}</span></p>{m.body}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2"><input className="input" value={body} maxLength={3000} placeholder="Write a reply…" onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} /><button className="btn-primary" aria-label="Send reply" onClick={send}><Send size={15} /></button></div>
    </Modal>
  )
}
