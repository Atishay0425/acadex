import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, classroom } from './helpers.js'

const rec = (ctx, ...statuses) => [ctx.ids.student, ctx.ids.student2].slice(0, statuses.length).map((studentId, i) => ({ studentId, status: statuses[i] }))

test('teacher records a session; summary, list and student view agree', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const post = (date, ...s) => ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date, topic: 'Arrays', records: rec(ctx, ...s) })
  assert.equal((await post('2026-10-01', 'present', 'absent')).status, 201)
  assert.equal((await post('2026-10-02', 'late', 'excused')).status, 201)
  assert.equal((await post('2026-10-03', 'absent', 'present')).status, 201)

  const list = await ctx.as('teacher').get(`/courses/${c.id}/attendance`)
  assert.deepEqual(list.body.map((s) => s.date), ['2026-10-03', '2026-10-02', '2026-10-01'])
  assert.equal(list.body[2].present, 1)

  const sum = await ctx.as('teacher').get(`/courses/${c.id}/attendance/summary`)
  const s1 = sum.body.find((x) => x.studentId === ctx.ids.student)
  const s2 = sum.body.find((x) => x.studentId === ctx.ids.student2)
  assert.equal(s1.pct, 66.7) // present, late, absent
  assert.equal(s2.pct, 50)   // absent, excused (ignored), present

  const mine = await ctx.as('student').get(`/courses/${c.id}/attendance/me`)
  assert.equal(mine.body.pct, 66.7)
  assert.equal(mine.body.sessions.length, 3)
  assert.equal(mine.body.classesNeededFor75, 1) // 2/3 -> 3/4 after one more class
})

test('duplicate date is a 409, unknown or foreign students are a 400', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const body = { date: '2026-10-01', records: rec(ctx, 'present') }
  assert.equal((await ctx.as('teacher').post(`/courses/${c.id}/attendance`, body)).status, 201)
  assert.equal((await ctx.as('teacher').post(`/courses/${c.id}/attendance`, body)).status, 409)
  const stranger = await ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: '2026-10-02', records: [{ studentId: ctx.ids.teacher2, status: 'present' }] })
  assert.equal(stranger.status, 400)
  const bad = await ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: 'tomorrow', records: rec(ctx, 'present') })
  assert.equal(bad.status, 400)
  const dupe = await ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: '2026-10-05', records: [...rec(ctx, 'present'), ...rec(ctx, 'absent')] })
  assert.equal(dupe.status, 400)
})

test('a failed write leaves no half-saved session', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const res = await ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: '2026-10-01', records: rec(ctx, 'present', 'maybe') })
  assert.equal(res.status, 400)
  assert.equal((await ctx.as('teacher').get(`/courses/${c.id}/attendance`)).body.length, 0)
})

test('editing replaces statuses; deleting removes the session', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const { id } = (await ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: '2026-10-01', records: rec(ctx, 'absent', 'absent') })).body
  assert.equal((await ctx.as('teacher').put(`/courses/${c.id}/attendance/${id}`, { topic: 'Fixed', records: rec(ctx, 'present', 'absent') })).status, 200)
  const one = await ctx.as('teacher').get(`/courses/${c.id}/attendance/${id}`)
  assert.equal(one.body.topic, 'Fixed')
  assert.deepEqual(one.body.records.map((r) => r.status).sort(), ['absent', 'present'])
  assert.equal((await ctx.as('teacher').del(`/courses/${c.id}/attendance/${id}`)).status, 204)
  assert.equal((await ctx.as('teacher').get(`/courses/${c.id}/attendance/${id}`)).status, 404)
})

test('only the course teacher or an admin can write; students see only their own data', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const body = { date: '2026-10-01', records: rec(ctx, 'present') }
  assert.equal((await ctx.as('teacher2').post(`/courses/${c.id}/attendance`, body)).status, 403)
  assert.equal((await ctx.as('student').post(`/courses/${c.id}/attendance`, body)).status, 403)
  assert.equal((await ctx.as('student').get(`/courses/${c.id}/attendance`)).status, 403)
  assert.equal((await ctx.as('student').get(`/courses/${c.id}/attendance/summary`)).status, 403)
  assert.equal((await ctx.as('admin').post(`/courses/${c.id}/attendance`, body)).status, 201)
  const other = (await ctx.as('teacher2').post('/courses', { code: 'CS999', title: 'Other' })).body
  assert.equal((await ctx.as('student').get(`/courses/${other.id}/attendance/me`)).status, 403) // not enrolled
  assert.equal((await ctx.as('teacher').get(`/courses/${c.id}/attendance/me`)).status, 403)
  assert.equal((await ctx.as('teacher').get(`/courses/${c.id}/attendance/9999`)).status, 404)
})

test('deleting a course removes its attendance', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  await ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: '2026-10-01', records: rec(ctx, 'present') })
  await ctx.as('admin').del(`/courses/${c.id}`)
  assert.equal((await ctx.pool.query('SELECT 1 FROM attendance_records')).rows.length, 0)
})
