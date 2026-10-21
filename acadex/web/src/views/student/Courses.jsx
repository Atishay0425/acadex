'use client'
import { useState } from 'react'
import { BookOpen, WifiOff } from 'lucide-react'
import { PageHeader, Card, Badge, Table, Tabs, Empty, useToast } from '../../components/ui'
import { api, useRemote } from '../../lib/acadex'
import { courseCatalogue } from '../../data/mock'

export default function StudentCourses() {
  const [tab, setTab] = useState('mine')
  const [toast, node] = useToast()
  const { data, loading, offline, error, reload } = useRemote('/courses?scope=all')
  const all = offline ? courseCatalogue : data || []
  const rows = tab === 'mine' ? all.filter((c) => c.enrolled) : all

  const toggle = async (c) => {
    if (offline) return toast('Demo data: connect the API to enrol')
    try {
      await api(`/courses/${c.id}/enroll`, { method: c.enrolled ? 'DELETE' : 'POST' })
      toast(c.enrolled ? `Dropped ${c.code}` : `Enrolled in ${c.code}`); reload()
    } catch (e) { toast(e.message) }
  }

  return (
    <>
      <PageHeader icon={BookOpen} title="My Courses" subtitle="Courses you are enrolled in, and the catalogue you can join"
        actions={offline && <Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'mine', label: 'Enrolled', count: all.filter((c) => c.enrolled).length }, { id: 'all', label: 'Catalogue', count: all.length }]} />
      <Card pad={false}>
        {error ? <Empty text={error} /> : loading ? <Empty text="Loading…" /> : !rows.length ? <Empty text={tab === 'mine' ? 'You are not enrolled in any course yet. Browse the catalogue.' : 'No courses yet.'} /> : (
          <Table rows={rows} columns={[
            { key: 'code', label: 'Code', render: (c) => <span className="font-bold text-primary-dark">{c.code}</span> },
            { key: 'title', label: 'Course' },
            { key: 'teacher', label: 'Faculty', render: (c) => c.teacher?.name ?? 'Unassigned' },
            { key: 'semester', label: 'Sem', render: (c) => c.semester ?? '-' },
            { key: 'studentCount', label: 'Students' },
            { key: 'act', label: '', render: (c) => <button className={c.enrolled ? 'btn-ghost' : 'btn-primary'} onClick={() => toggle(c)}>{c.enrolled ? 'Drop' : 'Enrol'}</button> },
          ]} />
        )}
      </Card>
      {node}
    </>
  )
}
