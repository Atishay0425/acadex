CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0),
  storage_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE submission_files (
  submission_id INTEGER NOT NULL REFERENCES submissions (id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  PRIMARY KEY (submission_id, file_id)
);

ALTER TABLE resources ADD COLUMN file_id INTEGER REFERENCES files (id) ON DELETE SET NULL
