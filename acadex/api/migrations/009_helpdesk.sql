CREATE TABLE tickets (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('fees', 'hostel', 'library', 'it', 'certificates', 'academics')),
  department TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE ticket_messages (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
