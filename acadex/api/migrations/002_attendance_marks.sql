CREATE TABLE attendance_sessions (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  topic TEXT,
  created_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, session_date)
);

CREATE TABLE attendance_records (
  session_id INTEGER NOT NULL REFERENCES attendance_sessions (id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE assessments (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('quiz', 'assignment', 'midterm', 'endterm', 'practical')),
  max_marks NUMERIC NOT NULL CHECK (max_marks > 0),
  held_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE marks (
  assessment_id INTEGER NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  score NUMERIC NOT NULL CHECK (score >= 0),
  PRIMARY KEY (assessment_id, student_id)
)
