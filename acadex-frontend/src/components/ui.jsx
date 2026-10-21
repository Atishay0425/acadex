'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import {
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'

export const cx = (...a) => a.filter(Boolean).join(' ')

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary">
            <Icon size={20} />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-primary-dark">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, subtitle, action, children, className, pad = true }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-primary-dark">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, hint, icon: Icon, tone = 'primary', trend }) {
  const tones = {
    primary: 'bg-primary-100 text-primary',
    secondary: 'bg-secondary-100 text-secondary',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  }
  return (
    <div className="card flex items-start justify-between gap-3 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-primary-dark">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
        {trend && (
          <p className={cx('mt-1 text-xs font-semibold', trend.startsWith('-') ? 'text-secondary' : 'text-emerald-700')}>
            {trend}
          </p>
        )}
      </div>
      {Icon && (
        <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone])}>
          <Icon size={20} />
        </div>
      )}
    </div>
  )
}

const badgeTones = {
  gray: 'bg-gray-100 text-gray-700',
  primary: 'bg-primary-100 text-primary',
  red: 'bg-secondary-100 text-secondary',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
}
export function Badge({ children, tone = 'gray' }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', badgeTones[tone])}>
      {children}
    </span>
  )
}
export const riskTone = (l) => ({ High: 'red', Medium: 'amber', Low: 'green', high: 'red', medium: 'amber', low: 'green' }[l] || 'gray')
export const statusTone = (s) =>
  ({ Open: 'amber', 'In progress': 'primary', Resolved: 'green', Completed: 'green', Idea: 'gray', Suspended: 'red', Active: 'green' }[s] || 'gray')

export function Progress({ value, tone, className }) {
  const color = tone || (value >= 75 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-secondary')
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-gray-100', className)}>
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  )
}

export function Avatar({ name, size = 36, tone = 'primary' }) {
  const initials = name.split(' ').filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <div
      className={cx('flex shrink-0 items-center justify-center rounded-full font-bold', tone === 'primary' ? 'bg-primary text-white' : 'bg-secondary text-white')}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
            value === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-primary-dark',
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h3 className="font-bold text-primary-dark">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </header>
        <div className="p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export function Table({ columns, rows, onRow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>{columns.map((c) => <th key={c.key} className="th">{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <tr key={r.id ?? i} onClick={onRow ? () => onRow(r) : undefined} className={cx('hover:bg-primary-50/60', onRow && 'cursor-pointer')}>
              {columns.map((c) => <td key={c.key} className="td">{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Empty({ text }) {
  return <p className="py-8 text-center text-sm text-gray-500">{text}</p>
}

export function useToast() {
  const [msg, setMsg] = useState(null)
  const show = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2400) }
  const node = msg ? (
    <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-primary-dark px-4 py-2.5 text-sm font-semibold text-white shadow-lg">{msg}</div>
  ) : null
  return [show, node]
}

// Shared chart styling
export const chartColors = { primary: 'hsl(230,54%,34%)', secondary: 'hsl(352,70%,37%)', light: 'hsl(230,54%,70%)', green: '#2e9e6b', amber: '#e0a21c' }
export const axisProps = { tick: { fontSize: 11, fill: '#6b7280' }, axisLine: false, tickLine: false }
export function ChartFrame({ height = 240, children }) {
  return <div style={{ height }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
}
export { CartesianGrid, XAxis, YAxis, Tooltip, Legend }
