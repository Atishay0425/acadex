'use client'
import { useState } from 'react'
import { HeartHandshake, Compass, Users, MessagesSquare, Lightbulb, Star, EyeOff, CalendarPlus, Rocket, GraduationCap, Briefcase, ThumbsUp, Plus, Send, Hash, GitBranch } from 'lucide-react'
import { PageHeader, Card, Badge, Avatar, Modal, Field, Tabs, Progress, useToast, statusTone, cx } from '../../components/ui'
import { counsellors, careers, mentors, projects as seedProjects } from '../../data/mock'

/* ---------------------------------------------------------------- Student Counselling */
export function Counselling() {
  const [booked, setBooked] = useState([{ id: 1, who: 'Dr. Sunita Mehra', slot: 'Wed 14:00', type: 'Academic', note: 'Discuss low attendance in Cloud Computing', anon: false, status: 'Confirmed' }])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ c: counsellors[0].id, slot: '', type: 'Academic', note: '', anon: false })
  const [toast, node] = useToast()
  const cn = counsellors.find((c) => c.id === +form.c)
  const book = () => {
    if (!form.slot) return
    setBooked([{ id: Date.now(), who: cn.name, slot: form.slot, type: form.type, note: form.note, anon: form.anon, status: 'Requested' }, ...booked]); setOpen(false); toast('Session requested')
  }
  return (
    <>
      <PageHeader icon={HeartHandshake} title="Student Counselling" subtitle="Academic, career and personal support with notes, follow-ups and an anonymous option"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><CalendarPlus size={16} /> Book a session</button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Your sessions">
          <ul className="space-y-3">
            {booked.map((b) => (
              <li key={b.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{b.who} · {b.slot}</p><div className="flex gap-1.5">{b.anon && <Badge tone="gray"><EyeOff size={12} className="mr-1" />Anonymous</Badge>}<Badge tone={b.status === 'Confirmed' ? 'green' : 'amber'}>{b.status}</Badge></div></div>
                <p className="text-xs text-gray-500">{b.type} counselling</p>{b.note && <p className="mt-1.5 text-sm">{b.note}</p>}
                {b.status === 'Confirmed' && <div className="mt-2 rounded bg-primary-50 p-2 text-xs"><b className="text-primary">Follow-up:</b> Share your Cloud Computing attendance sheet before the session.</div>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Counsellors">
          <ul className="space-y-4">{counsellors.map((c) => <li key={c.id} className="flex gap-3"><Avatar name={c.name} /><div><p className="font-semibold">{c.name}</p><p className="text-xs text-gray-500">{c.area}</p><p className="mt-1 text-xs">Next: {c.slots.join(' · ')}</p></div></li>)}</ul>
        </Card>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Book a counselling session"
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={book}>Request session</button></>}>
        <Field label="Counsellor"><select className="input" value={form.c} onChange={(e) => setForm({ ...form, c: e.target.value, slot: '' })}>{counsellors.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.area}</option>)}</select></Field>
        <Field label="Slot"><div className="flex flex-wrap gap-2">{cn.slots.map((s) => <button key={s} onClick={() => setForm({ ...form, slot: s })} className={cx('rounded-lg border px-3 py-1.5 text-sm font-semibold', form.slot === s ? 'border-primary bg-primary-50 text-primary' : 'border-gray-200')}>{s}</button>)}</div></Field>
        <Field label="Type"><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>Academic</option><option>Career</option><option>Personal</option></select></Field>
        <Field label="What would you like to discuss?"><textarea className="input min-h-20" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.anon} onChange={(e) => setForm({ ...form, anon: e.target.checked })} /> Keep my identity anonymous</label>
      </Modal>
      {node}
    </>
  )
}

/* ---------------------------------------------------------------- Career Guidance */
export function CareerGuidance() {
  const [skills, setSkills] = useState('Python, React, SQL')
  const [interests, setInterests] = useState('Machine learning, Web development')
  const [shown, setShown] = useState(true)
  return (
    <>
      <PageHeader icon={Compass} title="Career Guidance" subtitle="Enter interests, skills and marks to get suggested paths, courses, internships and a placement roadmap" />
      <Card className="mb-5" title="Your profile">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Interests"><input className="input" value={interests} onChange={(e) => setInterests(e.target.value)} /></Field>
          <Field label="Skills"><input className="input" value={skills} onChange={(e) => setSkills(e.target.value)} /></Field>
          <Field label="CGPA"><input className="input" defaultValue="7.8" /></Field>
          <div className="flex items-end pb-3"><button className="btn-primary w-full" onClick={() => setShown(true)}><Rocket size={16} /> Suggest paths</button></div>
        </div>
      </Card>
      {shown && (
        <>
          <div className="mb-5 grid gap-5 lg:grid-cols-3">
            {careers.map((c) => (
              <Card key={c.title}>
                <div className="mb-2 flex items-start justify-between"><h3 className="font-bold text-primary-dark">{c.title}</h3><Badge tone="primary">{c.match}% match</Badge></div>
                <Progress value={c.match} tone="bg-primary" className="mb-3" />
                <p className="label">Key skills</p><div className="mb-3 flex flex-wrap gap-1.5">{c.skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                <p className="label flex items-center gap-1"><GraduationCap size={13} />Courses</p><ul className="mb-3 text-sm">{c.courses.map((s) => <li key={s}>• {s}</li>)}</ul>
                <p className="label flex items-center gap-1"><Briefcase size={13} />Internships</p><ul className="text-sm">{c.internships.map((s) => <li key={s}>• {s}</li>)}</ul>
              </Card>
            ))}
          </div>
          <Card title="Placement roadmap" subtitle="For Machine Learning Engineer">
            <ol className="grid gap-4 md:grid-cols-4">
              {[['Now – Dec', 'Strengthen DSA and Python. Finish a deep learning course.'], ['Jan – Mar', 'Build 2 ML projects and publish on GitHub.'], ['Apr – Jun', 'Apply for ML internships. Practise mock interviews.'], ['Jul – Sep', 'Campus drives. Polish resume and system design.']].map(([t, d], i) => (
                <li key={t} className="rounded-lg bg-primary-50 p-3"><span className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span><p className="text-sm font-bold text-primary-dark">{t}</p><p className="text-xs text-gray-600">{d}</p></li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- Mentorship */
export function Mentorship() {
  const [tab, setTab] = useState('mentors')
  const [q, setQ] = useState([{ id: 1, to: 'Karan Malhotra', text: 'How should I prepare for Microsoft’s online assessment?', anon: false, answer: 'Focus on medium-level graphs and DP. Solve 2 problems daily for 3 weeks.' }])
  const [form, setForm] = useState({ to: mentors[0].name, text: '', anon: true })
  const [rated, setRated] = useState({})
  const [toast, node] = useToast()
  const ask = () => { if (!form.text.trim()) return; setQ([{ id: Date.now(), ...form, answer: '' }, ...q]); setForm({ ...form, text: '' }); toast('Question sent') }
  return (
    <>
      <PageHeader icon={Users} title="Senior–Junior Mentorship" subtitle="Branch-wise mentors, college and career questions, anonymous questions and mentor ratings" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'mentors', label: 'Find a mentor' }, { id: 'questions', label: 'Ask a question', count: q.length }]} />
      {tab === 'mentors' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {mentors.map((m) => (
            <Card key={m.id}>
              <div className="flex gap-3"><Avatar name={m.name} size={46} tone="secondary" />
                <div className="flex-1"><p className="font-bold text-primary-dark">{m.name}</p><p className="text-xs text-gray-500">{m.year}</p><p className="text-xs font-semibold text-secondary">{m.company}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{m.topics.map((t) => <Badge key={t} tone="primary">{t}</Badge>)}</div></div>
                <div className="text-right"><p className="flex items-center justify-end gap-1 font-bold"><Star size={14} className="fill-amber-400 text-amber-400" />{m.rating}</p><p className="text-xs text-gray-500">{m.sessions} sessions</p></div></div>
              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => { setRated({ ...rated, [m.id]: n }); toast('Thanks for rating') }}><Star size={16} className={n <= (rated[m.id] || 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} /></button>)}</div>
                <button className="btn-ghost" onClick={() => { setForm({ ...form, to: m.name }); setTab('questions') }}>Ask a question</button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="New question">
            <Field label="Ask"><select className="input" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })}>{mentors.map((m) => <option key={m.id}>{m.name}</option>)}</select></Field>
            <Field label="Your question"><textarea className="input min-h-24" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></Field>
            <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.anon} onChange={(e) => setForm({ ...form, anon: e.target.checked })} /> Ask anonymously</label>
            <button className="btn-primary w-full" onClick={ask}><Send size={15} /> Send</button>
          </Card>
          <div className="space-y-3 lg:col-span-2">
            {q.map((x) => (
              <article key={x.id} className="card p-4"><div className="flex items-center gap-2 text-xs text-gray-500"><span>To {x.to}</span>{x.anon && <Badge><EyeOff size={11} className="mr-1" />Anonymous</Badge>}</div>
                <p className="mt-1 font-semibold">{x.text}</p>{x.answer ? <p className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm">{x.answer}</p> : <p className="mt-2 text-xs text-amber-700">Waiting for reply</p>}</article>
            ))}
          </div>
        </div>
      )}
      {node}
    </>
  )
}

/* ---------------------------------------------------------------- Project & Idea Hub */
export function ProjectHub() {
  const [list, setList] = useState(seedProjects)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', stack: '', mentor: 'Dr. Neha Verma' })
  const [toast, node] = useToast()
  const submit = () => {
    if (!form.title.trim()) return
    setList([{ id: Date.now(), title: form.title, owner: 'Aarav Sharma', mentor: form.mentor, stack: form.stack.split(',').map((s) => s.trim()).filter(Boolean), lookingFor: 2, progress: 0, status: 'Idea', description: form.description }, ...list]); setOpen(false); toast('Idea submitted for mentor review')
  }
  return (
    <>
      <PageHeader icon={Lightbulb} title="Project & Idea Hub" subtitle="Submit ideas, find teammates, get a faculty mentor and track progress"
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Submit idea</button>} />
      <div className="grid gap-5 md:grid-cols-2">
        {list.map((p) => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-2"><h3 className="font-bold text-primary-dark">{p.title}</h3><Badge tone={statusTone(p.status)}>{p.status}</Badge></div>
            <p className="mt-1 text-sm text-gray-600">{p.description}</p>
            <div className="my-3 flex flex-wrap gap-1.5">{p.stack.map((s) => <Badge key={s} tone="primary">{s}</Badge>)}</div>
            <p className="text-xs text-gray-500">Owner {p.owner} · Mentor {p.mentor}</p>
            <div className="mt-3"><div className="mb-1 flex justify-between text-xs font-semibold"><span>Progress</span><span>{p.progress}%</span></div><Progress value={p.progress} tone="bg-primary" /></div>
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-xs font-semibold text-secondary">{p.lookingFor > 0 ? `Looking for ${p.lookingFor} teammate${p.lookingFor > 1 ? 's' : ''}` : 'Team complete'}</span>
              <div className="flex gap-2"><button className="btn-ghost"><GitBranch size={14} /> Repo</button>{p.lookingFor > 0 && <button className="btn-primary" onClick={() => toast('Join request sent')}>Request to join</button>}</div>
            </div>
          </Card>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Submit a project idea"
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={submit}>Submit</button></>}>
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Tech stack (comma separated)"><input className="input" value={form.stack} onChange={(e) => setForm({ ...form, stack: e.target.value })} /></Field>
        <Field label="Preferred faculty mentor"><select className="input" value={form.mentor} onChange={(e) => setForm({ ...form, mentor: e.target.value })}>{['Dr. Neha Verma', 'Prof. Anil Rao', 'Dr. Priya Nair', 'Prof. Sameer Khan'].map((m) => <option key={m}>{m}</option>)}</select></Field>
      </Modal>
      {node}
    </>
  )
}
