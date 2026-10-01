CREATE TABLE legacy_patient_mappings (
  source_id text NOT NULL,
  legacy_patient_id bigint NOT NULL,
  patient_id bigint NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id bigint NOT NULL REFERENCES clinics(id),
  imported_by_user_id bigint REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, legacy_patient_id)
);

CREATE INDEX legacy_patient_mappings_patient_idx
  ON legacy_patient_mappings (patient_id);
