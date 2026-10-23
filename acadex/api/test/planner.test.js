import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSchedule, addDays, daysBetween, MAX_PER_DAY } from '../src/planner.js'
import { setup, classroom } from './helpers.js'

const T = '2026-10-20'
const topics = (n, done = 0) => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `Topic ${i + 1}`, done: i < done }))

test('date helpers work on plain date strings across month ends', () => {
  assert.equal(addDays('2026-10-30', 3), '2026-11-02')
  assert.equal(daysBetween('2026-10-20', '2026-11-03'), 14)
  assert.equal(daysBetween('2026-11-03', '2026-10-20'), -14)
})

test('unfinished topics are spread evenly before the exam and finished ones are skipped', () => {
  const { days, exams } = buildSchedule([{ id: 1, subject: 'ML', date: addDays(T, 4), topics: topics(8, 2) }], T, 7)
  const counts = days.map((d) => d.items.length)
  assert.deepEqual(counts, [2, 1, 2, 1, 0, 0, 0]) // 6 topics over 4 study days
  assert.equal(counts.reduce((a, b) => a + b), 6)
  assert.equal(days[0].items[0].title, 'Topic 3') // first unfinished topic comes first
  assert.deepEqual(exams[0], { examId: 1, remaining: 6, daysLeft: 4, perDay: 2, atRisk: false })
})

test('an exam today or tomorrow puts everything on today; too much work flags the exam', () => {
  const one = buildSchedule([{ id: 1, subject: 'ML', date: addDays(T, 1), topics: topics(5) }], T)
  assert.equal(one.days[0].items.length, 5)
  assert.equal(one.exams[0].atRisk, true)
  const today = buildSchedule([{ id: 1, subject: 'ML', date: T, topics: topics(1) }], T)
  assert.deepEqual([today.days[0].items.length, today.exams[0].atRisk], [1, true])
  const fine = buildSchedule([{ id: 1, subject: 'ML', date: addDays(T, 10), topics: topics(MAX_PER_DAY * 10) }], T)
  assert.equal(fine.exams[0].atRisk, false)
  assert.equal(buildSchedule([{ id: 1, subject: 'ML', date: addDays(T, 5), topics: topics(3, 3) }], T).exams[0].atRisk, false)
})

test('several exams are merged by day, nearest exam first', () => {
  const { days } = buildSchedule([
    { id: 2, subject: 'CN', date: addDays(T, 6), topics: topics(2) },
    { id: 1, subject: 'ML', date: addDays(T, 2), topics: topics(2) },
  ], T, 3)
  assert.deepEqual(days[0].items.map((i) => i.subject), ['ML', 'CN'])
})

const exam = (ctx, key, body, today = T) => ctx.as(key).post(`/planner/exams?today=${today}`, body)

test('a student plans an exam with topics and ticks them off', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const res = await exam(ctx, 'student', { courseId: c.id, date: addDays(T, 10), topics: ['Arrays', 'Linked lists', 'Trees'] })
  assert.equal(res.status, 201)
  assert.deepEqual([res.body.subject, res.body.total, res.body.doneCount, res.body.daysLeft], ['Intro', 3, 0, 10])
  const t = res.body.topics[0]
  assert.equal((await ctx.as('student').patch(`/planner/topics/${t.id}`, { done: true })).body.done, true)
  const list = (await ctx.as('student').get(`/planner/exams?today=${T}`)).body
  assert.deepEqual([list[0].doneCount, list[0].topics.map((x) => x.title)], [1, ['Arrays', 'Linked lists', 'Trees']])
  const added = await ctx.as('student').post(`/planner/exams/${res.body.id}/topics`, { title: 'Graphs' })
  assert.equal(added.status, 201)
  assert.equal((await ctx.as('student').del(`/planner/topics/${added.body.id}`)).status, 204)
  const sched = (await ctx.as('student').get(`/planner/schedule?today=${T}&days=7`)).body
  assert.equal(sched.days.length, 7)
  assert.equal(sched.days.flatMap((d) => d.items).length, 2) // two topics left
  assert.equal(sched.exams[0].remaining, 2)
})

test('validation: past dates, unknown courses, missing subject, limits', async () => {
  const ctx = await setup()
  assert.equal((await exam(ctx, 'student', { subject: 'ML', date: addDays(T, -1) })).status, 400)
  assert.equal((await exam(ctx, 'student', { subject: 'ML', date: 'soon' })).status, 400)
  assert.equal((await exam(ctx, 'student', { date: addDays(T, 5) })).status, 400)
  assert.equal((await exam(ctx, 'student', { courseId: 999, date: addDays(T, 5) })).status, 400)
  assert.equal((await exam(ctx, 'student', { subject: 'ML', date: addDays(T, 5), topics: ['x'] })).status, 400)
  assert.equal((await exam(ctx, 'student', { subject: 'ML', date: addDays(T, 5), topics: ['Valid topic'] })).status, 201)
  assert.equal((await exam(ctx, 'student', { subject: 'ML', date: T })).status, 201) // exam today is fine
})

test('planner data is private and students-only', async () => {
  const ctx = await setup()
  const e = (await exam(ctx, 'student', { subject: 'ML', date: addDays(T, 5), topics: ['Regression'] })).body
  const topic = e.topics[0]
  assert.equal((await ctx.as('student2').get(`/planner/exams?today=${T}`)).body.length, 0)
  assert.equal((await ctx.as('student2').patch(`/planner/exams/${e.id}`, { subject: 'Hijack' })).status, 404)
  assert.equal((await ctx.as('student2').patch(`/planner/topics/${topic.id}`, { done: true })).status, 404)
  assert.equal((await ctx.as('student2').del(`/planner/exams/${e.id}`)).status, 404)
  assert.equal((await ctx.as('student2').post(`/planner/exams/${e.id}/topics`, { title: 'Sneaky' })).status, 404)
  assert.equal((await ctx.as('teacher').get('/planner/exams')).status, 403)
  assert.equal((await ctx.request('get', '/planner/exams')).status, 401)
})

test('editing an exam, passed exams drop out of the schedule, deleting cascades', async () => {
  const ctx = await setup()
  const e = (await exam(ctx, 'student', { subject: 'ML', date: addDays(T, 3), topics: ['Regression', 'Trees'] })).body
  const edited = await ctx.as('student').patch(`/planner/exams/${e.id}?today=${T}`, { subject: 'Machine Learning', date: addDays(T, 8) })
  assert.deepEqual([edited.body.subject, edited.body.daysLeft], ['Machine Learning', 8])
  assert.equal((await ctx.as('student').get(`/planner/schedule?today=${addDays(T, 20)}`)).body.exams.length, 0)
  assert.equal((await ctx.as('student').del(`/planner/exams/${e.id}`)).status, 204)
  assert.equal((await ctx.pool.query('SELECT 1 FROM study_topics')).rows.length, 0)
})
