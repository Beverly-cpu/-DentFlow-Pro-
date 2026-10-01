ALTER TABLE implant_cases DROP CONSTRAINT implant_central_workflow_check;
ALTER TABLE implant_cases ADD CONSTRAINT implant_central_workflow_check
  CHECK(migration_state<>'central_workflow' OR status IN ('醫師已叫貨','已取出待手術','已取消'));
ALTER TABLE implant_stock_requests DROP CONSTRAINT implant_stock_requests_operation_check;
ALTER TABLE implant_stock_requests ADD CONSTRAINT implant_stock_requests_operation_check
  CHECK(operation IN ('order','cancel_order','withdraw'));
ALTER TABLE implant_stock_reservations DROP CONSTRAINT implant_stock_reservations_state_check;
ALTER TABLE implant_stock_reservations ADD CONSTRAINT implant_stock_reservations_state_check
  CHECK(state IN ('reserved','released','picked'));
ALTER TABLE implant_stock_reservations ADD COLUMN picked_quantity integer NOT NULL DEFAULT 0 CHECK(picked_quantity>=0 AND picked_quantity<=quantity);
ALTER TABLE implant_stock_reservations ADD COLUMN picked_unit_cost numeric(14,2) CHECK(picked_unit_cost>=0);
ALTER TABLE implant_stock_reservations ADD COLUMN picked_at timestamptz;
ALTER TABLE implant_stock_reservations ADD COLUMN picked_by_user_id bigint REFERENCES users(id);
ALTER TABLE implant_stock_reservations ADD CONSTRAINT reservation_pick_check CHECK (
  (state='picked' AND picked_quantity=quantity AND picked_unit_cost IS NOT NULL AND picked_at IS NOT NULL AND picked_by_user_id IS NOT NULL)
  OR (state<>'picked' AND picked_quantity=0 AND picked_unit_cost IS NULL AND picked_at IS NULL AND picked_by_user_id IS NULL)
);
CREATE FUNCTION protect_reservation_pick() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.state='picked' THEN RAISE EXCEPTION 'Picked reservations cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.state='picked' AND (NEW.state IS DISTINCT FROM OLD.state
    OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.picked_quantity IS DISTINCT FROM OLD.picked_quantity
    OR NEW.picked_unit_cost IS DISTINCT FROM OLD.picked_unit_cost OR NEW.picked_at IS DISTINCT FROM OLD.picked_at
    OR NEW.picked_by_user_id IS DISTINCT FROM OLD.picked_by_user_id
    OR NEW.implant_case_id IS DISTINCT FROM OLD.implant_case_id OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
    OR NEW.plan_item_id IS DISTINCT FROM OLD.plan_item_id OR NEW.inventory_batch_id IS DISTINCT FROM OLD.inventory_batch_id) THEN
    RAISE EXCEPTION 'Picked reservation identity and cost are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER implant_reservation_protect_pick BEFORE UPDATE OR DELETE ON implant_stock_reservations
FOR EACH ROW EXECUTE FUNCTION protect_reservation_pick();

CREATE TABLE inventory_withdrawal_events (
  id uuid PRIMARY KEY,
  stock_request_id uuid NOT NULL,
  inventory_batch_id bigint NOT NULL,
  clinic_id bigint NOT NULL,
  quantity integer NOT NULL CHECK(quantity>0),
  unit_cost numeric(14,2) NOT NULL CHECK(unit_cost>=0),
  total_cost numeric(20,2) GENERATED ALWAYS AS (quantity*unit_cost) STORED,
  on_hand_delta integer NOT NULL CHECK(on_hand_delta=-quantity),
  reserved_delta integer NOT NULL CHECK(reserved_delta=-quantity),
  on_hand_after integer NOT NULL CHECK(on_hand_after>=0),
  reserved_after integer NOT NULL CHECK(reserved_after>=0 AND reserved_after<=on_hand_after),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stock_request_id,inventory_batch_id),
  FOREIGN KEY(stock_request_id,clinic_id) REFERENCES implant_stock_requests(id,clinic_id),
  FOREIGN KEY(inventory_batch_id,clinic_id) REFERENCES inventory_batches(id,clinic_id)
);
CREATE TRIGGER inventory_withdrawal_events_immutable BEFORE UPDATE OR DELETE ON inventory_withdrawal_events
FOR EACH ROW EXECUTE FUNCTION protect_inventory_opening();
