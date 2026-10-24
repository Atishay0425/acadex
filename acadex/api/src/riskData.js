import { assess } from './risk.js'
import { loadRiskRules } from './settings.js'

// Loads the raw signals for one scope ({ courseId } | { studentId } | {} for everyone) in four queries and
// returns assess() results per student, overall and per course.
export async function riskFor(pool, scope = {}) {
  const rules = await loadRiskRules(pool)
  const f = (col) => (scope.courseId ? [`WHERE ${col.course} = $1`, [scope.courseId]] : scope.studentId ? [`WHERE ${col.student} = $1`, [scope.studentId]] : ['', []])
  const q = (sql, col) => { const [w, p] = f(col); return pool.query(sql.replace('{W}', w), p).then((r) => r.rows) }

  const people = await q('SELECT e.course_id, e.student_id, u.name, u.email, c.code, c.title FROM enrollments e JOIN users u ON u.id = e.student_id JOIN courses c ON c.id = e.course_id {W} ORDER BY u.name', { course: 'e.course_id', student: 'e.student_id' })
  const att = await q('SELECT s.course_id, r.student_id, r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id {W}', { course: 's.course_id', student: 'r.student_id' })
  const mks = await q('SELECT a.course_id, m.student_id, a.id AS aid, m.score, a.max_marks FROM marks m JOIN assessments a ON a.id = m.assessment_id {W} ORDER BY a.id', { course: 'a.course_id', student: 'm.student_id' })
  const asg = await q('SELECT a.course_id, e.student_id, a.due_at, s.id AS sid FROM assignments a JOIN enrollments e ON e.course_id = a.course_id LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = e.student_id {W}', { course: 'a.course_id', student: 'e.student_id' })

  const signals = (match) => ({
    statuses: att.filter(match).map((x) => x.status),
    marks: mks.filter(match).map((x) => ({ score: x.score, max: x.max_marks })),
    assignments: asg.filter(match).map((x) => ({ due_at: x.due_at, submitted: x.sid != null })),
  })
  const students = new Map()
  for (const p of people) {
    if (!students.has(p.student_id)) students.set(p.student_id, { studentId: p.student_id, name: p.name, email: p.email, courses: [] })
    students.get(p.student_id).courses.push({ id: p.course_id, code: p.code, title: p.title, ...assess(signals((x) => x.course_id === p.course_id && x.student_id === p.student_id), new Date(), rules) })
  }
  for (const s of students.values()) Object.assign(s, assess(signals((x) => x.student_id === s.studentId), new Date(), rules))
  return [...students.values()]
}
