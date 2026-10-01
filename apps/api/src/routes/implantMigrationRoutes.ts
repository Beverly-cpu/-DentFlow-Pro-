import type { FastifyInstance, FastifyRequest } from "fastify";

import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { implantSnapshotHash, positiveId, validateLegacyImplant } from "../legacyImplant.js";

function assertMigrationRole(request: FastifyRequest) {
  if (!request.principal || !["Admin", "Assistant"].includes(request.principal.role)) {
    throw new Error("無權存取植體遷移資料");
  }
}

export async function registerImplantMigrationRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.post<{ Body: { sourceId?: unknown; implants?: unknown[] } }>(
    "/v1/migrations/implants/import", { preHandler: requireSession }, async (request) => {
      assertMigrationRole(request);
      const principal = request.principal!;
      const sourceId = request.body.sourceId;
      if (typeof sourceId !== "string" || !sourceId || sourceId.length > 200 || sourceId !== principal.deviceId) {
        throw new Error("來源電腦必須與登入裝置相同");
      }
      const implants = request.body.implants;
      if (!Array.isArray(implants) || implants.length > 50) throw new Error("每批最多 50 筆植體個案");
      const summary = { imported: 0, unchanged: 0, pendingAssets: 0, conflicts: [] as Array<{
        index: number; reason: string;
      }> };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
        for (const [index, raw] of implants.entries()) {
          let payload;
          try { payload = validateLegacyImplant(raw); }
          catch (error) {
            summary.conflicts.push({ index, reason: error instanceof Error ? error.message : "個案資料格式錯誤" });
            continue;
          }
          const legacy = payload.snapshot.case;
          const legacyId = positiveId(legacy.id, "舊個案 ID");
          const clinic = await client.query<{ id: string }>(
            `SELECT c.id FROM clinics c JOIN user_clinics uc ON uc.clinic_id=c.id
             WHERE upper(c.code)=$1 AND c.active=true AND uc.user_id=$2`,
            [payload.clinicCode, principal.userId],
          );
          if (clinic.rows.length !== 1) {
            summary.conflicts.push({ index, reason: "無權存取來源院所" }); continue;
          }
          const clinicId = Number(clinic.rows[0]!.id);
          const hash = implantSnapshotHash(payload);
          const existing = await client.query<{ clinicId: string; hash: string; pendingAssets: number }>(
            `SELECT m.clinic_id AS "clinicId", m.snapshot_hash AS hash, s.pending_asset_count AS "pendingAssets"
             FROM legacy_implant_mappings m JOIN legacy_implant_snapshots s ON s.implant_case_id=m.implant_case_id
             WHERE m.source_id=$1 AND m.legacy_implant_id=$2`, [sourceId, legacyId],
          );
          if (existing.rows[0]) {
            if (Number(existing.rows[0].clinicId) !== clinicId || existing.rows[0].hash !== hash) {
              summary.conflicts.push({ index, reason: "已匯入個案的院所或內容已改變，禁止覆寫" });
            } else {
              summary.unchanged += 1;
              summary.pendingAssets += existing.rows[0].pendingAssets;
            }
            continue;
          }
          const patient = await client.query<{ id: string }>(
            `SELECT p.id FROM legacy_patient_mappings m JOIN patients p ON p.id=m.patient_id
             WHERE m.source_id=$1 AND m.legacy_patient_id=$2 AND m.clinic_id=$3 AND p.clinic_id=$3`,
            [sourceId, legacy.patientId, clinicId],
          );
          if (patient.rows.length !== 1) {
            summary.conflicts.push({ index, reason: "病患中央對照尚未完成或院所不一致" }); continue;
          }
          let doctorUserId: number | null = null;
          if (legacy.doctorId !== null) {
            const doctor = await client.query<{ id: string }>(
              `SELECT u.id FROM legacy_doctor_mappings m JOIN users u ON u.id=m.doctor_user_id
               JOIN user_clinics uc ON uc.user_id=u.id AND uc.clinic_id=m.clinic_id
               WHERE m.source_id=$1 AND m.legacy_doctor_id=$2 AND m.clinic_id=$3
                 AND u.active=true AND u.role='Doctor'`, [sourceId, legacy.doctorId, clinicId],
            );
            if (doctor.rows.length !== 1) {
              summary.conflicts.push({ index, reason: "醫師中央對照尚未完成或缺少院所授權" }); continue;
            }
            doctorUserId = Number(doctor.rows[0]!.id);
          }
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO implant_cases (clinic_id,patient_id,doctor_user_id,implant_date,note,status)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [clinicId, Number(patient.rows[0]!.id), doctorUserId, legacy.implantDate, legacy.note, legacy.status],
          );
          const id = Number(inserted.rows[0]!.id);
          await client.query(
            `INSERT INTO legacy_implant_mappings
             (source_id,legacy_implant_id,implant_case_id,clinic_id,snapshot_hash,imported_by_user_id)
             VALUES ($1,$2,$3,$4,$5,$6)`, [sourceId, legacyId, id, clinicId, hash, principal.userId],
          );
          await client.query(
            `INSERT INTO legacy_implant_snapshots (implant_case_id,snapshot,assets,pending_asset_count)
             VALUES ($1,$2,$3,$4)`, [id, JSON.stringify(payload.snapshot), JSON.stringify(payload.assets), payload.assets.length],
          );
          summary.imported += 1;
          summary.pendingAssets += payload.assets.length;
        }
        await audit(client, request, "legacy_implants_imported", "implant_import", sourceId, {
          imported: summary.imported, unchanged: summary.unchanged, conflicts: summary.conflicts.length,
          pendingAssets: summary.pendingAssets,
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK"); throw error;
      } finally { client.release(); }
      return summary;
    },
  );

  // Migration review only; snapshots contain source-scoped IDs, not operational IDs.
  app.get<{ Querystring: { clinicId?: string; afterId?: string } }>(
    "/v1/migrations/implants", { preHandler: requireSession }, async (request) => {
      assertMigrationRole(request);
      const clinicId = positiveId(Number(request.query.clinicId), "院所 ID");
      const afterId = request.query.afterId === undefined ? 0 : positiveId(Number(request.query.afterId), "分頁 ID");
      const access = await pool.query(
        `SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
         WHERE uc.user_id=$1 AND c.id=$2 AND c.active=true`, [request.principal!.userId, clinicId],
      );
      if (access.rowCount !== 1) throw new Error("無權存取此院所遷移資料");
      const result = await pool.query(
        `SELECT i.id::int, i.patient_id::int AS "patientId", i.doctor_user_id::int AS "doctorUserId",
          i.status,i.implant_date AS "implantDate",i.migration_state AS "migrationState",
          m.source_id AS "sourceId", m.legacy_implant_id AS "legacyImplantId",
          s.pending_asset_count AS "pendingAssets"
         FROM implant_cases i JOIN legacy_implant_mappings m ON m.implant_case_id=i.id
         JOIN legacy_implant_snapshots s ON s.implant_case_id=i.id
         WHERE i.clinic_id=$1 AND i.id>$2 ORDER BY i.id LIMIT 100`, [clinicId, afterId],
      );
      return { items: result.rows, nextAfterId: result.rows.length === 100 ? result.rows.at(-1)!.id : null };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { clinicId?: string } }>(
    "/v1/migrations/implants/:id", { preHandler: requireSession }, async (request, reply) => {
      assertMigrationRole(request);
      const clinicId = positiveId(Number(request.query.clinicId), "院所 ID");
      const id = positiveId(Number(request.params.id), "中央個案 ID");
      const result = await pool.query(
        `SELECT i.id::int, i.clinic_id::int AS "clinicId", i.patient_id::int AS "patientId",
          i.doctor_user_id::int AS "doctorUserId", i.implant_date AS "implantDate",i.status,i.note,
          i.migration_state AS "migrationState",m.source_id AS "sourceId",
          m.legacy_implant_id AS "legacyImplantId",m.snapshot_hash AS "snapshotHash",
          s.snapshot AS "legacySnapshot",s.assets,s.pending_asset_count AS "pendingAssets"
         FROM implant_cases i JOIN clinics c ON c.id=i.clinic_id AND c.active=true
         JOIN user_clinics uc ON uc.clinic_id=i.clinic_id AND uc.user_id=$3
         JOIN legacy_implant_mappings m ON m.implant_case_id=i.id
         JOIN legacy_implant_snapshots s ON s.implant_case_id=i.id
         WHERE i.id=$1 AND i.clinic_id=$2`, [id, clinicId, request.principal!.userId],
      );
      return result.rows[0] ?? reply.code(404).send({ error: "not_found", message: "找不到可存取的遷移個案" });
    },
  );
}
