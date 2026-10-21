import { loadConfig } from './config.js'
import { createPool } from './db/pool.js'
import { createApp } from './app.js'

const config = loadConfig()
const pool = createPool(config.databaseUrl)
createApp({ pool, config }).listen(config.port, () => console.log(`Acadex API on http://localhost:${config.port}/api/v1`))
