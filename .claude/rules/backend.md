---
paths:
  - "acadex-backend/**"
---

# Back-end rules (Django community service)

- This Django service is a known exception to `tech-stack.md` (the stack is Node/Express + PostgreSQL). Only fix or maintain it; build every other module in Express, and propose a port before adding features here. Do not port MU-CONNECT's chat, calls or social login (out of scope).
- Counts and the viewer's vote come from annotations (`views.annotate_votes`). Serializers read `upvotes`, `downvotes`, `my_vote`, `answers_total`; never add a query or a model property that counts per row. List endpoints must stay at 3 queries (`test_list_query_count_does_not_grow_with_rows`).
- `Vote`, `Flag` and `Attachment` target exactly one of question or answer through two nullable foreign keys, enforced by DB constraints. Do not go back to a type string plus object id.
- Visibility is decided in `get_queryset`: hidden posts are visible only to their author and to moderators (`User.is_moderator`: teacher, admin, staff). Anonymous posts are masked in the serializer.
- Role checks use `request.user.role` or `is_moderator`; self-registration may only create students.
- Throttle scopes are set per action (`post`, `vote`, `flag`, `auth`); new write endpoints need one.
- Never commit `.env`, `db.sqlite3`, tokens or media. `SECRET_KEY` must come from the environment unless `DEBUG=True`.
- Every behaviour change needs a test in `community/tests/`. Run one test with `manage.py test community.tests.test_api.CommunityAPITests.<name>`, then the full suite.
- Schema changes: `makemigrations` and commit the migration; do not edit applied migrations.
