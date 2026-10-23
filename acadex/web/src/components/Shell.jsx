'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from '../lib/auth'
import {
  LayoutDashboard, MessageCircleQuestion, NotebookPen, CalendarCheck, LineChart, BellRing, HeartHandshake,
  Compass, Users, MessagesSquare, Lightbulb, LifeBuoy, GraduationCap, Search, Bell, Menu, LogOut, ChevronDown,
  ShieldAlert, ClipboardList, FolderKanban, Settings, BarChart3, Building2, UserCog, Brain, Inbox, BookOpen, School, Library, CalendarDays, ClipboardCheck, ListChecks, FileText, HeartPulse,
} from 'lucide-react'
import { Avatar, cx } from './ui'
import { me } from '../data/mock'

const NAV = {
  student: [
    { group: null, items: [{ to: '', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    { group: 'Learn smarter', items: [
      { to: 'courses', label: 'My Courses', icon: BookOpen },
      { to: 'assignments', label: 'Assignments', icon: FileText },
      { to: 'doubts', label: 'Faculty Doubt Desk', icon: MessageCircleQuestion },
      { to: 'notes', label: 'Smart Notes', icon: NotebookPen },
      { to: 'planner', label: 'Study Planner', icon: CalendarCheck },
    ] },
    { group: 'Stay on track', items: [
      { to: 'records', label: 'Attendance & Marks', icon: ListChecks },
      { to: 'performance', label: 'Performance Analyzer', icon: LineChart },
      { to: 'alerts', label: 'Early Warning', icon: BellRing },
      { to: 'help', label: 'Student Help Center', icon: LifeBuoy },
    ] },
    { group: 'Get guidance', items: [
      { to: 'counselling', label: 'Counselling', icon: HeartHandshake },
      { to: 'career', label: 'Career Guidance', icon: Compass },
      { to: 'mentorship', label: 'Mentorship', icon: Users },
    ] },
    { group: 'Build together', items: [
      { to: 'community', label: 'Student Community', icon: MessagesSquare },
      { to: 'projects', label: 'Project & Idea Hub', icon: Lightbulb },
    ] },
  ],
  teacher: [
    { group: null, items: [{ to: '', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
    { group: 'Teaching', items: [
      { to: 'classes', label: 'My Classes', icon: School },
      { to: 'attendance', label: 'Attendance', icon: CalendarDays },
      { to: 'marks', label: 'Marks', icon: ClipboardCheck },
      { to: 'assignments', label: 'Assignments', icon: FileText },
      { to: 'doubts', label: 'Doubt Inbox', icon: Inbox },
      { to: 'resources', label: 'Class Resources', icon: NotebookPen },
    ] },
    { group: 'Student success', items: [
      { to: 'students', label: 'Class Performance', icon: BarChart3 },
      { to: 'at-risk', label: 'Early Warning', icon: ShieldAlert },
      { to: 'mentees', label: 'Mentees & Counselling', icon: HeartHandshake },
      { to: 'counselling', label: 'Counsellor Desk', icon: HeartPulse },
    ] },
    { group: 'Projects', items: [{ to: 'projects', label: 'Project Reviews', icon: FolderKanban }] },
  ],
  admin: [
    { group: null, items: [{ to: '', label: 'Analytics Dashboard', icon: LayoutDashboard, end: true }] },
    { group: 'Insights', items: [
      { to: 'risk', label: 'Risk & Interventions', icon: ShieldAlert },
      { to: 'model', label: 'Model Monitoring', icon: Brain },
      { to: 'engagement', label: 'Module Usage', icon: BarChart3 },
    ] },
    { group: 'Operations', items: [
      { to: 'tickets', label: 'Help Center Routing', icon: LifeBuoy },
      { to: 'moderation', label: 'Community Moderation', icon: ClipboardList },
    ] },
    { group: 'Administration', items: [
      { to: 'courses', label: 'Courses', icon: Library },
      { to: 'users', label: 'Users & Roles', icon: UserCog },
      { to: 'departments', label: 'Departments', icon: Building2 },
      { to: 'settings', label: 'Alert Rules', icon: Settings },
    ] },
  ],
}

const ROLE_LABEL = { student: 'Student', teacher: 'Teacher', admin: 'Admin' }

export default function Shell({ role, children }) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const user = me[role]
  const base = `/${role}`

  return (
    <div className="flex h-full flex-col">
      {/* Top bar (Azure-style command bar) */}
      <header className="z-30 flex h-12 shrink-0 items-center gap-3 bg-primary-dark px-3 text-white">
        <button className="rounded p-1.5 hover:bg-white/10 lg:hidden" onClick={() => setOpen(!open)}><Menu size={20} /></button>
        <div className="flex items-center gap-2 font-bold">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary"><GraduationCap size={17} /></span>
          <span className="hidden sm:inline">Acadex</span>
          <span className="hidden rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide sm:inline">{ROLE_LABEL[role]}</span>
        </div>
        <div className="mx-auto hidden w-full max-w-xl items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 md:flex">
          <Search size={15} className="text-white/70" />
          <input className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/60" placeholder="Search doubts, notes, students, tickets…" />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="relative rounded p-2 hover:bg-white/10">
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-secondary-light" />
          </button>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/10">
              <Avatar name={user.name} size={28} tone="secondary" />
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-semibold">{user.name}</span>
                <span className="block text-[11px] text-white/70">{user.id}</span>
              </span>
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="absolute right-0 top-full mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-ink shadow-lg">
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase text-gray-500">Switch portal</p>
                {Object.keys(ROLE_LABEL).filter((r) => r !== role).map((r) => (
                  <button key={r} onClick={() => { setMenu(false); router.push(`/${r}`) }} className="block w-full px-3 py-2 text-left text-sm hover:bg-primary-50">
                    {ROLE_LABEL[r]} portal
                  </button>
                ))}
                <button onClick={() => { signOut(); router.push('/') }} className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-secondary hover:bg-secondary-50">
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className={cx(
          'absolute inset-y-12 left-0 z-20 w-64 shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-3 py-4 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}>
          {NAV[role].map((g, i) => (
            <div key={i} className="mb-3">
              {g.group && <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">{g.group}</p>}
              {g.items.map((it) => (
                <Link
                  key={it.label}
                  href={it.to ? `${base}/${it.to}` : base}
                  onClick={() => setOpen(false)}
                  className={cx(
                    'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                    (it.to ? pathname.startsWith(`${base}/${it.to}`) : pathname === base) ? 'bg-primary-100 text-primary' : 'text-gray-600 hover:bg-gray-100',
                  )}
                >
                  <it.icon size={18} /> {it.label}
                </Link>
              ))}
            </div>
          ))}
        </aside>
        {open && <div className="fixed inset-0 z-10 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />}

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
