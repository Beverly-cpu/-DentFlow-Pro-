import type { FastifyInstance } from "fastify";

import { normalizeAccount, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";

type LegacyDoctor = { legacyId?: unknown; clinicCode?: unknown; account?: unknown };

export async function registerDoctorMigrationRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.post<{ Body: { sourceId?: unknown; doctors?: LegacyDoctor[] } }>(
    "/v1/migrations/doctors/import", { preHandler: requireSession },
    async (request, reply) => {
      const principal = request.principal!;
      if (!["Admin", "Assistant"].includes(principal.role)) {
        return reply.code(403).send({ error: "forbidden", message: "無權執行醫師對照匯入" });
      }
      const sourceId = request.body.sourceId;
      if (typeof sourceId !== "string" || !sourceId || sourceId.length > 200 || sourceId !== principal.deviceId) {
        throw new Error("來源電腦必須與登入裝置相同");
      }
      const doctors = request.body.doctors;
      if (!Array.isArray(doctors) || doctors.length > 500) throw new Error("每批最多 500 筆醫師對照");
      const summary = { mapped: 0, unchanged: 0, conflicts: [] as Array<{
        legacyId: number; clinicCode: string; reason: string;
      }> };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize repeated uploads from this device; never overwrite an established identity.
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
        for (const row of doctors) {
          const legacyId = Number(row.legacyId);
          const clinicCode = String(row.clinicCode ?? "").trim().toUpperCase();
          const account = normalizeAccount(row.account);
          if (!Number.isSafeInteger(legacyId) || legacyId <= 0 || !clinicCode || !account) {
            throw new Error("醫師對照資料格式錯誤");
          }
          const target = await client.query<{ clinicId: string; userId: string }>(
            `SELECT c.id AS "clinicId", u.id AS "userId"
             FROM clinics c
             JOIN user_clinics actor ON actor.clinic_id=c.id AND actor.user_id=$1
             JOIN user_clinics doctor ON doctor.clinic_id=c.id
             JOIN users u ON u.id=doctor.user_id
             WHERE upper(c.code)=$2 AND c.active=true
               AND lower(u.account)=$3 AND u.role='Doctor' AND u.active=true`,
            [principal.userId, clinicCode, account],
          );
          if (target.rows.length !== 1) {
            summary.conflicts.push({ legacyId, clinicCode, reason: "中央醫師帳號不存在、未啟用或缺少院所授權" });
            continue;
          }
          const { clinicId, userId } = target.rows[0]!;
          const existing = await client.query<{ userId: string }>(
            `SELECT doctor_user_id AS "userId" FROM legacy_doctor_mappings
             WHERE source_id=$1 AND legacy_doctor_id=$2 AND clinic_id=$3`,
            [sourceId, legacyId, clinicId],
          );
          if (existing.rows[0]) {
            if (existing.rows[0].userId !== userId) {
              summary.conflicts.push({ legacyId, clinicCode, reason: "舊醫師 ID 已對應其他中央帳號" });
            } else summary.unchanged += 1;
            continue;
          }
          // A multi-clinic legacy doctor must resolve to the same central account everywhere.
          const incompatible = await client.query(
            `SELECT 1 FROM legacy_doctor_mappings
             WHERE source_id=$1 AND legacy_doctor_id=$2 AND doctor_user_id<>$3 LIMIT 1`,
            [sourceId, legacyId, userId],
          );
          if (incompatible.rowCount) {
            summary.conflicts.push({ legacyId, clinicCode, reason: "同一舊醫師於其他院所已對應不同帳號" });
            continue;
          }
          await client.query(
            `INSERT INTO legacy_doctor_mappings
             (source_id,legacy_doctor_id,clinic_id,doctor_user_id,imported_by_user_id)
             VALUES ($1,$2,$3,$4,$5)`,
            [sourceId, legacyId, clinicId, userId, principal.userId],
          );
          summary.mapped += 1;
        }
        // Audit and mappings commit together, including batches containing only conflicts.
        await client.query(
          `INSERT INTO audit_events
           (actor_user_id,clinic_id,session_id,device_id,request_id,event_type,entity_type,entity_id,ip,metadata)
           VALUES ($1,$2,$3,$4,$5,'legacy_doctors_mapped','doctor_import',$4,$6,$7)`,
          [principal.userId, principal.clinicId, principal.sessionId, sourceId, request.id, request.ip,
            JSON.stringify({ mapped: summary.mapped, unchanged: summary.unchanged, conflicts: summary.conflicts.length })],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return summary;
    },
  );
}
