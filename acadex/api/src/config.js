import 'dotenv/config'

// Refuse to start without a JWT secret outside development, like the Django service does for SECRET_KEY.
export function loadConfig(env = process.env) {
  const dev = env.NODE_ENV !== 'production'
  const jwtSecret = env.JWT_SECRET || (dev ? 'dev-only-secret-change-me' : '')
  if (!jwtSecret) throw new Error('JWT_SECRET must be set in production')
  return {
    port: Number(env.PORT) || 4000,
    databaseUrl: env.DATABASE_URL || 'postgres://localhost/acadex',
    jwtSecret,
    accessTtl: env.ACCESS_TOKEN_TTL || '15m',
    refreshDays: Number(env.REFRESH_TOKEN_DAYS) || 7,
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(','),
    rateLimit: env.RATE_LIMIT !== 'off',
    redisUrl: env.REDIS_URL || '',
    uploadDir: env.UPLOAD_DIR || 'uploads',
    // Notifications: in-app always; email needs SMTP_URL, web push needs the VAPID keys. Either is skipped when unset.
    webUrl: env.WEB_URL || 'http://localhost:3000',
    smtpUrl: env.SMTP_URL || '',
    mailFrom: env.MAIL_FROM || 'Acadex <no-reply@acadex.local>',
    vapid: { publicKey: env.VAPID_PUBLIC_KEY || '', privateKey: env.VAPID_PRIVATE_KEY || '', subject: env.VAPID_SUBJECT || 'mailto:admin@acadex.local' },
    // A post or answer is hidden once it has this many open reports.
    flagHideThreshold: Number(env.FLAG_HIDE_THRESHOLD) || 3,
  }
}
