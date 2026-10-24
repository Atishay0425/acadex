'use client'

import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import { Modal, useToast } from './ui'
import { previewFile } from '../lib/acadex'
import { errorText } from '../lib/classes'

// PDFs, images and text files can be shown in the page; Office files can only be downloaded.
export const canPreview = (mime) => /^(application\/pdf|image\/(png|jpeg|webp)|text\/)/.test(mime || '')

// A "Preview" button for an attached file ({ id, name, mime }) that opens it in a window. Renders nothing for types that cannot be previewed.
export function PreviewButton({ file, className = 'btn-ghost' }) {
  const toast = useToast()
  const [shown, setShown] = useState(null) // { url } or { text }
  const [open, setOpen] = useState(false)
  useEffect(() => () => { if (shown?.url) URL.revokeObjectURL(shown.url) }, [shown])
  if (!canPreview(file.mime)) return null

  async function show() {
    try { setShown(await previewFile(file.id)); setOpen(true) } catch (e) { toast(errorText(e)) }
  }
  const close = () => { setOpen(false); setShown(null) }
  const pdf = file.mime.startsWith('application/pdf')
  return (
    <>
      <button type="button" className={className} onClick={show}><Eye size={14} /> Preview</button>
      <Modal open={open} onClose={close} title={file.name} wide footer={<button className="btn-ghost" onClick={close}>Close</button>}>
        {shown?.text != null ? <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words text-sm text-gray-800">{shown.text}</pre>
          : shown?.url && (pdf ? <iframe src={shown.url} title={file.name} className="h-[65vh] w-full rounded border border-gray-200" />
            : /* eslint-disable-next-line @next/next/no-img-element */ <img src={shown.url} alt={file.name} className="mx-auto max-h-[65vh] max-w-full" />)}
      </Modal>
    </>
  )
}
