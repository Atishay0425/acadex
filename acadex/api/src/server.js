import { loadConfig } from './config.js'
import { createPool } from './db/pool.js'
import { createApp } from './app.js'
import { createOcr } from './ocr.js'
import { connectRedis } from './redis.js'
import { createDiskStore, purgeOrphans } from './files.js'

const config = loadConfig()
config.redis = await connectRedis(config.redisUrl) // null when REDIS_URL is not set
const pool = createPool(config.databaseUrl)
const files = createDiskStore(config.uploadDir)
const sweep = () => purgeOrphans(pool, files).then((n) => n && console.log(`removed ${n} unused uploads`)).catch((e) => console.error('upload cleanup failed:', e.message))
sweep(); setInterval(sweep, 6 * 3600 * 1000).unref()
createApp({ pool, config, ocr: createOcr(), files }).listen(config.port, () => console.log(`Acadex API on http://localhost:${config.port}/api/v1 (redis ${config.redis ? 'on' : 'off'})`))
