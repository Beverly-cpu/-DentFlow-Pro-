import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { DraftError, draftId } from "../implantDraft.js";
import { dispositionHash, expectedReturn, validateDisposition } from "../implantDisposition.js";
import type { DispositionOperation } from "../implantDisposition.js";

type Pick = { id: string; batchId: number; picked: number; used: number; expected: number | null; returned: number; category: string; unitCost: string };
const paths: Record<DispositionOperation, string> = { surgery_complete: "surgery-complete", usage: "usage", return: "return-items", cancel_picked: "cancel-picked" };
export async function registerImplantDispositionRoutes(app: FastifyInstance, pool: DatabasePool) {
  for (const operation of Object.keys(paths) as DispositionOperation[]) {
    app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(`/v1/implants/:id/${paths[operation]}`, { preHandler: requireSession, bodyLimit: 64 * 1024 }, async (request, reply) => {
      const principal = request.principal!;
      if (!["Admin", "Assistant", "Doctor"].includes(principal.role)) return reply.code(403).send({ error: "forbidden", message: "無權修改臨床使用／歸回紀錄" });
      const caseId = draftId(Number(request.params.id), "中央個案"); const input = validateDisposition(request.body, operation);
      const hash = dispositionHash(caseId, operation, input); const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const access = await client.query(`SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
          WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true FOR SHARE OF uc,c`, [principal.userId, input.clinicId]);
        if (!access.rows.length) throw new DraftError(403, "forbidden", "無權存取此院所");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`implant-stock:${principal.userId}:${input.requestId}`]);
        const found = await client.query<{ version: number; status: string }>(`SELECT version,status FROM implant_cases
          WHERE id=$1 AND clinic_id=$2 AND migration_state='central_workflow' AND ($3<>'Doctor' OR doctor_user_id=$4) FOR UPDATE`, [caseId, input.clinicId, principal.role, principal.userId]);
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
        const requiredStatus = operation === "usage" ? "待術後紀錄" : operation === "return" ? "待歸回品項" : "已取出待手術";
        if (current.status !== requiredStatus) throw new DraftError(409, "workflow_conflict", "目前個案階段不允許此操作");
        const held = await client.query<Pick>(`SELECT r.id,r.inventory_batch_id::int AS "batchId",r.picked_quantity AS picked,
          r.used_quantity AS used,r.expected_return_quantity AS expected,r.returned_quantity AS returned,p.category,r.picked_unit_cost::text AS "unitCost"
          FROM implant_stock_reservations r JOIN implant_draft_plan_items p ON p.id=r.plan_item_id AND p.implant_case_id=r.implant_case_id
          WHERE r.implant_case_id=$1 AND r.state='picked' ORDER BY r.inventory_batch_id,r.id FOR UPDATE OF r`, [caseId]);
        if (!held.rows.length) throw new DraftError(409, "pick_conflict", "找不到已取出品項");
        const rows = new Map(held.rows.map((r) => [r.id, r]));
        let status: string = current.status; let outstanding: number | null = null;
        const usageRecords: { row: Pick; used: number; expected: number }[] = [];
        const returnRecords: { row: Pick; quantity: number; condition: string; after: number }[] = [];
        if (operation === "surgery_complete") {
          await client.query(`UPDATE implant_cases SET status='待術後紀錄',surgery_completed_at=now(),surgery_completed_by_user_id=$2 WHERE id=$1`, [caseId, principal.userId]);
          status = "待術後紀錄";
        } else if (operation === "usage") {
          if (input.entries.length !== rows.size || input.entries.some((e) => !rows.has(e.reservationId)) || held.rows.some((r) => r.expected !== null)) {
            throw new DraftError(400, "usage_mismatch", "須逐項登錄全部取出品項，且不得重複分類");
          }
          outstanding = 0;
          for (const e of input.entries) {
            const row = rows.get(e.reservationId)!; const expected = expectedReturn(row.category, row.picked, e.quantity);
            usageRecords.push({ row, used: e.quantity, expected }); outstanding += expected;
            await client.query("UPDATE implant_stock_reservations SET used_quantity=$2,expected_return_quantity=$3,usage_recorded_at=now() WHERE id=$1", [row.id, e.quantity, expected]);
          }
          status = outstanding ? "待歸回品項" : "已完成";
          await client.query("UPDATE implant_cases SET status=$2,usage_recorded_at=now(),usage_recorded_by_user_id=$3 WHERE id=$1", [caseId, status, principal.userId]);
        } else {
          const cancel = operation === "cancel_picked";
          if (!cancel && held.rows.some((r) => r.expected === null)) throw new DraftError(409, "usage_incomplete", "仍有取出品項尚未完成術後分類");
          if (cancel && (input.entries.length !== rows.size || held.rows.some((r) => r.expected !== null || r.used !== 0 || r.returned !== 0))) {
            throw new DraftError(400, "return_mismatch", "手術前取消須逐項確認全部取出品項完整歸回");
          }
          for (const e of input.entries) {
            const row = rows.get(e.reservationId);
            if (!row || (cancel ? e.quantity !== row.picked : row.expected === null || e.quantity > row.expected - row.returned)) {
              throw new DraftError(400, "return_mismatch", "歸回量超過待歸回數量或品項不屬於此個案");
            }
            if (e.returnCondition !== (row.category === "器械" ? "reusable" : "sealed")) throw new DraftError(400, "return_condition_mismatch", "植體／套件須確認未拆封，器械須確認可重複使用");
          }
          const totals = new Map<number, number>();
          for (const e of input.entries) { const row = rows.get(e.reservationId)!; totals.set(row.batchId, (totals.get(row.batchId) ?? 0) + e.quantity); }
          const stocks = await client.query<{ id: number; onHand: number }>(`SELECT b.id::int,s.on_hand AS "onHand" FROM inventory_batches b
            JOIN inventory_balances s ON s.inventory_batch_id=b.id AND s.clinic_id=b.clinic_id WHERE b.id=ANY($1::bigint[]) AND b.clinic_id=$2
            AND b.migration_state='active' ORDER BY b.id FOR UPDATE OF b,s`, [[...totals.keys()].sort((a, b) => a - b), input.clinicId]);
          if (stocks.rows.length !== totals.size || stocks.rows.some((s) => s.onHand + totals.get(s.id)! > 1_000_000)) throw new DraftError(409, "stock_conflict", "歸回批次未啟用或數量超過上限");
          const running = new Map(stocks.rows.map((s) => [s.id, s.onHand]));
          // Locks are held for all batches before any balance changes.
          for (const e of input.entries) {
            const row = rows.get(e.reservationId)!; const after = running.get(row.batchId)! + e.quantity; running.set(row.batchId, after);
            await client.query("UPDATE inventory_balances SET on_hand=on_hand+$2 WHERE inventory_batch_id=$1", [row.batchId, e.quantity]);
            await client.query(`UPDATE implant_stock_reservations SET expected_return_quantity=COALESCE(expected_return_quantity,picked_quantity),
              returned_quantity=returned_quantity+$2,last_returned_at=now(),returned_by_user_id=$3 WHERE id=$1`, [row.id, e.quantity, principal.userId]);
            returnRecords.push({ row, quantity: e.quantity, condition: e.returnCondition, after });
          }
          outstanding = cancel ? 0 : held.rows.reduce((sum, r) => sum + r.expected! - r.returned, 0) - input.entries.reduce((sum, e) => sum + e.quantity, 0);
          status = cancel ? "已取消" : outstanding ? "待歸回品項" : "已完成";
          await client.query("UPDATE implant_cases SET status=$2,cancellation_reason=CASE WHEN $2='已取消' THEN $3 ELSE cancellation_reason END WHERE id=$1", [caseId, status, input.reason]);
        }
        const result = { id: caseId, status, version: current.version + 1, entryCount: input.entries.length, outstandingQuantity: outstanding };
        const eventId = randomUUID();
        await client.query(`INSERT INTO implant_stock_requests(id,implant_case_id,clinic_id,actor_user_id,request_id,request_hash,operation,result)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [eventId, caseId, input.clinicId, principal.userId, input.requestId, hash, operation, JSON.stringify(result)]);
        for (const record of usageRecords) await client.query(`INSERT INTO implant_usage_events(id,stock_request_id,reservation_id,implant_case_id,clinic_id,used_quantity,consumed_quantity,expected_return_quantity)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), eventId, record.row.id, caseId, input.clinicId, record.used, record.row.category === "器械" ? 0 : record.used, record.expected]);
        for (const record of returnRecords) await client.query(`INSERT INTO inventory_return_events(id,stock_request_id,reservation_id,implant_case_id,clinic_id,inventory_batch_id,quantity,return_condition,reason,unit_cost,on_hand_after)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [randomUUID(), eventId, record.row.id, caseId, input.clinicId, record.row.batchId, record.quantity, record.condition, input.reason, record.row.unitCost, record.after]);
        await audit(client, request, `implant_${operation}_recorded`, "implant_case", caseId, { clinicId: input.clinicId, eventId, version: result.version });
        await client.query("COMMIT"); return { ...result, unchanged: false };
      } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message });
        throw error;
      } finally { client.release(); }
    });
  }
  app.get<{ Params: { id: string }; Querystring: { clinicId?: string } }>("/v1/implants/:id/return-ledger", { preHandler: requireSession }, async (request, reply) => {
    if (!["Admin", "Accountant", "Procurement"].includes(request.principal!.role)) return reply.code(403).send({ error: "forbidden" });
    const clinicId = draftId(Number(request.query.clinicId), "院所"); const caseId = draftId(Number(request.params.id), "中央個案");
    const access = await pool.query(`SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true`, [request.principal!.userId, clinicId]);
    if (!access.rows.length) return reply.code(403).send({ error: "forbidden" });
    const events = await pool.query(`SELECT e.id,e.reservation_id AS "reservationId",e.inventory_batch_id::int AS "inventoryBatchId",e.quantity,
      e.return_condition AS "returnCondition",e.reason,e.unit_cost::text AS "unitCost",e.total_cost::text AS "totalCost",e.on_hand_after AS "onHandAfter",
      r.actor_user_id::int AS "actorUserId",e.created_at AS "createdAt" FROM inventory_return_events e JOIN implant_stock_requests r ON r.id=e.stock_request_id
      AND r.implant_case_id=e.implant_case_id AND r.clinic_id=e.clinic_id WHERE e.implant_case_id=$1 AND e.clinic_id=$2 ORDER BY e.created_at,e.id`, [caseId, clinicId]);
    if (!events.rows.length) return reply.code(404).send({ error: "not_found" });
    await audit(pool, request, "implant_return_ledger_read", "implant_case", caseId, { clinicId }); return { items: events.rows };
  });
}
