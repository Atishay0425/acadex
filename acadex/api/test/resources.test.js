import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, classroom } from './helpers.js'

const NOTE = 'Decision trees split data using impurity measures such as entropy and the Gini index. ID3 uses information gain to choose the splitting attribute. Pruning removes branches that overfit the training data. A random forest averages many decision trees to reduce variance.'
const R = (c) => `/courses/${c.id}/resources`

test('a course teacher shares a note and a link; validation and permissions', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const note = await ctx.as('teacher').post(R(c), { kind: 'note', title: 'Unit 3: Decision trees', content: NOTE })
  assert.deepEqual([note.status, note.body.kind, note.body.imports, note.body.teacher], [201, 'note', 0, 'Teacher One'])
  assert.equal((await ctx.as('teacher').post(R(c), { kind: 'link', title: 'Lecture video', url: 'https://example.com/lecture' })).status, 201)
  assert.equal((await ctx.as('teacher').post(R(c), { kind: 'link', title: 'Bad link', url: 'javascript:alert(1)' })).status, 400)
  assert.equal((await ctx.as('teacher').post(R(c), { kind: 'note', title: 'Too short', content: 'Short.' })).status, 400)
  assert.equal((await ctx.as('teacher').post(R(c), { kind: 'file', title: 'Nope' })).status, 400)
  assert.equal((await ctx.as('student').post(R(c), { kind: 'link', title: 'Mine', url: 'https://example.com' })).status, 403)
  assert.equal((await ctx.as('teacher2').post(R(c), { kind: 'link', title: 'Not mine', url: 'https://example.com' })).status, 403)
  assert.equal((await ctx.as('admin').post(R(c), { kind: 'link', title: 'Admin link', url: 'https://example.com' })).status, 201)
})

test('only the class (enrolled students, its teacher, admins) can see the resources; students are told', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  await ctx.as('teacher').post(R(c), { kind: 'note', title: 'Unit 3', content: NOTE })
  assert.equal((await ctx.as('student').get(R(c))).body.length, 1)
  assert.equal((await ctx.as('student').get(R(c))).body[0].imports, undefined) // students do not see the counts
  assert.equal((await ctx.as('admin').get(R(c))).status, 200)
  assert.equal((await ctx.as('teacher2').get(R(c))).status, 403)
  await ctx.as('student2').del(`/courses/${c.id}/enroll`)
  assert.equal((await ctx.as('student2').get(R(c))).status, 403)
  const n = (await ctx.as('student').get('/notifications')).body
  assert.match(n.items[0].title, /New material in CS101: Unit 3/)
  assert.equal(n.items[0].link, '/student/resources')
})

test('a student can add a shared note to Smart Notes once; the teacher sees the count', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const note = (await ctx.as('teacher').post(R(c), { kind: 'note', title: 'Unit 3', content: NOTE })).body
  const link = (await ctx.as('teacher').post(R(c), { kind: 'link', title: 'Video', url: 'https://example.com/v' })).body
  const first = await ctx.as('student').post(`${R(c)}/${note.id}/import`)
  assert.deepEqual([first.status, first.body.already], [201, false])
  const mine = (await ctx.as('student').get(`/notes/${first.body.noteId}`)).body
  assert.deepEqual([mine.title, mine.course.code, mine.summary.length > 0, mine.questions.length > 0], ['Unit 3', 'CS101', true, true])
  const again = await ctx.as('student').post(`${R(c)}/${note.id}/import`)
  assert.deepEqual([again.status, again.body.already, again.body.noteId], [200, true, first.body.noteId])
  assert.equal((await ctx.as('student').get('/notes')).body.length, 1) // no duplicate
  assert.equal((await ctx.as('student').post(`${R(c)}/${link.id}/import`)).status, 400)
  assert.equal((await ctx.as('teacher').post(`${R(c)}/${note.id}/import`)).status, 403)
  const list = (await ctx.as('teacher').get(R(c))).body
  assert.equal(list.find((x) => x.id === note.id).imports, 1)
  assert.equal((await ctx.as('student').get(R(c))).body.find((x) => x.id === note.id).imported, true)
  assert.equal((await ctx.as('student2').get(R(c))).body.find((x) => x.id === note.id).imported, false)
  // deleting the student's own copy lets them import again
  await ctx.as('student').del(`/notes/${first.body.noteId}`)
  assert.equal((await ctx.as('student').post(`${R(c)}/${note.id}/import`)).status, 201)
})

test('removing a resource keeps students\' own copies; others cannot remove it', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const note = (await ctx.as('teacher').post(R(c), { kind: 'note', title: 'Unit 3', content: NOTE })).body
  await ctx.as('student').post(`${R(c)}/${note.id}/import`)
  assert.equal((await ctx.as('teacher2').del(`${R(c)}/${note.id}`)).status, 403)
  assert.equal((await ctx.as('student').del(`${R(c)}/${note.id}`)).status, 403)
  assert.equal((await ctx.as('teacher').del(`${R(c)}/${note.id}`)).status, 204)
  assert.equal((await ctx.as('teacher').del(`${R(c)}/${note.id}`)).status, 404)
  assert.equal((await ctx.as('student').get('/notes')).body.length, 1)
})
