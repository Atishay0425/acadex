import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assess, levelOf, WEIGHTS } from '../src/risk.js'
import { setup, classroom } from './helpers.js'

const NOW = new Date('2026-10-20T00:00:00Z')
const past = (n) => ({ due_at: `2026-10-${String(10 - n).padStart(2, '0')}T00:00:00Z`, submitted: false })

test('a student who meets every target scores zero', () => {
  const r = assess({ statuses: ['present', 'present', 'late', 'present'], marks: [{ score: 8, max: 10 }, { score: 9, max: 10 }], assignments: [{ due_at: '2026-10-01T00:00:00Z', submitted: true }] }, NOW)
  assert.deepEqual([r.score, r.level, r.drivers.length], [0, 'low', 0])
})

test('each signal adds explainable points, worst driver first', () => {
  const r = assess({
    statuses: ['present', 'present', 'absent', 'absent'], // 50% attendance
    marks: [{ score: 9, max: 10 }, { score: 2, max: 10 }], // 55% overall, latest 70 points below earlier
    assignments: [past(1), past(2), past(3)], // three overdue
  }, NOW)
  const by = Object.fromEntries(r.drivers.map((d) => [d.key, d.points]))
  assert.deepEqual(by, { assignments: 20, attendance: 22, trend: 15, marks: 4 })
  assert.deepEqual(r.drivers.map((d) => d.key), ['attendance', 'assignments', 'trend', 'marks'])
  assert.equal(r.score, 61)
  assert.equal(r.level, 'high')
  assert.match(r.drivers[0].detail, /Attendance is 50%/)
  assert.ok(r.score <= Object.values(WEIGHTS).reduce((a, b) => a + b))
})

test('missing data adds nothing, and the worst case is capped at 100', () => {
  assert.equal(assess({}, NOW).score, 0)
  const worst = assess({ statuses: Array(10).fill('absent'), marks: [{ score: 3, max: 10 }, { score: 0, max: 100 }], assignments: [past(1), past(2), past(3), past(4)] }, NOW)
  assert.equal(worst.score, 100) // every signal at its maximum
  assert.equal(assess({ assignments: [{ due_at: '2026-12-01T00:00:00Z', submitted: false }] }, NOW).score, 0) // not due yet
})

test('level thresholds', () => {
  assert.deepEqual([29, 30, 59, 60].map(levelOf), ['low', 'medium', 'medium', 'high'])
})

// A course where `student` struggles and `student2` is fine.
async function scenario(ctx) {
  const c = await classroom(ctx)
  const day = (d, a, b) => ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: `2026-10-0${d}`, records: [{ studentId: ctx.ids.student, status: a }, { studentId: ctx.ids.student2, status: b }] })
  await day(1, 'absent', 'present'); await day(2, 'absent', 'present'); await day(3, 'present', 'present'); await day(4, 'absent', 'late')
  const q = (await ctx.as('teacher').post(`/courses/${c.id}/assessments`, { title: 'Quiz', kind: 'quiz', maxMarks: 10 })).body
  await ctx.as('teacher').put(`/courses/${c.id}/assessments/${q.id}/marks`, { marks: [{ studentId: ctx.ids.student, score: 3 }, { studentId: ctx.ids.student2, score: 9 }] })
  const old = new Date(Date.now() - 5 * 86400000).toISOString()
  for (const t of ['Lab 1', 'Lab 2']) await ctx.as('teacher').post(`/courses/${c.id}/assignments`, { title: t, dueAt: old, maxMarks: 10 })
  return c
}

test('student sees their own score, drivers, per-course breakdown and alerts', async () => {
  const ctx = await setup(); const c = await scenario(ctx)
  const me = (await ctx.as('student').get('/risk/me')).body
  assert.equal(me.level, 'high')
  assert.deepEqual(me.drivers.map((d) => d.key).sort(), ['assignments', 'attendance', 'marks'])
  assert.equal(me.courses[0].code, 'CS101')
  assert.ok(me.alerts.some((a) => a.title.startsWith('CS101: low attendance')))
  assert.equal((await ctx.as('student2').get('/risk/me')).body.drivers.some((d) => d.key === 'attendance'), false)
  assert.equal((await ctx.as('teacher').get('/risk/me')).status, 403)
  assert.equal(me.signals.assignmentsMissing, 2)
  assert.ok(c.id)
})

test('teachers see their class ranked by risk; others cannot', async () => {
  const ctx = await setup(); const c = await scenario(ctx)
  const rows = (await ctx.as('teacher').get(`/risk/courses/${c.id}`)).body
  assert.deepEqual(rows.map((r) => r.name), ['Student One', 'Student Two'])
  assert.ok(rows[0].score > rows[1].score)
  assert.equal(rows[0].level, 'high')
  assert.equal((await ctx.as('admin').get(`/risk/courses/${c.id}`)).status, 200)
  assert.equal((await ctx.as('teacher2').get(`/risk/courses/${c.id}`)).status, 403)
  assert.equal((await ctx.as('student').get(`/risk/courses/${c.id}`)).status, 403)
})

test('interventions: teacher logs an action, student sees it, outcome can be updated', async () => {
  const ctx = await setup(); const c = await scenario(ctx)
  const post = (key, body) => ctx.as(key).post('/risk/interventions', { courseId: c.id, studentId: ctx.ids.student, action: 'mentor_call', ...body })
  assert.equal((await post('student', {})).status, 403)
  assert.equal((await post('teacher2', {})).status, 403)
  assert.equal((await post('teacher', { studentId: ctx.ids.teacher2 })).status, 400)
  assert.equal((await post('teacher', { action: 'prayer' })).status, 400)
  const iv = await post('teacher', { note: 'Call on Friday' })
  assert.equal(iv.status, 201)
  assert.deepEqual([iv.body.action, iv.body.by, iv.body.status, iv.body.riskScore > 0], ['mentor_call', 'Teacher One', 'sent', true])
  const seen = (await ctx.as('student').get('/risk/me')).body.interventions
  assert.deepEqual([seen.length, seen[0].note], [1, 'Call on Friday'])
  assert.equal((await ctx.as('student2').get('/risk/me')).body.interventions.length, 0)
  const upd = await ctx.as('teacher').patch(`/risk/interventions/${iv.body.id}`, { status: 'responded', outcome: 'Attendance up 10 points' })
  assert.deepEqual([upd.body.status, upd.body.outcome], ['responded', 'Attendance up 10 points'])
  assert.equal((await ctx.as('teacher2').patch(`/risk/interventions/${iv.body.id}`, { status: 'closed' })).status, 403)
  assert.equal((await ctx.as('teacher').patch(`/risk/interventions/${iv.body.id}`, {})).status, 400)
  const hist = (await ctx.as('teacher').get(`/risk/interventions?courseId=${c.id}&studentId=${ctx.ids.student}`)).body
  assert.deepEqual([hist.length, hist[0].id], [1, iv.body.id])
  assert.equal((await ctx.as('teacher2').get(`/risk/interventions?courseId=${c.id}`)).status, 403)
  assert.equal((await ctx.as('teacher').get('/risk/interventions?courseId=0')).body.length, 0)
  const board = (await ctx.as('teacher').get(`/risk/courses/${c.id}`)).body[0]
  assert.equal(board.latestIntervention.outcome, 'Attendance up 10 points')
})

test('admin overview: distribution, intervention counts and flagged students without action', async () => {
  const ctx = await setup(); const c = await scenario(ctx)
  let o = (await ctx.as('admin').get('/risk/overview')).body
  assert.deepEqual([o.total, o.distribution.high, o.flaggedWithoutAction], [2, 1, 1])
  await ctx.as('teacher').post('/risk/interventions', { courseId: c.id, studentId: ctx.ids.student, action: 'reminder' })
  o = (await ctx.as('admin').get('/risk/overview')).body
  assert.deepEqual([o.interventions.total, o.interventions.open, o.flaggedWithoutAction], [1, 1, 0])
  assert.equal(o.students[0].name, 'Student One')
  assert.equal((await ctx.as('teacher').get('/risk/overview')).status, 403)
})
