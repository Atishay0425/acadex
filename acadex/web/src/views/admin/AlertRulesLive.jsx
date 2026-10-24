'use client'
import { useEffect, useState } from 'react'
import { Settings, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { errorText } from '../../lib/classes'
import { AlertRules as MockRules } from './Admin'

const ROWS = [
  ['attendanceTarget', 'Minimum attendance', '%', 'Below this, attendance adds risk (full points 40 points lower).'],
  ['marksFloor', 'Marks floor', '%', 'Below this, low marks add risk (full points 40 points lower).'],
  ['missingFull', 'Overdue assignments for full risk', '', 'This many overdue assignments add the maximum assignment risk.'],
  ['dropFull', 'Marks drop for full risk', ' pts', 'A latest score this far below the earlier average adds the maximum trend risk.'],
  ['medium', 'Medium risk from score', '', 'Scores at or above this are flagged medium.'],
  ['high', 'High risk from score', '', 'Scores at or above this are flagged high.'],
]

export default function AlertRulesLive() {
  const [toast, node] = useToast()
  const rules = useRemote('/admin/rules')
  const [v, setV] = useState(null)
  const [effect, setEffect] = useState(null)
  useEffect(() => { if (rules.data) setV(rules.data.rules) }, [rules.data])

  if (rules.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><MockRules /></>
  if (rules.loading || !v) return <Card><Empty text={rules.error || 'Loading…'} /></Card>
  const { limits, defaults } = rules.data
  const changed = Object.keys(defaults).some((k) => v[k] !== rules.data.rules[k])

  const save = async () => {
    try { const r = await api('/admin/rules', { method: 'PUT', body: v }); setEffect(r.distribution); toast('Rules saved'); rules.reload() } catch (e) { toast(errorText(e)) }
  }
  return (
    <>
      <PageHeader icon={Settings} title="Alert rules" subtitle="Thresholds the Early Warning score uses. Saving applies to everyone straight away."
        actions={<><button className="btn-ghost" onClick={() => setV(defaults)}>Reset to defaults</button><button className="btn-primary" disabled={!changed} onClick={save}>Save changes</button></>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Thresholds">
          {ROWS.map(([k, label, unit, help]) => (
            <div key={k} className="mb-5">
              <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{label}</span><b className="text-primary">{v[k]}{unit}{v[k] !== defaults[k] && <span className="ml-1 text-xs font-normal text-gray-400">(default {defaults[k]})</span>}</b></div>
              <input aria-label={label} type="range" min={limits[k][0]} max={limits[k][1]} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className="w-full accent-[hsl(230,54%,34%)]" />
              <p className="text-xs text-gray-500">{help}</p>
            </div>
          ))}
          {v.medium >= v.high && <p className="text-sm font-semibold text-secondary">The medium cut-off must be lower than the high cut-off.</p>}
        </Card>
        <Card title="Effect on students" subtitle="Shown after you save">
          {!effect ? <p className="text-sm text-gray-500">Save to see how many students are low, medium and high with these rules.</p> : (
            <ul className="space-y-2 text-sm">{[['high', 'High risk'], ['medium', 'Medium risk'], ['low', 'Low risk']].map(([k, l]) => <li key={k} className="flex justify-between"><span>{l}</span><b>{effect[k]}</b></li>)}</ul>
          )}
          <p className="mt-4 text-xs text-gray-500">Attendance and marks “weak subject” flags on student pages keep their fixed 75% and 60% marks. Email and push preferences are set by each person from the bell.</p>
        </Card>
      </div>
      {node}
    </>
  )
}
