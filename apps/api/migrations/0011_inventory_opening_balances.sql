ALTER TABLE inventory_batches DROP CONSTRAINT inventory_batches_migration_state_check;
ALTER TABLE inventory_batches ADD CONSTRAINT inventory_batches_migration_state_check
  CHECK (migration_state IN ('legacy_staged','active'));
ALTER TABLE inventory_batches ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version>0);
ALTER TABLE inventory_batches ADD COLUMN activation_identity text;
ALTER TABLE inventory_batches ADD CONSTRAINT inventory_active_identity_check
  CHECK (migration_state<>'active' OR (activation_identity IS NOT NULL AND activation_identity ~ '^[0-9a-f]{64}$'));
CREATE UNIQUE INDEX inventory_active_identity_unique ON inventory_batches(clinic_id,activation_identity)
  WHERE migration_state='active';
CREATE FUNCTION increment_inventory_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.version := OLD.version + 1; RETURN NEW; END;
$$;
CREATE TRIGGER inventory_batches_increment_version BEFORE UPDATE ON inventory_batches
FOR EACH ROW EXECUTE FUNCTION increment_inventory_version();

CREATE TABLE inventory_balances (
  inventory_batch_id bigint PRIMARY KEY,
  clinic_id bigint NOT NULL,
  on_hand integer NOT NULL CHECK (on_hand BETWEEN 0 AND 1000000),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved>=0 AND reserved<=on_hand),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost>=0),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  FOREIGN KEY (inventory_batch_id,clinic_id) REFERENCES inventory_batches(id,clinic_id)
);
CREATE TABLE inventory_openings (
  id uuid PRIMARY KEY,
  inventory_batch_id bigint NOT NULL UNIQUE,
  clinic_id bigint NOT NULL,
  counted_quantity integer NOT NULL CHECK (counted_quantity BETWEEN 0 AND 1000000),
  unit_cost numeric(14,2) NOT NULL CHECK (unit_cost>=0),
  reconciliation_note text NOT NULL CHECK (length(reconciliation_note)>0),
  actor_user_id bigint NOT NULL REFERENCES users(id),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id,request_id),
  FOREIGN KEY (inventory_batch_id,clinic_id) REFERENCES inventory_batches(id,clinic_id)
);
CREATE FUNCTION protect_inventory_opening() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Opening inventory records are immutable'; END;
$$;
CREATE TRIGGER inventory_openings_immutable BEFORE UPDATE OR DELETE ON inventory_openings
FOR EACH ROW EXECUTE FUNCTION protect_inventory_opening();
