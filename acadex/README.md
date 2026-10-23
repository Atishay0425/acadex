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
- Student Community (ported from the Django service): rooms, posts, answers, comments, votes, reports and teacher moderation under `/api/v1/community`. Every course gets a members-only room (teacher plus enrolled students, kept in sync with enrolment). File attachments, notifications and full-text search are not ported yet.
- Web: real login, My Courses / My Classes / Courses, Attendance and Marks (teacher), Attendance & Marks (student), plus live Performance Analyzer (student) and Class Performance (teacher). Every other page is still mock data.

Percentages: attendance counts present and late, ignores excused; marks are total score over total maximum of graded work. "Weak" means attendance under 75% or marks under 60%. All of this lives in `api/src/stats.js`.

## Next modules

Assignments, doubt desk, then Redis-backed alerts, OCR, vector search and notifications.
