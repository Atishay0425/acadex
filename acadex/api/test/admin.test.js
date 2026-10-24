import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assess, DEFAULT_RULES } from '../src/risk.js'
import { setup, classroom } from './helpers.js'

const NOW = new Date('2026-10-20T00:00:00Z')

test('rules change the score: a stricter attendance target and a lower high cut-off', () => {
  const input = { statuses: ['present', 'present', 'present', 'absent', 'absent'] } // 60% attendance
  const base = assess(input, NOW)
  const strict = assess(input, NOW, { ...DEFAULT_RULES, attendanceTarget: 90, high: 45 })
  assert.ok(strict.score > base.score)
  assert.match(strict.drivers[0].detail, /below the 90% minimum/)
  assert.equal(assess({ statuses: Array(10).fill('absent') }, NOW, { ...DEFAULT_RULES, high: 30 }).level, 'high')
  const lenient = assess({ assignments: [{ due_at: '2026-10-01T00:00:00Z', submitted: false }, { due_at: '2026-10-02T00:00:00Z', submitted: false }] }, NOW, { ...DEFAULT_RULES, missingFull: 6 })
  assert.ok(lenient.score < assess({ assignments: [{ due_at: '2026-10-01T00:00:00Z', submitted: false }, { due_at: '2026-10-02T00:00:00Z', submitted: false }] }, NOW).score)
})

test('only admins read or change the rules; values are validated and persist', async () => {
  const ctx = await setup()
  assert.equal((await ctx.as('teacher').get('/admin/rules')).status, 403)
  assert.equal((await ctx.as('student').put('/admin/rules', DEFAULT_RULES)).status, 403)
  const cur = (await ctx.as('admin').get('/admin/rules')).body
  assert.deepEqual(cur.rules, DEFAULT_RULES)
  assert.equal((await ctx.as('admin').put('/admin/rules', { ...DEFAULT_RULES, attendanceTarget: 120 })).status, 400)
  assert.equal((await ctx.as('admin').put('/admin/rules', { ...DEFAULT_RULES, medium: 70, high: 60 })).status, 400)
  assert.equal((await ctx.as('admin').put('/admin/rules', { ...DEFAULT_RULES, surprise: 1 })).status, 400)
  const ok = await ctx.as('admin').put('/admin/rules', { ...DEFAULT_RULES, attendanceTarget: 85, high: 50 })
  assert.equal(ok.status, 200)
  assert.deepEqual((await ctx.as('admin').get('/admin/rules')).body.rules.attendanceTarget, 85)
  await ctx.as('admin').put('/admin/rules', { ...DEFAULT_RULES, attendanceTarget: 70 }) // saving again updates the same row
  assert.equal((await ctx.pool.query('SELECT 1 FROM app_settings')).rows.length, 1)
})

test('saved rules drive the early-warning score, and the save reports the effect', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  for (const [d, st] of [['01', 'present'], ['02', 'present'], ['03', 'present'], ['04', 'absent']]) await ctx.as('teacher').post(`/courses/${c.id}/attendance`, { date: `2026-10-${d}`, records: [{ studentId: ctx.ids.student, status: st }] })
  const before = (await ctx.as('student').get('/risk/me')).body // 75% attendance meets the default target
  assert.equal(before.score, 0)
  const saved = await ctx.as('admin').put('/admin/rules', { ...DEFAULT_RULES, attendanceTarget: 95 })
  assert.equal(saved.body.distribution.low + saved.body.distribution.medium + saved.body.distribution.high, 2)
  const after = (await ctx.as('student').get('/risk/me')).body
  assert.ok(after.score > 0)
  assert.match(after.drivers[0].detail, /below the 95% minimum/)
})

test('usage: counts distinct active students per module in the window', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  assert.equal((await ctx.as('teacher').get('/admin/usage')).status, 403)
  let u = (await ctx.as('admin').get('/admin/usage')).body
  assert.deepEqual([u.students, u.activeStudents, u.modules.every((m) => m.pct === 0)], [2, 0, true])
  await ctx.as('student').post('/doubts', { courseId: c.id, title: 'Why does gain ratio fix ID3 bias?' })
  await ctx.as('student').post('/doubts', { courseId: c.id, title: 'Another question about parsing' })
  await ctx.as('student2').post('/helpdesk/tickets', { category: 'fees', title: 'Fee receipt missing' })
  await ctx.as('student').post('/helpdesk/tickets', { category: 'it', title: 'Wi-Fi not connecting' })
  u = (await ctx.as('admin').get('/admin/usage?days=7')).body
  const by = Object.fromEntries(u.modules.map((m) => [m.module, m]))
  assert.deepEqual([by['Doubt Desk'].users, by['Doubt Desk'].pct, by['Help Center'].pct, by['Counselling'].pct], [1, 50, 100, 0])
  assert.equal(u.activeStudents, 2)
  assert.equal(u.modules[0].module, 'Help Center') // sorted by adoption
  assert.equal((await ctx.as('admin').get('/admin/usage?days=0')).status, 400)
  await ctx.pool.query("UPDATE doubts SET created_at = now() - interval '30 days'")
  assert.equal((await ctx.as('admin').get('/admin/usage')).body.modules.find((m) => m.module === 'Doubt Desk').users, 0) // outside the window
})
