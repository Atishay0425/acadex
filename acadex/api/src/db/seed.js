import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'
import { createPool } from './pool.js'

const USERS = [
  { email: 'admin@college.edu', name: 'Dr. R. Menon', role: 'admin', department: 'Administration' },
  { email: 'neha.verma@college.edu', name: 'Prof. Neha Verma', role: 'teacher', department: 'Computer Engineering' },
  { email: 'rahul.iyer@college.edu', name: 'Prof. Rahul Iyer', role: 'teacher', department: 'Computer Engineering' },
  { email: 'aarav.sharma@college.edu', name: 'Aarav Sharma', role: 'student', department: 'Computer Engineering' },
  { email: 'diya.patel@college.edu', name: 'Diya Patel', role: 'student', department: 'Computer Engineering' },
  { email: 'kabir.singh@college.edu', name: 'Kabir Singh', role: 'student', department: 'Computer Engineering' },
]
const COURSES = [
  { code: 'CE301', title: 'Data Structures', semester: 3, teacher: 'neha.verma@college.edu', students: ['aarav.sharma@college.edu', 'diya.patel@college.edu'] },
  { code: 'CE302', title: 'Database Management Systems', semester: 3, teacher: 'neha.verma@college.edu', students: ['aarav.sharma@college.edu', 'kabir.singh@college.edu'] },
  { code: 'CE303', title: 'Operating Systems', semester: 3, teacher: 'rahul.iyer@college.edu', students: ['diya.patel@college.edu'] },
]

// Demo attendance (status per student, one entry per session date) and graded work per course code.
const ATTENDANCE = {
  CE301: { 'aarav.sharma@college.edu': ['present', 'present', 'late', 'present', 'absent', 'present'], 'diya.patel@college.edu': ['present', 'absent', 'absent', 'present', 'absent', 'absent'] },
  CE302: { 'aarav.sharma@college.edu': ['present', 'absent', 'present', 'present', 'present', 'present'], 'kabir.singh@college.edu': ['absent', 'absent', 'present', 'absent', 'absent', 'excused'] },
}
const ASSESSMENTS = {
  CE301: [{ title: 'Quiz 1', kind: 'quiz', max: 10, scores: { 'aarav.sharma@college.edu': 8, 'diya.patel@college.edu': 5 } }, { title: 'Mid-semester', kind: 'midterm', max: 50, scores: { 'aarav.sharma@college.edu': 36, 'diya.patel@college.edu': 24 } }],
  CE302: [{ title: 'Assignment 1', kind: 'assignment', max: 20, scores: { 'aarav.sharma@college.edu': 17, 'kabir.singh@college.edu': 9 } }],
}

// Local development data only. Set DEMO_PASSWORD or a random one is printed once.
export async function seed(pool, password = process.env.DEMO_PASSWORD || crypto.randomBytes(9).toString('base64url')) {
  const hash = await bcrypt.hash(password, 10)
  const ids = {}
  for (const u of USERS) {
    const found = await pool.query('SELECT id FROM users WHERE email = $1', [u.email])
    ids[u.email] = found.rows[0]?.id ?? (await pool.query(
      'INSERT INTO users (email, name, role, department, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [u.email, u.name, u.role, u.department, hash])).rows[0].id
  }
  for (const c of COURSES) {
    let course = (await pool.query('SELECT id FROM courses WHERE code = $1', [c.code])).rows[0]
    if (!course) course = (await pool.query(
      'INSERT INTO courses (code, title, department, semester, teacher_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [c.code, c.title, 'Computer Engineering', c.semester, ids[c.teacher]])).rows[0]
    for (const s of c.students) {
      await pool.query('INSERT INTO enrollments (course_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [course.id, ids[s]])
    }
  }
  for (const [code, perStudent] of Object.entries(ATTENDANCE)) {
    const course = (await pool.query('SELECT id FROM courses WHERE code = $1', [code])).rows[0]
    const has = await pool.query('SELECT 1 FROM attendance_sessions WHERE course_id = $1', [course.id])
    if (has.rows.length) continue
    for (let i = 0; i < 6; i++) {
      const date = `2026-09-${String(8 + i * 2).padStart(2, '0')}`
      const sid = (await pool.query('INSERT INTO attendance_sessions (course_id, session_date, topic) VALUES ($1, $2, $3) RETURNING id', [course.id, date, `Lecture ${i + 1}`])).rows[0].id
      for (const [email, statuses] of Object.entries(perStudent)) {
        await pool.query('INSERT INTO attendance_records (session_id, student_id, status) VALUES ($1, $2, $3)', [sid, ids[email], statuses[i]])
      }
    }
  }
  for (const [code, list] of Object.entries(ASSESSMENTS)) {
    const course = (await pool.query('SELECT id FROM courses WHERE code = $1', [code])).rows[0]
    for (const a of list) {
      if ((await pool.query('SELECT 1 FROM assessments WHERE course_id = $1 AND title = $2', [course.id, a.title])).rows.length) continue
      const aid = (await pool.query('INSERT INTO assessments (course_id, title, kind, max_marks) VALUES ($1, $2, $3, $4) RETURNING id', [course.id, a.title, a.kind, a.max])).rows[0].id
      for (const [email, score] of Object.entries(a.scores)) await pool.query('INSERT INTO marks (assessment_id, student_id, score) VALUES ($1, $2, $3)', [aid, ids[email], score])
    }
  }
  return password
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(loadConfig().databaseUrl)
  const pw = await seed(pool)
  console.log(`Seeded demo users (admin@college.edu, neha.verma@college.edu, aarav.sharma@college.edu, ...). Password: ${pw}`)
  await pool.end()
}
