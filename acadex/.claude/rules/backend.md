---
paths:
  - "acadex/api/**"
---

# API rules (Express + PostgreSQL)

- Node.js ESM, Express 4, `pg` with parameterised SQL only (never string-build values into queries). Stack limits are in `tech-stack.md`.
- Routes live in `src/routes/<area>.js` as `xRouter({ pool, config })`, are mounted in `src/app.js` under `/api/v1`, and wrap async handlers with `wrap()`.
- Validate every body, query and param with zod before touching the database. Throw `HttpError` for expected failures; `errorHandler` shapes the response.
- Authorisation is decided in the route: `requireRole(...)` plus ownership checks (a teacher manages only their own courses). Self-registration only ever creates students.
- Schema changes are new numbered files in `migrations/`. Never edit an applied migration.
- Every behaviour change needs a test in `test/`. Tests run on in-memory Postgres (`pg-mem`) via `test/helpers.js`; run `npm test`.
- Attendance and marks percentages, the 75% target and the weak thresholds are defined only in `src/stats.js`; routes and tests call those helpers, never re-derive them. Multi-row writes go through `withTx` in `src/db/pool.js`.
- Never commit `.env`, tokens or real passwords. `JWT_SECRET` is mandatory in production.
