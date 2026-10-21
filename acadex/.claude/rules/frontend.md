---
paths:
  - "acadex/web/**"
---

# Web rules (Next.js + Tailwind)

- Next.js App Router in JavaScript with Tailwind. Stack limits are in `tech-stack.md`.
- Never create `src/pages`. Real pages go in `src/views/<role>/`, with a one-line `src/app/<role>/<route>/page.jsx` wrapper and an entry in `NAV` in `src/components/Shell.jsx`.
- Build screens from `src/components/ui.jsx`; use the theme tokens from `tailwind.config.js`, no hard-coded hex colours in views.
- Call the Express API only through `src/lib/acadex.js`. Views that use it fall back to mock data from `src/data/mock.js` with a "Demo data · API offline" badge when the API is unreachable.
- Every client view file starts with `'use client'`. After changes run `npm run build`.
