import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestPriority, departmentFor, ticketNumber } from '../src/helpdesk.js'
import { setup } from './helpers.js'

const raise = (ctx, key, body = {}) => ctx.as(key).post('/helpdesk/tickets', { category: 'fees', title: 'Fee receipt not showing', details: 'Sem 5 receipt is missing', ...body })

test('routing and priority rules', () => {
  assert.deepEqual(['fees', 'hostel', 'library', 'it', 'certificates', 'academics'].map(departmentFor), ['Accounts & Fees', 'Hostel', 'Library', 'IT Services', 'Academic Office', 'Examination'])
  assert.equal(suggestPriority('Wi-Fi is down, urgent'), 'high')
  assert.equal(suggestPriority('Need a bonafide certificate'), 'medium')
  assert.equal(ticketNumber(42), 'TK-1042')
})

test('a student raises a ticket and it is routed to the right department', async () => {
  const ctx = await setup()
  const res = await raise(ctx, 'student')
  assert.equal(res.status, 201)
  assert.deepEqual([res.body.number, res.body.department, res.body.status, res.body.priority], ['TK-1001', 'Accounts & Fees', 'open', 'medium'])
  const urgent = await raise(ctx, 'student', { category: 'hostel', title: 'No water in room 204', details: 'Need this fixed urgently' })
  assert.deepEqual([urgent.body.department, urgent.body.priority], ['Hostel', 'high'])
  assert.equal((await raise(ctx, 'student', { category: 'parking' })).status, 400)
  assert.equal((await raise(ctx, 'student', { title: 'Hi' })).status, 400)
  assert.equal((await raise(ctx, 'teacher')).status, 403)
  assert.equal((await raise(ctx, 'admin')).status, 403)
})

test('students see only their own tickets; admins see all and can filter', async () => {
  const ctx = await setup()
  const mine = (await raise(ctx, 'student')).body
  await raise(ctx, 'student2', { category: 'library', title: 'Need a book extension' })
  assert.deepEqual((await ctx.as('student').get('/helpdesk/tickets')).body.map((t) => t.id), [mine.id])
  assert.equal((await ctx.as('student2').get(`/helpdesk/tickets/${mine.id}`)).status, 404)
  assert.equal((await ctx.as('admin').get('/helpdesk/tickets')).body.length, 2)
  assert.equal((await ctx.as('admin').get('/helpdesk/tickets?department=Library')).body.length, 1)
  assert.equal((await ctx.as('admin').get('/helpdesk/tickets?department=Nowhere')).status, 400)
  assert.equal((await ctx.as('teacher').get('/helpdesk/tickets')).status, 403)
  assert.equal((await ctx.as('teacher').get(`/helpdesk/tickets/${mine.id}`)).status, 404)
  assert.equal((await ctx.as('student').get('/helpdesk/meta')).body.categories.length, 6)
})

test('only admins re-route, set priority and resolve; resolving stamps the time', async () => {
  const ctx = await setup()
  const t = (await raise(ctx, 'student')).body
  assert.equal((await ctx.as('student').patch(`/helpdesk/tickets/${t.id}`, { status: 'resolved' })).status, 403)
  const rerouted = await ctx.as('admin').patch(`/helpdesk/tickets/${t.id}`, { department: 'Academic Office', priority: 'high' })
  assert.deepEqual([rerouted.body.department, rerouted.body.priority], ['Academic Office', 'high'])
  assert.equal((await ctx.as('admin').patch(`/helpdesk/tickets/${t.id}`, { department: 'Moon Base' })).status, 400)
  assert.equal((await ctx.as('admin').patch(`/helpdesk/tickets/${t.id}`, {})).status, 400)
  const done = await ctx.as('admin').patch(`/helpdesk/tickets/${t.id}`, { status: 'resolved' })
  assert.deepEqual([done.body.status, done.body.resolvedAt != null], ['resolved', true])
})

test('conversation: staff reply starts work, student reply reopens a resolved ticket', async () => {
  const ctx = await setup()
  const t = (await raise(ctx, 'student')).body
  const reply = await ctx.as('admin').post(`/helpdesk/tickets/${t.id}/messages`, { body: 'Checking with accounts.' })
  assert.deepEqual([reply.status, reply.body.status], [201, 'in_progress'])
  await ctx.as('student').post(`/helpdesk/tickets/${t.id}/messages`, { body: 'Thanks, any update?' })
  await ctx.as('admin').patch(`/helpdesk/tickets/${t.id}`, { status: 'resolved' })
  const again = await ctx.as('student').post(`/helpdesk/tickets/${t.id}/messages`, { body: 'Still missing for Sem 4.' })
  assert.equal(again.body.status, 'open')
  const thread = (await ctx.as('student').get(`/helpdesk/tickets/${t.id}`)).body
  assert.deepEqual(thread.messages.map((m) => [m.author.role, m.body]), [['admin', 'Checking with accounts.'], ['student', 'Thanks, any update?'], ['student', 'Still missing for Sem 4.']])
  assert.equal(thread.resolvedAt, null)
  assert.equal((await ctx.as('student2').post(`/helpdesk/tickets/${t.id}/messages`, { body: 'Hello' })).status, 404)
  assert.equal((await ctx.as('teacher').post(`/helpdesk/tickets/${t.id}/messages`, { body: 'Hello' })).status, 403)
  assert.equal((await ctx.as('student').post(`/helpdesk/tickets/${t.id}/messages`, { body: '' })).status, 400)
})

test('admin stats by status and department', async () => {
  const ctx = await setup()
  const a = (await raise(ctx, 'student')).body
  await raise(ctx, 'student2', { category: 'it', title: 'Wi-Fi not connecting in block C' })
  await ctx.as('admin').patch(`/helpdesk/tickets/${a.id}`, { status: 'resolved' })
  const s = (await ctx.as('admin').get('/helpdesk/stats')).body
  assert.deepEqual([s.total, s.open, s.resolved, s.avgResolutionHours != null], [2, 1, 1, true])
  assert.deepEqual(s.byDepartment.find((d) => d.department === 'IT Services'), { department: 'IT Services', open: 1, total: 1 })
  assert.equal((await ctx.as('student').get('/helpdesk/stats')).status, 403)
})

test('deleting a student removes their tickets', async () => {
  const ctx = await setup()
  await raise(ctx, 'student')
  await ctx.pool.query('DELETE FROM users WHERE id = $1', [ctx.ids.student])
  assert.equal((await ctx.pool.query('SELECT 1 FROM tickets')).rows.length, 0)
})
