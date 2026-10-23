CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('course', 'branch', 'general')),
  description TEXT NOT NULL DEFAULT '',
  course_id INTEGER UNIQUE REFERENCES courses (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_members (
  room_id INTEGER NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0)
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms (id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'question' CHECK (kind IN ('question', 'notes', 'resource', 'event')),
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_answer_id INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE answers (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_faculty_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE posts ADD CONSTRAINT posts_accepted_answer_fk FOREIGN KEY (accepted_answer_id) REFERENCES answers (id) ON DELETE SET NULL;

CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  answer_id INTEGER NOT NULL REFERENCES answers (id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES comments (id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE post_votes (
  post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (1, -1)),
  PRIMARY KEY (post_id, voter_id)
);

CREATE TABLE answer_votes (
  answer_id INTEGER NOT NULL REFERENCES answers (id) ON DELETE CASCADE,
  voter_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (1, -1)),
  PRIMARY KEY (answer_id, voter_id)
);

CREATE TABLE post_flags (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'offtopic', 'other')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'removed')),
  reviewed_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);

CREATE TABLE answer_flags (
  id SERIAL PRIMARY KEY,
  answer_id INTEGER NOT NULL REFERENCES answers (id) ON DELETE CASCADE,
  reporter_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'offtopic', 'other')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'removed')),
  reviewed_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (answer_id, reporter_id)
);

CREATE TABLE post_views (
  post_id INTEGER NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  viewer_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, viewer_id)
);

INSERT INTO rooms (name, slug, kind, course_id) SELECT code || ' - ' || title, 'course-' || lower(code), 'course', id FROM courses;

INSERT INTO room_members (room_id, user_id) SELECT r.id, e.student_id FROM rooms r JOIN enrollments e ON e.course_id = r.course_id;

INSERT INTO room_members (room_id, user_id) SELECT r.id, c.teacher_id FROM rooms r JOIN courses c ON c.id = r.course_id WHERE c.teacher_id IS NOT NULL
