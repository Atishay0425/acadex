import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, classroom } from './helpers.js'

const ask = (ctx, key, c, extra = {}) => ctx.as(key).post('/doubts', { courseId: c.id, title: 'Why does gain ratio fix ID3 bias?', body: 'Context here', ...extra })

test('a student asks the course teacher; validation and enrolment are enforced', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const res = await ask(ctx, 'student', c)
  assert.equal(res.status, 201)
  assert.deepEqual([res.body.teacher.name, res.body.solved, res.body.isMine, res.body.upvotes], ['Teacher One', false, true, 0])
  assert.equal((await ask(ctx, 'student', c, { title: 'Hi' })).status, 400)
  const other = (await ctx.as('teacher2').post('/courses', { code: 'CS999', title: 'Other' })).body
  assert.equal((await ask(ctx, 'student', other)).status, 403) // not enrolled
  assert.equal((await ask(ctx, 'teacher', c)).status, 403)
  const orphan = (await ctx.as('admin').post('/courses', { code: 'CS500', title: 'No teacher' })).body
  await ctx.as('admin').post(`/courses/${orphan.id}/students`, { studentId: ctx.ids.student })
  assert.equal((await ask(ctx, 'student', orphan)).status, 400)
})

test('visibility: classmates and the course teacher see a doubt, outsiders do not', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const d = (await ask(ctx, 'student', c)).body
  assert.equal((await ctx.as('student2').get(`/doubts/${d.id}`)).status, 200)
  assert.equal((await ctx.as('teacher').get(`/doubts/${d.id}`)).status, 200)
  assert.equal((await ctx.as('admin').get(`/doubts/${d.id}`)).status, 200)
  assert.equal((await ctx.as('teacher2').get(`/doubts/${d.id}`)).status, 404)
  await ctx.as('student2').del(`/courses/${c.id}/enroll`)
  assert.equal((await ctx.as('student2').get(`/doubts/${d.id}`)).status, 404)
  assert.equal((await ctx.as('teacher2').get('/doubts')).body.length, 0)
  assert.equal((await ctx.as('student2').get('/doubts')).body.length, 0)
})

test('upvotes toggle, never on your own doubt, and top sort uses them', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = (await ask(ctx, 'student', c)).body
  const b = (await ask(ctx, 'student', c, { title: 'Another question entirely' })).body
  assert.equal((await ctx.as('student').post(`/doubts/${a.id}/upvote`)).status, 400)
  assert.deepEqual((await ctx.as('student2').post(`/doubts/${a.id}/upvote`)).body, { upvotes: 1, myUpvote: true })
  const top = (await ctx.as('student2').get('/doubts?sort=top')).body
  assert.deepEqual([top[0].id, top[0].upvotes, top[0].myUpvote], [a.id, 1, true])
  assert.deepEqual((await ctx.as('student2').post(`/doubts/${a.id}/upvote`)).body, { upvotes: 0, myUpvote: false })
  assert.equal((await ctx.as('student2').get('/doubts')).body[0].id, b.id) // newest first
})

test('only the course teacher or an admin answers; answering marks it solved and is editable', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const d = (await ask(ctx, 'student', c)).body
  const put = (key, answer) => ctx.as(key).put(`/doubts/${d.id}/answer`, { answer })
  assert.equal((await put('student2', 'I think so')).status, 403)
  assert.equal((await put('teacher2', 'Not mine')).status, 404)
  assert.equal((await put('teacher', '')).status, 400)
  const res = await put('teacher', 'Gain ratio normalises by split information.')
  assert.deepEqual([res.status, res.body.solved, res.body.answer], [200, true, 'Gain ratio normalises by split information.'])
  assert.equal((await put('teacher', 'Updated answer')).body.answer, 'Updated answer')
  assert.equal((await ctx.as('student').get('/doubts?status=open')).body.length, 0)
  assert.equal((await ctx.as('student').get('/doubts?status=solved')).body.length, 1)
})

test('search covers title, details and the answer; similar finds solved doubts only', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = (await ask(ctx, 'student', c)).body
  await ask(ctx, 'student', c, { title: 'Gain ratio homework unsolved yet', body: '' })
  await ctx.as('teacher').put(`/doubts/${a.id}/answer`, { answer: 'Normalises by split information' })
  const find = async (q) => (await ctx.as('student2').get(`/doubts?search=${encodeURIComponent(q)}`)).body.length
  assert.deepEqual([await find('split information'), await find('context here'), await find('zzz'), await find('%')], [1, 1, 0, 0])
  const sim = (await ctx.as('student2').get('/doubts/similar?title=How%20does%20gain%20ratio%20work')).body
  assert.deepEqual(sim.map((x) => x.id), [a.id])
  assert.equal((await ctx.as('student2').get('/doubts/similar?title=hi')).body.length, 0)
  assert.equal((await ctx.as('teacher2').get('/doubts/similar?title=gain%20ratio')).body.length, 0)
})

test('withdrawing: the asker only while unanswered; the teacher any time; deleting a course clears them', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = (await ask(ctx, 'student', c)).body
  assert.equal((await ctx.as('student2').del(`/doubts/${a.id}`)).status, 403)
  assert.equal((await ctx.as('student').del(`/doubts/${a.id}`)).status, 204)
  const b = (await ask(ctx, 'student', c)).body
  await ctx.as('teacher').put(`/doubts/${b.id}/answer`, { answer: 'Done' })
  assert.equal((await ctx.as('student').del(`/doubts/${b.id}`)).status, 403)
  await ctx.as('student2').post(`/doubts/${b.id}/upvote`)
  assert.equal((await ctx.as('teacher').del(`/doubts/${b.id}`)).status, 204)
  await ask(ctx, 'student', c)
  await ctx.as('admin').del(`/courses/${c.id}`)
  assert.equal((await ctx.pool.query('SELECT 1 FROM doubts')).rows.length, 0)
})
