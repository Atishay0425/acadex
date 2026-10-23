import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const M = '/mentorship'
const profile = { headline: 'Placed at Microsoft', year: 'Final Year', topics: ['Placements', 'DSA'], bio: 'Happy to help with interviews.' }
// `student2` is a mentor; `student` is a junior.
async function world() {
  const ctx = await setup()
  await ctx.as('student2').put(`${M}/mentors/me`, profile)
  return ctx
}
const ask = (ctx, key, extra = {}) => ctx.as(key).post(`${M}/questions`, { mentorId: ctx.ids.student2, text: 'How should I prepare for the online assessment?', ...extra })

test('a student opts in as a mentor, edits the profile, and can step down', async () => {
  const ctx = await setup()
  assert.equal((await ctx.as('student').get(`${M}/mentors/me`)).body, null)
  assert.equal((await ctx.as('student').put(`${M}/mentors/me`, { headline: 'x' })).status, 400)
  assert.equal((await ctx.as('student').put(`${M}/mentors/me`, { ...profile, topics: Array(7).fill('Topic') })).status, 400)
  assert.equal((await ctx.as('teacher').put(`${M}/mentors/me`, profile)).status, 403)
  const res = await ctx.as('student').put(`${M}/mentors/me`, profile)
  assert.deepEqual([res.body.headline, res.body.topics, res.body.isMe, res.body.rating], ['Placed at Microsoft', ['Placements', 'DSA'], true, null])
  assert.equal((await ctx.as('student').put(`${M}/mentors/me`, { ...profile, headline: 'Intern at Amazon' })).body.headline, 'Intern at Amazon')
  assert.equal((await ctx.as('student2').get(`${M}/mentors`)).body.length, 1)
  assert.equal((await ctx.as('student').del(`${M}/mentors/me`)).status, 204)
  assert.equal((await ctx.as('student2').get(`${M}/mentors`)).body.length, 0)
})

test('mentor list: search, topic and department filters, and admin can hide a mentor', async () => {
  const ctx = await world()
  await ctx.as('student').put(`${M}/mentors/me`, { headline: 'MS applicant', year: '4th Year', topics: ['GRE'], bio: '' })
  const names = async (qs) => (await ctx.as('teacher').get(`${M}/mentors${qs}`)).body.map((m) => m.name)
  assert.deepEqual(await names(''), ['Student One', 'Student Two'])
  assert.deepEqual(await names('?topic=gre'), ['Student One'])
  assert.deepEqual(await names('?q=microsoft'), ['Student Two'])
  assert.deepEqual(await names('?q=nothing'), [])
  assert.equal((await ctx.as('teacher').patch(`${M}/mentors/${ctx.ids.student2}`, { isActive: false })).status, 403)
  assert.equal((await ctx.as('admin').patch(`${M}/mentors/${ctx.ids.student2}`, { isActive: false })).status, 200)
  assert.deepEqual(await names(''), ['Student One'])
  assert.equal((await ctx.as('admin').get(`${M}/mentors`)).body.length, 2) // admins still see hidden ones
  assert.equal((await ask(ctx, 'student')).status, 404) // cannot ask a hidden mentor
  assert.equal((await ctx.as('admin').patch(`${M}/mentors/9999`, { isActive: true })).status, 404)
})

test('asking: anonymous by default, hidden from the mentor, never yourself, limits apply', async () => {
  const ctx = await world()
  const res = await ask(ctx, 'student')
  assert.equal(res.status, 201)
  assert.deepEqual([res.body.anonymous, res.body.mentor.name, res.body.answer], [true, 'Student Two', ''])
  const inbox = (await ctx.as('student2').get(`${M}/questions?box=received`)).body
  assert.deepEqual(inbox[0].asker, { id: null, name: 'Anonymous' })
  await ask(ctx, 'student', { anonymous: false, text: 'And what about resumes? Any tips please.' })
  assert.equal((await ctx.as('student2').get(`${M}/questions?box=received`)).body[0].asker.name, 'Student One')
  assert.equal((await ask(ctx, 'student2', { mentorId: ctx.ids.student2 })).status, 400)
  assert.equal((await ask(ctx, 'student', { text: 'short' })).status, 400)
  assert.equal((await ask(ctx, 'student', { mentorId: ctx.ids.teacher })).status, 404)
  assert.equal((await ask(ctx, 'teacher')).status, 403)
  for (let i = 0; i < 8; i++) await ask(ctx, 'student')
  assert.equal((await ask(ctx, 'student')).status, 400) // ten unanswered is the cap
})

test('only the asked mentor answers; the asker rates only after an answer; the average shows on the profile', async () => {
  const ctx = await world()
  const q1 = (await ask(ctx, 'student')).body
  const q2 = (await ask(ctx, 'student', { text: 'Which projects impress recruiters most?' })).body
  assert.equal((await ctx.as('student').post(`${M}/questions/${q1.id}/rate`, { rating: 5 })).status, 400) // unanswered
  assert.equal((await ctx.as('student').post(`${M}/questions/${q1.id}/answer`, { answer: 'I will answer myself' })).status, 404)
  assert.equal((await ctx.as('teacher').post(`${M}/questions/${q1.id}/answer`, { answer: 'x'.repeat(5) })).status, 403)
  assert.equal((await ctx.as('student2').post(`${M}/questions/${q1.id}/answer`, { answer: 'Solve two medium graph problems daily.' })).status, 200)
  await ctx.as('student2').post(`${M}/questions/${q2.id}/answer`, { answer: 'Show shipped work with real users.' })
  assert.equal((await ctx.as('student').post(`${M}/questions/${q1.id}/rate`, { rating: 6 })).status, 400)
  assert.equal((await ctx.as('student').post(`${M}/questions/${q1.id}/rate`, { rating: 5 })).status, 200)
  assert.equal((await ctx.as('student').post(`${M}/questions/${q2.id}/rate`, { rating: 4 })).status, 200)
  assert.equal((await ctx.as('student2').post(`${M}/questions/${q1.id}/rate`, { rating: 5 })).status, 404) // not the asker
  const m = (await ctx.as('student').get(`${M}/mentors`)).body[0]
  assert.deepEqual([m.rating, m.ratingCount, m.answered], [4.5, 2, 2])
  const mine = (await ctx.as('student').get(`${M}/questions`)).body
  assert.deepEqual(mine.map((x) => [x.answer.length > 0, x.rating]), [[true, 4], [true, 5]])
})

test('questions are private to the asker and the mentor', async () => {
  const ctx = await world()
  await ask(ctx, 'student')
  assert.equal((await ctx.as('student2').get(`${M}/questions?box=asked`)).body.length, 0)
  assert.equal((await ctx.as('student').get(`${M}/questions?box=received`)).body.length, 0)
  assert.equal((await ctx.as('teacher').get(`${M}/questions`)).status, 403)
  assert.equal((await ctx.request('get', `${M}/questions`)).status, 401)
})
