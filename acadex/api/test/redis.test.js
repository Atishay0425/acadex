import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createCache, connectRedis } from '../src/redis.js'
import { setup } from './helpers.js'

// A stand-in for the Redis client with just the calls the cache uses.
function fakeRedis({ failing = false, ready = true } = {}) {
  const store = new Map(); const calls = []
  return {
    store, calls, isReady: ready,
    async get(k) { if (failing) throw new Error('down'); return store.get(k) ?? null },
    async set(k, v, opts) { if (failing) throw new Error('down'); calls.push(['set', k, opts]); store.set(k, v) },
    async del(keys) { for (const k of keys) store.delete(k) },
  }
}

test('cache: computes once, serves the stored value, and honours the expiry setting', async () => {
  const redis = fakeRedis(); const cache = createCache(redis); let runs = 0
  const compute = async () => { runs++; return { n: runs } }
  assert.deepEqual(await cache.cached('k', 30, compute), { n: 1 })
  assert.deepEqual(await cache.cached('k', 30, compute), { n: 1 })
  assert.equal(runs, 1)
  assert.deepEqual(redis.calls[0], ['set', 'acadex:cache:k', { EX: 30 }])
  await cache.del('k')
  assert.deepEqual(await cache.cached('k', 30, compute), { n: 2 })
})

test('cache: no Redis, a Redis that is not ready, or one that errors all just compute fresh', async () => {
  for (const redis of [null, fakeRedis({ ready: false }), fakeRedis({ failing: true })]) {
    let runs = 0
    const cache = createCache(redis)
    await cache.cached('k', 30, async () => ++runs); await cache.cached('k', 30, async () => ++runs)
    assert.equal(runs, 2)
    await cache.del('k') // never throws
  }
  assert.equal(await connectRedis(''), null)
  assert.equal(await connectRedis('redis://127.0.0.1:1'), null) // unreachable: the app carries on without it
})

test('cached admin summaries are served from the cache, and saving rules refreshes the risk overview', async () => {
  const redis = fakeRedis(); const ctx = await setup({ redis })
  const usage = async () => (await ctx.as('admin').get('/admin/usage')).body
  assert.equal((await usage()).activeStudents, 0)
  await ctx.as('student').put('/career/profile', { skills: ['python'] })
  assert.equal((await usage()).activeStudents, 0) // still the cached answer within its minute
  assert.ok([...redis.store.keys()].some((k) => k.endsWith('admin:usage:7')))
  const overview = async () => (await ctx.as('admin').get('/risk/overview')).body
  await overview(); assert.ok(redis.store.has('acadex:cache:risk:overview'))
  await ctx.as('admin').put('/admin/rules', { attendanceTarget: 75, marksFloor: 60, missingFull: 3, dropFull: 30, high: 60, medium: 30 })
  assert.equal(redis.store.has('acadex:cache:risk:overview'), false)
})

// With a real Redis running: TEST_REDIS_URL=redis://localhost:6379 npm test
const REAL = process.env.TEST_REDIS_URL
test('real Redis: rate limits are counted in Redis and the cache round-trips', { skip: !REAL }, async () => {
  const redis = await connectRedis(REAL)
  assert.ok(redis, 'could not connect to TEST_REDIS_URL')
  try {
    await redis.flushDb()
    const ctx = await setup({ redis, rateLimit: true })
    for (let i = 0; i < 30; i++) await request(ctx.app).post('/api/v1/auth/login').send({ email: 'student@t.edu', password: 'wrong-password' })
    assert.equal((await request(ctx.app).post('/api/v1/auth/login').send({ email: 'student@t.edu', password: 'wrong-password' })).status, 429)
    assert.ok((await redis.keys('acadex:rl:auth:*')).length >= 1)
    const cache = createCache(redis)
    assert.deepEqual(await cache.cached('probe', 5, async () => ({ ok: true })), { ok: true })
    assert.ok((await redis.ttl('acadex:cache:probe')) > 0)
    await cache.del('probe')
    assert.equal(await redis.exists('acadex:cache:probe'), 0)
  } finally { await redis.flushDb(); await redis.quit() }
})
