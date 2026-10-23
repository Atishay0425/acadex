import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.js'
import { createPool } from './pool.js'
import { ensureCourseRoom } from '../community/rooms.js'

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

// Demo community: open rooms plus posts in the course rooms and open rooms (course rooms come from the courses).
const OPEN_ROOMS = [['Placement Prep', 'general'], ['Hackathons & Events', 'general'], ['CSE Branch Lounge', 'branch']]
const POSTS = [
  { room: 'course-ce301', kind: 'question', by: 'diya.patel@college.edu', title: 'When is a linked list better than an array?', content: 'Both store sequences. When should I pick a linked list in the lab assignment?', tags: ['Data Structures', 'Lists'] },
  { room: 'course-ce301', kind: 'notes', by: 'aarav.sharma@college.edu', title: 'Stack and queue revision notes', content: 'One-page summary with push, pop, enqueue and dequeue complexities.', tags: ['Data Structures'] },
  { room: 'course-ce302', kind: 'question', by: 'kabir.singh@college.edu', title: 'Normalisation: 3NF vs BCNF', content: 'I keep mixing these up. Can someone give a small example?', tags: ['DBMS'] },
  { room: 'placement-prep', kind: 'resource', by: 'aarav.sharma@college.edu', title: 'Top 60 OS and DBMS interview questions', content: 'Compiled from this season’s campus drives.', tags: ['Placements', 'DBMS'] },
  { room: 'hackathons-events', kind: 'event', by: 'diya.patel@college.edu', title: 'Codeathon registration closes Friday', content: 'Teams of 3. Register through the training cell.', tags: ['Codeathon'] },
]

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
  await seedAssignments(pool, ids)
  await seedDoubts(pool, ids)
  await seedCommunity(pool, ids)
  return password
}

async function seedCommunity(pool, ids) {
  for (const c of COURSES) await ensureCourseRoom(pool, (await pool.query('SELECT id FROM courses WHERE code = $1', [c.code])).rows[0].id)
  for (const [name, kind] of OPEN_ROOMS) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!(await pool.query('SELECT 1 FROM rooms WHERE slug = $1', [slug])).rows.length) await pool.query('INSERT INTO rooms (name, slug, kind) VALUES ($1, $2, $3)', [name, slug, kind])
  }
  if ((await pool.query('SELECT 1 FROM posts')).rows.length) return
  const made = []
  for (const p of POSTS) {
    const room = (await pool.query('SELECT id FROM rooms WHERE slug = $1', [p.room])).rows[0]
    const post = (await pool.query('INSERT INTO posts (room_id, kind, title, content, author_id) VALUES ($1, $2, $3, $4, $5) RETURNING id', [room.id, p.kind, p.title, p.content, ids[p.by]])).rows[0]
    for (const name of p.tags) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const tag = (await pool.query('SELECT id FROM tags WHERE slug = $1', [slug])).rows[0] ?? (await pool.query('INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id', [name, slug])).rows[0]
      await pool.query('INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2)', [post.id, tag.id])
      await pool.query('UPDATE tags SET usage_count = usage_count + 1 WHERE id = $1', [tag.id])
    }
    made.push(post.id)
  }
  const ans = (await pool.query('INSERT INTO answers (post_id, author_id, content, is_faculty_verified) VALUES ($1, $2, $3, TRUE) RETURNING id', [made[0], ids['neha.verma@college.edu'], 'Pick a linked list when you insert or delete in the middle often and do not need random access. Arrays win when you index a lot.'])).rows[0]
  await pool.query('UPDATE posts SET accepted_answer_id = $2 WHERE id = $1', [made[0], ans.id])
  for (const [email, post] of [['aarav.sharma@college.edu', 0], ['kabir.singh@college.edu', 3], ['diya.patel@college.edu', 3]]) {
    await pool.query('INSERT INTO post_votes (post_id, voter_id, value) VALUES ($1, $2, 1)', [made[post], ids[email]])
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(loadConfig().databaseUrl)
  const pw = await seed(pool)
  console.log(`Seeded demo users (admin@college.edu, neha.verma@college.edu, aarav.sharma@college.edu, ...). Password: ${pw}`)
  await pool.end()
}

const DAY = 86400000
async function seedAssignments(pool, ids) {
  const course = (await pool.query("SELECT id FROM courses WHERE code = 'CE301'")).rows[0]
  if ((await pool.query('SELECT 1 FROM assignments WHERE course_id = $1', [course.id])).rows.length) return
  const mk = async (title, description, days, max) => (await pool.query('INSERT INTO assignments (course_id, title, description, due_at, max_marks, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [course.id, title, description, new Date(Date.now() + days * DAY).toISOString(), max, ids['neha.verma@college.edu']])).rows[0].id
  const lab1 = await mk('Lab 1: Singly linked list', 'Implement insert, delete and reverse. Submit a repository link.', -10, 10)
  const lab2 = await mk('Lab 2: Stack and queue', 'Implement both with arrays and compare.', -3, 10)
  await mk('Lab 3: Binary trees', 'Traversals and height. Due next week.', 6, 20)
  const sub = (aid, email, content, late, score, feedback) => pool.query('INSERT INTO submissions (assignment_id, student_id, content, is_late, score, feedback, graded_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [aid, ids[email], content, late, score, feedback ?? '', score == null ? null : new Date()])
  await sub(lab1, 'aarav.sharma@college.edu', 'https://github.com/aarav/ds-lab1', false, 9, 'Clean code. Add a test for reverse.')
  await sub(lab1, 'diya.patel@college.edu', 'https://github.com/diya/ds-lab1', true, 6, 'Late. Delete misses the head case.')
  await sub(lab2, 'aarav.sharma@college.edu', 'Arrays vs linked: amortised cost notes attached in repo.', false, null)
}

async function seedDoubts(pool, ids) {
  if ((await pool.query('SELECT 1 FROM doubts')).rows.length) return
  const cid = async (code) => (await pool.query('SELECT id FROM courses WHERE code = $1', [code])).rows[0].id
  const add = async (code, by, title, body, answer) => (await pool.query('INSERT INTO doubts (course_id, student_id, title, body, answer, answered_by, answered_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [await cid(code), ids[by], title, body, answer ?? '', answer ? ids['neha.verma@college.edu'] : null, answer ? new Date() : null])).rows[0].id
  const d1 = await add('CE301', 'diya.patel@college.edu', 'When should I use a doubly linked list over a singly linked one?', 'Both worked for my lab. Is the extra pointer ever worth it?', 'Use doubly linked when you delete a node you already hold a reference to, or traverse backwards. The extra pointer costs memory but makes those O(1).')
  await add('CE301', 'aarav.sharma@college.edu', 'Is the height of a single-node tree 0 or 1?', 'My lab 3 stub returns 1 but the textbook says 0.')
  await add('CE302', 'kabir.singh@college.edu', 'Difference between 3NF and BCNF with an example?', 'I keep mixing these up before the quiz.')
  await pool.query('INSERT INTO doubt_upvotes (doubt_id, user_id) VALUES ($1, $2)', [d1, ids['aarav.sharma@college.edu']])
}




