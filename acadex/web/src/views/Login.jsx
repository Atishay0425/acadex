'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '../lib/auth'
import { login, ApiError } from '../lib/acadex'
import { GraduationCap, UserRound, Presentation, ShieldCheck, Eye } from 'lucide-react'
import { cx } from '../components/ui'

const roles = [
  { id: 'student', user: 'aarav', label: 'Student', icon: UserRound, email: 'aarav.sharma@college.edu', desc: 'Doubts, planner, performance, guidance and community' },
  { id: 'teacher', user: 'neha', label: 'Teacher', icon: Presentation, email: 'neha.verma@college.edu', desc: 'Doubt inbox, class performance and early warning' },
  { id: 'admin', user: 'admin', label: 'Admin', icon: ShieldCheck, email: 'admin@college.edu', desc: 'Analytics, tickets routing, users and alert rules' },
]

export default function Login() {
  const [role, setRole] = useState('student')
  const [email, setEmail] = useState(roles[0].email)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const r = roles.find((x) => x.id === role)
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary"><GraduationCap size={20} /></span> Acadex
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold leading-tight">From a portal<br />to a daily companion.</h1>
          <p className="mt-3 max-w-md text-white/80">Learn. Plan. Connect. Grow. Advanced learning, guidance and support features for your College Management System.</p>
          <div className="mt-8 grid max-w-md grid-cols-2 gap-3 text-sm">
            {['Faculty Doubt Desk', 'Smart Notes', 'Study Planner', 'Early Warning System', 'Mentorship', 'Project & Idea Hub'].map((f) => (
              <div key={f} className="rounded-lg bg-white/10 px-3 py-2 font-semibold">{f}</div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/60">Major project · Acadex Smart Student Management</p>
        <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-white/5" />
        <div className="absolute -right-10 top-24 h-40 w-40 rounded-3xl bg-secondary/30" />
      </div>

      <div className="flex items-center justify-center bg-white p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-primary-dark">Already a Member? Please proceed.</h2>
          <p className="mt-1 text-sm text-gray-500">Sign in with your college account.</p>
          <div className="mt-5 grid gap-2">
            {roles.map((x) => (
              <button
                key={x.id}
                onClick={() => { setRole(x.id); setEmail(x.email); setError('') }}
                className={cx('flex items-center gap-3 rounded-xl border p-3 text-left transition-colors', role === x.id ? 'border-primary bg-primary-50' : 'border-gray-200 hover:bg-gray-50')}
              >
                <span className={cx('flex h-9 w-9 items-center justify-center rounded-lg', role === x.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600')}><x.icon size={18} /></span>
                <span>
                  <span className="block text-sm font-bold text-primary-dark">{x.label}</span>
                  <span className="block text-xs text-gray-500">{x.desc}</span>
                </span>
              </button>
            ))}
          </div>
          <form className="mt-5" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError('')
            try {
              const user = await login(email, password)
              signIn(user.role); router.push(`/${user.role}`)
            } catch (err) {
              // Wrong credentials stay on this page; only an unreachable API drops into demo mode.
              if (err instanceof ApiError) { setError(err.message); setBusy(false); return }
              signIn(role); router.push(`/${role}`)
            }
          }}>
            <label className="label">Email address</label>
            <input className="input mb-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <label className="label">Password</label>
            <div className="relative mb-1">
              <input className="input pr-9" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Eye size={16} className="absolute right-3 top-2.5 text-gray-400" />
            </div>
            {error && <p className="mb-2 text-xs font-semibold text-secondary">{error}</p>}
            <p className="mb-4 text-right text-xs font-semibold text-primary">Forgot password?</p>
            <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? 'Signing in…' : `Log in as ${r.label}`}</button>
            <p className="mt-3 text-center text-xs text-gray-500">API offline? You will enter the demo portal with sample data.</p>
          </form>
        </div>
      </div>
    </div>
  )
}
