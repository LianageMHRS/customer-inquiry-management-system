-- Up Migration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT users_email_not_blank CHECK (btrim(email) <> '')
);

CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name VARCHAR(100) NOT NULL,
  contact VARCHAR(254) NOT NULL,
  subject VARCHAR(150) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'NEW',
  created_by_id UUID NOT NULL REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inquiries_customer_name_not_blank CHECK (btrim(customer_name) <> ''),
  CONSTRAINT inquiries_contact_not_blank CHECK (btrim(contact) <> ''),
  CONSTRAINT inquiries_subject_not_blank CHECK (btrim(subject) <> ''),
  CONSTRAINT inquiries_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT inquiries_status_allowed CHECK (
    status IN ('NEW', 'IN_PROGRESS', 'RESOLVED')
  ),
  CONSTRAINT inquiries_version_positive CHECK (version >= 1)
);

CREATE INDEX inquiries_owner_created_at_idx
  ON inquiries (created_by_id, created_at DESC);
CREATE INDEX inquiries_owner_status_idx
  ON inquiries (created_by_id, status);
CREATE INDEX inquiries_customer_name_trgm_idx
  ON inquiries USING GIN (customer_name gin_trgm_ops);
CREATE INDEX inquiries_subject_trgm_idx
  ON inquiries USING GIN (subject gin_trgm_ops);

CREATE TABLE "session" (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);

CREATE INDEX "IDX_session_expire" ON "session" (expire);

GRANT USAGE ON SCHEMA public TO inquiry_app;
GRANT SELECT, INSERT, UPDATE ON users, inquiries TO inquiry_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "session" TO inquiry_app;

-- Down Migration
DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS inquiries;
DROP TABLE IF EXISTS users;
