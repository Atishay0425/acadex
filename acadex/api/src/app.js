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
import { authenticate } from './middleware/auth.js'
import { errorHandler } from './middleware/errors.js'

export function createApp({ pool, config }) {
  const app = express()
  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins }))
  app.use(express.json({ limit: '100kb' }))

  const auth = authenticate(config)
  const v1 = express.Router()
  v1.get('/health', (_req, res) => res.json({ ok: true }))
  v1.use('/auth', authRouter({ pool, config }))
  v1.use('/users', auth, usersRouter({ pool, config }))
  v1.use('/courses', auth, coursesRouter({ pool, config }))
  v1.use('/courses/:courseId/attendance', auth, attendanceRouter({ pool }))
  v1.use('/courses/:courseId/assignments', auth, assignmentsRouter({ pool }))
  v1.use('/courses/:courseId', auth, marksRouter({ pool }))
  v1.use('/me/assignments', auth, myAssignmentsRouter({ pool }))
  v1.use('/me', auth, performanceRouter({ pool }))
  v1.use('/doubts', auth, doubtsRouter({ pool }))
  v1.use('/notes', auth, notesRouter({ pool }))
  v1.use('/community', auth, communityRouter({ pool, config }))
  app.use('/api/v1', v1)

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
  app.use(errorHandler)
  return app
}
