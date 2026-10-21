import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { setup } from './helpers.js'

test('login returns tokens and the user, wrong password is rejected', async () => {
  const { app } = await setup()
  const ok = await request(app).post('/api/v1/auth/login').send({ email: 'Teacher@t.edu', password: 'password123' })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.user.role, 'teacher')
  assert.ok(ok.body.accessToken && ok.body.refreshToken)
  assert.equal(ok.body.user.password_hash, undefined)
  const bad = await request(app).post('/api/v1/auth/login').send({ email: 'teacher@t.edu', password: 'nope-nope' })
  assert.equal(bad.status, 401)
  const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@t.edu', password: 'password123' })
  assert.equal(unknown.status, 401)
})

test('protected routes need a valid bearer token', async () => {
  const { app, as } = await setup()
  assert.equal((await request(app).get('/api/v1/auth/me')).status, 401)
  assert.equal((await request(app).get('/api/v1/courses').set('Authorization', 'Bearer junk')).status, 401)
  const me = await as('student').get('/auth/me')
  assert.equal(me.status, 200)
  assert.equal(me.body.email, 'student@t.edu')
})

test('register creates a student only, even if a role is sent', async () => {
  const { app } = await setup()
  const res = await request(app).post('/api/v1/auth/register').send({ email: 'new@t.edu', password: 'longenough1', name: 'New Kid', role: 'admin' })
  assert.equal(res.status, 201)
  assert.equal(res.body.user.role, 'student')
  const dup = await request(app).post('/api/v1/auth/register').send({ email: 'new@t.edu', password: 'longenough1', name: 'New Kid' })
  assert.equal(dup.status, 409)
  const weak = await request(app).post('/api/v1/auth/register').send({ email: 'x@t.edu', password: 'short', name: 'X Y' })
  assert.equal(weak.status, 400)
})

test('refresh tokens rotate and cannot be reused; logout revokes', async () => {
  const { app } = await setup()
  const login = await request(app).post('/api/v1/auth/login').send({ email: 'student@t.edu', password: 'password123' })
  const r1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken })
  assert.equal(r1.status, 200)
  assert.notEqual(r1.body.refreshToken, login.body.refreshToken)
  assert.equal((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken })).status, 401)
  assert.equal((await request(app).post('/api/v1/auth/logout').send({ refreshToken: r1.body.refreshToken })).status, 204)
  assert.equal((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken })).status, 401)
})

test('a disabled account cannot log in', async () => {
  const { app, as, ids } = await setup()
  assert.equal((await as('admin').patch(`/users/${ids.student}`, { isActive: false })).status, 200)
  const res = await request(app).post('/api/v1/auth/login').send({ email: 'student@t.edu', password: 'password123' })
  assert.equal(res.status, 401)
})
