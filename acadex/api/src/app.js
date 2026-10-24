import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { authRouter } from './routes/auth.js'
import { usersRouter } from './routes/users.js'
import { coursesRouter } from './routes/courses.js'
import { attendanceRouter } from './routes/attendance.js'
import { marksRouter } from './routes/marks.js'
import { performanceRouter } from './routes/performance.js'
import { communityRouter } from './routes/community.js'
import { assignmentsRouter, myAssignmentsRouter } from './routes/assignments.js'
import { doubtsRouter } from './routes/doubts.js'
import { notesRouter } from './routes/notes.js'
import { plannerRouter } from './routes/planner.js'
import { riskRouter } from './routes/risk.js'
import { helpdeskRouter } from './routes/helpdesk.js'
import { counsellingRouter } from './routes/counselling.js'
import { mentorshipRouter } from './routes/mentorship.js'
import { projectsRouter } from './routes/projects.js'
import { careerRouter } from './routes/career.js'
import { notificationsRouter } from './routes/notifications.js'
import { createNotifier } from './notify.js'
import { filesRouter } from './routes/files.js'
import { createCache } from './redis.js'
import { adminRouter } from './routes/admin.js'
import { resourcesRouter } from './routes/resources.js'
import { authenticate } from './middleware/auth.js'
import { forbidden } from './errors.js'
import { errorHandler } from './middleware/errors.js'

export function createApp({ pool, config, mailer, pusher, ocr, files }) {
  const notify = createNotifier({ pool, config, mailer, pusher })
  const cache = createCache(config.redis)
  const app = express()
  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  const auth = authenticate(config)
  // Department staff only use the help desk and their notifications; every other module refuses them.
  const member = [auth, (req, _res, next) => (req.user.role === 'staff' ? next(forbidden()) : next())]
  const v1 = express.Router()
  v1.get('/health', (_req, res) => res.json({ ok: true }))
  v1.use('/auth', authRouter({ pool, config }))
  v1.use('/users', member, usersRouter({ pool, config }))
  v1.use('/courses', member, coursesRouter({ pool, config }))
  v1.use('/courses/:courseId/attendance', member, attendanceRouter({ pool }))
  v1.use('/courses/:courseId/resources', member, resourcesRouter({ pool, notify, files }))
  v1.use('/courses/:courseId/assignments', member, assignmentsRouter({ pool, notify, files }))
  v1.use('/courses/:courseId', member, marksRouter({ pool }))
  v1.use('/me/assignments', member, myAssignmentsRouter({ pool, notify }))
  v1.use('/me', member, performanceRouter({ pool }))
  v1.use('/doubts', member, doubtsRouter({ pool, notify, config, ocr }))
  v1.use('/notes', member, notesRouter({ pool }))
  v1.use('/planner', member, plannerRouter({ pool }))
  v1.use('/risk', member, riskRouter({ pool, notify, cache }))
  v1.use('/helpdesk', auth, helpdeskRouter({ pool, config, notify }))
  v1.use('/counselling', member, counsellingRouter({ pool, notify }))
  v1.use('/mentorship', member, mentorshipRouter({ pool, notify }))
  v1.use('/projects', member, projectsRouter({ pool, notify }))
  v1.use('/notifications', auth, notificationsRouter({ pool, config, notify }))
  v1.use('/admin', member, adminRouter({ pool, cache }))
  v1.use('/files', member, filesRouter({ pool, config, files }))
  v1.use('/career', member, careerRouter({ pool }))
  v1.use('/community', member, communityRouter({ pool, config, notify }))
  app.use('/api/v1', v1)

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
  app.use(errorHandler)
  app.notify = notify // exposed so tests can wait for email and push delivery
  return app
}
