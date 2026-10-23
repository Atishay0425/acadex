# Acadex web

Next.js 14 (App Router) + Tailwind. Role-based portals for Student, Teacher and Admin. Talks to the Express API in `../api`.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # the only check
```

Sign in with a seeded account (see `../README.md`). If the API is not running, pages that use it fall back to demo data and show a "Demo data · API offline" badge.

- `src/app/<role>/...` routes are one-line wrappers; the pages live in `src/views/<role>/`. `src/components` holds the shell and shared UI.
- `src/lib/acadex.js` is the only API client (`NEXT_PUBLIC_ACADEX_API_URL`, default `http://localhost:4000/api/v1`).
- `src/data/mock.js` is the offline fallback and the data for pages not connected yet.
- `src/middleware.js` is a cosmetic role guard (an unsigned cookie). The API enforces real permissions from the JWT.
