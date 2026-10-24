import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PATHS, norm, cleanList, match, suggest, roadmap } from '../src/careers.js'
import { setup } from './helpers.js'

const ML = { skills: ['Python', 'ML', 'SQL', 'Statistics'], interests: ['Machine learning', 'Data'], cgpa: 8 }

test('aliases and duplicates are normalised', () => {
  assert.equal(norm('  JS '), 'javascript')
  assert.deepEqual(cleanList(['Node', 'nodejs', 'React.js', 'react']), ['node.js', 'react'])
})

test('a machine-learning profile ranks the ML path first, with matched and missing skills', () => {
  const [top, second] = suggest(ML)
  assert.equal(top.path.id, 'ml-engineer')
  assert.deepEqual(top.matchedSkills.sort(), ['machine learning', 'python', 'sql', 'statistics'])
  assert.deepEqual(top.missingSkills, ['pytorch'])
  assert.ok(top.score > second.score && top.score <= 100)
  assert.equal(top.cgpaOk, true)
})

test('CGPA only moves the score slightly and reports whether it clears the guide', () => {
  const ml = PATHS.find((p) => p.id === 'ml-engineer')
  const high = match({ ...ML, cgpa: 9 }, ml), low = match({ ...ML, cgpa: 5 }, ml), unknown = match({ ...ML, cgpa: null }, ml)
  assert.ok(high.score > low.score && high.score - low.score <= 10)
  assert.deepEqual([high.cgpaOk, low.cgpaOk, unknown.cgpaOk], [true, false, null])
})

test('no overlap means no suggestions; a web profile finds full-stack', () => {
  assert.deepEqual(suggest({ skills: ['pottery'], interests: ['gardening'], cgpa: 8 }), [])
  assert.equal(suggest({ skills: ['JavaScript', 'React', 'Node'], interests: ['web development'], cgpa: 7 })[0].path.id, 'full-stack')
})

test('the roadmap has four three-month phases starting this month and names the skill gaps', () => {
  const ml = PATHS.find((p) => p.id === 'ml-engineer')
  const phases = roadmap({ skills: ['python'], interests: ['ai'], cgpa: 7 }, ml, '2026-10-22')
  assert.deepEqual(phases.map((p) => p.when), ['Oct – Dec', 'Jan – Mar', 'Apr – Jun', 'Jul – Sep'])
  assert.match(phases[0].steps[0], /statistics, machine learning, pytorch/)
  assert.ok(phases[1].steps.some((s) => s.startsWith('Project:')))
})

const put = (ctx, key, body) => ctx.as(key).put('/career/profile', body)

test('profile: save, normalise, update, validate; students only', async () => {
  const ctx = await setup()
  assert.equal((await ctx.as('student').get('/career/profile')).body, null)
  assert.equal((await put(ctx, 'student', { skills: [], interests: [] })).status, 400)
  assert.equal((await put(ctx, 'student', { skills: ['python'], cgpa: 11 })).status, 400)
  const res = await put(ctx, 'student', { skills: ['Python', 'js', 'JS'], interests: ['AI'], cgpa: 7.8 })
  assert.deepEqual([res.body.skills, res.body.interests, res.body.cgpa], [['python', 'javascript'], ['ai'], 7.8])
  assert.equal((await put(ctx, 'student', { skills: ['sql'], interests: [], cgpa: null })).body.cgpa, null)
  assert.equal((await put(ctx, 'teacher', { skills: ['x'] })).status, 403)
  assert.equal((await ctx.as('student2').get('/career/profile')).body, null) // private
  assert.equal((await ctx.request('get', '/career/profile')).status, 401)
})

test('suggestions and roadmap need a profile and respect the chosen path', async () => {
  const ctx = await setup()
  assert.equal((await ctx.as('student').get('/career/suggestions')).status, 400)
  assert.equal((await ctx.as('student').get('/career/roadmap/ml-engineer')).status, 400)
  await put(ctx, 'student', { skills: ['Python', 'ML', 'SQL'], interests: ['AI'], cgpa: 8 })
  const s = (await ctx.as('student').get('/career/suggestions')).body
  assert.equal(s.suggestions[0].id, 'ml-engineer')
  assert.ok(s.suggestions[0].courses.length && s.suggestions[0].internships.length)
  const rm = (await ctx.as('student').get('/career/roadmap/ml-engineer?today=2026-10-22')).body
  assert.deepEqual([rm.phases.length, rm.phases[0].when], [4, 'Oct – Dec'])
  assert.equal((await ctx.as('student').get('/career/roadmap/astronaut')).status, 404)
  assert.equal((await ctx.as('student').get('/career/roadmap/ml-engineer?today=soon')).status, 400)
  assert.equal((await ctx.as('student').get('/career/paths')).body.length, PATHS.length)
})
