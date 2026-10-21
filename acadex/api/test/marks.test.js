import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, classroom } from './helpers.js'

const quiz = { title: 'Quiz 1', kind: 'quiz', maxMarks: 10 }
const mid = { title: 'Mid-sem', kind: 'midterm', maxMarks: 50 }

test('grading flow: marks per assessment, summary and student view', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const q = (await ctx.as('teacher').post(`/courses/${c.id}/assessments`, quiz)).body
  const m = (await ctx.as('teacher').post(`/courses/${c.id}/assessments`, mid)).body
  const put = (a, marks) => ctx.as('teacher').put(`/courses/${c.id}/assessments/${a.id}/marks`, { marks })
  assert.equal((await put(q, [{ studentId: ctx.ids.student, score: 8 }, { studentId: ctx.ids.student2, score: 4 }])).status, 200)
  assert.equal((await put(m, [{ studentId: ctx.ids.student, score: 30 }])).status, 200)

  const grid = await ctx.as('teacher').get(`/courses/${c.id}/assessments/${q.id}/marks`)
  assert.deepEqual(grid.body.marks.map((x) => x.score).sort(), [4, 8])
  const gridM = await ctx.as('teacher').get(`/courses/${c.id}/assessments/${m.id}/marks`)
  assert.deepEqual(gridM.body.marks.map((x) => x.score).sort(), [30, null].sort())

  const sum = (await ctx.as('teacher').get(`/courses/${c.id}/marks/summary`)).body
  assert.equal(sum.find((x) => x.studentId === ctx.ids.student).pct, 63.3)  // 38/60
  assert.equal(sum.find((x) => x.studentId === ctx.ids.student2).pct, 40)   // 4/10, mid-sem ungraded so excluded

  const mine = (await ctx.as('student').get(`/courses/${c.id}/marks/me`)).body
  assert.equal(mine.pct, 63.3)
  assert.deepEqual(mine.assessments.map((a) => a.score), [8, 30])
  const list = (await ctx.as('teacher').get(`/courses/${c.id}/assessments`)).body
  assert.deepEqual(list.map((a) => a.graded), [2, 1])
})

test('null clears a score; re-entering overwrites', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const q = (await ctx.as('teacher').post(`/courses/${c.id}/assessments`, quiz)).body
  const put = (score) => ctx.as('teacher').put(`/courses/${c.id}/assessments/${q.id}/marks`, { marks: [{ studentId: ctx.ids.student, score }] })
  await put(5); await put(7)
  assert.equal((await ctx.as('student').get(`/courses/${c.id}/marks/me`)).body.assessments[0].score, 7)
  await put(null)
  const after = (await ctx.as('student').get(`/courses/${c.id}/marks/me`)).body
  assert.equal(after.assessments[0].score, null)
  assert.equal(after.pct, null)
})

test('scores above the maximum, negative scores and outsiders are rejected', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const q = (await ctx.as('teacher').post(`/courses/${c.id}/assessments`, quiz)).body
  const put = (marks) => ctx.as('teacher').put(`/courses/${c.id}/assessments/${q.id}/marks`, { marks })
  assert.equal((await put([{ studentId: ctx.ids.student, score: 10.5 }])).status, 400)
  assert.equal((await put([{ studentId: ctx.ids.student, score: -1 }])).status, 400)
  assert.equal((await put([{ studentId: ctx.ids.teacher2, score: 3 }])).status, 400)
  // one bad row means nothing is saved
  assert.equal((await put([{ studentId: ctx.ids.student, score: 9 }, { studentId: ctx.ids.student2, score: 11 }])).status, 400)
  assert.equal((await ctx.as('student').get(`/courses/${c.id}/marks/me`)).body.assessments[0].score, null)
  assert.equal((await ctx.as('teacher').post(`/courses/${c.id}/assessments`, { ...quiz, maxMarks: 0 })).status, 400)
  assert.equal((await ctx.as('teacher').post(`/courses/${c.id}/assessments`, { ...quiz, kind: 'exam' })).status, 400)
})

test('lowering the maximum below a recorded score is refused', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const q = (await ctx.as('teacher').post(`/courses/${c.id}/assessments`, quiz)).body
  await ctx.as('teacher').put(`/courses/${c.id}/assessments/${q.id}/marks`, { marks: [{ studentId: ctx.ids.student, score: 9 }] })
  assert.equal((await ctx.as('teacher').patch(`/courses/${c.id}/assessments/${q.id}`, { maxMarks: 5 })).status, 400)
  assert.equal((await ctx.as('teacher').patch(`/courses/${c.id}/assessments/${q.id}`, { maxMarks: 20, title: 'Quiz One' })).body.maxMarks, 20)
})

test('permissions: course staff write, students read only their own, assessments are scoped to the course', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  assert.equal((await ctx.as('teacher2').post(`/courses/${c.id}/assessments`, quiz)).status, 403)
  assert.equal((await ctx.as('student').post(`/courses/${c.id}/assessments`, quiz)).status, 403)
  assert.equal((await ctx.as('student').get(`/courses/${c.id}/marks/summary`)).status, 403)
  const q = (await ctx.as('admin').post(`/courses/${c.id}/assessments`, quiz)).body
  const other = (await ctx.as('teacher2').post('/courses', { code: 'CS999', title: 'Other' })).body
  assert.equal((await ctx.as('teacher2').get(`/courses/${other.id}/assessments/${q.id}/marks`)).status, 404)
  assert.equal((await ctx.as('student').get(`/courses/${other.id}/marks/me`)).status, 403)
  assert.equal((await ctx.as('teacher').del(`/courses/${c.id}/assessments/${q.id}`)).status, 204)
})
