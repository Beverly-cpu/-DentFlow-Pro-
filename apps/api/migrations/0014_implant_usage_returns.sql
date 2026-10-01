ALTER TABLE implant_cases DROP CONSTRAINT implant_central_workflow_check;
ALTER TABLE implant_cases ADD CONSTRAINT implant_central_workflow_check CHECK (
  migration_state<>'central_workflow' OR status IN ('醫師已叫貨','已取出待手術','待術後紀錄','待歸回品項','已完成','已取消')
);
ALTER TABLE implant_cases ADD COLUMN surgery_completed_at timestamptz;
ALTER TABLE implant_cases ADD COLUMN surgery_completed_by_user_id bigint REFERENCES users(id);
ALTER TABLE implant_cases ADD COLUMN usage_recorded_at timestamptz;
ALTER TABLE implant_cases ADD COLUMN usage_recorded_by_user_id bigint REFERENCES users(id);
ALTER TABLE implant_stock_requests DROP CONSTRAINT implant_stock_requests_operation_check;
ALTER TABLE implant_stock_requests ADD CONSTRAINT implant_stock_requests_operation_check
  CHECK(operation IN ('order','cancel_order','withdraw','surgery_complete','usage','return','cancel_picked'));
ALTER TABLE implant_stock_requests ADD CONSTRAINT stock_request_case_identity UNIQUE(id,implant_case_id,clinic_id);
ALTER TABLE implant_stock_reservations ADD CONSTRAINT stock_reservation_case_identity UNIQUE(id,implant_case_id,clinic_id);
ALTER TABLE implant_stock_reservations ADD COLUMN used_quantity integer NOT NULL DEFAULT 0 CHECK(used_quantity>=0 AND used_quantity<=picked_quantity);
ALTER TABLE implant_stock_reservations ADD COLUMN expected_return_quantity integer CHECK(expected_return_quantity>=0 AND expected_return_quantity<=picked_quantity);
ALTER TABLE implant_stock_reservations ADD COLUMN returned_quantity integer NOT NULL DEFAULT 0 CHECK(returned_quantity>=0);
ALTER TABLE implant_stock_reservations ADD COLUMN usage_recorded_at timestamptz;
ALTER TABLE implant_stock_reservations ADD COLUMN last_returned_at timestamptz;
ALTER TABLE implant_stock_reservations ADD COLUMN returned_by_user_id bigint REFERENCES users(id);
ALTER TABLE implant_stock_reservations ADD CONSTRAINT reservation_return_check CHECK (
  (expected_return_quantity IS NULL AND returned_quantity=0)
  OR (expected_return_quantity IS NOT NULL AND returned_quantity<=expected_return_quantity)
);
ALTER TABLE implant_stock_reservations ADD CONSTRAINT reservation_disposition_check CHECK (
  state='picked' OR (used_quantity=0 AND expected_return_quantity IS NULL AND returned_quantity=0 AND usage_recorded_at IS NULL)
);
CREATE FUNCTION protect_reservation_disposition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.expected_return_quantity IS NOT NULL AND
    (NEW.used_quantity IS DISTINCT FROM OLD.used_quantity OR NEW.expected_return_quantity IS DISTINCT FROM OLD.expected_return_quantity
      OR NEW.usage_recorded_at IS DISTINCT FROM OLD.usage_recorded_at OR NEW.returned_quantity<OLD.returned_quantity) THEN
    RAISE EXCEPTION 'Recorded usage and return history cannot be rewritten';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER implant_reservation_protect_disposition BEFORE UPDATE ON implant_stock_reservations
FOR EACH ROW EXECUTE FUNCTION protect_reservation_disposition();

CREATE TABLE implant_usage_events (
  id uuid PRIMARY KEY,
  stock_request_id uuid NOT NULL,
  reservation_id uuid NOT NULL UNIQUE,
  implant_case_id bigint NOT NULL,
  clinic_id bigint NOT NULL,
  used_quantity integer NOT NULL CHECK(used_quantity>=0),
  consumed_quantity integer NOT NULL CHECK(consumed_quantity>=0 AND consumed_quantity<=used_quantity),
  expected_return_quantity integer NOT NULL CHECK(expected_return_quantity>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(stock_request_id,implant_case_id,clinic_id) REFERENCES implant_stock_requests(id,implant_case_id,clinic_id),
  FOREIGN KEY(reservation_id,implant_case_id,clinic_id) REFERENCES implant_stock_reservations(id,implant_case_id,clinic_id)
);
CREATE TABLE inventory_return_events (
  id uuid PRIMARY KEY,
  stock_request_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  implant_case_id bigint NOT NULL,
  clinic_id bigint NOT NULL,
  inventory_batch_id bigint NOT NULL,
  quantity integer NOT NULL CHECK(quantity>0),
  return_condition text NOT NULL CHECK(return_condition IN ('sealed','reusable')),
  reason text NOT NULL CHECK(length(reason)>0),
  unit_cost numeric(14,2) NOT NULL CHECK(unit_cost>=0),
  total_cost numeric(20,2) GENERATED ALWAYS AS (quantity*unit_cost) STORED,
  on_hand_after integer NOT NULL CHECK(on_hand_after>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stock_request_id,reservation_id),
  FOREIGN KEY(stock_request_id,implant_case_id,clinic_id) REFERENCES implant_stock_requests(id,implant_case_id,clinic_id),
  FOREIGN KEY(reservation_id,implant_case_id,clinic_id) REFERENCES implant_stock_reservations(id,implant_case_id,clinic_id),
  FOREIGN KEY(inventory_batch_id,clinic_id) REFERENCES inventory_batches(id,clinic_id)
);
CREATE TRIGGER implant_usage_events_immutable BEFORE UPDATE OR DELETE ON implant_usage_events
FOR EACH ROW EXECUTE FUNCTION protect_inventory_opening();
CREATE TRIGGER inventory_return_events_immutable BEFORE UPDATE OR DELETE ON inventory_return_events
FOR EACH ROW EXECUTE FUNCTION protect_inventory_opening();
