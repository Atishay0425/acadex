import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup, classroom } from './helpers.js'

// Fake channels record what would have been sent.
function channels({ mailFails = false, pushStatus = null } = {}) {
  const sent = { mail: [], push: [] }
  return {
    sent,
    mailer: { send: async (to, subject, text) => { if (mailFails) throw new Error('smtp down'); sent.mail.push({ to, subject, text }) } },
    pusher: { send: async (sub, payload) => { if (pushStatus) throw Object.assign(new Error('gone'), { statusCode: pushStatus }); sent.push.push({ endpoint: sub.endpoint, payload }) } },
  }
}
const inbox = async (ctx, key) => (await ctx.as(key).get('/notifications')).body
const ask = (ctx, c) => ctx.as('student').post('/doubts', { courseId: c.id, title: 'Why does gain ratio fix ID3 bias?', body: '' })
const sub = (n = 1) => ({ endpoint: `https://push.example.com/send/${n}`, keys: { p256dh: 'BPublicKeyPublicKeyPublicKey', auth: 'authsecret' } })

test('events create in-app notifications for the right people, not the actor', async () => {
  const ch = channels(); const ctx = await setup(ch); const c = await classroom(ctx)
  const d = (await ask(ctx, c)).body
  let t = await inbox(ctx, 'teacher')
  assert.deepEqual([t.unread, t.items[0].kind, t.items[0].link], [1, 'doubt', '/teacher/doubts'])
  assert.match(t.items[0].title, /New doubt/)
  assert.equal((await inbox(ctx, 'student')).unread, 0) // the asker is not told about their own doubt
  await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'It normalises by split information.' })
  const s = await inbox(ctx, 'student')
  assert.deepEqual([s.unread, s.items[0].title, s.items[0].link], [1, 'Your doubt was answered', '/student/doubts'])
  await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'Edited answer.' })
  assert.equal((await inbox(ctx, 'student')).unread, 1) // editing an answer does not notify again
  assert.equal((await inbox(ctx, 'student2')).unread, 0)
})

test('email goes to the user with a link; push goes to each subscribed browser', async () => {
  const ch = channels(); const ctx = await setup(ch); const c = await classroom(ctx)
  await ctx.as('student').post('/notifications/push-subscription', sub(1))
  await ctx.as('student').post('/notifications/push-subscription', sub(2))
  const d = (await ask(ctx, c)).body
  await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'Done.' })
  await ctx.app.notify.flush()
  const mail = ch.sent.mail.find((m) => m.to === 'student@t.edu')
  assert.equal(mail.subject, 'Your doubt was answered')
  assert.match(mail.text, /http:\/\/localhost:3000\/student\/doubts/)
  assert.deepEqual(ch.sent.push.map((p) => p.endpoint).sort(), [sub(1).endpoint, sub(2).endpoint])
  assert.equal(ch.sent.push[0].payload.title, 'Your doubt was answered')
  assert.ok(ch.sent.mail.some((m) => m.to === 'teacher@t.edu')) // the teacher was emailed about the new doubt too
})

test('preferences switch email and push off per user', async () => {
  const ch = channels(); const ctx = await setup(ch); const c = await classroom(ctx)
  assert.deepEqual(Object.entries((await ctx.as('student').get('/notifications/settings')).body).slice(0, 2), [['email', true], ['push', true]])
  await ctx.as('student').post('/notifications/push-subscription', sub(1))
  assert.deepEqual((await ctx.as('student').put('/notifications/settings', { email: false })).body, { email: false, push: true })
  assert.equal((await ctx.as('student').put('/notifications/settings', {})).status, 400)
  const d = (await ask(ctx, c)).body
  await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'Done.' })
  await ctx.app.notify.flush()
  assert.equal(ch.sent.mail.some((m) => m.to === 'student@t.edu'), false)
  assert.equal(ch.sent.push.length, 1)
  await ctx.as('student').put('/notifications/settings', { push: false })
  const d2 = (await ask(ctx, c)).body
  await ctx.as('teacher').put(`/doubts/${d2.id}/answer`, { answer: 'Again.' })
  await ctx.app.notify.flush()
  assert.equal(ch.sent.push.length, 1)
  assert.equal((await inbox(ctx, 'student')).unread, 2) // in-app always arrives
})

test('a broken mail server never fails the request; dead push subscriptions are removed', async () => {
  const bad = channels({ mailFails: true, pushStatus: 410 }); const ctx = await setup(bad); const c = await classroom(ctx)
  await ctx.as('student').post('/notifications/push-subscription', sub(1))
  const d = (await ask(ctx, c)).body
  assert.equal((await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'Done.' })).status, 200)
  await ctx.app.notify.flush()
  assert.equal((await inbox(ctx, 'student')).unread, 1)
  assert.equal((await ctx.pool.query('SELECT 1 FROM push_subscriptions')).rows.length, 0)
})

test('reading: one, all, unread count, and nobody else can touch yours', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const d = (await ask(ctx, c)).body
  await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'Done.' })
  await ctx.as('teacher2').post('/doubts', {}) // ignored, wrong role
  const mine = await inbox(ctx, 'student')
  assert.equal((await ctx.as('student2').post(`/notifications/${mine.items[0].id}/read`)).status, 404)
  assert.equal((await ctx.as('student').post(`/notifications/${mine.items[0].id}/read`)).body.read, true)
  assert.equal((await inbox(ctx, 'student')).unread, 0)
  await ctx.as('student').del('/doubts/0').catch(() => {})
  await ask(ctx, c); await ctx.as('teacher').put(`/doubts/${d.id}/answer`, { answer: 'x'.repeat(3) })
  assert.equal((await ctx.as('teacher').post('/notifications/read-all')).status, 204)
  assert.equal((await inbox(ctx, 'teacher')).unread, 0)
  assert.equal((await ctx.request('get', '/notifications')).status, 401)
})

test('push subscriptions validate input, replace themselves and can be removed', async () => {
  const ctx = await setup()
  assert.equal((await ctx.as('student').post('/notifications/push-subscription', { endpoint: 'nope', keys: {} })).status, 400)
  await ctx.as('student').post('/notifications/push-subscription', sub(1))
  await ctx.as('student2').post('/notifications/push-subscription', sub(1)) // same browser, new owner
  assert.deepEqual((await ctx.pool.query('SELECT user_id FROM push_subscriptions')).rows.map((r) => r.user_id), [ctx.ids.student2])
  assert.equal((await ctx.as('student').del('/notifications/push-subscription', undefined)).status, 400)
  const settings = (await ctx.as('student').get('/notifications/settings')).body
  assert.deepEqual(settings.channels, { email: false, push: false }) // nothing configured in this test app
})

test('other modules notify too: assignments, tickets, counselling, mentorship, projects, community', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  const a = (await ctx.as('teacher').post(`/courses/${c.id}/assignments`, { title: 'Lab 1', dueAt: new Date(Date.now() + 86400000).toISOString(), maxMarks: 10 })).body
  assert.equal((await inbox(ctx, 'student')).items[0].title, 'New assignment: Lab 1')
  await ctx.as('student').put(`/courses/${c.id}/assignments/${a.id}/submission`, { content: 'My answer' })
  await ctx.as('teacher').put(`/courses/${c.id}/assignments/${a.id}/submissions/${ctx.ids.student}/grade`, { score: 8 })
  assert.match((await inbox(ctx, 'student')).items[0].title, /Lab 1 was graded/)

  const t = (await ctx.as('student').post('/helpdesk/tickets', { category: 'fees', title: 'Fee receipt missing', details: '' })).body
  assert.match((await inbox(ctx, 'admin')).items[0].title, /New ticket/)
  await ctx.as('admin').post(`/helpdesk/tickets/${t.id}/messages`, { body: 'Looking into it' })
  assert.equal((await inbox(ctx, 'student')).items[0].title, 'TK-1001 has a new reply')
  await ctx.as('admin').patch(`/helpdesk/tickets/${t.id}`, { status: 'resolved' })
  assert.equal((await inbox(ctx, 'student')).items[0].title, 'TK-1001 is now resolved')

  await ctx.as('admin').patch(`/users/${ctx.ids.teacher2}`, { isCounsellor: true })
  await ctx.as('teacher2').post('/counselling/slots', { slots: [new Date(Date.now() + 2 * 86400000).toISOString()] })
  const slot = (await ctx.as('student').get('/counselling/counsellors')).body[0].slots[0]
  const s = (await ctx.as('student').post('/counselling/sessions', { slotId: slot.id, type: 'academic', topic: '' })).body
  assert.equal((await inbox(ctx, 'teacher2')).items[0].title, 'New counselling request')
  await ctx.as('teacher2').patch(`/counselling/sessions/${s.id}`, { status: 'confirmed' })
  assert.equal((await inbox(ctx, 'student')).items[0].title, 'Your counselling session is confirmed')

  await ctx.as('student2').put('/mentorship/mentors/me', { headline: 'Placed at Microsoft', topics: ['DSA'] })
  const q = (await ctx.as('student').post('/mentorship/questions', { mentorId: ctx.ids.student2, text: 'How do I prepare for interviews?' })).body
  assert.equal((await inbox(ctx, 'student2')).items[0].title, 'A junior asked you a question')
  await ctx.as('student2').post(`/mentorship/questions/${q.id}/answer`, { answer: 'Practise daily.' })
  assert.equal((await inbox(ctx, 'student')).items[0].title, 'Your mentor answered your question')

  const p = (await ctx.as('student').post('/projects', { title: 'AI Study Buddy', spots: 2, mentorId: ctx.ids.teacher })).body
  await ctx.as('student2').post(`/projects/${p.id}/requests`, { message: 'I can help' })
  assert.match((await inbox(ctx, 'student')).items[0].title, /wants to join AI Study Buddy/)
  await ctx.as('teacher').post(`/projects/${p.id}/review`, { decision: 'approve' })
  assert.equal((await inbox(ctx, 'student')).items[0].title, 'AI Study Buddy was approved')

  const room = (await ctx.as('admin').post('/community/rooms', { name: 'General' })).body
  const post = (await ctx.as('student').post('/community/posts', { room: room.slug, title: 'What is PCA?' })).body
  await ctx.as('student').post(`/community/posts/${post.id}/answers`, { content: 'My own answer' })
  const before = (await inbox(ctx, 'student')).unread
  await ctx.as('student2').post(`/community/posts/${post.id}/answers`, { content: 'Dimensionality reduction' })
  const after = await inbox(ctx, 'student')
  assert.deepEqual([after.unread - before, after.items[0].kind], [1, 'community']) // own answer did not notify
})
