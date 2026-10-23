ALTER TABLE users ADD COLUMN is_counsellor BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE counselling_slots (
  id SERIAL PRIMARY KEY,
  counsellor_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  UNIQUE (counsellor_id, starts_at)
);

CREATE TABLE counselling_sessions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  counsellor_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  slot_id INTEGER UNIQUE REFERENCES counselling_slots (id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('academic', 'career', 'personal')),
  topic TEXT NOT NULL DEFAULT '',
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'completed', 'cancelled')),
  counsellor_note TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
