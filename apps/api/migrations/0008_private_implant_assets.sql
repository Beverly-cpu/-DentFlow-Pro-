CREATE TABLE implant_assets (
  id uuid PRIMARY KEY,
  implant_case_id bigint NOT NULL,
  source_id text NOT NULL,
  clinic_id bigint NOT NULL,
  owner_table text NOT NULL,
  legacy_owner_id bigint NOT NULL CHECK (legacy_owner_id>0),
  owner_field text NOT NULL,
  data_url_sha256 text NOT NULL CHECK (data_url_sha256 ~ '^[0-9a-f]{64}$'),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  byte_size integer NOT NULL CHECK (byte_size>0 AND byte_size<=10485760),
  object_key text NOT NULL UNIQUE,
  upload_state text NOT NULL DEFAULT 'pending' CHECK (upload_state IN ('pending','uploaded')),
  uploaded_by_user_id bigint REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  UNIQUE (implant_case_id,owner_table,legacy_owner_id,owner_field),
  FOREIGN KEY (implant_case_id,source_id,clinic_id)
    REFERENCES legacy_implant_mappings(implant_case_id,source_id,clinic_id),
  CHECK (
    (owner_table='implants' AND owner_field='doctorSignature') OR
    (owner_table='implantPlanItems' AND owner_field='instrumentPhotoDataUrl') OR
    (owner_table='implantUsageItems' AND owner_field='refLotPhotoDataUrl')
  ),
  CHECK ((upload_state='uploaded') = (uploaded_at IS NOT NULL))
);

CREATE INDEX implant_assets_case_idx ON implant_assets (implant_case_id,upload_state);
