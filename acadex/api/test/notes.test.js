import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarize, keyTerms, importantQuestions, mcqs, search, sentencesOf, tokens } from '../src/notes/text.js'
import { setup, classroom } from './helpers.js'

const TREES = `Decision trees split data using impurity measures such as entropy and the Gini index. ID3 uses information gain to choose the splitting attribute. Information gain is biased towards attributes with many distinct values. Gain ratio fixes this bias by normalising with the split information. C4.5 extends ID3 with gain ratio and handles continuous attributes. CART builds binary trees and uses the Gini index by default. Pruning removes branches that overfit the training data. Pre-pruning stops growth early, whereas post-pruning trims a fully grown tree. Overfitting happens when a tree memorises noise in the training data. A random forest averages many decision trees to reduce variance.`
const NETWORKS = `A subnet mask separates the network portion of an address from the host portion. A /23 prefix gives 510 usable hosts in each subnet. Routers forward packets between different networks using routing tables. OSPF is a link-state protocol that floods topology information. RIP is a distance-vector protocol that shares tables with its neighbours.`

test('sentences, tokens and key terms ignore filler words', () => {
  assert.ok(sentencesOf(TREES).length >= 9)
  assert.ok(!tokens('the and of with').length)
  const terms = keyTerms(TREES)
  assert.ok(terms.includes('information') && terms.includes('gain'))
  assert.ok(!terms.includes('with') && !terms.includes('the'))
})

test('summary is extractive, shorter than the source, and in the original order', () => {
  const s = summarize(TREES, 3)
  const picked = sentencesOf(TREES).filter((x) => s.includes(x))
  assert.equal(picked.length, 3)
  assert.ok(s.length < TREES.length / 2)
  assert.ok(TREES.indexOf(picked[0]) < TREES.indexOf(picked[2]))
  assert.equal(summarize('Too short to summarise. Really short.'), '')
})

test('questions come from definitions, contrasts and key terms, without duplicates', () => {
  const qs = importantQuestions(TREES)
  assert.ok(qs.length >= 3 && qs.length <= 6)
  assert.ok(qs.some((q) => /^(What is|Define) /.test(q)))
  assert.ok(qs.some((q) => q.startsWith('Explain how this differs') && q.includes('post-pruning')))
  assert.equal(new Set(qs.map((q) => q.toLowerCase())).size, qs.length)
})

test('MCQs blank a key term, include it among four options, and are stable', () => {
  const a = mcqs(TREES); const b = mcqs(TREES)
  assert.deepEqual(a, b)
  assert.ok(a.length >= 2)
  for (const m of a) {
    assert.ok(m.q.includes('_____'))
    assert.equal(m.options.length, 4)
    assert.equal(new Set(m.options).size, 4)
    assert.equal(m.q.replace('_____', m.options[m.answer]).includes('_____'), false)
  }
  assert.deepEqual(mcqs('Short note with few repeated words. Another short line here today.'), [])
})

test('search ranks the passage that answers the question', () => {
  const hits = search('how many usable hosts does a /23 give', [{ id: 1, title: 'Trees', content: TREES }, { id: 2, title: 'Networks', content: NETWORKS }])
  assert.equal(hits[0].noteId, 2)
  assert.ok(hits[0].passage.includes('510'))
  assert.equal(search('quantum chromodynamics', [{ id: 1, title: 'Trees', content: TREES }]).length, 0)
  assert.equal(search('the and of', [{ id: 1, title: 'Trees', content: TREES }]).length, 0)
})

const post = (ctx, key, body) => ctx.as(key).post('/notes', body)

test('saving a note stores its analysis; the owner can read, edit and delete', async () => {
  const ctx = await setup()
  const res = await post(ctx, 'student', { title: 'Decision trees', content: TREES })
  assert.equal(res.status, 201)
  assert.ok(res.body.summary && res.body.keyTerms.length && res.body.questions.length && res.body.mcqs.length)
  assert.equal((await ctx.as('student').get('/notes')).body[0].words > 50, true)
  assert.equal((await ctx.as('student').get('/notes')).body[0].content, undefined)
  const up = await ctx.as('student').patch(`/notes/${res.body.id}`, { content: NETWORKS.repeat(2), title: 'Networks' })
  assert.equal(up.body.title, 'Networks')
  assert.ok(up.body.keyTerms.includes('subnet') || up.body.keyTerms.includes('routing') || up.body.keyTerms.includes('protocol'))
  assert.equal((await ctx.as('student').patch(`/notes/${res.body.id}`, {})).status, 400)
  assert.equal((await ctx.as('student').del(`/notes/${res.body.id}`)).status, 204)
  assert.equal((await ctx.as('student').get(`/notes/${res.body.id}`)).status, 404)
})

test('notes are private: nobody else can read, search, edit or delete them', async () => {
  const ctx = await setup()
  const n = (await post(ctx, 'student', { title: 'Decision trees', content: TREES })).body
  for (const key of ['student2', 'teacher', 'admin']) {
    assert.equal((await ctx.as(key).get(`/notes/${n.id}`)).status, 404)
    assert.equal((await ctx.as(key).del(`/notes/${n.id}`)).status, 404)
    assert.equal((await ctx.as(key).post('/notes/ask', { question: 'what is pruning', noteId: n.id })).status, 404)
  }
  assert.equal((await ctx.as('student2').get('/notes')).body.length, 0)
  assert.equal((await ctx.as('student2').post('/notes/ask', { question: 'what is pruning' })).status, 400) // has no notes
  assert.equal((await ctx.request('get', '/notes')).status, 401)
})

test('validation: too short, too long, and course must be one you are enrolled in', async () => {
  const ctx = await setup(); const c = await classroom(ctx)
  assert.equal((await post(ctx, 'student', { title: 'Tiny', content: 'Too short.' })).status, 400)
  assert.equal((await post(ctx, 'student', { title: 'Huge', content: 'word '.repeat(13000) })).status, 400)
  assert.equal((await post(ctx, 'student', { title: 'Trees', content: TREES, courseId: c.id })).body.course.code, 'CS101')
  const other = (await ctx.as('teacher2').post('/courses', { code: 'CS999', title: 'Other' })).body
  assert.equal((await post(ctx, 'student', { title: 'Trees', content: TREES, courseId: other.id })).status, 403)
})

test('asking: answers from the right note, or says nothing was found', async () => {
  const ctx = await setup()
  const trees = (await post(ctx, 'student', { title: 'Trees', content: TREES })).body
  const net = (await post(ctx, 'student', { title: 'Networks', content: NETWORKS })).body
  const all = (await ctx.as('student').post('/notes/ask', { question: 'Which protocol is link-state?' })).body
  assert.equal(all.sources[0].noteId, net.id)
  assert.ok(all.answer.includes('OSPF'))
  const scoped = (await ctx.as('student').post('/notes/ask', { question: 'What does pruning remove?', noteId: trees.id })).body
  assert.ok(scoped.answer.includes('Pruning removes branches'))
  const none = (await ctx.as('student').post('/notes/ask', { question: 'quantum chromodynamics' })).body
  assert.deepEqual(none, { answer: null, sources: [] })
  assert.equal((await ctx.as('student').post('/notes/ask', { question: 'hi' })).status, 400)
})
