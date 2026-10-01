ALTER TABLE implant_cases DROP CONSTRAINT implant_central_workflow_check;
ALTER TABLE implant_cases ADD CONSTRAINT implant_central_workflow_check CHECK (
  migration_state<>'central_workflow' OR status IN ('醫師已叫貨','已取出待手術','待術後紀錄','待歸回品項','已完成','已結案','已取消')
);
CREATE TABLE implant_clinical_assets (
  id uuid PRIMARY KEY,
  implant_case_id bigint NOT NULL,
  clinic_id bigint NOT NULL,
  kind text NOT NULL CHECK(kind IN ('instrument_photo','ref_lot_photo','doctor_signature')),
  plan_item_id bigint,
  reservation_id uuid,
  actor_user_id bigint NOT NULL REFERENCES users(id),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  expected_version integer NOT NULL CHECK(expected_version>0),
  content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
  content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
  object_key text NOT NULL UNIQUE,
  upload_state text NOT NULL DEFAULT 'pending' CHECK(upload_state IN ('pending','uploaded')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  uploaded_at timestamptz,
  UNIQUE(actor_user_id,request_id),
  UNIQUE(id,implant_case_id,clinic_id),
  FOREIGN KEY(implant_case_id,clinic_id) REFERENCES implant_cases(id,clinic_id),
  FOREIGN KEY(plan_item_id,implant_case_id) REFERENCES implant_draft_plan_items(id,implant_case_id),
  FOREIGN KEY(reservation_id,implant_case_id,clinic_id) REFERENCES implant_stock_reservations(id,implant_case_id,clinic_id),
  CHECK((kind='instrument_photo' AND plan_item_id IS NOT NULL AND reservation_id IS NULL)
    OR (kind='ref_lot_photo' AND reservation_id IS NOT NULL AND plan_item_id IS NULL)
    OR (kind='doctor_signature' AND plan_item_id IS NULL AND reservation_id IS NULL AND content_type='image/png')),
  CHECK((upload_state='uploaded' AND uploaded_at IS NOT NULL AND result IS NOT NULL) OR (upload_state='pending' AND uploaded_at IS NULL AND result IS NULL))
);
CREATE INDEX implant_clinical_assets_case_idx ON implant_clinical_assets(implant_case_id,upload_state);
CREATE FUNCTION protect_clinical_asset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Clinical asset intent cannot be deleted'; END IF;
  IF OLD.upload_state='uploaded' OR
     (to_jsonb(NEW)-'upload_state'-'uploaded_at'-'result') IS DISTINCT FROM (to_jsonb(OLD)-'upload_state'-'uploaded_at'-'result') THEN
    RAISE EXCEPTION 'Clinical asset identity and uploaded history are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER implant_clinical_assets_immutable BEFORE UPDATE OR DELETE ON implant_clinical_assets
FOR EACH ROW EXECUTE FUNCTION protect_clinical_asset();
ALTER TABLE implant_cases ADD COLUMN doctor_signature_asset_id uuid;
ALTER TABLE implant_cases ADD COLUMN doctor_signed_at timestamptz;
ALTER TABLE implant_cases ADD COLUMN doctor_signed_by_user_id bigint REFERENCES users(id);
ALTER TABLE implant_cases ADD COLUMN doctor_signed_version integer;
ALTER TABLE implant_cases ADD COLUMN closed_at timestamptz;
ALTER TABLE implant_cases ADD COLUMN closed_by_user_id bigint REFERENCES users(id);
ALTER TABLE implant_cases ADD CONSTRAINT implant_signature_asset_fk FOREIGN KEY(doctor_signature_asset_id,id,clinic_id)
  REFERENCES implant_clinical_assets(id,implant_case_id,clinic_id);
ALTER TABLE implant_cases ADD CONSTRAINT implant_signature_complete CHECK(
  (doctor_signature_asset_id IS NULL AND doctor_signed_at IS NULL AND doctor_signed_by_user_id IS NULL AND doctor_signed_version IS NULL)
  OR (doctor_signature_asset_id IS NOT NULL AND doctor_signed_at IS NOT NULL AND doctor_signed_by_user_id IS NOT NULL AND doctor_signed_version IS NOT NULL AND doctor_signed_version>0 AND doctor_user_id IS NOT NULL
    AND doctor_signed_by_user_id=doctor_user_id AND status IN ('已完成','已結案'))
);
ALTER TABLE implant_cases ADD CONSTRAINT implant_closure_complete CHECK(
  migration_state<>'central_workflow' OR ((status='已結案')=(closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL AND doctor_signature_asset_id IS NOT NULL))
);
CREATE TABLE implant_closures (
  id uuid PRIMARY KEY,
  implant_case_id bigint NOT NULL UNIQUE,
  clinic_id bigint NOT NULL,
  actor_user_id bigint NOT NULL REFERENCES users(id),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_user_id,request_id),
  FOREIGN KEY(implant_case_id,clinic_id) REFERENCES implant_cases(id,clinic_id)
);
CREATE TRIGGER implant_closures_immutable BEFORE UPDATE OR DELETE ON implant_closures
FOR EACH ROW EXECUTE FUNCTION protect_inventory_opening();
CREATE FUNCTION protect_implant_closure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.migration_state='central_workflow' AND OLD.status='已結案' THEN RAISE EXCEPTION 'Closed case is immutable'; END IF;
  IF TG_OP='DELETE' THEN
    IF OLD.doctor_signature_asset_id IS NOT NULL THEN RAISE EXCEPTION 'Signed case cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.doctor_signature_asset_id IS NOT NULL AND NEW.status<>'已結案' THEN RAISE EXCEPTION 'Signed case is immutable except for closure'; END IF;
  IF OLD.doctor_signature_asset_id IS NOT NULL AND
    (to_jsonb(NEW)-'status'-'closed_at'-'closed_by_user_id'-'version'-'updated_at') IS DISTINCT FROM
    (to_jsonb(OLD)-'status'-'closed_at'-'closed_by_user_id'-'version'-'updated_at') THEN
    RAISE EXCEPTION 'Signed clinical case is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER implant_cases_protect_closure BEFORE UPDATE OR DELETE ON implant_cases
FOR EACH ROW EXECUTE FUNCTION protect_implant_closure();
CREATE FUNCTION protect_signed_implant_children() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE case_id bigint;
BEGIN
  IF TG_OP='DELETE' THEN case_id:=OLD.implant_case_id; ELSE case_id:=NEW.implant_case_id; END IF;
  IF EXISTS(SELECT 1 FROM implant_cases WHERE id=case_id AND doctor_signature_asset_id IS NOT NULL) THEN RAISE EXCEPTION 'Signed case children are immutable'; END IF;
  IF TG_OP='UPDATE' AND NEW.implant_case_id IS DISTINCT FROM OLD.implant_case_id AND EXISTS(SELECT 1 FROM implant_cases WHERE id=OLD.implant_case_id AND doctor_signature_asset_id IS NOT NULL) THEN RAISE EXCEPTION 'Signed case children are immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER implant_teeth_protect_signed BEFORE INSERT OR UPDATE OR DELETE ON implant_draft_teeth FOR EACH ROW EXECUTE FUNCTION protect_signed_implant_children();
CREATE TRIGGER implant_plans_protect_signed BEFORE INSERT OR UPDATE OR DELETE ON implant_draft_plan_items FOR EACH ROW EXECUTE FUNCTION protect_signed_implant_children();
CREATE TRIGGER implant_reservations_protect_signed BEFORE INSERT OR UPDATE OR DELETE ON implant_stock_reservations FOR EACH ROW EXECUTE FUNCTION protect_signed_implant_children();
CREATE TRIGGER implant_assets_protect_signed BEFORE INSERT OR UPDATE OR DELETE ON implant_clinical_assets FOR EACH ROW EXECUTE FUNCTION protect_signed_implant_children();
