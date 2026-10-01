import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { audit, requireAdmin, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { DraftError, draftId } from "../implantDraft.js";
import { inventoryActivationIdentity, inventoryOpeningHash, validateInventoryOpening } from "../inventoryOpening.js";
import type { BatchIdentity } from "../inventoryOpening.js";

type Queryable = Pick<DatabasePool, "query">;
const metadata = `b.id::int,b.clinic_id::int AS "clinicId",b.name,b.category,b.brand,b.model,b.specification,
  b.ref_number AS "refNumber",b.lot_number AS "lotNumber",b.expiry_date AS "expiryDate",b.migration_state AS "migrationState",b.version`;
function financial(request: FastifyRequest) { return ["Admin", "Procurement", "Accountant"].includes(request.principal!.role); }
async function access(client: Queryable, request: FastifyRequest, clinicId: number, locked = false) {
  const result = await client.query(`SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
    WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true ${locked ? "FOR SHARE OF uc,c" : ""}`, [request.principal!.userId, clinicId]);
  if (!result.rows.length) throw new DraftError(403, "forbidden", "無權存取此院所庫存");
}
async function balance(client: Queryable, batchId: number, clinicId: number, cost: boolean) {
  const result = await client.query(`SELECT ${metadata},s.on_hand AS "onHand",s.reserved,
    (s.on_hand-s.reserved) AS available,s.version AS "balanceVersion"${cost ? ',s.unit_cost::text AS "unitCost"' : ''}
    FROM inventory_batches b JOIN inventory_balances s ON s.inventory_batch_id=b.id AND s.clinic_id=b.clinic_id
    WHERE b.id=$1 AND b.clinic_id=$2 AND b.migration_state='active'`, [batchId, clinicId]);
  if (!result.rows[0]) throw new DraftError(404, "not_found", "找不到已啟用的中央庫存");
  return result.rows[0];
}
export async function registerInventoryRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/v1/inventory/:id/activate", { preHandler: requireAdmin, bodyLimit: 16 * 1024 }, async (request, reply) => {
    const batchId = draftId(Number(request.params.id), "中央庫存批次"); const input = validateInventoryOpening(request.body);
    const hash = inventoryOpeningHash(batchId, input); const client = await pool.connect();
    try {
      await client.query("BEGIN"); await access(client, request, input.clinicId, true);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`inventory-opening:${request.principal!.userId}:${input.requestId}`]);
      const previous = await client.query<{ batchId: string; hash: string }>(
        `SELECT inventory_batch_id AS "batchId",request_hash AS hash FROM inventory_openings WHERE actor_user_id=$1 AND request_id=$2`,
        [request.principal!.userId, input.requestId],
      );
      if (previous.rows[0]) {
        if (Number(previous.rows[0].batchId) !== batchId || previous.rows[0].hash !== hash) throw new DraftError(409, "request_conflict", "同一盤點請求不可改為其他內容");
        const result = await balance(client, batchId, input.clinicId, true); await client.query("COMMIT"); return { ...result, unchanged: true };
      }
      const result = await client.query<BatchIdentity & { version: number; state: string }>(
        `SELECT name,category,brand,model,specification,ref_number AS "refNumber",lot_number AS "lotNumber",version,migration_state AS state
         FROM inventory_batches WHERE id=$1 AND clinic_id=$2 FOR UPDATE`, [batchId, input.clinicId],
      );
      const batch = result.rows[0];
      if (!batch) throw new DraftError(404, "not_found", "找不到此院所的中央庫存批次");
      if (batch.version !== input.expectedVersion) throw new DraftError(409, "version_conflict", "庫存批次已更新，請重新載入後核對");
      if (batch.state !== "legacy_staged") throw new DraftError(409, "already_active", "庫存已啟用，不可重新設定期初數量");
      await client.query("UPDATE inventory_batches SET migration_state='active',activation_identity=$2 WHERE id=$1", [batchId, inventoryActivationIdentity(batch)]);
      await client.query("INSERT INTO inventory_balances(inventory_batch_id,clinic_id,on_hand,unit_cost) VALUES($1,$2,$3,$4)", [batchId, input.clinicId, input.countedQuantity, input.unitCost]);
      const openingId = randomUUID();
      await client.query(`INSERT INTO inventory_openings(id,inventory_batch_id,clinic_id,counted_quantity,unit_cost,reconciliation_note,actor_user_id,request_id,request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [openingId, batchId, input.clinicId, input.countedQuantity, input.unitCost, input.reconciliationNote, request.principal!.userId, input.requestId, hash]);
      await audit(client, request, "inventory_opening_recorded", "inventory_batch", batchId, { clinicId: input.clinicId, openingId, countedQuantity: input.countedQuantity, previousVersion: input.expectedVersion });
      const stock = await balance(client, batchId, input.clinicId, true); await client.query("COMMIT"); return { ...stock, unchanged: false };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message });
      if ((error as { code?: string; constraint?: string }).code === "23505" && (error as { constraint?: string }).constraint === "inventory_active_identity_unique") {
        return reply.code(409).send({ error: "duplicate_batch", message: "此院所已有相同 REF／LOT 或規格的啟用批次，請先核對來源，不可重複盤點入帳" });
      }
      throw error;
    } finally { client.release(); }
  });
  app.get<{ Params: { id: string }; Querystring: { clinicId?: string } }>("/v1/inventory/:id/sources", { preHandler: requireAdmin }, async (request, reply) => {
    const clinicId = draftId(Number(request.query.clinicId), "院所"); const batchId = draftId(Number(request.params.id), "中央批次");
    try {
      await access(pool, request, clinicId);
      const batch = await pool.query("SELECT 1 FROM inventory_batches WHERE id=$1 AND clinic_id=$2", [batchId, clinicId]);
      if (!batch.rows.length) return reply.code(404).send({ error: "not_found" });
      const result = await pool.query(`SELECT source_id AS "sourceId",legacy_inventory_id::int AS "legacyInventoryId",snapshot,imported_at AS "importedAt"
        FROM legacy_inventory_mappings WHERE inventory_batch_id=$1 AND clinic_id=$2 ORDER BY source_id,legacy_inventory_id`, [batchId, clinicId]);
      await audit(pool, request, "inventory_sources_read", "inventory_batch", batchId, { clinicId }); return { items: result.rows };
    } catch (error) { if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message }); throw error; }
  });
  app.get<{ Querystring: { clinicId?: string; afterId?: string } }>("/v1/inventory/staged", { preHandler: requireAdmin }, async (request, reply) => {
    const clinicId = draftId(Number(request.query.clinicId), "院所"); const afterId = request.query.afterId === undefined ? 0 : draftId(Number(request.query.afterId), "分頁 ID");
    try {
      await access(pool, request, clinicId);
      const rows = await pool.query<{ id: number }>(`SELECT ${metadata} FROM inventory_batches b WHERE b.clinic_id=$1 AND b.id>$2 AND b.migration_state='legacy_staged' ORDER BY b.id LIMIT 100`, [clinicId, afterId]);
      return { items: rows.rows, nextAfterId: rows.rows.length === 100 ? rows.rows.at(-1)!.id : null };
    } catch (error) { if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message }); throw error; }
  });
  app.get<{ Querystring: { clinicId?: string; afterId?: string } }>("/v1/inventory", { preHandler: requireSession }, async (request, reply) => {
    const clinicId = draftId(Number(request.query.clinicId), "院所"); const afterId = request.query.afterId === undefined ? 0 : draftId(Number(request.query.afterId), "分頁 ID");
    try {
      await access(pool, request, clinicId);
      const result = await pool.query<{ id: number }>(`SELECT ${metadata},s.on_hand AS "onHand",s.reserved,(s.on_hand-s.reserved) AS available,
        s.version AS "balanceVersion"${financial(request) ? ',s.unit_cost::text AS "unitCost"' : ''}
        FROM inventory_batches b JOIN inventory_balances s ON s.inventory_batch_id=b.id AND s.clinic_id=b.clinic_id
        WHERE b.clinic_id=$1 AND b.id>$2 AND b.migration_state='active' ORDER BY b.id LIMIT 100`, [clinicId, afterId]);
      return { items: result.rows, nextAfterId: result.rows.length === 100 ? result.rows.at(-1)!.id : null };
    } catch (error) { if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message }); throw error; }
  });
  app.get<{ Params: { id: string }; Querystring: { clinicId?: string } }>("/v1/inventory/:id/opening", { preHandler: requireSession }, async (request, reply) => {
    if (!financial(request)) return reply.code(403).send({ error: "forbidden", message: "無權讀取期初成本及盤點紀錄" });
    const clinicId = draftId(Number(request.query.clinicId), "院所"); const batchId = draftId(Number(request.params.id), "中央庫存批次");
    try {
      await access(pool, request, clinicId);
      const result = await pool.query(`SELECT id,inventory_batch_id::int AS "inventoryBatchId",counted_quantity AS "countedQuantity",
        unit_cost::text AS "unitCost",reconciliation_note AS "reconciliationNote",actor_user_id::int AS "actorUserId",created_at AS "createdAt"
        FROM inventory_openings WHERE inventory_batch_id=$1 AND clinic_id=$2`, [batchId, clinicId]);
      if (!result.rows[0]) return reply.code(404).send({ error: "not_found" });
      await audit(pool, request, "inventory_opening_read", "inventory_batch", batchId, { clinicId }); return result.rows[0];
    } catch (error) { if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message }); throw error; }
  });
}
