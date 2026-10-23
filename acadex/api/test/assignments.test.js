import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, classroom } from './helpers.js'

const future = () => new Date(Date.now() + 7 * 86400000).toISOString()
const past = () => new Date(Date.now() - 2 * 86400000).toISOString()
const body = (extra = {}) => ({ title: 'Lab 1', description: 'Linked lists', dueAt: future(), maxMarks: 10, ...extra })
const mk = async (ctx, c, extra) => (await ctx.as('teacher').post(`/courses/${c.id}/assignments`, body(extra))).body

test('teacher creates assignments; validation and permissions', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const res = await ctx.as('teacher').post(`/courses/${c.id}/assignments`, body())
  assert.equal(res.status, 201)
  assert.equal(res.body.maxMarks, 10)
  assert.equal((await ctx.as('teacher').post(`/courses/${c.id}/assignments`, body({ dueAt: 'next friday' }))).status, 400)
  assert.equal((await ctx.as('teacher').post(`/courses/${c.id}/assignments`, body({ maxMarks: 0 }))).status, 400)
  assert.equal((await ctx.as('student').post(`/courses/${c.id}/assignments`, body())).status, 403)
  assert.equal((await ctx.as('teacher2').post(`/courses/${c.id}/assignments`, body())).status, 403)
  assert.equal((await ctx.as('admin').post(`/courses/${c.id}/assignments`, body())).status, 201)
  assert.equal((await ctx.as('student').get(`/courses/${c.id}/assignments`)).status, 403)
})

test('student submits, resubmits, and late work is accepted but flagged', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = await mk(ctx, c)
  const submit = (key, payload, aid = a.id) => ctx.as(key).put(`/courses/${c.id}/assignments/${aid}/submission`, payload)
  assert.equal((await submit('student', { content: 'My answer' })).status, 201)
  assert.equal((await submit('student', { content: 'Better answer', link: 'https://github.com/x/y' })).status, 200)
  assert.equal((await submit('student', {})).status, 400)
  assert.equal((await submit('student', { link: 'javascript:alert(1)' })).status, 400)
  const mine = (await ctx.as('student').get(`/courses/${c.id}/assignments/mine`)).body
  assert.deepEqual([mine[0].status, mine[0].submission.content, mine[0].submission.isLate], ['submitted', 'Better answer', false])
  const old = await mk(ctx, c, { title: 'Old lab', dueAt: past() })
  const late = await submit('student2', { content: 'Sorry, late' }, old.id)
  assert.equal(late.body.isLate, true)
  assert.equal((await ctx.as('student').get(`/courses/${c.id}/assignments/mine`)).body.find((x) => x.id === old.id).status, 'overdue')
  assert.equal((await ctx.as('student2').get(`/courses/${c.id}/assignments/mine`)).body.find((x) => x.id === old.id).status, 'late')
})

test('only enrolled students can submit; teachers cannot', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = await mk(ctx, c)
  const other = (await ctx.as('teacher2').post('/courses', { code: 'CS999', title: 'Other' })).body
  assert.equal((await ctx.as('student').put(`/courses/${other.id}/assignments/${a.id}/submission`, { content: 'x' })).status, 403)
  assert.equal((await ctx.as('teacher').put(`/courses/${c.id}/assignments/${a.id}/submission`, { content: 'x' })).status, 403)
  assert.equal((await ctx.as('student').put(`/courses/${c.id}/assignments/9999/submission`, { content: 'x' })).status, 404)
})

test('grading: score and feedback, bounded by the maximum, locks the submission', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = await mk(ctx, c)
  const grade = (key, sid, payload) => ctx.as(key).put(`/courses/${c.id}/assignments/${a.id}/submissions/${sid}/grade`, payload)
  assert.equal((await grade('teacher', ctx.ids.student, { score: 8 })).status, 400) // nothing submitted yet
  await ctx.as('student').put(`/courses/${c.id}/assignments/${a.id}/submission`, { content: 'Answer' })
  assert.equal((await grade('teacher', ctx.ids.student, { score: 11 })).status, 400)
  assert.equal((await grade('teacher', ctx.ids.student, { score: -1 })).status, 400)
  assert.equal((await grade('student2', ctx.ids.student, { score: 5 })).status, 403)
  assert.equal((await grade('teacher2', ctx.ids.student, { score: 5 })).status, 403)
  assert.equal((await grade('teacher', ctx.ids.student, { score: 8.5, feedback: 'Good, add complexity notes' })).status, 200)
  const mine = (await ctx.as('student').get(`/courses/${c.id}/assignments/mine`)).body[0]
  assert.deepEqual([mine.status, mine.submission.score, mine.submission.feedback], ['graded', 8.5, 'Good, add complexity notes'])
  assert.equal((await ctx.as('student').put(`/courses/${c.id}/assignments/${a.id}/submission`, { content: 'Edit' })).status, 409)
  assert.equal((await ctx.as('teacher').patch(`/courses/${c.id}/assignments/${a.id}`, { maxMarks: 5 })).status, 400)
  assert.equal((await ctx.as('teacher').patch(`/courses/${c.id}/assignments/${a.id}`, { maxMarks: 20, title: 'Lab One' })).body.maxMarks, 20)
})

test('teacher sees every student with their status; lists carry counts', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = await mk(ctx, c)
  await ctx.as('student').put(`/courses/${c.id}/assignments/${a.id}/submission`, { content: 'Answer' })
  await ctx.as('teacher').put(`/courses/${c.id}/assignments/${a.id}/submissions/${ctx.ids.student}/grade`, { score: 7 })
  const view = (await ctx.as('teacher').get(`/courses/${c.id}/assignments/${a.id}/submissions`)).body
  assert.deepEqual(view.students.map((s) => [s.name, s.status]), [['Student One', 'graded'], ['Student Two', 'pending']])
  assert.equal(view.students[1].submission, null)
  const list = (await ctx.as('teacher').get(`/courses/${c.id}/assignments`)).body
  assert.deepEqual([list[0].submitted, list[0].graded], [1, 1])
  assert.equal((await ctx.as('teacher2').get(`/courses/${c.id}/assignments/${a.id}/submissions`)).status, 403)
})

test('/me/assignments spans courses, and performance reports completion and missing work', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const done = await mk(ctx, c, { title: 'Done', dueAt: past() })
  await mk(ctx, c, { title: 'Missed', dueAt: past() })
  await mk(ctx, c, { title: 'Upcoming' })
  await ctx.as('student').put(`/courses/${c.id}/assignments/${done.id}/submission`, { content: 'ok' })
  const all = (await ctx.as('student').get('/me/assignments')).body
  assert.deepEqual(all.map((x) => [x.title, x.status]).sort(), [['Done', 'late'], ['Missed', 'overdue'], ['Upcoming', 'pending']])
  assert.equal(all[0].course.code, 'CS101')
  assert.equal((await ctx.as('teacher').get('/me/assignments')).status, 403)
  const perf = (await ctx.as('student').get('/me/performance')).body[0]
  assert.deepEqual([perf.assignmentsPct, perf.assignmentsSubmitted, perf.assignmentsExpected, perf.assignmentsMissing], [50, 1, 2, 1])
  assert.equal((await ctx.as('student2').get('/me/performance')).body[0].assignmentsMissing, 2)
})

test('deleting an assignment or its course removes the submissions', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = await mk(ctx, c)
  await ctx.as('student').put(`/courses/${c.id}/assignments/${a.id}/submission`, { content: 'x' })
  assert.equal((await ctx.as('teacher2').del(`/courses/${c.id}/assignments/${a.id}`)).status, 403)
  assert.equal((await ctx.as('teacher').del(`/courses/${c.id}/assignments/${a.id}`)).status, 204)
  assert.equal((await ctx.pool.query('SELECT 1 FROM submissions')).rows.length, 0)
})
