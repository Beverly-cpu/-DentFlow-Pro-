ALTER TABLE implant_cases DROP CONSTRAINT implant_cases_migration_state_check;
ALTER TABLE implant_cases ADD CONSTRAINT implant_cases_migration_state_check
  CHECK (migration_state IN ('legacy_staged','central_draft','central_workflow'));
ALTER TABLE implant_cases ADD CONSTRAINT implant_central_workflow_check
  CHECK (migration_state<>'central_workflow' OR status IN ('醫師已叫貨','已取消'));
ALTER TABLE implant_draft_plan_items ADD CONSTRAINT implant_plan_case_unique UNIQUE(id,implant_case_id);
CREATE TRIGGER inventory_balances_increment_version BEFORE UPDATE ON inventory_balances
FOR EACH ROW EXECUTE FUNCTION increment_inventory_version();

CREATE TABLE implant_stock_requests (
  id uuid PRIMARY KEY,
  implant_case_id bigint NOT NULL,
  clinic_id bigint NOT NULL,
  actor_user_id bigint NOT NULL REFERENCES users(id),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  operation text NOT NULL CHECK (operation IN ('order','cancel_order')),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_user_id,request_id),
  UNIQUE(id,clinic_id),
  FOREIGN KEY(implant_case_id,clinic_id) REFERENCES implant_cases(id,clinic_id)
);
CREATE TABLE implant_stock_reservations (
  id uuid PRIMARY KEY,
  implant_case_id bigint NOT NULL,
  clinic_id bigint NOT NULL,
  plan_item_id bigint NOT NULL,
  inventory_batch_id bigint NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  UNIQUE(implant_case_id,plan_item_id,inventory_batch_id),
  FOREIGN KEY(implant_case_id,clinic_id) REFERENCES implant_cases(id,clinic_id),
  FOREIGN KEY(plan_item_id,implant_case_id) REFERENCES implant_draft_plan_items(id,implant_case_id),
  FOREIGN KEY(inventory_batch_id,clinic_id) REFERENCES inventory_batches(id,clinic_id),
  CHECK ((state='released')=(released_at IS NOT NULL))
);
CREATE TABLE inventory_reservation_events (
  id uuid PRIMARY KEY,
  stock_request_id uuid NOT NULL,
  inventory_batch_id bigint NOT NULL,
  clinic_id bigint NOT NULL,
  reserved_delta integer NOT NULL CHECK(reserved_delta<>0),
  reserved_after integer NOT NULL CHECK(reserved_after>=0),
  on_hand_after integer NOT NULL CHECK(on_hand_after>=reserved_after),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stock_request_id,inventory_batch_id),
  FOREIGN KEY(stock_request_id,clinic_id) REFERENCES implant_stock_requests(id,clinic_id),
  FOREIGN KEY(inventory_batch_id,clinic_id) REFERENCES inventory_batches(id,clinic_id)
);
CREATE TRIGGER inventory_reservation_events_immutable BEFORE UPDATE OR DELETE ON inventory_reservation_events
FOR EACH ROW EXECUTE FUNCTION protect_inventory_opening();
CREATE TRIGGER implant_stock_requests_immutable BEFORE UPDATE OR DELETE ON implant_stock_requests
FOR EACH ROW EXECUTE FUNCTION protect_inventory_opening();
