CREATE TABLE legacy_doctor_mappings (
  source_id text NOT NULL,
  legacy_doctor_id bigint NOT NULL CHECK (legacy_doctor_id > 0),
  clinic_id bigint NOT NULL REFERENCES clinics(id),
  doctor_user_id bigint NOT NULL REFERENCES users(id),
  imported_by_user_id bigint REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, legacy_doctor_id, clinic_id)
);

CREATE INDEX legacy_doctor_mappings_user_idx
  ON legacy_doctor_mappings (doctor_user_id, clinic_id);
