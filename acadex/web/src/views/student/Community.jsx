'use client'
import { useCallback, useEffect, useState } from 'react'
import { MessagesSquare, ThumbsUp, ThumbsDown, Hash, CheckCircle2, Flag, EyeOff, BadgeCheck, MessageSquare, Send, WifiOff, Search } from 'lucide-react'
import { PageHeader, Card, Badge, Avatar, Empty, Modal, Field, useToast, cx } from '../../components/ui'
import { api, tokens } from '../../lib/api'
import { rooms as mockRooms, posts as mockPosts } from '../../data/mock'

const KINDS = ['question', 'notes', 'resource', 'event']
const kindLabel = (k) => k[0].toUpperCase() + k.slice(1)
const ago = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}
// Shape the offline mock data like the API so one UI handles both
const mockToApi = () => ({
  rooms: mockRooms.map((r) => ({ slug: r.id, name: r.name, kind: r.type.toLowerCase(), member_count: r.members })),
  posts: mockPosts.map((p) => ({ id: p.id, room: p.room, kind: p.tag.toLowerCase(), title: p.text.slice(0, 60), content: p.text, author: { full_name: p.author }, tags: [], upvote_count: p.upvotes, downvote_count: 0, vote_score: p.upvotes, user_vote: null, answer_count: p.comments, is_solved: false, created_at: new Date().toISOString(), _mock: true })),
})

export default function Community() {
  const [online, setOnline] = useState(true)
  const [rooms, setRooms] = useState([])
  const [room, setRoom] = useState(null)
  const [posts, setPosts] = useState([])
  const [kind, setKind] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('-created_at')
  const [open, setOpen] = useState(null)       // expanded post (detail)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', content: '', kind: 'question', tags: '', is_anonymous: false })
  const [answer, setAnswer] = useState('')
  const [flagFor, setFlagFor] = useState(null)
  const [toast, node] = useToast()

  const loadRooms = useCallback(async () => {
    try {
      const d = await api('/community/rooms/'); setOnline(true); setRooms(d.results); setRoom((r) => r || d.results[0]?.slug)
    } catch { const m = mockToApi(); setOnline(false); setRooms(m.rooms); setRoom((r) => r || m.rooms[0].slug) }
  }, [])
  useEffect(() => { loadRooms() }, [loadRooms])

  const loadPosts = useCallback(async () => {
    if (!room) return
    setLoading(true)
    if (!online) { setPosts(mockToApi().posts.filter((p) => p.room === room)); setLoading(false); return }
    try {
      const qs = new URLSearchParams({ room, ordering: sort, ...(kind && { kind }), ...(q && { search: q }) })
      setPosts((await api(`/community/questions/?${qs}`)).results)
    } catch { toast('Could not load posts') }
    setLoading(false)
  }, [room, kind, q, sort, online])
  useEffect(() => { const t = setTimeout(loadPosts, 200); return () => clearTimeout(t) }, [loadPosts])

  const requireOnline = () => { if (!online) { toast('API offline: start the backend to save changes'); return false } if (!tokens.access) { toast('Sign in again to post'); return false } return true }
  const patch = (id, p) => setPosts((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const create = async () => {
    if (!requireOnline() || !form.title.trim()) return
    try {
      const created = await api('/community/questions/', { method: 'POST', body: { room, title: form.title, content: form.content, kind: form.kind, is_anonymous: form.is_anonymous, tag_names: form.tags.split(',').map((t) => t.trim()).filter(Boolean) } })
      setPosts((l) => [created, ...l]); setForm({ title: '', content: '', kind: 'question', tags: '', is_anonymous: false }); toast('Posted')
    } catch (e) { toast(e.data?.title?.[0] || 'Could not post') }
  }
  const vote = async (post, type, target = 'questions') => {
    if (!requireOnline()) return
    try {
      const r = await api(`/community/${target}/${post.id}/vote/`, { method: 'POST', body: { vote_type: type } })
      if (target === 'questions') patch(post.id, r)
      else setOpen((o) => ({ ...o, answers: o.answers.map((a) => (a.id === post.id ? { ...a, ...r } : a)) }))
    } catch (e) { toast(e.data?.[0] || e.data?.detail || 'Vote failed') }
  }
  const openPost = async (p) => {
    if (open?.id === p.id) return setOpen(null)
    if (!online) return setOpen({ ...p, answers: [] })
    setOpen(await api(`/community/questions/${p.id}/`))
    api(`/community/questions/${p.id}/view/`, { method: 'POST' }).then((r) => patch(p.id, r)).catch(() => {})
  }
  const reply = async () => {
    if (!requireOnline() || !answer.trim()) return
    await api('/community/answers/', { method: 'POST', body: { question: open.id, content: answer } })
    setAnswer(''); setOpen(await api(`/community/questions/${open.id}/`)); loadPosts(); toast('Answer posted')
  }
  const accept = async (a) => { await api(`/community/answers/${a.id}/accept/`, { method: 'POST' }); setOpen(await api(`/community/questions/${open.id}/`)); loadPosts() }
  const verify = async (a) => { try { await api(`/community/answers/${a.id}/verify/`, { method: 'POST' }); setOpen(await api(`/community/questions/${open.id}/`)) } catch { toast('Only teachers can verify') } }
  const sendFlag = async (reason) => {
    try { const r = await api(`/community/questions/${flagFor.id}/flag/`, { method: 'POST', body: { reason } }); toast(r.auto_hidden ? 'Reported. Post hidden pending review' : 'Reported to moderators') }
    catch (e) { toast(e.status === 409 ? 'You already reported this' : e.data?.[0] || 'Could not report') }
    setFlagFor(null)
  }
  const join = async (slug) => { if (!requireOnline()) return; await api(`/community/rooms/${slug}/join/`, { method: 'POST' }); loadRooms(); toast('Joined room') }

  const cur = rooms.find((r) => r.slug === room)
  return (
    <>
      <PageHeader icon={MessagesSquare} title="Student Community" subtitle="Course and branch rooms to share notes, discuss projects and upvote useful answers"
        actions={!online && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>} />
      <div className="grid gap-5 lg:grid-cols-4">
        <Card title="Rooms" pad={false}>
          <ul className="p-2">{rooms.map((r) => (
            <li key={r.slug}><button onClick={() => { setRoom(r.slug); setOpen(null) }} className={cx('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold', room === r.slug ? 'bg-primary-100 text-primary' : 'hover:bg-gray-100')}>
              <Hash size={15} /><span className="flex-1">{r.name}</span><span className="text-xs font-normal text-gray-500">{r.member_count}</span></button></li>
          ))}</ul>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {cur && (
            <Card>
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold text-primary-dark">{cur.name} <Badge>{kindLabel(cur.kind)}</Badge></p>
                {online && !cur.is_member && <button className="btn-ghost py-1" onClick={() => join(cur.slug)}>Join room</button>}</div>
              <input className="input mb-2" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea className="input mb-2 min-h-20" placeholder="Share notes, ask a question or announce an event…" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-36" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}</select>
                <input className="input w-48" placeholder="Tags: SVM, PCA" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600"><input type="checkbox" checked={form.is_anonymous} onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })} /> Post anonymously</label>
                <button className="btn-primary ml-auto" onClick={create}>Post</button>
              </div>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1"><Search size={15} className="absolute left-3 top-2.5 text-gray-400" /><input className="input pl-9" placeholder="Search this room…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <select className="input w-36" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option>{KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}</select>
            <select className="input w-40" value={sort} onChange={(e) => setSort(e.target.value)}><option value="-created_at">Newest</option><option value="-score">Top voted</option><option value="-answers_total">Most answered</option></select>
          </div>

          {loading && <Empty text="Loading…" />}
          {!loading && posts.length === 0 && <Empty text="No posts yet in this room. Start the conversation." />}
          {posts.map((p) => (
            <article key={p.id} className="card p-4">
              <div className="flex gap-3">
                <div className="flex w-10 shrink-0 flex-col items-center text-xs font-bold text-gray-500">
                  <button onClick={() => vote(p, 'upvote')} className={cx('rounded p-1 hover:bg-primary-50', p.user_vote === 'upvote' && 'text-primary')}><ThumbsUp size={16} /></button>
                  <span className="text-sm text-primary-dark">{p.vote_score}</span>
                  <button onClick={() => vote(p, 'downvote')} className={cx('rounded p-1 hover:bg-secondary-50', p.user_vote === 'downvote' && 'text-secondary')}><ThumbsDown size={16} /></button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {p.author?.id ? <Avatar name={p.author.full_name} size={22} /> : <EyeOff size={16} className="text-gray-400" />}
                    <b>{p.author?.full_name}</b>{p.author?.role === 'teacher' && <Badge tone="primary">Faculty</Badge>}<span className="text-xs text-gray-400">· {ago(p.created_at)}</span>
                    <Badge tone="primary">{kindLabel(p.kind)}</Badge>{p.is_solved && <Badge tone="green"><CheckCircle2 size={11} className="mr-1" />Solved</Badge>}
                  </div>
                  <button onClick={() => openPost(p)} className="mt-1 text-left font-bold text-primary-dark hover:underline">{p.title}</button>
                  {p.content && <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{p.content}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-gray-500">
                    {p.tags?.map((t) => <span key={t} className="text-primary">#{t}</span>)}
                    <button onClick={() => openPost(p)} className="flex items-center gap-1 hover:text-primary"><MessageSquare size={14} />{p.answer_count} {p.kind === 'question' ? 'answers' : 'comments'}</button>
                    {p.view_count != null && <span>{p.view_count} views</span>}
                    {online && <button onClick={() => setFlagFor(p)} className="ml-auto flex items-center gap-1 hover:text-secondary"><Flag size={13} />Report</button>}
                  </div>

                  {open?.id === p.id && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      {open.answers?.length === 0 && <p className="mb-3 text-sm text-gray-500">No answers yet. Be the first to help.</p>}
                      {open.answers?.map((a) => (
                        <div key={a.id} className={cx('mb-3 flex gap-3 rounded-lg p-3', a.is_accepted ? 'bg-emerald-50' : 'bg-gray-50')}>
                          <div className="flex w-8 flex-col items-center text-xs font-bold">
                            <button onClick={() => vote(a, 'upvote', 'answers')} className={cx(a.user_vote === 'upvote' && 'text-primary')}><ThumbsUp size={14} /></button>{a.vote_score}
                            <button onClick={() => vote(a, 'downvote', 'answers')} className={cx(a.user_vote === 'downvote' && 'text-secondary')}><ThumbsDown size={14} /></button>
                          </div>
                          <div className="flex-1 text-sm">
                            <p className="mb-1 flex flex-wrap items-center gap-2 text-xs"><b>{a.author.full_name}</b>
                              {a.is_faculty_verified && <Badge tone="primary"><BadgeCheck size={12} className="mr-1" />Verified by faculty</Badge>}
                              {a.is_accepted && <Badge tone="green">Accepted</Badge>}</p>
                            <p>{a.content}</p>
                            <div className="mt-1.5 flex gap-3 text-xs font-semibold text-gray-500"><button onClick={() => accept(a)} className="hover:text-emerald-700">{a.is_accepted ? 'Unaccept' : 'Accept answer'}</button><button onClick={() => verify(a)} className="hover:text-primary">Verify (faculty)</button></div>
                          </div>
                        </div>
                      ))}
                      {online && <div className="flex gap-2"><input className="input" placeholder="Write an answer…" value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reply()} /><button className="btn-primary" onClick={reply}><Send size={15} /></button></div>}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      <Modal open={!!flagFor} onClose={() => setFlagFor(null)} title="Report this post">
        <p className="mb-3 text-sm text-gray-600">Why are you reporting “{flagFor?.title}”? Teachers review all reports.</p>
        <div className="grid gap-2">{[['spam', 'Spam'], ['abuse', 'Abusive or harassing'], ['offtopic', 'Off topic'], ['other', 'Other']].map(([v, l]) => <button key={v} className="btn-ghost justify-start" onClick={() => sendFlag(v)}>{l}</button>)}</div>
      </Modal>
      {node}
    </>
  )
}
