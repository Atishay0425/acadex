import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, classroom } from './helpers.js'

test('/me/performance combines attendance and marks per enrolled course and flags weak ones', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const day = (d, status) => ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: `2026-10-0${d}`, records: [{ studentId: ctx.ids.student, status }] })
  await day(1, 'present'); await day(2, 'absent'); await day(3, 'absent'); await day(4, 'present')
  const q = (await ctx.as('teacher').post(`/courses/${c.id}/assessments`, { title: 'Quiz', kind: 'quiz', maxMarks: 10 })).body
  await ctx.as('teacher').put(`/courses/${c.id}/assessments/${q.id}/marks`, { marks: [{ studentId: ctx.ids.student, score: 9 }] })

  const res = await ctx.as('student').get('/me/performance')
  assert.equal(res.status, 200)
  assert.equal(res.body.length, 1)
  assert.deepEqual(res.body[0], {
    course: { id: c.id, code: 'CS101', title: 'Intro', teacher: 'Teacher One' },
    attendancePct: 50, marksPct: 90, classesNeededFor75: 4, weak: true,
    assignmentsPct: null, assignmentsSubmitted: 0, assignmentsExpected: 0, assignmentsMissing: 0,
  })
  // student2 has no data: nulls, not weak
  const quiet = await ctx.as('student2').get('/me/performance')
  assert.deepEqual([quiet.body[0].attendancePct, quiet.body[0].marksPct, quiet.body[0].weak], [null, null, false])
})

test('/me/performance is for students and lists only their courses', async () => {
  const ctx = await setup(); await classroom(ctx)
  assert.equal((await ctx.as('teacher').get('/me/performance')).status, 403)
  await ctx.as('teacher2').post('/courses', { code: 'CS999', title: 'Not mine' })
  assert.equal((await ctx.as('student').get('/me/performance')).body.length, 1)
})
