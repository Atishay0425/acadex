import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const P = '/projects'
const idea = (ctx, key = 'student', extra = {}) => ctx.as(key).post(P, { title: 'AI Study Buddy', description: 'Chat with your notes', stack: ['Next.js', 'Express'], spots: 2, mentorId: ctx.ids.teacher, ...extra })

test('a student posts an idea; it starts as an idea with spots open', async () => {
  const ctx = await setup()
  const res = await idea(ctx)
  assert.equal(res.status, 201)
  assert.deepEqual([res.body.status, res.body.progress, res.body.lookingFor, res.body.myRole, res.body.mentor.name], ['idea', 0, 2, 'owner', 'Teacher One'])
  assert.equal((await idea(ctx, 'student', { title: 'No' })).status, 400)
  assert.equal((await idea(ctx, 'student', { mentorId: ctx.ids.student2 })).status, 400) // mentor must be a teacher
  assert.equal((await idea(ctx, 'student', { repoUrl: 'javascript:alert(1)' })).status, 400)
  assert.equal((await idea(ctx, 'teacher')).status, 403)
  for (let i = 0; i < 4; i++) await idea(ctx, 'student', { title: `Another idea ${i}` })
  assert.equal((await idea(ctx, 'student', { title: 'One too many' })).status, 400)
})

test('everyone signed in can browse; filters work', async () => {
  const ctx = await setup()
  await idea(ctx, 'student', { title: 'Lost and Found Portal', stack: ['React'], spots: 0, mentorId: null })
  await idea(ctx, 'student2', { title: 'Mess Feedback Analyzer', stack: ['Python', 'NLP'], spots: 3 })
  const titles = async (qs) => (await ctx.as('student').get(`${P}${qs}`)).body.map((p) => p.title).sort()
  assert.deepEqual(await titles(''), ['Lost and Found Portal', 'Mess Feedback Analyzer'])
  assert.deepEqual(await titles('?looking=true'), ['Mess Feedback Analyzer'])
  assert.deepEqual(await titles('?q=nlp'), ['Mess Feedback Analyzer'])
  assert.deepEqual(await titles('?mine=true'), ['Lost and Found Portal'])
  assert.deepEqual(await titles('?status=completed'), [])
  assert.equal((await ctx.request('get', P)).status, 401)
  assert.equal((await ctx.as('student').get(`${P}?review=true`)).status, 403)
})

test('mentor review: approve starts the project; changes sends it back until the owner edits', async () => {
  const ctx = await setup()
  const p = (await idea(ctx)).body
  const review = (key, body) => ctx.as(key).post(`${P}/${p.id}/review`, body)
  assert.equal((await review('student', { decision: 'approve' })).status, 403)
  assert.equal((await review('teacher2', { decision: 'approve' })).status, 403)
  const noNote = await review('teacher', { decision: 'changes', note: '' })
  assert.deepEqual([noNote.status, noNote.body.error], [400, 'Say what should change'])
  const changed = await review('teacher', { decision: 'changes', note: 'Narrow the scope to one subject.' })
  assert.equal(changed.body.status, 'changes_requested')
  assert.equal((await review('teacher', { decision: 'approve' })).status, 409) // owner has to resubmit first
  const edited = await ctx.as('student').patch(`${P}/${p.id}`, { description: 'Now only for Data Structures' })
  assert.equal(edited.body.status, 'idea')
  const ok = await review('teacher', { decision: 'approve', note: 'Go ahead' })
  assert.deepEqual([ok.body.status, ok.body.progress], ['in_progress', 5])
  const detail = (await ctx.as('student2').get(`${P}/${p.id}`)).body
  assert.deepEqual(detail.updates.map((u) => u.kind), ['approved', 'changes_requested'])
})

test('ideas without a mentor show up for review and a teacher can claim one', async () => {
  const ctx = await setup()
  const p = (await idea(ctx, 'student', { mentorId: null })).body
  assert.deepEqual((await ctx.as('teacher').get(`${P}?review=true`)).body.map((x) => x.id), [p.id])
  assert.equal((await ctx.as('student2').post(`${P}/${p.id}/claim`)).status, 403)
  assert.equal((await ctx.as('teacher').post(`${P}/${p.id}/claim`)).body.mentor.name, 'Teacher One')
  assert.equal((await ctx.as('teacher2').post(`${P}/${p.id}/claim`)).status, 409)
  assert.equal((await ctx.as('teacher2').get(`${P}?review=true`)).body.length, 0) // now only its mentor reviews it
  assert.equal((await ctx.as('teacher').get(`${P}?review=true`)).body.length, 1)
})

test('teammates: request, owner accepts within the spots, duplicates and full teams are refused', async () => {
  const ctx = await setup()
  const p = (await idea(ctx, 'student', { spots: 1 })).body
  const join = (key) => ctx.as(key).post(`${P}/${p.id}/requests`, { message: 'I know React' })
  assert.equal((await join('student')).status, 400) // own project
  assert.equal((await join('student2')).status, 201)
  assert.equal((await join('student2')).status, 409)
  assert.equal((await ctx.as('student2').get(`${P}/${p.id}/requests`)).status, 403)
  assert.equal((await ctx.as('student2').get(`${P}/${p.id}`)).body.myRole, 'pending')
  const pending = (await ctx.as('student').get(`${P}/${p.id}/requests`)).body
  assert.deepEqual([pending.length, pending[0].student.name, pending[0].message], [1, 'Student Two', 'I know React'])
  assert.equal((await ctx.as('student2').post(`${P}/${p.id}/requests/${pending[0].id}/decision`, { accept: true })).status, 403)
  const res = await ctx.as('student').post(`${P}/${p.id}/requests/${pending[0].id}/decision`, { accept: true })
  assert.deepEqual([res.body.lookingFor, res.body.team.map((m) => m.name)], [0, ['Student Two']])
  assert.equal((await ctx.as('student2').get(`${P}/${p.id}`)).body.myRole, 'member')
  assert.equal((await ctx.as('student').patch(`${P}/${p.id}`, { spots: 0 })).status, 400) // cannot drop below current team
  assert.equal((await ctx.as('student2').del(`${P}/${p.id}/members/me`)).status, 204)
  assert.equal((await ctx.as('student').get(`${P}/${p.id}`)).body.lookingFor, 1)
  assert.equal((await join('student2')).status, 201) // may ask again after leaving
})

test('declining keeps the team as it was; a full team refuses new requests', async () => {
  const ctx = await setup()
  const p = (await idea(ctx, 'student', { spots: 1 })).body
  await ctx.as('student2').post(`${P}/${p.id}/requests`, {})
  const [q] = (await ctx.as('student').get(`${P}/${p.id}/requests`)).body
  assert.equal((await ctx.as('student').post(`${P}/${p.id}/requests/${q.id}/decision`, { accept: false })).body.lookingFor, 1)
  assert.equal((await ctx.as('student').get(`${P}/${p.id}/requests`)).body.length, 0)
  const full = (await idea(ctx, 'student', { title: 'Closed team project', spots: 0 })).body
  assert.equal((await ctx.as('student2').post(`${P}/${full.id}/requests`, {})).status, 409)
})

test('progress: logged after approval by the team, feedback by the mentor, then completed', async () => {
  const ctx = await setup()
  const p = (await idea(ctx)).body
  const log = (key, body) => ctx.as(key).post(`${P}/${p.id}/updates`, body)
  assert.equal((await log('student', { body: 'Started the schema', progress: 10 })).status, 409) // not approved yet
  await ctx.as('teacher').post(`${P}/${p.id}/review`, { decision: 'approve' })
  assert.equal((await log('student2', { body: 'Hello there everyone' })).status, 403) // not on the team
  assert.equal((await log('student', { body: 'Schema done', progress: 40 })).body.progress, 40)
  assert.equal((await log('student', { body: 'bad', progress: 140 })).status, 400)
  const fb = await log('teacher', { body: 'Add a test plan', progress: 90 })
  assert.equal(fb.body.progress, 40) // a mentor's feedback does not move progress
  assert.equal((await ctx.as('student2').post(`${P}/${p.id}/complete`)).status, 403)
  const done = await ctx.as('student').post(`${P}/${p.id}/complete`)
  assert.deepEqual([done.body.status, done.body.progress], ['completed', 100])
  assert.equal((await ctx.as('student').patch(`${P}/${p.id}`, { title: 'Renamed project' })).status, 409)
  assert.equal((await ctx.as('student2').post(`${P}/${p.id}/requests`, {})).status, 409)
  const kinds = (await ctx.as('student').get(`${P}/${p.id}`)).body.updates.map((u) => u.kind)
  assert.deepEqual(kinds, ['completed', 'feedback', 'update', 'approved'])
})

test('only the owner (or an admin) deletes; deleting clears related rows', async () => {
  const ctx = await setup()
  const p = (await idea(ctx)).body
  await ctx.as('student2').post(`${P}/${p.id}/requests`, {})
  assert.equal((await ctx.as('student2').del(`${P}/${p.id}`)).status, 403)
  assert.equal((await ctx.as('admin').del(`${P}/${p.id}`)).status, 204)
  assert.equal((await ctx.pool.query('SELECT 1 FROM project_requests')).rows.length, 0)
  assert.equal((await ctx.as('student').get(`${P}/${p.id}`)).status, 404)
})
