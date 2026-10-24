import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const raise = (ctx, key, body = {}) => ctx.as(key).post('/helpdesk/tickets', { category: 'fees', title: 'Fee receipt not showing', details: 'Sem 5 receipt is missing', ...body })
const inbox = async (ctx, key) => (await ctx.as(key).get('/notifications')).body.items

// Admin creates a fees desk and a hostel desk account; both log in.
async function desks() {
  const ctx = await setup()
  const make = (email, name, deskDepartment) => ctx.as('admin').post('/users', { email, name, role: 'staff', deskDepartment, password: 'password123' })
  assert.equal((await make('fees@t.edu', 'Fees Desk', 'Accounts & Fees')).status, 201)
  assert.equal((await make('hostel@t.edu', 'Hostel Desk', 'Hostel')).status, 201)
  await ctx.login('fees', 'fees@t.edu'); await ctx.login('hostel', 'hostel@t.edu')
  return ctx
}

test('admin creates staff accounts: a help-desk department is required, and only for staff', async () => {
  const ctx = await setup()
  const base = { email: 'desk@t.edu', name: 'Some Desk', password: 'password123' }
  const ok = await ctx.as('admin').post('/users', { ...base, role: 'staff', deskDepartment: 'Library' })
  assert.deepEqual([ok.status, ok.body.role, ok.body.deskDepartment], [201, 'staff', 'Library'])
  assert.equal((await ctx.as('admin').post('/users', { ...base, email: 'a@t.edu', role: 'staff' })).status, 400) // no department
  assert.equal((await ctx.as('admin').post('/users', { ...base, email: 'b@t.edu', role: 'staff', deskDepartment: 'Nowhere' })).status, 400)
  assert.equal((await ctx.as('admin').post('/users', { ...base, email: 'c@t.edu', role: 'teacher', deskDepartment: 'Library' })).status, 400) // not staff
  assert.equal((await ctx.as('teacher').post('/users', { ...base, email: 'd@t.edu', role: 'staff', deskDepartment: 'Library' })).status, 403)
  const me = await ctx.request('post', '/auth/login', { email: 'desk@t.edu', password: 'password123' })
  assert.deepEqual([me.status, me.body.user.role, me.body.user.deskDepartment], [200, 'staff', 'Library'])
  // changing the department, and leaving the staff role clears it
  const moved = await ctx.as('admin').patch(`/users/${ok.body.id}`, { deskDepartment: 'Hostel' })
  assert.equal(moved.body.deskDepartment, 'Hostel')
  assert.equal((await ctx.as('admin').patch(`/users/${ok.body.id}`, { deskDepartment: null })).status, 400)
  const left = await ctx.as('admin').patch(`/users/${ok.body.id}`, { role: 'teacher' })
  assert.deepEqual([left.body.role, left.body.deskDepartment], ['teacher', null])
  assert.equal((await ctx.as('admin').patch(`/users/${ok.body.id}`, { role: 'staff' })).status, 400) // back to staff needs a department
})

test('staff reach only the help desk and notifications; every other module refuses them', async () => {
  const ctx = await desks()
  for (const u of ['/users', '/courses', '/doubts', '/notes', '/planner', '/risk/overview', '/counselling/slots', '/mentorship/mentors', '/projects', '/admin/usage', '/career', '/community/rooms', '/me/performance', '/files/1']) {
    assert.equal((await ctx.as('fees').get(u)).status, 403, u)
  }
  assert.equal((await ctx.as('fees').get('/helpdesk/meta')).status, 200)
  assert.equal((await ctx.as('fees').get('/notifications')).status, 200)
  assert.equal((await ctx.as('fees').get('/helpdesk/stats')).status, 403) // admin only
  assert.equal((await raise(ctx, 'fees')).status, 403) // staff do not raise tickets
})

test('staff see and handle only their own department\'s tickets', async () => {
  const ctx = await desks()
  const fees = (await raise(ctx, 'student')).body
  const hostel = (await raise(ctx, 'student2', { category: 'hostel', title: 'No water in room 204' })).body
  assert.deepEqual((await ctx.as('fees').get('/helpdesk/tickets')).body.map((t) => t.id), [fees.id])
  assert.deepEqual((await ctx.as('hostel').get('/helpdesk/tickets')).body.map((t) => t.id), [hostel.id])
  assert.equal((await ctx.as('fees').get('/helpdesk/tickets?department=Hostel')).body.length, 1) // the filter cannot widen it
  assert.equal((await ctx.as('fees').get(`/helpdesk/tickets/${hostel.id}`)).status, 404)
  assert.equal((await ctx.as('fees').post(`/helpdesk/tickets/${hostel.id}/messages`, { body: 'Not mine' })).status, 404)
  assert.equal((await ctx.as('fees').patch(`/helpdesk/tickets/${hostel.id}`, { status: 'resolved' })).status, 404)
  // reply and resolve their own
  const reply = await ctx.as('fees').post(`/helpdesk/tickets/${fees.id}/messages`, { body: 'We have re-issued the receipt.' })
  assert.deepEqual([reply.status, reply.body.status, reply.body.messages[0].author.role], [201, 'in_progress', 'staff'])
  const done = await ctx.as('fees').patch(`/helpdesk/tickets/${fees.id}`, { status: 'resolved', priority: 'low' })
  assert.deepEqual([done.status, done.body.status, done.body.priority], [200, 'resolved', 'low'])
  assert.equal((await ctx.as('student').get(`/helpdesk/tickets/${fees.id}`)).body.status, 'resolved')
  // a student reply reopens it
  await ctx.as('student').post(`/helpdesk/tickets/${fees.id}/messages`, { body: 'Still cannot see it.' })
  assert.equal((await ctx.as('fees').get(`/helpdesk/tickets/${fees.id}`)).body.status, 'open')
  // staff cannot re-route, admins can, and the ticket moves to the other desk
  assert.equal((await ctx.as('fees').patch(`/helpdesk/tickets/${fees.id}`, { department: 'Hostel' })).status, 403)
  assert.equal((await ctx.as('admin').patch(`/helpdesk/tickets/${fees.id}`, { department: 'Hostel' })).status, 200)
  assert.equal((await ctx.as('fees').get(`/helpdesk/tickets/${fees.id}`)).status, 404)
  assert.equal((await ctx.as('hostel').get('/helpdesk/tickets')).body.length, 2)
  assert.equal((await ctx.as('teacher').get('/helpdesk/tickets')).status, 403)
})

test('the right desk is notified, and the student hears back from staff', async () => {
  const ctx = await desks()
  const t = (await raise(ctx, 'student')).body
  assert.ok(JSON.stringify(await inbox(ctx, 'fees')).includes('New ticket'))
  assert.ok(JSON.stringify(await inbox(ctx, 'admin')).includes('New ticket'))
  assert.equal((await inbox(ctx, 'hostel')).length, 0) // another department hears nothing
  await ctx.as('fees').post(`/helpdesk/tickets/${t.id}/messages`, { body: 'Receipt re-issued.' })
  assert.ok(JSON.stringify(await inbox(ctx, 'student')).includes('has a new reply'))
  await ctx.as('admin').patch(`/helpdesk/tickets/${t.id}`, { department: 'Hostel' })
  assert.ok(JSON.stringify(await inbox(ctx, 'hostel')).includes('routed to your department'))
})

test('a suspended or department-less staff account gets nothing', async () => {
  const ctx = await desks()
  const t = (await raise(ctx, 'student')).body
  const id = (await ctx.pool.query("SELECT id FROM users WHERE email = 'fees@t.edu'")).rows[0].id
  await ctx.pool.query('UPDATE users SET desk_department = NULL WHERE id = $1', [id])
  assert.equal((await ctx.as('fees').get('/helpdesk/tickets')).status, 403)
  await ctx.pool.query("UPDATE users SET desk_department = 'Accounts & Fees', is_active = FALSE WHERE id = $1", [id])
  assert.equal((await ctx.as('fees').get(`/helpdesk/tickets/${t.id}`)).status, 403) // the old token stops working with the account
})
