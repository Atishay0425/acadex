CREATE TABLE resources (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'link')),
  content TEXT NOT NULL DEFAULT '',
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resource_imports (
  resource_id INTEGER NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  note_id INTEGER REFERENCES notes (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (resource_id, student_id)
)
