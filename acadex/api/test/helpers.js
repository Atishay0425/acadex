import { newDb } from 'pg-mem'
import pg from 'pg'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { migrate } from '../src/db/migrate.js'
import { createMemoryStore } from '../src/files.js'

const config = { jwtSecret: 'test-secret', accessTtl: '12h' /* tests log in once per test; a slow or busy machine must not expire the token mid-test */, refreshDays: 7, corsOrigins: ['http://localhost:3000'], rateLimit: false, flagHideThreshold: 2, webUrl: 'http://localhost:3000' }

// With TEST_DATABASE_URL set, tests run on a real PostgreSQL, each in its own throwaway schema. Otherwise they
// run on the in-memory pg-mem emulator, which needs no server.
const schemas = []
async function createTestPool() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) { const { Pool } = newDb().adapters.createPg(); return new Pool() }
  const schema = `t_${crypto.randomBytes(6).toString('hex')}`
  const admin = new pg.Pool({ connectionString: url, max: 1 })
  await admin.query(`CREATE SCHEMA ${schema}`)
  await admin.end()
  schemas.push(schema)
  // Idle connections close quickly: every test makes its own pool and PostgreSQL's default limit is 100 clients.
  return new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4, idleTimeoutMillis: 300 })
}
process.once('beforeExit', async () => {
  if (!schemas.length) return
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 })
  for (const s of schemas.splice(0)) await admin.query(`DROP SCHEMA ${s} CASCADE`).catch(() => {})
  await admin.end()
})

// Fresh database per test: real SQL, real constraints, no server needed.
export async function setup({ mailer, pusher, ocr, redis, rateLimit, files = createMemoryStore() } = {}) {
  const pool = await createTestPool()
  await migrate(pool)
  const hash = await bcrypt.hash('password123', 4)
  const mk = async (email, name, role) =>
    (await pool.query('INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4) RETURNING id', [email, name, role, hash])).rows[0].id
  const ids = {
    admin: await mk('admin@t.edu', 'Admin', 'admin'),
    teacher: await mk('teacher@t.edu', 'Teacher One', 'teacher'),
    teacher2: await mk('teacher2@t.edu', 'Teacher Two', 'teacher'),
    student: await mk('student@t.edu', 'Student One', 'student'),
    student2: await mk('student2@t.edu', 'Student Two', 'student'),
  }
  // Counts every query the app runs, so tests can assert a list does not issue per-row queries.
  let queries = 0
  const counted = { query: (...a) => { queries++; return pool.query(...a) }, connect: () => pool.connect() }
  const app = createApp({ pool: counted, config: { ...config, redis, rateLimit: rateLimit ?? config.rateLimit }, mailer, pusher, ocr, files })
  const tokens = {}
  const login = async (key, email) => { tokens[key] = (await request(app).post('/api/v1/auth/login').send({ email, password: 'password123' })).body.accessToken }
  await login('admin', 'admin@t.edu'); await login('teacher', 'teacher@t.edu'); await login('teacher2', 'teacher2@t.edu')
  await login('student', 'student@t.edu'); await login('student2', 'student2@t.edu')
  const as = (key) => ({
    get: (u) => request(app).get(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`),
    post: (u, b) => request(app).post(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`).send(b),
    put: (u, b) => request(app).put(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`).send(b),
    patch: (u, b) => request(app).patch(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`).send(b),
    upload: (name, buf) => request(app).post('/api/v1/files').set('Authorization', `Bearer ${tokens[key]}`).set('X-File-Name', encodeURIComponent(name)).set('Content-Type', 'application/octet-stream').send(buf),
    download: (id) => request(app).get(`/api/v1/files/${id}`).set('Authorization', `Bearer ${tokens[key]}`).buffer(true).parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))) }),
    raw: (u, buf, type) => request(app).post(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`).set('Content-Type', type).send(buf),
    del: (u) => request(app).delete(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`),
  })
  return { app, pool, ids, as, login, queryCount: () => queries, request: (m, u, b) => request(app)[m](`/api/v1${u}`).send(b) }
}

// A course taught by `teacher` with `student` and `student2` enrolled.
export async function classroom(ctx) {
  const c = (await ctx.as('teacher').post('/courses', { code: 'CS101', title: 'Intro' })).body
  for (const key of ['student', 'student2']) await ctx.as('teacher').post(`/courses/${c.id}/students`, { studentId: ctx.ids[key] })
  return c
}
