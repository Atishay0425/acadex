CREATE TABLE assignments (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at TIMESTAMPTZ NOT NULL,
  max_marks NUMERIC NOT NULL CHECK (max_marks > 0),
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES assignments (id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  link TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  score NUMERIC CHECK (score >= 0),
  feedback TEXT NOT NULL DEFAULT '',
  graded_at TIMESTAMPTZ,
  graded_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  UNIQUE (assignment_id, student_id)
)
