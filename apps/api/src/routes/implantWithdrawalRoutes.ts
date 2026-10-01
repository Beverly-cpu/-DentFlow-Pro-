import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { DraftError, draftId } from "../implantDraft.js";
import { validateWithdrawal, withdrawalHash } from "../implantWithdrawal.js";

export async function registerImplantWithdrawalRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/v1/implants/:id/withdraw", { preHandler: requireSession, bodyLimit: 64 * 1024 }, async (request, reply) => {
    const principal = request.principal!;
    if (!["Admin", "Assistant", "Doctor"].includes(principal.role)) return reply.code(403).send({ error: "forbidden", message: "無權確認臨床品項取出" });
    const caseId = draftId(Number(request.params.id), "中央個案"); const input = validateWithdrawal(request.body); const hash = withdrawalHash(caseId, input);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const access = await client.query(`SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
        WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true FOR SHARE OF uc,c`, [principal.userId, input.clinicId]);
      if (!access.rows.length) throw new DraftError(403, "forbidden", "無權存取此院所");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`implant-stock:${principal.userId}:${input.requestId}`]);
      const found = await client.query<{ version: number; status: string; patientId: string }>(
        `SELECT version,status,patient_id AS "patientId" FROM implant_cases WHERE id=$1 AND clinic_id=$2 AND migration_state='central_workflow'
         AND ($3<>'Doctor' OR doctor_user_id=$4) FOR UPDATE`, [caseId, input.clinicId, principal.role, principal.userId],
      );
      const current = found.rows[0];
      if (!current) throw new DraftError(404, "not_found", "找不到可存取的中央流程個案");
      const previous = await client.query<{ hash: string; result: Record<string, unknown> }>(
        "SELECT request_hash AS hash,result FROM implant_stock_requests WHERE actor_user_id=$1 AND request_id=$2", [principal.userId, input.requestId],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].hash !== hash) throw new DraftError(409, "request_conflict", "同一庫存請求不可更換內容或操作");
        await client.query("COMMIT"); return { ...previous.rows[0].result, unchanged: true };
      }
      if (current.version !== input.expectedVersion) throw new DraftError(409, "version_conflict", "個案版本已更新，請重新載入核對");
      if (current.status !== "醫師已叫貨") throw new DraftError(409, "workflow_conflict", "只有醫師已叫貨的個案可確認取出");
      const patient = await client.query("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2 AND active=true FOR SHARE", [current.patientId, input.clinicId]);
      if (!patient.rows.length) throw new DraftError(400, "invalid_patient", "病患已停用，請先核對個案");
      const held = await client.query<{ id: string; batchId: number; quantity: number }>(
        `SELECT id,inventory_batch_id::int AS "batchId",quantity FROM implant_stock_reservations
         WHERE implant_case_id=$1 AND state='reserved' ORDER BY inventory_batch_id,id FOR UPDATE`, [caseId],
      );
      const confirmed = new Map(input.confirmations.map((c) => [c.reservationId, c.quantity]));
      if (!held.rows.length || held.rows.length !== confirmed.size || held.rows.some((r) => confirmed.get(r.id) !== r.quantity)) {
        throw new DraftError(400, "confirmation_mismatch", "須逐筆確認此個案全部預留品項及完整取出數量");
      }
      const totals = new Map<number, number>();
      for (const row of held.rows) totals.set(row.batchId, (totals.get(row.batchId) ?? 0) + row.quantity);
      const stocks = await client.query<{ id: number; onHand: number; reserved: number; unitCost: string; expired: boolean }>(
        `SELECT b.id::int,s.on_hand AS "onHand",s.reserved,s.unit_cost::text AS "unitCost",
          (b.expiry_date<>'' AND b.expiry_date<(now() AT TIME ZONE 'Asia/Taipei')::date::text) AS expired
         FROM inventory_batches b JOIN inventory_balances s ON s.inventory_batch_id=b.id AND s.clinic_id=b.clinic_id
         WHERE b.id=ANY($1::bigint[]) AND b.clinic_id=$2 AND b.migration_state='active' ORDER BY b.id FOR UPDATE OF b,s`, [[...totals.keys()].sort((a, b) => a - b), input.clinicId],
      );
      if (stocks.rows.length !== totals.size || stocks.rows.some((s) => s.expired || s.reserved < totals.get(s.id)! || s.onHand < totals.get(s.id)!)) {
        throw new DraftError(409, "stock_conflict", "批次已過期、未啟用或庫存／預留數量不一致");
      }
      const costs = new Map(stocks.rows.map((s) => [s.id, s.unitCost]));
      for (const s of stocks.rows) await client.query("UPDATE inventory_balances SET on_hand=on_hand-$2,reserved=reserved-$2 WHERE inventory_batch_id=$1", [s.id, totals.get(s.id)!]);
      for (const r of held.rows) await client.query(
        `UPDATE implant_stock_reservations SET state='picked',picked_quantity=quantity,picked_unit_cost=$2,picked_at=now(),picked_by_user_id=$3 WHERE id=$1`,
        [r.id, costs.get(r.batchId)!, principal.userId],
      );
      await client.query("UPDATE implant_cases SET status='已取出待手術' WHERE id=$1", [caseId]);
      const result = { id: caseId, version: current.version + 1, status: "已取出待手術", pickedCount: held.rows.length };
      const eventId = randomUUID();
      await client.query(`INSERT INTO implant_stock_requests(id,implant_case_id,clinic_id,actor_user_id,request_id,request_hash,operation,result)
        VALUES($1,$2,$3,$4,$5,$6,'withdraw',$7::jsonb)`, [eventId, caseId, input.clinicId, principal.userId, input.requestId, hash, JSON.stringify(result)]);
      for (const s of stocks.rows) {
        const quantity = totals.get(s.id)!;
        await client.query(`INSERT INTO inventory_withdrawal_events(id,stock_request_id,inventory_batch_id,clinic_id,quantity,unit_cost,on_hand_delta,reserved_delta,on_hand_after,reserved_after)
          VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)`, [randomUUID(), eventId, s.id, input.clinicId, quantity, s.unitCost, -quantity, s.onHand - quantity, s.reserved - quantity]);
      }
      await audit(client, request, "implant_stock_withdrawn", "implant_case", caseId, { clinicId: input.clinicId, eventId, version: result.version });
      await client.query("COMMIT"); return { ...result, unchanged: false };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message });
      throw error;
    } finally { client.release(); }
  });
  app.get<{ Params: { id: string }; Querystring: { clinicId?: string } }>("/v1/implants/:id/withdrawal-ledger", { preHandler: requireSession }, async (request, reply) => {
    if (!["Admin", "Accountant", "Procurement"].includes(request.principal!.role)) return reply.code(403).send({ error: "forbidden", message: "無權讀取臨床庫存成本紀錄" });
    const clinicId = draftId(Number(request.query.clinicId), "院所"); const caseId = draftId(Number(request.params.id), "中央個案");
    const access = await pool.query(`SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
      WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true`, [request.principal!.userId, clinicId]);
    if (!access.rows.length) return reply.code(403).send({ error: "forbidden" });
    const events = await pool.query(`SELECT e.id,e.inventory_batch_id::int AS "inventoryBatchId",e.quantity,e.unit_cost::text AS "unitCost",
      e.total_cost::text AS "totalCost",e.on_hand_delta AS "onHandDelta",e.reserved_delta AS "reservedDelta",
      e.on_hand_after AS "onHandAfter",e.reserved_after AS "reservedAfter",r.actor_user_id::int AS "actorUserId",e.created_at AS "createdAt"
      FROM inventory_withdrawal_events e JOIN implant_stock_requests r ON r.id=e.stock_request_id AND r.clinic_id=e.clinic_id
      WHERE r.implant_case_id=$1 AND r.clinic_id=$2 ORDER BY e.created_at,e.inventory_batch_id`, [caseId, clinicId]);
    if (!events.rows.length) return reply.code(404).send({ error: "not_found" });
    await audit(pool, request, "implant_withdrawal_ledger_read", "implant_case", caseId, { clinicId }); return { items: events.rows };
  });
}
