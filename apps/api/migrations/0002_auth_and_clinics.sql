ALTER TABLE clinics ADD COLUMN IF NOT EXISTS code text;
UPDATE clinics SET code = 'CLINIC-' || id::text WHERE code IS NULL OR btrim(code) = '';
ALTER TABLE clinics ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clinics_code_upper_unique ON clinics (upper(code));

INSERT INTO clinics (id, legacy_id, code, name, active)
SELECT 1, 1, 'DEFAULT', '預設院所', true
WHERE NOT EXISTS (SELECT 1 FROM clinics);

SELECT setval(pg_get_serial_sequence('clinics', 'id'), GREATEST((SELECT max(id) FROM clinics), 1));

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('Doctor', 'Assistant', 'Admin', 'Accountant', 'Procurement'));

ALTER TABLE sessions ALTER COLUMN expires_at SET DEFAULT (now() + interval '8 hours');
