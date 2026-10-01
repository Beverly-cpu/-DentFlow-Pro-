import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { DraftError, draftId } from "../implantDraft.js";
import { orderHash, sameSpecification, validateImplantOrder } from "../implantOrder.js";
import type { Allocation } from "../implantOrder.js";

type Stock = Record<string, unknown> & { id: number; onHand: number; reserved: number; expired: boolean };
type Plan = Record<string, unknown> & { id: number; quantity: number; category: string; model: string; specification: string };
export async function registerImplantOrderRoutes(app: FastifyInstance, pool: DatabasePool) {
  for (const cancel of [false, true]) {
    app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(`/v1/implants/:id/${cancel ? "cancel-order" : "order"}`, { preHandler: requireSession, bodyLimit: 64 * 1024 }, async (request, reply) => {
      const principal = request.principal!;
      if (!(cancel ? ["Admin", "Assistant", "Doctor"] : ["Assistant", "Doctor"]).includes(principal.role)) return reply.code(403).send({ error: "forbidden", message: "無權執行此叫貨操作" });
      const caseId = draftId(Number(request.params.id), "中央個案"); const input = validateImplantOrder(request.body, cancel);
      const operation = cancel ? "cancel_order" : "order"; const hash = orderHash(caseId, operation, input);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const access = await client.query(`SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
          WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true FOR SHARE OF uc,c`, [principal.userId, input.clinicId]);
        if (!access.rows.length) throw new DraftError(403, "forbidden", "無權存取此院所");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`implant-stock:${principal.userId}:${input.requestId}`]);
        const found = await client.query<{ version: number; status: string; mode: string; patientId: string; doctorId: string | null }>(
          `SELECT version,status,migration_state AS mode,patient_id AS "patientId",doctor_user_id AS "doctorId" FROM implant_cases
           WHERE id=$1 AND clinic_id=$2 AND migration_state IN ('central_draft','central_workflow')
           AND ($3<>'Doctor' OR doctor_user_id=$4) FOR UPDATE`, [caseId, input.clinicId, principal.role, principal.userId],
        );
        const current = found.rows[0];
        if (!current) throw new DraftError(404, "not_found", "找不到可存取的中央個案");
        const previous = await client.query<{ hash: string; result: Record<string, unknown> }>(
          `SELECT request_hash AS hash,result FROM implant_stock_requests WHERE actor_user_id=$1 AND request_id=$2`, [principal.userId, input.requestId],
        );
        if (previous.rows[0]) {
          if (previous.rows[0].hash !== hash) throw new DraftError(409, "request_conflict", "同一庫存請求不可更換內容或操作");
          await client.query("COMMIT"); return { ...previous.rows[0].result, unchanged: true };
        }
        if (current.version !== input.expectedVersion) throw new DraftError(409, "version_conflict", "個案版本已更新，請重新載入核對");
        if (cancel ? current.mode !== "central_workflow" || current.status !== "醫師已叫貨" : current.mode !== "central_draft" || current.status !== "待醫師叫貨") {
          throw new DraftError(409, "workflow_conflict", "個案狀態不允許此叫貨操作");
        }
        let allocations: Allocation[] = input.allocations;
        const plans = new Map<number, Plan>();
        if (cancel) {
          const held = await client.query<{ planItemId: number; inventoryBatchId: number; quantity: number }>(
            `SELECT plan_item_id::int AS "planItemId",inventory_batch_id::int AS "inventoryBatchId",quantity
             FROM implant_stock_reservations WHERE implant_case_id=$1 AND state='reserved' ORDER BY inventory_batch_id,plan_item_id FOR UPDATE`, [caseId],
          );
          allocations = held.rows;
          if (!allocations.length) throw new DraftError(409, "reservation_conflict", "找不到可釋放的預留紀錄");
        } else {
          const patient = await client.query("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2 AND active=true FOR SHARE", [current.patientId, input.clinicId]);
          const doctor = await client.query(`SELECT 1 FROM users u JOIN user_clinics uc ON uc.user_id=u.id
            WHERE u.id=$1 AND uc.clinic_id=$2 AND u.active=true AND u.role='Doctor' FOR SHARE OF u,uc`, [current.doctorId, input.clinicId]);
          if (!patient.rows.length || !doctor.rows.length) throw new DraftError(400, "invalid_references", "叫貨需有效中央病患與啟用院所醫師");
          const rows = await client.query<Plan>(`SELECT id::int,name,category,brand,model,specification,planned_quantity AS quantity
            FROM implant_draft_plan_items WHERE implant_case_id=$1 ORDER BY id`, [caseId]);
          for (const plan of rows.rows) plans.set(plan.id, plan);
          if (!plans.size || allocations.some((a) => !plans.has(a.planItemId))) throw new DraftError(400, "invalid_plan", "規格分配不屬於此個案");
          for (const plan of plans.values()) if (allocations.filter((a) => a.planItemId === plan.id).reduce((sum, a) => sum + a.quantity, 0) !== plan.quantity) {
            throw new DraftError(400, "incomplete_allocation", "每筆術前規格須完整分配預計數量");
          }
          if (principal.role === "Assistant" && (!rows.rows.some((p) => p.category === "器械") || rows.rows.some((p) => p.category !== "器械" && (!p.model.trim() || !p.specification.trim())))) {
            throw new DraftError(400, "assistant_order_incomplete", "助理協助叫貨須有器械，植體／套件須填寫型號及規格");
          }
        }
        const totals = new Map<number, number>();
        for (const a of allocations) totals.set(a.inventoryBatchId, (totals.get(a.inventoryBatchId) ?? 0) + a.quantity);
        const stockRows = await client.query<Stock>(`SELECT b.id::int,b.name,b.category,b.brand,b.model,b.specification,s.on_hand AS "onHand",s.reserved,
          (b.expiry_date<>'' AND b.expiry_date<(now() AT TIME ZONE 'Asia/Taipei')::date::text) AS expired
          FROM inventory_batches b JOIN inventory_balances s ON s.inventory_batch_id=b.id AND s.clinic_id=b.clinic_id
          WHERE b.id=ANY($1::bigint[]) AND b.clinic_id=$2 AND b.migration_state='active' ORDER BY b.id FOR UPDATE OF b,s`, [[...totals.keys()].sort((a, b) => a - b), input.clinicId]);
        const stocks = new Map(stockRows.rows.map((s) => [s.id, s]));
        if (stocks.size !== totals.size) throw new DraftError(400, "invalid_batch", "預留批次須為此院所已啟用的中央庫存");
        for (const a of allocations) if (!cancel && !sameSpecification(plans.get(a.planItemId)!, stocks.get(a.inventoryBatchId)!)) throw new DraftError(400, "specification_mismatch", "批次規格與術前計畫不符");
        for (const [batchId, quantity] of totals) {
          const stock = stocks.get(batchId)!;
          if (cancel ? stock.reserved < quantity : stock.expired || stock.onHand - stock.reserved < quantity) throw new DraftError(409, "stock_conflict", "庫存不足、已過期或預留數量不一致");
          await client.query("UPDATE inventory_balances SET reserved=reserved+$2 WHERE inventory_batch_id=$1", [batchId, cancel ? -quantity : quantity]);
        }
        if (cancel) {
          await client.query("UPDATE implant_stock_reservations SET state='released',released_at=now() WHERE implant_case_id=$1 AND state='reserved'", [caseId]);
          await client.query("UPDATE implant_cases SET status='已取消',cancellation_reason=$2 WHERE id=$1", [caseId, input.reason]);
        } else {
          for (const a of allocations) await client.query(`INSERT INTO implant_stock_reservations(id,implant_case_id,clinic_id,plan_item_id,inventory_batch_id,quantity)
            VALUES($1,$2,$3,$4,$5,$6)`, [randomUUID(), caseId, input.clinicId, a.planItemId, a.inventoryBatchId, a.quantity]);
          await client.query("UPDATE implant_cases SET status='醫師已叫貨',migration_state='central_workflow' WHERE id=$1", [caseId]);
        }
        const result = { id: caseId, version: current.version + 1, status: cancel ? "已取消" : "醫師已叫貨", reservationCount: allocations.length };
        const eventId = randomUUID();
        await client.query(`INSERT INTO implant_stock_requests(id,implant_case_id,clinic_id,actor_user_id,request_id,request_hash,operation,result)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [eventId, caseId, input.clinicId, principal.userId, input.requestId, hash, operation, JSON.stringify(result)]);
        for (const [batchId, quantity] of totals) {
          const stock = stocks.get(batchId)!; const delta = cancel ? -quantity : quantity;
          await client.query(`INSERT INTO inventory_reservation_events(id,stock_request_id,inventory_batch_id,clinic_id,reserved_delta,reserved_after,on_hand_after)
            VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), eventId, batchId, input.clinicId, delta, stock.reserved + delta, stock.onHand]);
        }
        await audit(client, request, cancel ? "implant_order_cancelled" : "implant_order_reserved", "implant_case", caseId, { clinicId: input.clinicId, eventId, version: result.version });
        await client.query("COMMIT"); return { ...result, unchanged: false };
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message });
        throw error;
      } finally { client.release(); }
    });
  }
}
