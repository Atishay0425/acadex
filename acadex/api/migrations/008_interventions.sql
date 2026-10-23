CREATE TABLE interventions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('mentor_call', 'reminder', 'counselling_referral', 'note')),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'responded', 'closed')),
  outcome TEXT NOT NULL DEFAULT '',
  risk_score INTEGER,
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
