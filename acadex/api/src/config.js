import 'dotenv/config'

// Refuse to start without a JWT secret outside development, like the Django service does for SECRET_KEY.
export function loadConfig(env = process.env) {
  const dev = env.NODE_ENV !== 'production'
  const jwtSecret = env.JWT_SECRET || (dev ? 'dev-only-secret-change-me' : '')
  if (!jwtSecret) throw new Error('JWT_SECRET must be set in production')
  return {
    port: Number(env.PORT) || 4000,
    databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/acadex',
    jwtSecret,
    accessTtl: env.ACCESS_TOKEN_TTL || '15m',
    refreshDays: Number(env.REFRESH_TOKEN_DAYS) || 7,
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(','),
    rateLimit: env.RATE_LIMIT !== 'off',
    // A post or answer is hidden once it has this many open reports.
    flagHideThreshold: Number(env.FLAG_HIDE_THRESHOLD) || 3,
  }
}
