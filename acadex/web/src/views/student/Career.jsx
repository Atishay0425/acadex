'use client'
import { useEffect, useState } from 'react'
import { Compass, Rocket, GraduationCap, Briefcase, WifiOff, Check } from 'lucide-react'
import { PageHeader, Card, Badge, Progress, Field, Empty, useToast, cx } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText, today } from '../../lib/classes'
import { CareerGuidance as MockCareer } from './Guidance'

const split = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

export default function Career() {
  const [toast, node] = useToast()
  const profile = useRemote('/career/profile')
  const [form, setForm] = useState({ interests: '', skills: '', cgpa: '' })
  const [pathId, setPathId] = useState(null)
  const [saved, setSaved] = useState(0)
  const sugg = useRemote(profile.data ? `/career/suggestions?v=${saved}` : null)
  const top = pathId ?? sugg.data?.suggestions?.[0]?.id
  const road = useRemote(top && profile.data ? `/career/roadmap/${top}?today=${today()}&v=${saved}` : null)

  useEffect(() => { if (profile.data) setForm({ interests: profile.data.interests.join(', '), skills: profile.data.skills.join(', '), cgpa: profile.data.cgpa ?? '' }) }, [profile.data])
  if (profile.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockCareer /></>

  const save = async () => {
    try {
      await api('/career/profile', { method: 'PUT', body: { interests: split(form.interests), skills: split(form.skills), cgpa: form.cgpa === '' ? null : Number(form.cgpa) } })
      setPathId(null); setSaved((n) => n + 1); profile.reload(); toast('Profile saved')
    } catch (e) { toast(errorText(e)) }
  }
  const list = sugg.data?.suggestions || []

  return (
    <>
      <PageHeader icon={Compass} title="Career Guidance" subtitle="Enter interests, skills and CGPA to get suggested paths, courses, internships and a placement roadmap" />
      <Card className="mb-5" title="Your profile" subtitle="Comma separated. Matches show what you have and what is missing.">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Interests"><input className="input" value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} placeholder="machine learning, web development" /></Field>
          <Field label="Skills"><input className="input" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="python, react, sql" /></Field>
          <Field label="CGPA (optional)"><input className="input" type="number" step="0.1" min="0" max="10" value={form.cgpa} onChange={(e) => setForm({ ...form, cgpa: e.target.value })} /></Field>
          <div className="flex items-end pb-3"><button className="btn-primary w-full" onClick={save}><Rocket size={16} /> Suggest paths</button></div>
        </div>
      </Card>

      {profile.loading ? <Empty text="Loading…" /> : !profile.data ? <Card><Empty text="Add your skills and interests above to see matching career paths." /></Card> : sugg.loading ? <Empty text="Loading…" /> : !list.length ? <Card><Empty text="No paths match yet. Try adding more skills or interests, such as python, sql, web development or cloud." /></Card> : (<>
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          {list.slice(0, 6).map((c) => (
            <Card key={c.id} className={cx(top === c.id && 'ring-2 ring-primary')}>
              <div className="mb-2 flex items-start justify-between gap-2"><h3 className="font-bold text-primary-dark">{c.title}</h3><Badge tone="primary">{c.score}% match</Badge></div>
              <Progress value={c.score} tone="bg-primary" className="mb-3" />
              <p className="label">Skills you have</p><div className="mb-2 flex flex-wrap gap-1.5">{c.matchedSkills.length ? c.matchedSkills.map((s) => <Badge key={s} tone="green"><Check size={11} className="mr-0.5" />{s}</Badge>) : <span className="text-xs text-gray-500">None yet</span>}</div>
              <p className="label">To learn</p><div className="mb-3 flex flex-wrap gap-1.5">{c.missingSkills.length ? c.missingSkills.map((s) => <Badge key={s}>{s}</Badge>) : <span className="text-xs text-emerald-700">You cover them all</span>}</div>
              {c.cgpaOk === false && <p className="mb-2 text-xs font-semibold text-amber-700">Employers often look for CGPA {c.minCgpa}+ here.</p>}
              <p className="label flex items-center gap-1"><GraduationCap size={13} />Courses</p><ul className="mb-3 text-sm">{c.courses.map((s) => <li key={s}>• {s}</li>)}</ul>
              <p className="label flex items-center gap-1"><Briefcase size={13} />Internships</p><ul className="mb-3 text-sm">{c.internships.map((s) => <li key={s}>• {s}</li>)}</ul>
              <button className={top === c.id ? 'btn-primary w-full' : 'btn-ghost w-full'} onClick={() => setPathId(c.id)}>{top === c.id ? 'Showing roadmap' : 'Show roadmap'}</button>
            </Card>
          ))}
        </div>
        {road.data && (
          <Card title="Placement roadmap" subtitle={`For ${road.data.path.title}`}>
            <ol className="grid gap-4 md:grid-cols-4">
              {road.data.phases.map((p, i) => (
                <li key={p.when} className="rounded-lg bg-primary-50 p-3"><span className="mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
                  <p className="text-sm font-bold text-primary-dark">{p.when} · {p.title}</p><ul className="mt-1 space-y-1 text-xs text-gray-600">{p.steps.map((s) => <li key={s}>{s}</li>)}</ul></li>
              ))}
            </ol>
          </Card>
        )}
      </>)}
      {node}
    </>
  )
}
