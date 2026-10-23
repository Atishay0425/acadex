CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mentor_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stack TEXT NOT NULL DEFAULT '[]',
  spots INTEGER NOT NULL DEFAULT 0 CHECK (spots BETWEEN 0 AND 8),
  repo_url TEXT,
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'changes_requested', 'in_progress', 'completed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_members (
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_requests (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, student_id)
);

CREATE TABLE project_updates (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'update' CHECK (kind IN ('update', 'feedback', 'approved', 'changes_requested', 'completed')),
  body TEXT NOT NULL DEFAULT '',
  progress INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
