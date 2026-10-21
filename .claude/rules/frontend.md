---
paths:
  - "acadex-frontend/**"
---

# Front-end rules

- Stack is fixed by the project slide: Next.js (App Router, JavaScript) + Tailwind. Do not add another UI framework or CSS system.
- Never create `src/pages`; it collides with the Next pages router. Real pages go in `src/views/<role>/`, with a one-line `src/app/<role>/<route>/page.jsx` wrapper.
- A new page needs three edits: the view, the `page.jsx` wrapper, and an entry in `NAV` in `src/components/Shell.jsx`.
- Build screens from `src/components/ui.jsx` (Card, Stat, Badge, Table, Modal, Tabs, `useToast`, chart helpers). Add to it only when two or more views need the same thing.
- Use the college-portal theme tokens from `tailwind.config.js` (`primary`, `secondary`, `tertiary`, `surface`); no hard-coded hex colours in views except chart series via `chartColors`.
- Mock data lives only in `src/data/mock.js`. Views that talk to the API must fall back to mock data and show the "Demo data · API offline" badge, as `views/student/Community.jsx` does.
- Call the API only through `src/lib/api.js`. Never put tokens or the demo password in views.
- Every client view file starts with `'use client'`.
- After changes run `npm run build` (the only check; there is no lint or test script).
