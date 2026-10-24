import { createClient } from 'redis'
import RedisStore from 'rate-limit-redis'

// Redis is optional. With REDIS_URL set it backs the rate limiters (so limits hold across several API
// processes and survive restarts) and caches a few expensive admin summaries. Without it, or if it goes
// down, everything keeps working in memory and uncached.
export async function connectRedis(url) {
  if (!url) return null
  // Give up at once if Redis is not there at startup; once it has been up, keep reconnecting if it drops.
  let everReady = false
  const client = createClient({ url, socket: { connectTimeout: 3000, reconnectStrategy: (n) => (everReady ? Math.min(n * 200, 3000) : false) } })
  let warned = false
  client.on('error', (e) => { if (!warned) { warned = true; console.error('redis:', e.message) } })
  client.on('ready', () => { warned = false; everReady = true })
  try { await client.connect() } catch (e) { console.error('redis unavailable, continuing without it:', e.message); await client.disconnect().catch(() => {}); return null }
  return client
}

// A fresh store per limiter, as express-rate-limit requires.
export const limiterStore = (redis, prefix) => (redis ? new RedisStore({ sendCommand: (...args) => redis.sendCommand(args), prefix: `acadex:rl:${prefix}:` }) : undefined)

// cached(key, seconds, compute): the computed value is kept in Redis for a short time. Any Redis problem
// falls back to computing it fresh.
export function createCache(redis) {
  const cache = {
    async cached(key, seconds, compute) {
      if (!redis?.isReady) return compute()
      try { const hit = await redis.get(`acadex:cache:${key}`); if (hit != null) return JSON.parse(hit) } catch { /* fall through */ }
      const value = await compute()
      try { await redis.set(`acadex:cache:${key}`, JSON.stringify(value), { EX: seconds }) } catch { /* not cached */ }
      return value
    },
    async del(...keys) { if (redis?.isReady) try { await redis.del(keys.map((k) => `acadex:cache:${k}`)) } catch { /* ignore */ } },
  }
  return cache
}
