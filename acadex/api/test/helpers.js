import { newDb } from 'pg-mem'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { migrate } from '../src/db/migrate.js'

const config = { jwtSecret: 'test-secret', accessTtl: '15m', refreshDays: 7, corsOrigins: ['http://localhost:3000'], rateLimit: false }

// Fresh in-memory Postgres per test file: real SQL, real constraints, no server needed.
export async function setup() {
  const { Pool } = newDb().adapters.createPg()
  const pool = new Pool()
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
  const app = createApp({ pool, config })
  const tokens = {}
  const login = async (key, email) => { tokens[key] = (await request(app).post('/api/v1/auth/login').send({ email, password: 'password123' })).body.accessToken }
  await login('admin', 'admin@t.edu'); await login('teacher', 'teacher@t.edu'); await login('teacher2', 'teacher2@t.edu')
  await login('student', 'student@t.edu'); await login('student2', 'student2@t.edu')
  const as = (key) => ({
    get: (u) => request(app).get(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`),
    post: (u, b) => request(app).post(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`).send(b),
    put: (u, b) => request(app).put(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`).send(b),
    patch: (u, b) => request(app).patch(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`).send(b),
    del: (u) => request(app).delete(`/api/v1${u}`).set('Authorization', `Bearer ${tokens[key]}`),
  })
  return { app, pool, ids, as, request: (m, u, b) => request(app)[m](`/api/v1${u}`).send(b) }
}

// A course taught by `teacher` with `student` and `student2` enrolled.
export async function classroom(ctx) {
  const c = (await ctx.as('teacher').post('/courses', { code: 'CS101', title: 'Intro' })).body
  for (const key of ['student', 'student2']) await ctx.as('teacher').post(`/courses/${c.id}/students`, { studentId: ctx.ids[key] })
  return c
}
