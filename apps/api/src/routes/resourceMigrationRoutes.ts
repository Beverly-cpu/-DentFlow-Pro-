import type { FastifyInstance, FastifyRequest } from "fastify";

import { audit, isRole, normalizeAccount, requireAdmin } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { positiveId } from "../legacyImplant.js";
import type { ImplantSnapshot } from "../legacyImplant.js";
import { collectLegacyImplantReferences, inventorySnapshotHash, validateLegacyInventory } from "../legacyResources.js";

function sourceIdFor(request: FastifyRequest, value: unknown) {
  if (typeof value !== "string" || !value || value.length > 200 || value !== request.principal!.deviceId) {
    throw new Error("來源電腦必須與登入裝置相同");
  }
  return value;
}
async function clinicFor(pool: Pick<DatabasePool, "query">, request: FastifyRequest, code: string) {
  const result = await pool.query<{ id: string }>(
    `SELECT c.id FROM clinics c JOIN user_clinics uc ON uc.clinic_id=c.id
     WHERE upper(c.code)=$1 AND c.active=true AND uc.user_id=$2`, [code, request.principal!.userId],
  );
  return result.rows.length === 1 ? Number(result.rows[0]!.id) : null;
}

export async function registerResourceMigrationRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.post<{ Body: { sourceId?: unknown; inventory?: unknown[] } }>(
    "/v1/migrations/inventory/import", { preHandler: requireAdmin }, async (request) => {
      const sourceId = sourceIdFor(request, request.body.sourceId);
      const rows = request.body.inventory;
      if (!Array.isArray(rows) || rows.length > 100) throw new Error("每批最多 100 筆庫存");
      const summary = { imported: 0, unchanged: 0, conflicts: [] as Array<{ index: number; reason: string }> };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
        for (const [index, raw] of rows.entries()) {
          let row;
          try { row = validateLegacyInventory(raw); }
          catch (error) { summary.conflicts.push({ index, reason: error instanceof Error ? error.message : "庫存資料格式錯誤" }); continue; }
          const clinicId = await clinicFor(client, request, row.clinicCode);
          if (clinicId === null) { summary.conflicts.push({ index, reason: "無權存取來源院所" }); continue; }
          const hash = inventorySnapshotHash(row);
          const existing = await client.query<{ clinicId: string; hash: string }>(
            `SELECT clinic_id AS "clinicId",snapshot_hash AS hash FROM legacy_inventory_mappings
             WHERE source_id=$1 AND legacy_inventory_id=$2`, [sourceId, row.legacyId],
          );
          if (existing.rows[0]) {
            if (Number(existing.rows[0].clinicId) !== clinicId || existing.rows[0].hash !== hash) {
              summary.conflicts.push({ index, reason: "已匯入庫存的院所或快照已改變，禁止覆寫" });
            } else summary.unchanged += 1;
            continue;
          }
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO inventory_batches (clinic_id,name,category,brand,model,specification,ref_number,lot_number,expiry_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [clinicId, row.name, row.category, row.brand, row.model, row.specification, row.refNumber, row.lotNumber, row.expiryDate],
          );
          await client.query(
            `INSERT INTO legacy_inventory_mappings
             (source_id,legacy_inventory_id,clinic_id,inventory_batch_id,snapshot_hash,snapshot,imported_by_user_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [sourceId, row.legacyId, clinicId, Number(inserted.rows[0]!.id), hash, JSON.stringify(row), request.principal!.userId],
          );
          summary.imported += 1;
        }
        await audit(client, request, "legacy_inventory_imported", "inventory_import", sourceId, {
          imported: summary.imported, unchanged: summary.unchanged, conflicts: summary.conflicts.length,
        });
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      return summary;
    },
  );

  app.post<{ Body: { sourceId?: unknown; users?: unknown[] } }>(
    "/v1/migrations/users/import", { preHandler: requireAdmin }, async (request) => {
      const sourceId = sourceIdFor(request, request.body.sourceId);
      const rows = request.body.users;
      if (!Array.isArray(rows) || rows.length > 500) throw new Error("每批最多 500 筆操作者對照");
      const summary = { mapped: 0, unchanged: 0, conflicts: [] as Array<{ index: number; reason: string }> };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
        for (const [index, raw] of rows.entries()) {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            summary.conflicts.push({ index, reason: "操作者資料格式錯誤" }); continue;
          }
          const row = raw as Record<string, unknown>;
          let legacyId;
          try { legacyId = positiveId(row.legacyId, "舊操作者 ID"); }
          catch { summary.conflicts.push({ index, reason: "舊操作者 ID 格式錯誤" }); continue; }
          const account = typeof row.account === "string" ? normalizeAccount(row.account) : "";
          const clinicCode = typeof row.clinicCode === "string" ? row.clinicCode.trim().toUpperCase() : "";
          if (!account || account.length > 200 || !clinicCode || clinicCode.length > 200 || !isRole(row.role)) {
            summary.conflicts.push({ index, reason: "帳號、角色或院所格式錯誤" }); continue;
          }
          const clinicId = await clinicFor(client, request, clinicCode);
          if (clinicId === null) { summary.conflicts.push({ index, reason: "無權存取來源院所" }); continue; }
          // Inactive accounts can identify historic actors; this grants no login or membership.
          const target = await client.query<{ id: string }>(
            `SELECT u.id FROM users u JOIN user_clinics uc ON uc.user_id=u.id
             WHERE lower(u.account)=$1 AND u.role=$2 AND uc.clinic_id=$3`, [account, row.role, clinicId],
          );
          if (target.rows.length !== 1) {
            summary.conflicts.push({ index, reason: "中央帳號不存在、角色不同或缺少院所關係" }); continue;
          }
          const userId = Number(target.rows[0]!.id);
          const existing = await client.query<{ userId: string; account: string; role: string }>(
            `SELECT user_id AS "userId",source_account AS account,source_role AS role FROM legacy_user_mappings
             WHERE source_id=$1 AND legacy_user_id=$2 AND clinic_id=$3`, [sourceId, legacyId, clinicId],
          );
          if (existing.rows[0]) {
            const mapped = existing.rows[0];
            if (Number(mapped.userId) !== userId || mapped.account !== account || mapped.role !== row.role) {
              summary.conflicts.push({ index, reason: "舊操作者 ID 的身分已改變，禁止覆寫" });
            } else summary.unchanged += 1;
            continue;
          }
          const incompatible = await client.query(
            `SELECT 1 FROM legacy_user_mappings WHERE source_id=$1 AND legacy_user_id=$2 AND user_id<>$3 LIMIT 1`,
            [sourceId, legacyId, userId],
          );
          if (incompatible.rowCount) {
            summary.conflicts.push({ index, reason: "同一舊操作者已於其他院所對應不同帳號" }); continue;
          }
          await client.query(
            `INSERT INTO legacy_user_mappings
             (source_id,legacy_user_id,clinic_id,user_id,source_account,source_role,imported_by_user_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [sourceId, legacyId, clinicId, userId, account, row.role, request.principal!.userId],
          );
          summary.mapped += 1;
        }
        await audit(client, request, "legacy_users_mapped", "user_import", sourceId, {
          mapped: summary.mapped, unchanged: summary.unchanged, conflicts: summary.conflicts.length,
        });
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      return summary;
    },
  );

  app.post<{ Body: { sourceId?: unknown; afterId?: unknown } }>(
    "/v1/migrations/implants/resolve-references", { preHandler: requireAdmin }, async (request) => {
      const sourceId = sourceIdFor(request, request.body.sourceId);
      const afterId = request.body.afterId == null ? 0 : positiveId(request.body.afterId, "分頁 ID");
      const summary = { processed: 0, inventoryRefs: 0, userRefs: 0, missingInventory: 0, missingUsers: 0,
        nextAfterId: null as number | null, conflicts: [] as Array<{ caseId: number; reason: string }> };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
        const cases = await client.query<{ id: string; clinicId: string; snapshot: ImplantSnapshot }>(
          `SELECT m.implant_case_id AS id,m.clinic_id AS "clinicId",s.snapshot
           FROM legacy_implant_mappings m JOIN legacy_implant_snapshots s ON s.implant_case_id=m.implant_case_id
           JOIN clinics c ON c.id=m.clinic_id AND c.active=true
           JOIN user_clinics uc ON uc.clinic_id=m.clinic_id AND uc.user_id=$3
           WHERE m.source_id=$1 AND m.implant_case_id>$2 ORDER BY m.implant_case_id LIMIT 50`,
          [sourceId, afterId, request.principal!.userId],
        );
        for (const row of cases.rows) {
          const id = Number(row.id); const clinicId = Number(row.clinicId);
          let references;
          try { references = collectLegacyImplantReferences(row.snapshot); }
          catch (error) {
            summary.conflicts.push({ caseId: id, reason: error instanceof Error ? error.message : "舊關聯格式錯誤" }); continue;
          }
          let missingInventory = 0; let missingUsers = 0;
          for (const legacyId of references.inventory) {
            const mapping = await client.query<{ id: string }>(
              `SELECT inventory_batch_id AS id FROM legacy_inventory_mappings
               WHERE source_id=$1 AND legacy_inventory_id=$2 AND clinic_id=$3`, [sourceId, legacyId, clinicId],
            );
            if (!mapping.rows[0]) { missingInventory += 1; continue; }
            await client.query(
              `INSERT INTO legacy_implant_inventory_links (implant_case_id,source_id,clinic_id,legacy_inventory_id,inventory_batch_id)
               VALUES ($1,$2,$3,$4,$5) ON CONFLICT (implant_case_id,legacy_inventory_id) DO NOTHING`,
              [id, sourceId, clinicId, legacyId, Number(mapping.rows[0].id)],
            );
            summary.inventoryRefs += 1;
          }
          for (const legacyId of references.users) {
            const mapping = await client.query<{ id: string }>(
              `SELECT user_id AS id FROM legacy_user_mappings
               WHERE source_id=$1 AND legacy_user_id=$2 AND clinic_id=$3`, [sourceId, legacyId, clinicId],
            );
            if (!mapping.rows[0]) { missingUsers += 1; continue; }
            await client.query(
              `INSERT INTO legacy_implant_user_links (implant_case_id,source_id,clinic_id,legacy_user_id,user_id)
               VALUES ($1,$2,$3,$4,$5) ON CONFLICT (implant_case_id,legacy_user_id) DO NOTHING`,
              [id, sourceId, clinicId, legacyId, Number(mapping.rows[0].id)],
            );
            summary.userRefs += 1;
          }
          await client.query(
            `UPDATE legacy_implant_snapshots SET pending_inventory_refs=$2,pending_user_refs=$3 WHERE implant_case_id=$1`,
            [id, missingInventory, missingUsers],
          );
          summary.processed += 1; summary.missingInventory += missingInventory; summary.missingUsers += missingUsers;
        }
        if (cases.rows.length === 50) summary.nextAfterId = Number(cases.rows.at(-1)!.id);
        await audit(client, request, "legacy_implant_references_resolved", "implant_import", sourceId, {
          processed: summary.processed, inventoryRefs: summary.inventoryRefs, userRefs: summary.userRefs,
          missingInventory: summary.missingInventory, missingUsers: summary.missingUsers, conflicts: summary.conflicts.length,
        });
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      return summary;
    },
  );

  app.get<{ Querystring: { clinicId?: string; afterId?: string } }>(
    "/v1/migrations/inventory", { preHandler: requireAdmin }, async (request) => {
      const clinicId = positiveId(Number(request.query.clinicId), "院所 ID");
      const afterId = request.query.afterId === undefined ? 0 : positiveId(Number(request.query.afterId), "分頁 ID");
      const result = await pool.query(
        `SELECT b.id::int,b.migration_state AS "migrationState",m.source_id AS "sourceId",
          m.legacy_inventory_id AS "legacyInventoryId",m.snapshot
         FROM inventory_batches b JOIN legacy_inventory_mappings m ON m.inventory_batch_id=b.id
         JOIN clinics c ON c.id=b.clinic_id AND c.active=true
         JOIN user_clinics uc ON uc.clinic_id=b.clinic_id AND uc.user_id=$3
         WHERE b.clinic_id=$1 AND b.id>$2 ORDER BY b.id LIMIT 100`, [clinicId, afterId, request.principal!.userId],
      );
      return { items: result.rows, nextAfterId: result.rows.length === 100 ? result.rows.at(-1)!.id : null };
    },
  );
}
