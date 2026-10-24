import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import { HttpError, forbidden, notFound } from '../errors.js'
import { wrap } from '../middleware/errors.js'
import { limiter } from '../community/lib.js'
import { MAX_FILE_BYTES, cleanName, detectFile } from '../files.js'

const id = z.coerce.number().int().positive()
const MAX_FILES_PER_USER = 100, MAX_BYTES_PER_USER = 200 * 1024 * 1024

// Files are uploaded on their own (the raw bytes as the body, the name in X-File-Name), then attached to a
// submission or a class resource by id. A file can only be downloaded by people who may see what it is attached to.
export function filesRouter({ pool, config, files }) {
  const r = Router()

  r.post('/', limiter(config ?? {}, 'upload'), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), wrap(async (req, res) => {
    if (!files) throw new HttpError(503, 'File uploads are not available on this server')
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Send the file as the request body')
    let raw = req.get('x-file-name') || 'file'
    try { raw = decodeURIComponent(raw) } catch { /* keep it as sent */ }
    const name = cleanName(raw)
    const kind = detectFile(req.body, name)
    if (!kind) throw new HttpError(400, 'That file type is not allowed. Use PDF, PNG, JPG, WebP, DOCX, PPTX, XLSX, TXT, MD or CSV.')
    const used = (await pool.query('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM files WHERE owner_id = $1', [req.user.id])).rows[0]
    if (Number(used.n) >= MAX_FILES_PER_USER || Number(used.bytes) + req.body.length > MAX_BYTES_PER_USER) throw new HttpError(400, 'You have reached your storage limit. Remove old files first.')
    const key = await files.save(req.body)
    const { rows } = await pool.query('INSERT INTO files (owner_id, original_name, mime, size, storage_key) VALUES ($1, $2, $3, $4, $5) RETURNING *', [req.user.id, name, kind.mime, req.body.length, key])
    res.status(201).json({ id: rows[0].id, name, mime: kind.mime, size: req.body.length })
  }))

  // Owner, the course staff of a submission, the student who submitted, or anyone in the course of a resource.
  async function canRead(user, f) {
    if (f.owner_id === user.id || user.role === 'admin') return true
    const asSub = (await pool.query('SELECT s.student_id, a.course_id, c.teacher_id FROM submission_files sf JOIN submissions s ON s.id = sf.submission_id JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id WHERE sf.file_id = $1', [f.id])).rows
    if (asSub.some((x) => x.student_id === user.id || (user.role === 'teacher' && x.teacher_id === user.id))) return true
    const asRes = (await pool.query('SELECT x.course_id, c.teacher_id FROM resources x JOIN courses c ON c.id = x.course_id WHERE x.file_id = $1', [f.id])).rows
    for (const x of asRes) {
      if (user.role === 'teacher' && x.teacher_id === user.id) return true
      if (user.role === 'student' && (await pool.query('SELECT 1 FROM enrollments WHERE course_id = $1 AND student_id = $2', [x.course_id, user.id])).rows.length) return true
    }
    return false
  }

  r.get('/:fid', wrap(async (req, res) => {
    const f = (await pool.query('SELECT * FROM files WHERE id = $1', [id.parse(req.params.fid)])).rows[0]
    if (!f || !(await canRead(req.user, f))) throw notFound('File not found')
    let data
    try { data = await files.read(f.storage_key) } catch { throw notFound('File not found') }
    res.set({
      'Content-Type': f.mime, 'Content-Length': String(data.length), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${f.original_name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.original_name)}`,
    })
    res.send(data)
  }))

  // An uploader can remove a file that is not attached to anything yet.
  r.delete('/:fid', wrap(async (req, res) => {
    const f = (await pool.query('SELECT * FROM files WHERE id = $1 AND owner_id = $2', [id.parse(req.params.fid), req.user.id])).rows[0]
    if (!f) throw notFound('File not found')
    const used = (await pool.query('SELECT 1 FROM submission_files WHERE file_id = $1 UNION ALL SELECT 1 FROM resources WHERE file_id = $1', [f.id])).rows.length
    if (used) throw new HttpError(409, 'This file is attached to something. Remove it from there first.')
    await files.remove(f.storage_key); await pool.query('DELETE FROM files WHERE id = $1', [f.id])
    res.status(204).end()
  }))

  return r
}
