# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Acadex is a college major project ("Smart Student Management"): 11 student-facing modules added on top of an existing College Management System, with Student, Teacher and Admin portals. The directory is not a git repo and holds three things:

- `acadex-frontend/`: Next.js 14 (App Router, JavaScript) + Tailwind prototype of all three portals.
- `acadex-backend/`: Django REST service for the **Student Community** module only (adapted from github.com/atharvjoshi944-netizen/MU-CONNECT). Everything else in the front end still runs on mock data.
- `ACADEX-SMART-STUDENT-MANAGEMENT-31-slides.pptx`: the current presentation (the `-redesigned` file is the older 21-slide version). The deck is being grown from 21 to 60–70 slides in batches of 10.

The tech stack on slide 10 of the deck (React/Next.js, Tailwind, Node/Express, PostgreSQL, Redis, JWT) is the stated target. Development must stay inside this stack (`.claude/rules/tech-stack.md`). The Django community service is a known exception that predates the rule: maintain it, but build new modules in Node/Express.

## Commands

Front end (from `acadex-frontend/`; there is no lint or test script):
```bash
npm run dev      # http://localhost:3000
npm run build    # compiles and type-checks pages; use it to catch import errors
```

Back end (from `acadex-backend/`, uses its own `.venv`; `.env` must exist, copy `.env.example`):
```bash
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo       # demo users aarav / neha / admin, rooms, posts
.venv/bin/python manage.py runserver 8000  # Swagger at /api/docs/
.venv/bin/python manage.py test            # whole suite
.venv/bin/python manage.py test community.tests.test_api.CommunityAPITests.test_vote_toggle_switch_and_counts   # one test
```

`.claude/launch.json` defines `acadex` (port 3000) and `acadex-api` (port 8000) for `preview_start`. The browser pane can be hidden, in which case screenshots time out; verify with `get_page_text`, `javascript_exec` and console errors instead.

## Front-end architecture

- `src/app/<role>/<route>/page.jsx` files are one-line wrappers; the real pages live in `src/views/<role>/*.jsx`, several exported components per file (e.g. `views/student/Learn.jsx` holds Doubt Desk, Smart Notes and Study Planner). Do not name a folder `src/pages`, it would collide with the Next pages router.
- `src/app/<role>/layout.jsx` wraps pages in `components/Shell.jsx`, which owns the Azure-style top bar and the per-role sidebar. **Adding a page means three edits**: the view, a `page.jsx` wrapper, and a nav entry in `NAV` inside `Shell.jsx`.
- `components/ui.jsx` is the shared kit (Card, Stat, Badge, Table, Modal, Tabs, charts helpers, `useToast`). All views import from it; charts use recharts, icons use lucide-react.
- Data: `src/data/mock.js` is the single source of mock data. Pages mutate local state only, nothing persists.
- Auth is a demo: `lib/auth.js` writes an `acadex_role` cookie and `middleware.js` redirects when the cookie role does not match the `/student`, `/teacher` or `/admin` prefix. `Login.jsx` also tries a real JWT login against the API and silently continues if it is offline.
- `lib/api.js` is the API client (Bearer token from localStorage, refresh-on-401). Only `views/student/Community.jsx` and `Moderation` in `views/admin/Admin.jsx` call it; both fall back to mock data when the API is unreachable, showing a "Demo data" badge. Follow that fallback pattern when connecting further modules.
- Theme comes from the college portal: Red Hat Display, primary `hsl(230,54%,34%)`, secondary `hsl(352,70%,37%)`, background `#f9f9f9` (set in `tailwind.config.js` and `index.css`).

## Back-end architecture

Two apps behind `/api/v1`: `users` (custom `User` with `role` student/teacher/admin; the JWT carries `role` and `name`) and `community` (rooms, questions of kind question/notes/resource/event, answers, comments, votes, flags). Things that are easy to break:

- Counts are annotations, not properties. `views.annotate_votes` adds `upvotes`, `downvotes` and `my_vote`; serializers only read those attributes. A list page must stay at 3 queries (enforced by `test_list_query_count_does_not_grow_with_rows`), so do not add per-row queries in serializers.
- `Vote` and `Flag` use two nullable foreign keys (question or answer) with DB check and unique constraints, not a generic type/id pair.
- Hidden posts (`is_hidden`) are filtered in `get_queryset` for everyone except the author and moderators (teachers, admins, staff). Reports auto-hide at `FLAG_HIDE_THRESHOLD` open flags; `FlagViewSet.resolve` restores or removes.
- Anonymous posts mask the author inside the serializer unless the viewer is the author or a moderator.
- `settings.py` refuses to start without `SECRET_KEY` unless `DEBUG=True`. `.env` and `db.sqlite3` are local and gitignored.

## Presentation (`.pptx`)

Slides 12–31 were generated by writing slide XML straight into the unzipped package (new slides created with the pptx skill's `add_slide.py`, content replaced, pictures kept); there is no persistent generator here, so edit or regenerate the XML and re-zip. Preview without LibreOffice by opening the file in Keynote via `osascript` and exporting slide images. Style and layout rules are in `.claude/rules/presentation.md`.

## Rules

Path-scoped rules live in `.claude/rules/`: `frontend.md`, `backend.md` and `presentation.md` (these load when matching files are touched), plus `tech-stack.md`, which always applies.
