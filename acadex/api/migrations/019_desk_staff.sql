ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_constraint_1;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'teacher', 'admin', 'staff'));
ALTER TABLE users ADD COLUMN desk_department TEXT
