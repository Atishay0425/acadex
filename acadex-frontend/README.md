# Acadex front end

Next.js 14 (React) + Tailwind CSS, as in the project's tech stack slide. Role-based dashboards for Student, Teacher and Admin.

```bash
npm install
npm run dev      # http://localhost:3000
```

Pick a role on the login page (demo only, no real auth).

- `src/app/<role>/...` routes, `src/views/<role>/...` page components, `src/components` shared UI and shell
- `src/data/mock.js` mock data. `src/lib/api.js` is the client for the planned Node/Express + PostgreSQL API.
- `src/middleware.js` role guard (cookie now, JWT claim later)

## Student Community uses the real API

Start the backend (`../acadex-backend`, see its README), then log in on the front end. If the API is offline the
page falls back to demo data and shows a badge. Set `NEXT_PUBLIC_API_URL` to point somewhere other than `http://localhost:8000/api/v1`.

To log in to the real API, create `.env.local` with `NEXT_PUBLIC_DEMO_PASSWORD=<the password you used for `seed_demo`>` (it is gitignored). Without it the app runs on demo data.
