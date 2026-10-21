import pg from 'pg'

// DATE columns come back as 'YYYY-MM-DD' strings, not local-midnight Date objects that shift across time zones.
pg.types.setTypeParser(1082, (v) => v)

export function createPool(databaseUrl) {
  return new pg.Pool({ connectionString: databaseUrl })
}

// Runs fn(client) in one transaction; rolls back if it throws.
export async function withTx(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export const dateStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)
