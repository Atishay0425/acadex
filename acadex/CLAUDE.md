# Acadex

Smart student management platform: Student, Teacher and Admin portals. Monorepo:

- `web/`: Next.js 14 (App Router, JavaScript) + Tailwind, copied from `../acadex-frontend` (the prototype).
- `api/`: Express + PostgreSQL + JWT REST API under `/api/v1`. Modules so far: auth, users, courses and enrolment, attendance, marks, assignments and submissions, doubts, smart notes, study planner, early warning with interventions, help center tickets, counselling, mentorship, projects, career guidance, notifications (in-app, email, web push; `src/notify.js`), class resources, OCR for doubt photos (`src/ocr.js`), file uploads (`src/files.js`), optional Redis (`src/redis.js`), admin usage and tunable risk rules (plus `GET /me/performance`, `GET /me/assignments`), community (rooms, posts, answers, votes, moderation). Course rooms are created and synced from `src/community/rooms.js`, called by the course routes.
- `docs/`: notes and plans.

`../acadex-frontend`, `../acadex-backend` (Django community service) and the `.pptx` decks are the earlier prototype and reference material.

## Commands

```bash
cd api && npm test            # whole suite on in-memory Postgres (no server)
cd api && npm run test:pg     # same suite on real PostgreSQL (database acadex_test)
cd api && npm run migrate && npm run seed && npm run dev   # needs PostgreSQL and api/.env
cd web && npm run dev         # http://localhost:3000
cd web && npm run build       # the only front-end check
```

## Rules

Stack and language limits (slide 10 only) are in `.claude/rules/tech-stack.md` and always apply. `backend.md` and `frontend.md` load for `api/` and `web/`.
