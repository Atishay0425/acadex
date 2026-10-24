ALTER TABLE mentor_profiles ADD COLUMN approval TEXT NOT NULL DEFAULT 'pending' CHECK (approval IN ('pending', 'approved', 'rejected'));
ALTER TABLE mentor_profiles ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
UPDATE mentor_profiles SET approval = 'approved'
