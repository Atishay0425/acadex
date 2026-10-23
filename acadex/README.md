# Acadex

Student, Teacher and Admin platform. `web/` is Next.js + Tailwind, `api/` is Express + PostgreSQL + JWT. See `CLAUDE.md` for commands and `.claude/rules/` for the stack rules (slide 10 only).

## Run it

1. Install PostgreSQL and create a database: `createdb acadex` (macOS: `brew install postgresql@16 && brew services start postgresql@16`).
2. API: `cd api && cp .env.example .env` (edit `DATABASE_URL`, `JWT_SECRET`), then `npm run migrate && npm run seed && npm run dev`. The seed prints the demo password once.
3. Web: `cd web && npm install && npm run dev`, open http://localhost:3000 and sign in with a seeded account (`admin@college.edu`, `neha.verma@college.edu`, `aarav.sharma@college.edu`).

If the API is not running, the portals fall back to demo data.

## Built so far

- Auth: register (students only), login, single-use refresh tokens, logout, `/auth/me`.
- Users: admin lists, creates, edits and disables accounts; teachers can list students.
- Courses: create, edit, delete, assign teacher (admin), enrol/drop (student), roster management (course teacher or admin).
- Attendance: teachers record a session per class date (present / late / absent / excused), edit or delete past sessions; students see their own record and how many classes they need to reach 75%.
- Marks: teachers create assessments (quiz, assignment, midterm, endterm, practical) and enter scores; students see their own scores and overall %.
- Assignments: teachers set work with a due date and maximum marks, students submit text and/or a link (late work is accepted and flagged, resubmission allowed until graded), teachers grade with feedback. Completion and missing work feed the Performance Analyzer. File uploads are not supported yet.
- Faculty Doubt Desk: students ask the teacher of a course they are enrolled in, classmates upvote "same doubt", similar solved doubts are suggested while typing, the course teacher (or an admin) answers, which marks it solved, and every doubt and answer is searchable by the course. Image questions (OCR) are not built yet.
- Smart Notes: students paste notes or load a .txt/.md file; the server builds a key-sentence summary, key terms, practice questions and fill-in-the-blank MCQs, and answers questions by finding the best matching passages in their own notes. This is a built-in text engine (`api/src/notes/text.js`) with no AI model: quality is basic. Notes are private. PDF and image notes, class-shared notes and embeddings (pgvector) are not built yet.
- Study Planner: students add exams (from a course or any subject) with a topic checklist; the server spreads unfinished topics evenly over the days before each exam (`api/src/planner.js`), flags exams needing more than 3 new topics a day, and reschedules as topics are ticked. Planner data is private. No reminders or notifications yet.
- Early Warning: a transparent rule-based risk score (0-100) per student from attendance (35 points), marks (30), overdue assignments (20) and falling marks (15), computed in `api/src/risk.js`. Students see their score, the reasons and alerts; teachers see their class ranked by risk and log actions (mentor call, reminder, counselling referral) with status and outcome; admins see the whole institution. This is a baseline, not the trained model from the deck. No automatic notifications yet.
- Student Help Center: students raise tickets in six categories (fees, hostel, library, IT, certificates, academics); each is routed to a department automatically and urgent wording sets high priority. Admins act as the front desk: re-route, change priority and status, reply in a thread and resolve; a student reply reopens a resolved ticket. Department staff do not have their own logins yet, and there are no email notifications.
- Student Counselling: an admin flags teachers as counsellors (`PATCH /users/:id {isCounsellor: true}`; there is no admin screen for this yet). Counsellors publish time slots; students book one (max 3 upcoming) as academic, career or personal, optionally anonymous (the counsellor sees "Anonymous student" in the app; the database still links the booking to the student). Counsellors confirm, complete or cancel, keep a private note, and leave a follow-up the student can read. No reminders or video links.
- Student Community (ported from the Django service): rooms, posts, answers, comments, votes, reports and teacher moderation under `/api/v1/community`. Every course gets a members-only room (teacher plus enrolled students, kept in sync with enrolment). File attachments, notifications and full-text search are not ported yet.
- Web: real login, My Courses / My Classes / Courses, Attendance and Marks (teacher), Attendance & Marks (student), plus live Performance Analyzer (student) and Class Performance (teacher). Every other page is still mock data.

Percentages: assignment completion is submitted over assignments that are past due or already handed in. Attendance counts present and late, ignores excused; marks are total score over total maximum of graded work. "Weak" means attendance under 75% or marks under 60%. All of this lives in `api/src/stats.js`.

## Next modules

Career Guidance, then Redis-backed alerts and notifications, OCR, vector search and notifications.
