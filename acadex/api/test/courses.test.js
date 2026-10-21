import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const course = { code: 'cs101', title: 'Intro to Computing', semester: 1 }

test('a teacher creates a course and owns it; students cannot create', async () => {
  const { as, ids } = await setup()
  const res = await as('teacher').post('/courses', { ...course, teacherId: ids.teacher2 })
  assert.equal(res.status, 201)
  assert.equal(res.body.code, 'CS101')
  assert.equal(res.body.teacher.id, ids.teacher)
  assert.equal((await as('student').post('/courses', course)).status, 403)
  assert.equal((await as('teacher').post('/courses', course)).status, 409)
})

test('admin assigns a teacher, and only to a teacher account', async () => {
  const { as, ids } = await setup()
  const ok = await as('admin').post('/courses', { ...course, teacherId: ids.teacher2 })
  assert.equal(ok.body.teacher.id, ids.teacher2)
  const bad = await as('admin').post('/courses', { code: 'CS102', title: 'Other', teacherId: ids.student })
  assert.equal(bad.status, 400)
})

test('students enrol, see only their courses, and can browse the catalogue', async () => {
  const { as } = await setup()
  const a = (await as('teacher').post('/courses', course)).body
  const b = (await as('teacher').post('/courses', { code: 'CS102', title: 'Second' })).body
  assert.equal((await as('student').get('/courses')).body.length, 0)
  assert.equal((await as('student').post(`/courses/${a.id}/enroll`)).status, 201)
  assert.equal((await as('student').post(`/courses/${a.id}/enroll`)).status, 200)
  const mine = await as('student').get('/courses')
  assert.deepEqual(mine.body.map((c) => c.code), ['CS101'])
  assert.equal(mine.body[0].studentCount, 1)
  const catalogue = await as('student').get('/courses?scope=all')
  assert.deepEqual(catalogue.body.map((c) => [c.code, c.enrolled]), [['CS101', true], ['CS102', false]])
  assert.equal((await as('student').del(`/courses/${a.id}/enroll`)).status, 204)
  assert.equal((await as('student').get('/courses')).body.length, 0)
  assert.equal((await as('teacher').post(`/courses/${b.id}/enroll`)).status, 403)
})

test('a teacher sees only their own courses; admin sees all', async () => {
  const { as, ids } = await setup()
  await as('teacher').post('/courses', course)
  await as('admin').post('/courses', { code: 'CS102', title: 'Second', teacherId: ids.teacher2 })
  assert.deepEqual((await as('teacher').get('/courses')).body.map((c) => c.code), ['CS101'])
  assert.deepEqual((await as('teacher2').get('/courses')).body.map((c) => c.code), ['CS102'])
  assert.equal((await as('admin').get('/courses')).body.length, 2)
})

test('only course staff can see or change the roster', async () => {
  const { as, ids } = await setup()
  const c = (await as('teacher').post('/courses', course)).body
  assert.equal((await as('teacher').post(`/courses/${c.id}/students`, { studentId: ids.student })).status, 201)
  assert.equal((await as('teacher').post(`/courses/${c.id}/students`, { studentId: ids.student })).status, 200)
  assert.equal((await as('teacher').post(`/courses/${c.id}/students`, { studentId: ids.teacher2 })).status, 400)
  const roster = await as('teacher').get(`/courses/${c.id}/students`)
  assert.deepEqual(roster.body.map((s) => s.id), [ids.student])
  assert.equal((await as('admin').get(`/courses/${c.id}/students`)).status, 200)
  assert.equal((await as('teacher2').get(`/courses/${c.id}/students`)).status, 403)
  assert.equal((await as('teacher2').post(`/courses/${c.id}/students`, { studentId: ids.student2 })).status, 403)
  assert.equal((await as('student').get(`/courses/${c.id}/students`)).status, 403)
  assert.equal((await as('teacher').del(`/courses/${c.id}/students/${ids.student}`)).status, 204)
  assert.equal((await as('teacher').get(`/courses/${c.id}/students`)).body.length, 0)
})

test('editing and deleting is limited to the owner or an admin; reassigning to admin', async () => {
  const { as, ids } = await setup()
  const c = (await as('teacher').post('/courses', course)).body
  assert.equal((await as('teacher2').patch(`/courses/${c.id}`, { title: 'Hijack' })).status, 403)
  assert.equal((await as('teacher').patch(`/courses/${c.id}`, { title: 'Renamed' })).body.title, 'Renamed')
  assert.equal((await as('teacher').patch(`/courses/${c.id}`, { teacherId: ids.teacher2 })).status, 403)
  assert.equal((await as('admin').patch(`/courses/${c.id}`, { teacherId: ids.teacher2 })).body.teacher.id, ids.teacher2)
  assert.equal((await as('teacher').del(`/courses/${c.id}`)).status, 403)
  assert.equal((await as('admin').del(`/courses/${c.id}`)).status, 204)
  assert.equal((await as('admin').get(`/courses/${c.id}`)).status, 404)
})
