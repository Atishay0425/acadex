'use client'
import { useState } from 'react'
import { FolderOpen, FileText, Link2, ExternalLink, WifiOff, NotebookPen, File as FileIcon, Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { PageHeader, Card, Badge, Modal, Empty, useToast } from '../../components/ui'
import { PreviewButton } from '../../components/FilePreview'
import { api, useRemote, downloadFile } from '../../lib/acadex'
import { errorText, ago, fmtSize } from '../../lib/classes'

export default function Resources() {
  const courses = useRemote('/courses')
  const [courseId, setCourseId] = useState(null)
  if (courses.offline) return <><div className="mb-3"><Badge tone="amber"><WifiOff size={12} className="mr-1" />Demo data · API offline</Badge></div><Card><Empty text="Class resources need the API. Start it and sign in again." /></Card></>
  const list = courses.data || []
  const course = list.find((c) => c.id === courseId) || list[0]
  return (
    <>
      <PageHeader icon={FolderOpen} title="Class Resources" subtitle="Notes and links your teachers shared. Add a note to Smart Notes to get a summary, questions and a quiz."
        actions={list.length > 1 && <select className="input w-auto" value={course.id} onChange={(e) => setCourseId(Number(e.target.value))}>{list.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}</select>} />
      {courses.loading ? <Card><Empty text="Loading…" /></Card> : !course ? <Card><Empty text="Enrol in a course to see its resources." /></Card> : <CourseResources key={course.id} course={course} />}
    </>
  )
}

function CourseResources({ course }) {
  const [toast, node] = useToast()
  const router = useRouter()
  const res = useRemote(`/courses/${course.id}/resources`)
  const [open, setOpen] = useState(null)
  const addToNotes = async (x) => {
    try { const r = await api(`/courses/${course.id}/resources/${x.id}/import`, { method: 'POST' }); toast(r.already ? 'Already in your Smart Notes' : 'Added to Smart Notes'); res.reload(); setOpen(null); router.push('/student/notes') } catch (e) { toast(errorText(e)) }
  }
  return (
    <>
      {res.loading ? <Empty text="Loading…" /> : res.error ? <Empty text={res.error} /> : !res.data.length ? <Card><Empty text="Your teacher has not shared anything for this course yet." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {res.data.map((x) => (
            <Card key={x.id}>
              <div className="flex items-start justify-between gap-2"><h3 className="flex items-center gap-2 font-bold text-primary-dark">{x.kind === 'note' ? <FileText size={17} className="text-primary" /> : x.kind === 'file' ? <FileIcon size={17} className="text-primary" /> : <Link2 size={17} className="text-primary" />}{x.title}</h3>{x.imported && <Badge tone="green">In Smart Notes</Badge>}</div>
              <p className="mt-1 line-clamp-3 text-sm text-gray-600">{x.kind === 'note' ? x.content : x.kind === 'file' ? `${x.file.name} · ${fmtSize(x.file.size)}${x.content ? `. ${x.content}` : ''}` : x.content || x.url}</p>
              <p className="mt-2 text-xs text-gray-500">{x.teacher} · {ago(x.createdAt)}</p>
              <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                {x.kind === 'note' ? (<><button className="btn-ghost" onClick={() => setOpen(x)}>Read</button><button className="btn-primary" onClick={() => addToNotes(x)}><NotebookPen size={14} /> {x.imported ? 'Open in Smart Notes' : 'Add to Smart Notes'}</button></>)
                  : x.kind === 'file' ? <><PreviewButton file={x.file} /><button className="btn-primary" onClick={() => downloadFile(x.file.id, x.file.name).catch((e) => toast(errorText(e)))}><Download size={14} /> Download</button></>
                  : <a className="btn-primary" href={x.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} /> Open link</a>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title} footer={<><button className="btn-ghost" onClick={() => setOpen(null)}>Close</button><button className="btn-primary" onClick={() => addToNotes(open)}>Add to Smart Notes</button></>}>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{open?.content}</p>
      </Modal>
      {node}
    </>
  )
}
