import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString()
// `teacher` becomes a counsellor with two slots, set up the way an admin would.
async function world() {
  const ctx = await setup()
  await ctx.as('admin').patch(`/users/${ctx.ids.teacher}`, { isCounsellor: true })
  await ctx.as('teacher').post('/counselling/slots', { slots: [inHours(24), inHours(48)] })
  const listing = (await ctx.as('student').get('/counselling/counsellors')).body[0]
  return { ...ctx, slots: listing.slots }
}
const book = (ctx, key, slot, extra = {}) => ctx.as(key).post('/counselling/sessions', { slotId: slot.id, type: 'academic', topic: 'Low attendance in CS101', ...extra })

test('admin flags teachers as counsellors; students list them with free slots', async () => {
  const ctx = await setup()
  assert.deepEqual((await ctx.as('student').get('/counselling/counsellors')).body, [])
  assert.equal((await ctx.as('admin').patch(`/users/${ctx.ids.student}`, { isCounsellor: true })).status, 400) // students cannot be counsellors
  assert.equal((await ctx.as('teacher').patch(`/users/${ctx.ids.teacher}`, { isCounsellor: true })).status, 403)
  const res = await ctx.as('admin').patch(`/users/${ctx.ids.teacher}`, { isCounsellor: true })
  assert.equal(res.body.isCounsellor, true)
  assert.equal((await ctx.as('teacher').get('/auth/me')).body.isCounsellor, true)
  await ctx.as('teacher').post('/counselling/slots', { slots: [inHours(24), inHours(48)] })
  const [c] = (await ctx.as('student').get('/counselling/counsellors')).body
  assert.deepEqual([c.name, c.slots.length], ['Teacher One', 2])
  assert.equal((await ctx.as('admin').patch(`/users/${ctx.ids.teacher}`, { role: 'admin' })).body.isCounsellor, false) // role change clears the flag
})

test('only counsellors manage slots; past, duplicate and excessive slots are handled', async () => {
  const ctx = await setup()
  assert.equal((await ctx.as('teacher').post('/counselling/slots', { slots: [inHours(5)] })).status, 403) // not a counsellor yet
  await ctx.as('admin').patch(`/users/${ctx.ids.teacher}`, { isCounsellor: true })
  assert.equal((await ctx.as('teacher').post('/counselling/slots', { slots: [inHours(-2)] })).status, 400)
  assert.equal((await ctx.as('teacher').post('/counselling/slots', { slots: ['tomorrow'] })).status, 400)
  const t = inHours(30)
  assert.equal((await ctx.as('teacher').post('/counselling/slots', { slots: [t, t] })).body.added, 1)
  assert.equal((await ctx.as('teacher').post('/counselling/slots', { slots: [t] })).body.added, 0)
  assert.equal((await ctx.as('student').post('/counselling/slots', { slots: [inHours(5)] })).status, 403)
  assert.equal((await ctx.as('student').get('/counselling/slots')).status, 403)
})

test('a student books a slot; it disappears from the free list and cannot be double-booked', async () => {
  const ctx = await world()
  const res = await book(ctx, 'student', ctx.slots[0])
  assert.equal(res.status, 201)
  assert.deepEqual([res.body.status, res.body.type, res.body.counsellor.name], ['requested', 'academic', 'Teacher One'])
  assert.equal((await ctx.as('student2').get('/counselling/counsellors')).body[0].slots.length, 1)
  assert.equal((await book(ctx, 'student2', ctx.slots[0])).status, 409)
  assert.equal((await ctx.as('student').post('/counselling/sessions', { slotId: ctx.slots[1].id, type: 'dating', topic: '' })).status, 400)
  assert.equal((await book(ctx, 'teacher', ctx.slots[1])).status, 403)
  assert.equal((await ctx.as('student').post('/counselling/sessions', { slotId: 9999, type: 'career' })).status, 404)
})

test('a student can hold at most three upcoming sessions', async () => {
  const ctx = await world()
  await ctx.as('teacher').post('/counselling/slots', { slots: [inHours(60), inHours(72), inHours(84)] })
  const slots = (await ctx.as('student').get('/counselling/counsellors')).body[0].slots
  for (const s of slots.slice(0, 3)) assert.equal((await book(ctx, 'student', s)).status, 201)
  assert.equal((await book(ctx, 'student', slots[3])).status, 400)
})

test('the counsellor confirms, writes a private note and a follow-up the student can read', async () => {
  const ctx = await world()
  const s = (await book(ctx, 'student', ctx.slots[0])).body
  const list = (await ctx.as('teacher').get('/counselling/sessions')).body
  assert.deepEqual([list.length, list[0].student.name, list[0].topic], [1, 'Student One', 'Low attendance in CS101'])
  const upd = await ctx.as('teacher').patch(`/counselling/sessions/${s.id}`, { status: 'confirmed', note: 'Family issue, be gentle', followUp: 'Bring your attendance sheet' })
  assert.deepEqual([upd.body.status, upd.body.note], ['confirmed', 'Family issue, be gentle'])
  const mine = (await ctx.as('student').get('/counselling/sessions')).body[0]
  assert.deepEqual([mine.status, mine.followUp, mine.note], ['confirmed', 'Bring your attendance sheet', undefined]) // private note never reaches the student
  assert.equal((await ctx.as('teacher').patch(`/counselling/sessions/${s.id}`, {})).status, 400)
  await ctx.as('teacher').patch(`/counselling/sessions/${s.id}`, { status: 'completed' })
  assert.equal((await ctx.as('student').get('/counselling/sessions')).body[0].status, 'completed')
  assert.equal((await ctx.as('student').post(`/counselling/sessions/${s.id}/cancel`)).status, 409)
})

test('anonymous bookings hide the student from the counsellor but not from themselves', async () => {
  const ctx = await world()
  await book(ctx, 'student', ctx.slots[0], { anonymous: true })
  const seen = (await ctx.as('teacher').get('/counselling/sessions')).body[0]
  assert.deepEqual([seen.student.name, seen.student.id, seen.student.email, seen.anonymous], ['Anonymous student', null, null, true])
  assert.equal((await ctx.as('student').get('/counselling/sessions')).body[0].anonymous, true)
})

test('privacy: sessions are visible only to the student and their counsellor', async () => {
  const ctx = await world()
  const s = (await book(ctx, 'student', ctx.slots[0])).body
  assert.equal((await ctx.as('student2').get('/counselling/sessions')).body.length, 0)
  assert.equal((await ctx.as('student2').post(`/counselling/sessions/${s.id}/cancel`)).status, 404)
  await ctx.as('admin').patch(`/users/${ctx.ids.teacher2}`, { isCounsellor: true })
  assert.equal((await ctx.as('teacher2').get('/counselling/sessions')).body.length, 0)
  assert.equal((await ctx.as('teacher2').patch(`/counselling/sessions/${s.id}`, { status: 'confirmed' })).status, 404)
  assert.equal((await ctx.as('admin').get('/counselling/sessions')).status, 403)
  assert.equal((await ctx.request('get', '/counselling/sessions')).status, 401)
})

test('cancelling frees the slot for someone else; booked slots cannot be deleted', async () => {
  const ctx = await world()
  const s = (await book(ctx, 'student', ctx.slots[0])).body
  assert.equal((await ctx.as('teacher').del(`/counselling/slots/${ctx.slots[0].id}`)).status, 409)
  assert.equal((await ctx.as('student').post(`/counselling/sessions/${s.id}/cancel`)).body.status, 'cancelled')
  assert.equal((await book(ctx, 'student2', ctx.slots[0])).status, 201)
  assert.equal((await ctx.as('student').get('/counselling/sessions')).body[0].status, 'cancelled')
  const mySlots = (await ctx.as('teacher').get('/counselling/slots')).body
  assert.deepEqual(mySlots.map((x) => x.booked), [true, false])
  assert.equal((await ctx.as('teacher').del(`/counselling/slots/${ctx.slots[1].id}`)).status, 204)
  // a counsellor cancelling frees the slot too
  const taken = (await ctx.as('student2').get('/counselling/sessions')).body[0]
  const cs = (await ctx.as('teacher').get('/counselling/sessions')).body.find((x) => x.status === 'requested')
  assert.equal((await ctx.as('teacher').patch(`/counselling/sessions/${cs.id}`, { status: 'cancelled' })).body.status, 'cancelled')
  assert.equal(taken.status, 'requested')
  assert.equal((await book(ctx, 'student', ctx.slots[0])).status, 201)
  assert.equal((await ctx.as('teacher').patch(`/counselling/sessions/${cs.id}`, { status: 'confirmed' })).status, 409) // already cancelled
})
