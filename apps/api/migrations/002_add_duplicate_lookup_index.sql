-- Up Migration
CREATE INDEX inquiries_contact_subject_created_at_idx
  ON inquiries (contact, subject, created_at DESC, id DESC);

-- Down Migration
DROP INDEX inquiries_contact_subject_created_at_idx;
