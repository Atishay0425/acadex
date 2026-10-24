import crypto from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

export const MAX_FILE_BYTES = 10 * 1024 * 1024

// Where file contents live. Disk for real use (api/uploads, git-ignored); memory for tests. Files are stored
// under a random key, never under the name the user gave, so a name cannot escape the folder.
export function createDiskStore(dir) {
  const full = (key) => path.join(dir, key)
  return {
    async save(buf) { await mkdir(dir, { recursive: true }); const key = crypto.randomBytes(24).toString('hex'); await writeFile(full(key), buf); return key },
    read: (key) => readFile(full(key)),
    remove: (key) => rm(full(key), { force: true }),
  }
}
export function createMemoryStore() {
  const m = new Map()
  return { m, async save(buf) { const k = crypto.randomBytes(24).toString('hex'); m.set(k, Buffer.from(buf)); return k }, async read(k) { if (!m.has(k)) throw new Error('missing'); return m.get(k) }, async remove(k) { m.delete(k) } }
}

const OFFICE = { '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const TEXT = { '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv' }

// What type a file really is, judged from its first bytes (and, for Office and text files, its extension).
// Anything not on this list (html, svg, scripts, executables, archives) is refused.
export function detectFile(buf, name) {
  const ext = path.extname(name).toLowerCase()
  if (buf.length > 4 && buf.toString('latin1', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: '.pdf' }
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return { mime: 'image/png', ext: '.png' }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' }
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: '.webp' }
  if (OFFICE[ext] && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return { mime: OFFICE[ext], ext }
  if (TEXT[ext] && !buf.includes(0)) return { mime: `${TEXT[ext]}; charset=utf-8`, ext }
  return null
}

export function cleanName(raw) {
  const base = path.basename(String(raw || '').replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim()
  return (base || 'file').slice(-120)
}

// Deletes files nothing refers to any more (an upload that was never attached, or whose submission or
// resource was removed) once they are older than `hours`.
export async function purgeOrphans(pool, store, hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600000).toISOString()
  const rows = (await pool.query('SELECT id, storage_key FROM files WHERE created_at < $1 AND id NOT IN (SELECT file_id FROM submission_files) AND id NOT IN (SELECT file_id FROM resources WHERE file_id IS NOT NULL)', [cutoff])).rows
  for (const f of rows) { await store.remove(f.storage_key); await pool.query('DELETE FROM files WHERE id = $1', [f.id]) }
  return rows.length
}
