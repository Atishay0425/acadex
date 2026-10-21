import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'
import { createPool } from './pool.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../migrations')

// Applies each migrations/NNN_*.sql once, in order. Applied files are recorded and never re-run or edited.
export async function migrate(pool) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)')
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (done.has(file)) continue
    const sql = await readFile(path.join(dir, file), 'utf8')
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await pool.query(stmt)
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    console.log(`applied ${file}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(loadConfig().databaseUrl)
  await migrate(pool)
  await pool.end()
}
