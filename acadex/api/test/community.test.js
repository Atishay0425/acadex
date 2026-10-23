import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setup } from './helpers.js'

const C = '/community'
// A general room plus one post by `student`.
async function world() {
  const ctx = await setup()
  const room = (await ctx.as('admin').post(`${C}/rooms`, { name: 'ML Circle' })).body
  const post = (await ctx.as('student').post(`${C}/posts`, { room: room.slug, title: 'What is PCA?', content: 'Explain it' })).body
  return { ...ctx, room, post }
}
const answer = async (ctx, key, postId, content = 'An answer') => (await ctx.as(key).post(`${C}/posts/${postId}/answers`, { content })).body

test('voting toggles, switches and counts', async () => {
  const ctx = await world()
  const v = (type) => ctx.as('student2').post(`${C}/posts/${ctx.post.id}/vote`, { type })
  let r = await v('up')
  assert.deepEqual([r.body.upvotes, r.body.myVote], [1, 'up'])
  r = await v('down')
  assert.deepEqual([r.body.upvotes, r.body.downvotes, r.body.myVote], [0, 1, 'down'])
  r = await v('down')
  assert.deepEqual([r.body.score, r.body.myVote], [0, null])
  assert.equal((await ctx.pool.query('SELECT 1 FROM post_votes')).rows.length, 0)
})

test('cannot vote on your own post, bad vote type is rejected, login is required', async () => {
  const ctx = await world()
  assert.equal((await ctx.as('student').post(`${C}/posts/${ctx.post.id}/vote`, { type: 'up' })).status, 400)
  assert.equal((await ctx.as('student2').post(`${C}/posts/${ctx.post.id}/vote`, { type: 'sideways' })).status, 400)
  assert.equal((await ctx.request('post', `${C}/posts/${ctx.post.id}/vote`, { type: 'up' })).status, 401)
})

test('a list costs the same number of queries however many posts it has', async () => {
  const ctx = await world()
  const populate = async (n) => {
    for (let i = 0; i < n; i++) {
      const p = (await ctx.as('student').post(`${C}/posts`, { room: ctx.room.slug, title: `Question ${i}`, tags: [`t${i}`] })).body
      await answer(ctx, 'student2', p.id)
      await ctx.as('student2').post(`${C}/posts/${p.id}/vote`, { type: 'up' })
    }
  }
  const cost = async () => { const before = ctx.queryCount(); const r = await ctx.as('student2').get(`${C}/posts`); return [ctx.queryCount() - before, r] }
  await populate(2)
  const [small] = await cost()
  await populate(15)
  const [big, res] = await cost()
  assert.equal(big, small)
  assert.equal(res.body.count, 18)
  assert.equal(res.body.results.length, 18)
  assert.equal(res.body.results[0].answerCount, 1)
})

test('free-text tags are created and their usage counts stay in sync', async () => {
  const ctx = await world()
  const res = await ctx.as('student2').post(`${C}/posts`, { title: 'Why SVM?', room: ctx.room.slug, tags: ['SVM', 'ML', 'svm'] })
  assert.equal(res.status, 201)
  assert.deepEqual(res.body.tags, ['ML', 'SVM'])
  const usage = async () => Object.fromEntries((await ctx.as('student').get(`${C}/tags`)).body.map((t) => [t.slug, t.usageCount]))
  assert.equal((await usage()).svm, 1)
  await ctx.as('student2').patch(`${C}/posts/${res.body.id}`, { tags: ['ML'] })
  assert.deepEqual([(await usage()).svm, (await usage()).ml], [0, 1])
  await ctx.as('student2').del(`${C}/posts/${res.body.id}`)
  assert.equal((await usage()).ml, 0)
})

test('only the question author or a teacher accepts an answer, and it toggles', async () => {
  const ctx = await world()
  const a = await answer(ctx, 'student2', ctx.post.id, 'Dimensionality reduction')
  assert.equal((await ctx.as('student2').post(`${C}/answers/${a.id}/accept`)).status, 403)
  assert.equal((await ctx.as('student').post(`${C}/answers/${a.id}/accept`)).body.isAccepted, true)
  assert.equal((await ctx.as('student').get(`${C}/posts/${ctx.post.id}`)).body.isSolved, true)
  assert.equal((await ctx.as('student').post(`${C}/answers/${a.id}/accept`)).body.isAccepted, false)
  assert.equal((await ctx.as('teacher').post(`${C}/answers/${a.id}/accept`)).body.isAccepted, true)
})

test('only a teacher can verify an answer; verified answers sort first', async () => {
  const ctx = await world()
  const a1 = await answer(ctx, 'student2', ctx.post.id, 'first')
  await answer(ctx, 'student2', ctx.post.id, 'second')
  assert.equal((await ctx.as('student').post(`${C}/answers/${a1.id}/verify`)).status, 403)
  assert.equal((await ctx.as('teacher').post(`${C}/answers/${a1.id}/verify`)).body.isFacultyVerified, true)
  const detail = (await ctx.as('student').get(`${C}/posts/${ctx.post.id}`)).body
  assert.deepEqual(detail.answers.map((x) => x.content), ['first', 'second'])
})

test('editing is author-only; deleting is author or moderator', async () => {
  const ctx = await world()
  assert.equal((await ctx.as('student2').patch(`${C}/posts/${ctx.post.id}`, { title: 'hacked' })).status, 403)
  assert.equal((await ctx.as('teacher').patch(`${C}/posts/${ctx.post.id}`, { title: 'hacked' })).status, 403)
  assert.equal((await ctx.as('student').patch(`${C}/posts/${ctx.post.id}`, { title: 'Better title' })).body.title, 'Better title')
  assert.equal((await ctx.as('student2').del(`${C}/posts/${ctx.post.id}`)).status, 403)
  assert.equal((await ctx.as('teacher').del(`${C}/posts/${ctx.post.id}`)).status, 204)
  assert.equal((await ctx.as('student').get(`${C}/posts/${ctx.post.id}`)).status, 404)
})

test('anonymous posts hide the author except from the owner and moderators', async () => {
  const ctx = await world()
  const p = (await ctx.as('student').post(`${C}/posts`, { title: 'Secret question', room: ctx.room.slug, isAnonymous: true })).body
  assert.equal(p.author.name, 'Student One')
  assert.deepEqual((await ctx.as('student2').get(`${C}/posts/${p.id}`)).body.author, { id: null, name: 'Anonymous', role: null })
  assert.equal((await ctx.as('teacher').get(`${C}/posts/${p.id}`)).body.author.name, 'Student One')
  const listed = (await ctx.as('student2').get(`${C}/posts`)).body.results.find((x) => x.id === p.id)
  assert.equal(listed.author.name, 'Anonymous')
  assert.equal((await ctx.as('student2').get(`${C}/posts?author=${ctx.ids.student}`)).body.results.some((x) => x.id === p.id), false)
})

test('reports auto-hide a post, a teacher removes it, and students stop seeing it', async () => {
  const ctx = await world()
  const flag = (key, reason = 'spam') => ctx.as(key).post(`${C}/posts/${ctx.post.id}/flag`, { reason })
  assert.equal((await flag('student')).status, 400) // own post
  assert.equal((await flag('student2')).status, 201)
  assert.equal((await flag('student2')).status, 409)
  const second = await flag('teacher', 'abuse')
  assert.equal(second.body.autoHidden, true) // threshold is 2 in tests
  assert.equal((await ctx.as('admin').get(`${C}/posts/${ctx.post.id}`)).status, 200)
  assert.equal((await ctx.as('student').get(`${C}/posts/${ctx.post.id}`)).status, 200) // author still sees it
  assert.equal((await ctx.as('student2').get(`${C}/posts/${ctx.post.id}`)).status, 404)
  const queue = (await ctx.as('teacher').get(`${C}/flags?status=open`)).body
  assert.equal(queue.length, 2)
  assert.equal(queue[0].target.text, 'What is PCA?')
  assert.equal((await ctx.as('teacher').post(`${C}/flags/${queue[0].type}/${queue[0].id}/resolve`, { decision: 'remove' })).status, 200)
  assert.equal((await ctx.as('teacher').get(`${C}/flags?status=open`)).body.length, 0)
  assert.equal((await ctx.as('student2').get(`${C}/posts/${ctx.post.id}`)).status, 404)
})

test('dismissing the last open report restores an auto-hidden post', async () => {
  const ctx = await world()
  await ctx.as('student2').post(`${C}/posts/${ctx.post.id}/flag`, { reason: 'spam' })
  await ctx.as('teacher').post(`${C}/posts/${ctx.post.id}/flag`, { reason: 'spam' })
  const queue = (await ctx.as('admin').get(`${C}/flags?status=open`)).body
  await ctx.as('admin').post(`${C}/flags/post/${queue[0].id}/resolve`, { decision: 'dismiss' })
  assert.equal((await ctx.as('student2').get(`${C}/posts/${ctx.post.id}`)).status, 404) // one report still open
  await ctx.as('admin').post(`${C}/flags/post/${queue[1].id}/resolve`, { decision: 'dismiss' })
  assert.equal((await ctx.as('student2').get(`${C}/posts/${ctx.post.id}`)).status, 200)
})

test('answers can be reported and hidden too', async () => {
  const ctx = await world()
  const a = await answer(ctx, 'student2', ctx.post.id)
  await ctx.as('student').post(`${C}/answers/${a.id}/flag`, { reason: 'abuse' })
  assert.equal((await ctx.as('teacher').post(`${C}/answers/${a.id}/flag`, { reason: 'abuse' })).body.autoHidden, true)
  assert.equal((await ctx.as('student').get(`${C}/posts/${ctx.post.id}`)).body.answers.length, 0)
  assert.equal((await ctx.as('teacher').get(`${C}/posts/${ctx.post.id}`)).body.answers.length, 1)
  assert.equal((await ctx.as('student').get(`${C}/posts`)).body.results[0].answerCount, 0)
})

test('students cannot open the moderation queue or stats; teachers get the numbers', async () => {
  const ctx = await world()
  assert.equal((await ctx.as('student2').get(`${C}/flags`)).status, 403)
  assert.equal((await ctx.as('student2').get(`${C}/stats`)).status, 403)
  const a = await answer(ctx, 'student2', ctx.post.id)
  await ctx.as('student').post(`${C}/answers/${a.id}/accept`)
  const s = (await ctx.as('teacher').get(`${C}/stats`)).body
  assert.deepEqual([s.postsTotal, s.postsLast7Days, s.solved, s.unanswered, s.openFlags], [1, 1, 1, 0, 0])
  assert.equal(s.byRoom.find((x) => x.slug === 'ml-circle').posts, 1)
  assert.equal(s.postsPerDay.length, 1)
})

test('a view counts once per viewer per hour', async () => {
  const ctx = await world()
  await ctx.as('student2').post(`${C}/posts/${ctx.post.id}/view`)
  assert.equal((await ctx.as('student2').post(`${C}/posts/${ctx.post.id}/view`)).body.viewCount, 1)
  assert.equal((await ctx.as('teacher').post(`${C}/posts/${ctx.post.id}/view`)).body.viewCount, 2)
})

test('open rooms can be joined and left; students cannot create rooms; posts filter by room', async () => {
  const ctx = await world()
  const other = (await ctx.as('teacher').post(`${C}/rooms`, { name: 'Placement Prep', kind: 'general' })).body
  await ctx.as('student').post(`${C}/posts`, { title: 'Elsewhere', room: other.slug })
  assert.equal((await ctx.as('student2').post(`${C}/rooms`, { name: 'Nope' })).status, 403)
  await ctx.as('student2').post(`${C}/rooms/ml-circle/join`)
  const rooms = Object.fromEntries((await ctx.as('student2').get(`${C}/rooms`)).body.map((x) => [x.slug, x]))
  assert.deepEqual([rooms['ml-circle'].isMember, rooms['ml-circle'].memberCount, rooms['placement-prep'].isMember], [true, 1, false])
  assert.equal((await ctx.as('student2').get(`${C}/posts?room=ml-circle`)).body.count, 1)
  await ctx.as('student2').post(`${C}/rooms/ml-circle/leave`)
  assert.equal((await ctx.as('student2').get(`${C}/rooms`)).body.find((x) => x.slug === 'ml-circle').isMember, false)
})

test('replies must stay on the same answer and one level deep', async () => {
  const ctx = await world()
  const a1 = await answer(ctx, 'student2', ctx.post.id, '1'); const a2 = await answer(ctx, 'student2', ctx.post.id, '2')
  const top = (await ctx.as('student').post(`${C}/answers/${a1.id}/comments`, { content: 'top' })).body
  assert.equal((await ctx.as('student').post(`${C}/answers/${a2.id}/comments`, { content: 'x', parentId: top.id })).status, 400)
  const reply = (await ctx.as('student').post(`${C}/answers/${a1.id}/comments`, { content: 'reply', parentId: top.id })).body
  assert.equal((await ctx.as('student').post(`${C}/answers/${a1.id}/comments`, { content: 'deep', parentId: reply.id })).status, 400)
  const detail = (await ctx.as('student').get(`${C}/posts/${ctx.post.id}`)).body
  assert.equal(detail.answers.find((x) => x.id === a1.id).comments.length, 2)
  assert.equal((await ctx.as('student2').del(`${C}/comments/${top.id}`)).status, 403)
  assert.equal((await ctx.as('student').del(`${C}/comments/${top.id}`)).status, 204)
})

test('search, tag, kind and sort filters', async () => {
  const ctx = await world()
  const mk = (title, extra = {}) => ctx.as('student').post(`${C}/posts`, { title, room: ctx.room.slug, ...extra })
  const svm = (await mk('Kernel trick notes', { kind: 'notes', content: 'about SVM kernels', tags: ['SVM'] })).body
  const pca = (await mk('Eigenvectors help', { tags: ['PCA'] })).body
  await answer(ctx, 'student2', pca.id); await answer(ctx, 'teacher', pca.id)
  await ctx.as('student2').post(`${C}/posts/${svm.id}/vote`, { type: 'up' })
  const titles = async (qs) => (await ctx.as('student2').get(`${C}/posts?${qs}`)).body.results.map((p) => p.title)
  assert.deepEqual(await titles('search=KERNEL'), ['Kernel trick notes'])
  assert.deepEqual(await titles('search=eigen'), ['Eigenvectors help'])
  assert.deepEqual(await titles('search=pca'), ['Eigenvectors help', 'What is PCA?']) // title match and tag match
  assert.deepEqual(await titles('tag=svm'), ['Kernel trick notes'])
  assert.deepEqual(await titles('kind=notes'), ['Kernel trick notes'])
  assert.deepEqual((await titles('sort=score'))[0], 'Kernel trick notes')
  assert.deepEqual((await titles('sort=answers'))[0], 'Eigenvectors help')
  assert.equal((await titles('mine=true')).length, 0)
  assert.equal((await titles('search=%25')).length, 0) // % is searched literally, not as a wildcard
})

test('lists are paged 20 at a time', async () => {
  const ctx = await world()
  for (let i = 0; i < 22; i++) await ctx.pool.query("INSERT INTO posts (title, author_id, room_id) VALUES ($1, $2, NULL)", [`P${i}`, ctx.ids.student])
  const p1 = (await ctx.as('student2').get(`${C}/posts`)).body
  const p2 = (await ctx.as('student2').get(`${C}/posts?page=2`)).body
  assert.deepEqual([p1.count, p1.results.length, p2.results.length], [23, 20, 3])
})

test('pinned posts come first and only moderators can pin', async () => {
  const ctx = await world()
  const newer = (await ctx.as('student').post(`${C}/posts`, { title: 'Newer post', room: ctx.room.slug })).body
  assert.equal((await ctx.as('student').post(`${C}/posts/${ctx.post.id}/pin`)).status, 403)
  assert.equal((await ctx.as('teacher').post(`${C}/posts/${ctx.post.id}/pin`)).body.isPinned, true)
  assert.deepEqual((await ctx.as('student2').get(`${C}/posts`)).body.results.map((p) => p.id), [ctx.post.id, newer.id])
})

// ---------------------------------------------------------------- course rooms
const courseRoom = async (ctx, key, courseId) => (await ctx.as(key).get(`${C}/rooms?kind=course`)).body.find((r) => r.courseId === courseId)

test('every course gets a room: the teacher and enrolled students are members, others cannot see it', async () => {
  const ctx = await setup()
  const c = (await ctx.as('teacher').post('/courses', { code: 'cs101', title: 'Intro' })).body
  const room = await courseRoom(ctx, 'teacher', c.id)
  assert.equal(room.slug, 'course-cs101')
  assert.equal(room.name, 'CS101 - Intro')
  assert.deepEqual([room.memberCount, room.isMember], [1, true])
  assert.equal(await courseRoom(ctx, 'student', c.id), undefined) // not enrolled
  await ctx.as('student').post(`/courses/${c.id}/enroll`)
  assert.deepEqual([(await courseRoom(ctx, 'student', c.id)).memberCount, (await courseRoom(ctx, 'student', c.id)).isMember], [2, true])
  assert.ok(await courseRoom(ctx, 'admin', c.id)) // admins see every course room
  assert.equal(await courseRoom(ctx, 'teacher2', c.id), undefined)
})

test('course room posts are members-only to read, list and write', async () => {
  const ctx = await setup()
  const c = (await ctx.as('teacher').post('/courses', { code: 'CS101', title: 'Intro' })).body
  await ctx.as('student').post(`/courses/${c.id}/enroll`)
  const p = (await ctx.as('student').post(`${C}/posts`, { room: 'course-cs101', title: 'Doubt about arrays' }))
  assert.equal(p.status, 201)
  assert.equal(p.body.room.name, 'CS101 - Intro')
  assert.equal((await ctx.as('student2').post(`${C}/posts`, { room: 'course-cs101', title: 'Sneaking in' })).status, 403)
  assert.equal((await ctx.as('student2').get(`${C}/posts/${p.body.id}`)).status, 404)
  assert.equal((await ctx.as('student2').get(`${C}/posts`)).body.count, 0)
  assert.equal((await ctx.as('student2').post(`${C}/rooms/course-cs101/join`)).status, 403)
  assert.equal((await ctx.as('teacher').get(`${C}/posts`)).body.count, 1)
  assert.equal((await ctx.as('teacher2').get(`${C}/posts`)).body.count, 0)
  assert.equal((await ctx.as('admin').get(`${C}/posts`)).body.count, 1)
})

test('dropping a course, roster changes and teacher reassignment update room membership', async () => {
  const ctx = await setup()
  const c = (await ctx.as('teacher').post('/courses', { code: 'CS101', title: 'Intro' })).body
  const members = async () => (await ctx.pool.query('SELECT user_id FROM room_members rm JOIN rooms r ON r.id = rm.room_id WHERE r.course_id = $1 ORDER BY user_id', [c.id])).rows.map((x) => x.user_id)
  await ctx.as('student').post(`/courses/${c.id}/enroll`)
  await ctx.as('teacher').post(`/courses/${c.id}/students`, { studentId: ctx.ids.student2 })
  assert.deepEqual(await members(), [ctx.ids.teacher, ctx.ids.student, ctx.ids.student2])
  await ctx.as('student').del(`/courses/${c.id}/enroll`)
  await ctx.as('teacher').del(`/courses/${c.id}/students/${ctx.ids.student2}`)
  assert.deepEqual(await members(), [ctx.ids.teacher])
  await ctx.as('teacher').post(`/courses/${c.id}/students`, { studentId: ctx.ids.student })
  await ctx.as('admin').patch(`/courses/${c.id}`, { teacherId: ctx.ids.teacher2, title: 'Intro to CS' })
  assert.deepEqual(await members(), [ctx.ids.student, ctx.ids.teacher2].sort((a, b) => a - b))
  assert.equal((await courseRoom(ctx, 'teacher2', c.id)).name, 'CS101 - Intro to CS')
})

test('deleting a course removes its room and discussion', async () => {
  const ctx = await setup()
  const c = (await ctx.as('teacher').post('/courses', { code: 'CS101', title: 'Intro' })).body
  await ctx.as('teacher').post(`${C}/posts`, { room: 'course-cs101', title: 'Welcome everyone' })
  await ctx.as('admin').del(`/courses/${c.id}`)
  for (const t of ['rooms', 'posts', 'room_members']) assert.equal((await ctx.pool.query(`SELECT 1 FROM ${t}`)).rows.length, 0)
})

test('course codes are limited to letters, digits and dashes', async () => {
  const ctx = await setup()
  assert.equal((await ctx.as('teacher').post('/courses', { code: 'cs 101', title: 'Bad code' })).status, 400)
})
