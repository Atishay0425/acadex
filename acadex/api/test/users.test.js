import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

test('admin lists and filters users; students are refused', async () => {
  const { as } = await setup()
  const all = await as('admin').get('/users')
  assert.equal(all.body.length, 5)
  const teachers = await as('admin').get('/users?role=teacher')
  assert.deepEqual(teachers.body.map((u) => u.role), ['teacher', 'teacher'])
  assert.equal((await as('student').get('/users')).status, 403)
})

test('teachers only see students, whatever role they ask for', async () => {
  const { as } = await setup()
  const res = await as('teacher').get('/users?role=admin')
  assert.equal(res.status, 200)
  assert.ok(res.body.length > 0 && res.body.every((u) => u.role === 'student'))
})

test('only an admin can create or edit accounts', async () => {
  const { as } = await setup()
  const body = { email: 'prof@t.edu', name: 'New Prof', role: 'teacher', password: 'longenough1' }
  assert.equal((await as('teacher').post('/users', body)).status, 403)
  const created = await as('admin').post('/users', body)
  assert.equal(created.status, 201)
  assert.equal(created.body.role, 'teacher')
  assert.equal((await as('admin').post('/users', body)).status, 409)
  const patched = await as('admin').patch(`/users/${created.body.id}`, { department: 'Physics' })
  assert.equal(patched.body.department, 'Physics')
  assert.equal((await as('admin').patch(`/users/${created.body.id}`, {})).status, 400)
  assert.equal((await as('admin').patch('/users/9999', { name: 'Nobody' })).status, 404)
})
