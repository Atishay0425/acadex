# Acadex community service

Django REST backend for the **Student Community** module, adapted from
[MU-CONNECT](https://github.com/atharvjoshi944-netizen/MU-CONNECT) (`questions` and `users` apps).
Auth is JWT (SimpleJWT) with the user's role in the token. SQLite for development, PostgreSQL via env vars, optional Redis cache.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # then set SECRET_KEY
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo      # demo users, rooms and posts
.venv/bin/python manage.py runserver 8000 # API docs at /api/docs/
.venv/bin/python manage.py test           # 14 tests
```

## What changed from MU-CONNECT

| Area | MU-CONNECT | Here |
|---|---|---|
| List performance | 3 COUNT queries per question + 1 for `user_vote` (N+1) | Votes and answer counts are annotated: 3 queries per list page regardless of size (tested) |
| Votes | `content_type` string + `object_id` int, no integrity | Real foreign keys, DB check + unique constraints, atomic toggle, self-votes rejected, response returns fresh counts |
| Tags | Required tag ids; `usage_count` only ever incremented | Free-text `tag_names`; counts kept in sync by signals on add/remove |
| Views | Counter never incremented | One view per viewer per hour (`POST /questions/{id}/view/`) |
| Accepted answer | Boolean on each answer, scanned to find it | `Question.accepted_answer` one-to-one; toggle to un-accept; teachers may accept too |
| Community features | Single global feed | Rooms (course/branch/general) with join/leave, post kinds (question/notes/resource/event), anonymous posting, faculty-verified answers, pinned posts |
| Moderation | None | Flags with reasons, auto-hide after `FLAG_HIDE_THRESHOLD` reports, teacher/admin queue with dismiss/remove, `/community/stats/` for the admin dashboard |
| Comments | Any parent allowed | Parent must belong to the same answer; one level of replies |
| Security | Real JWT committed (`user_token.txt`), default SECRET_KEY, `*.ngrok.io` hosts, `override=True` on .env, GitHub OAuth asking for `repo` scope, 24 h tokens, no throttling | No secrets in repo, SECRET_KEY required unless DEBUG, explicit hosts, 2 h access tokens with rotation, rate limits on login/post/vote/flag, 10 MB attachment cap |

Not carried over: the real-time messaging, calls and Google/GitHub OAuth. They are out of scope for the Acadex community module.

## Endpoints (`/api/v1`)

`auth/token/` · `auth/token/refresh/` · `auth/register/` · `auth/me/`
`community/rooms/` (+ `{slug}/join/`, `leave/`) · `community/questions/` (filters: `room`, `kind`, `tag`, `author`, `solved`, `mine`, `search`; ordering: `created_at`, `score`, `view_count`, `answers_total`) with `vote/`, `view/`, `flag/`, `pin/`
`community/answers/` with `vote/`, `flag/`, `accept/`, `verify/` · `community/comments/` · `community/attachments/` · `community/tags/`
`community/flags/` (teacher/admin) with `resolve/` · `community/stats/` (teacher/admin)
