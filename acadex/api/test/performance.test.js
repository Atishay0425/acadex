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

test('/me/trend gives running attendance per course and overall, and marks in date order', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const day = (d, status) => ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: `2026-10-0${d}`, records: [{ studentId: ctx.ids.student, status }, { studentId: ctx.ids.student2, status: 'present' }] })
  await day(1, 'present'); await day(2, 'absent'); await day(3, 'present'); await day(4, 'present')
  const q = (await ctx.as('teacher').post(`/courses/${c.id}/assessments`, { title: 'Quiz 1', kind: 'quiz', maxMarks: 10, heldOn: '2026-10-03' })).body
  await ctx.as('teacher').put(`/courses/${c.id}/assessments/${q.id}/marks`, { marks: [{ studentId: ctx.ids.student, score: 7 }] })
  const t = (await ctx.as('student').get('/me/trend')).body
  assert.deepEqual(t.courses, ['CS101'])
  assert.deepEqual(t.attendance.map((p) => [p.date, p.overall, p.CS101]), [['2026-10-01', 100, 100], ['2026-10-02', 50, 50], ['2026-10-03', 66.7, 66.7], ['2026-10-04', 75, 75]])
  assert.deepEqual(t.marks, [{ date: '2026-10-03', title: 'Quiz 1', code: 'CS101', pct: 70 }])
  const other = (await ctx.as('student2').get('/me/trend')).body
  assert.equal(other.attendance.at(-1).overall, 100) // each student sees only their own line
  assert.equal((await ctx.as('teacher').get('/me/trend')).status, 403)
  const empty = (await setup().then((x) => x.as('student').get('/me/trend'))).body
  assert.deepEqual([empty.attendance, empty.marks, empty.courses], [[], [], []])
})
