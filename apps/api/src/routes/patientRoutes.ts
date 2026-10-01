import type { FastifyInstance, FastifyRequest } from "fastify";

import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";

type Queryable = Pick<DatabasePool, "query">;

type Body = Record<string, unknown>;

type LegacyPatient = {
  legacyId?: unknown;
  legacyDoctorId?: unknown;
  doctorMatchCount?: unknown;
  clinicCode?: unknown;
  chartNumber?: unknown;
  name?: unknown;
  birthDate?: unknown;
  doctor?: unknown;
  note?: unknown;
};

const patientSelect = `
  SELECT p.id::int, p.clinic_id::int AS "clinicId",
         p.chart_number AS "chartNumber", p.name,
         COALESCE(to_char(p.birth_date, 'YYYY-MM-DD'), '') AS "birthDate",
         ''::text AS phone, p.doctor_name AS doctor, p.note,
         p.created_at AS "createdAt", p.updated_at AS "updatedAt",
         c.code AS "clinicCode", c.name AS "clinicName"
  FROM patients p
  JOIN clinics c ON c.id = p.clinic_id`;

function asId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label}格式錯誤`);
  return id;
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label}不可空白`);
  return text;
}

function optionalText(value: unknown) {
  return String(value ?? "").trim();
}

function birthDate(value: unknown) {
  const text = optionalText(value);
  if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("出生日期格式錯誤");
  return text || null;
}

function assertClinicalRole(request: FastifyRequest) {
  if (!request.principal || !["Admin", "Assistant", "Doctor"].includes(request.principal.role)) {
    throw new Error("無權存取病患資料");
  }
}

async function assertClinicAccess(pool: DatabasePool, request: FastifyRequest, clinicId: number) {
  assertClinicalRole(request);
  const result = await pool.query(
    `SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
     WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true`,
    [request.principal!.userId, clinicId],
  );
  if (result.rowCount !== 1) throw new Error("無權存取此院所病患資料");
}

async function resolveDoctor(pool: Queryable, clinicId: number, doctorName: string) {
  if (!doctorName) return null;
  const result = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u JOIN user_clinics uc ON uc.user_id=u.id
     WHERE uc.clinic_id=$1 AND u.role='Doctor' AND u.active=true AND u.display_name=$2
     ORDER BY u.id LIMIT 2`,
    [clinicId, doctorName],
  );
  return result.rows.length === 1 ? Number(result.rows[0]!.id) : null;
}

async function linkImportedDoctor(client: Queryable, patientId: number, doctorUserId: number | null, doctorName: string) {
  if (doctorUserId === null) return true;
  const result = await client.query<{ doctorUserId: string | null; doctorName: string }>(
    `SELECT doctor_user_id AS "doctorUserId", doctor_name AS "doctorName"
     FROM patients WHERE id=$1 FOR UPDATE`, [patientId],
  );
  const patient = result.rows[0];
  if (!patient) return false;
  if (patient.doctorUserId !== null) return Number(patient.doctorUserId) === doctorUserId;
  // Repair only an unassigned legacy row with the same stored doctor name.
  if (patient.doctorName.trim() !== doctorName) return false;
  await client.query("UPDATE patients SET doctor_user_id=$2 WHERE id=$1", [patientId, doctorUserId]);
  return true;
}

export async function registerPatientRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.post<{ Body: { sourceId?: unknown; patients?: LegacyPatient[] } }>(
    "/v1/migrations/patients/import",
    { preHandler: requireSession },
    async (request) => {
      assertClinicalRole(request);
      if (request.principal!.role === "Doctor") throw new Error("醫師不可執行病患資料匯入");

      const sourceId = requiredText(request.body.sourceId, "來源電腦");
      if (sourceId.length > 200 || sourceId !== request.principal!.deviceId) {
        throw new Error("來源電腦必須與登入裝置相同");
      }
      const patients = request.body.patients;
      if (!Array.isArray(patients)) throw new Error("病患匯入資料格式錯誤");
      if (patients.length > 5_000) throw new Error("單次最多匯入 5000 筆病患資料");

      const summary = { imported: 0, mapped: 0, unchanged: 0, conflicts: [] as Array<{
        legacyId: number; chartNumber: string; reason: string;
      }> };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
        for (const row of patients) {
          const legacyId = asId(row.legacyId, "舊病患 ID");
          const clinicCode = requiredText(row.clinicCode, "院所代碼").toUpperCase();
          const chartNumber = requiredText(row.chartNumber, "病歷號");
          const name = requiredText(row.name, "病患姓名");

          const clinic = await client.query<{ id: string }>(
            `SELECT c.id FROM clinics c JOIN user_clinics uc ON uc.clinic_id=c.id
             WHERE upper(c.code)=$1 AND c.active=true AND uc.user_id=$2`,
            [clinicCode, request.principal!.userId],
          );
          if (!clinic.rows[0]) {
            summary.conflicts.push({ legacyId, chartNumber, reason: `無權存取院所 ${clinicCode}` });
            continue;
          }
          const clinicId = Number(clinic.rows[0].id);
          const doctorName = optionalText(row.doctor);
          let doctorUserId: number | null = null;
          if (doctorName) {
            if (Number(row.doctorMatchCount) !== 1 || row.legacyDoctorId == null) {
              summary.conflicts.push({ legacyId, chartNumber, reason: "舊醫師姓名缺少唯一對照，請先確認醫師資料" });
              continue;
            }
            const doctor = await client.query<{ id: string }>(
              `SELECT u.id FROM legacy_doctor_mappings m
               JOIN users u ON u.id=m.doctor_user_id
               JOIN user_clinics uc ON uc.user_id=u.id AND uc.clinic_id=m.clinic_id
               WHERE m.source_id=$1 AND m.legacy_doctor_id=$2 AND m.clinic_id=$3
                 AND u.active=true AND u.role='Doctor'`,
              [sourceId, asId(row.legacyDoctorId, "舊醫師 ID"), clinicId],
            );
            if (doctor.rows.length !== 1) {
              summary.conflicts.push({ legacyId, chartNumber, reason: "醫師中央帳號對照尚未完成" });
              continue;
            }
            doctorUserId = Number(doctor.rows[0]!.id);
          }
          const mapped = await client.query<{ patientId: string; clinicId: string }>(
            `SELECT patient_id AS "patientId", clinic_id AS "clinicId"
             FROM legacy_patient_mappings WHERE source_id=$1 AND legacy_patient_id=$2`,
            [sourceId, legacyId],
          );
          if (mapped.rows[0]) {
            if (Number(mapped.rows[0].clinicId) !== clinicId) {
              summary.conflicts.push({ legacyId, chartNumber, reason: "舊 ID 已對應至其他院所" });
            } else {
              const linked = await linkImportedDoctor(client, Number(mapped.rows[0].patientId), doctorUserId, doctorName);
              if (!linked) summary.conflicts.push({ legacyId, chartNumber, reason: "中央病患已連結其他醫師" });
              else summary.unchanged += 1;
            }
            continue;
          }

          const existing = await client.query<{ id: string; clinicId: string }>(
            `SELECT id, clinic_id AS "clinicId" FROM patients WHERE chart_number=$1 LIMIT 1`,
            [chartNumber],
          );
          let patientId: number;
          if (existing.rows[0]) {
            if (Number(existing.rows[0].clinicId) !== clinicId) {
              summary.conflicts.push({ legacyId, chartNumber, reason: "病歷號已屬於其他院所" });
              continue;
            }
            patientId = Number(existing.rows[0].id);
            if (!await linkImportedDoctor(client, patientId, doctorUserId, doctorName)) {
              summary.conflicts.push({ legacyId, chartNumber, reason: "中央病患已連結其他醫師" });
              continue;
            }
            summary.mapped += 1;
          } else {
            const inserted = await client.query<{ id: string }>(
              `INSERT INTO patients
                (clinic_id,chart_number,name,birth_date,doctor_user_id,doctor_name,note)
               VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
              [clinicId, chartNumber, name, birthDate(row.birthDate),
                doctorUserId, doctorName, optionalText(row.note)],
            );
            patientId = Number(inserted.rows[0]!.id);
            summary.imported += 1;
          }
          await client.query(
            `INSERT INTO legacy_patient_mappings
              (source_id,legacy_patient_id,patient_id,clinic_id,imported_by_user_id)
             VALUES ($1,$2,$3,$4,$5)`,
            [sourceId, legacyId, patientId, clinicId, request.principal!.userId],
          );
        }
        await audit(client, request, "legacy_patients_imported", "patient_import", sourceId, {
          imported: summary.imported, mapped: summary.mapped,
          unchanged: summary.unchanged, conflicts: summary.conflicts.length,
        });
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

  app.get<{ Querystring: { clinicId?: string } }>("/v1/patients", { preHandler: requireSession }, async (request) => {
    const clinicId = asId(request.query.clinicId, "院所");
    await assertClinicAccess(pool, request, clinicId);
    const doctorClause = request.principal!.role === "Doctor" ? "AND p.doctor_user_id=$2" : "";
    const params = request.principal!.role === "Doctor"
      ? [clinicId, request.principal!.userId]
      : [clinicId];
    const result = await pool.query(
      `${patientSelect} WHERE p.clinic_id=$1 AND p.active=true ${doctorClause}
       ORDER BY p.name, p.id`,
      params,
    );
    return result.rows;
  });

  app.get<{ Params: { id: string }; Querystring: { clinicId?: string } }>(
    "/v1/patients/:id",
    { preHandler: requireSession },
    async (request, reply) => {
      const clinicId = asId(request.query.clinicId, "院所");
      const patientId = asId(request.params.id, "病患");
      await assertClinicAccess(pool, request, clinicId);
      const doctorClause = request.principal!.role === "Doctor" ? "AND p.doctor_user_id=$3" : "";
      const params = request.principal!.role === "Doctor"
        ? [patientId, clinicId, request.principal!.userId]
        : [patientId, clinicId];
      const result = await pool.query(
        `${patientSelect} WHERE p.id=$1 AND p.clinic_id=$2 AND p.active=true ${doctorClause}`,
        params,
      );
      return result.rows[0] ?? reply.code(404).send({ error: "not_found", message: "找不到病患資料" });
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/v1/patients/by-doctor-user/:userId",
    { preHandler: requireSession },
    async (request) => {
      assertClinicalRole(request);
      const userId = asId(request.params.userId, "醫師");
      if (request.principal!.role === "Doctor" && request.principal!.userId !== userId) {
        throw new Error("醫師只能查看自己的病患");
      }
      const result = await pool.query(
        `${patientSelect}
         JOIN user_clinics doctor_uc ON doctor_uc.clinic_id=p.clinic_id AND doctor_uc.user_id=$1
         JOIN user_clinics actor_uc ON actor_uc.clinic_id=p.clinic_id AND actor_uc.user_id=$2
         WHERE p.doctor_user_id=$1 AND p.active=true
         ORDER BY p.name, p.id`,
        [userId, request.principal!.userId],
      );
      return result.rows;
    },
  );

  app.post<{ Body: Body }>("/v1/patients", { preHandler: requireSession }, async (request) => {
    const clinicId = asId(request.body.clinicId, "院所");
    await assertClinicAccess(pool, request, clinicId);
    if (request.principal!.role === "Doctor") throw new Error("醫師不可新增病患資料");
    const chartNumber = requiredText(request.body.chartNumber, "病歷號");
    const name = requiredText(request.body.name, "病患姓名");
    const doctorName = optionalText(request.body.doctor);
    const doctorUserId = await resolveDoctor(pool, clinicId, doctorName);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO patients (clinic_id,chart_number,name,birth_date,doctor_user_id,doctor_name,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [clinicId, chartNumber, name, birthDate(request.body.birthDate), doctorUserId, doctorName,
        optionalText(request.body.note)],
    );
    const id = Number(result.rows[0]!.id);
    await audit(pool, request, "patient_created", "patient", id, { clinicId, chartNumber });
    const row = await pool.query(`${patientSelect} WHERE p.id=$1`, [id]);
    return row.rows[0];
  });

  app.put<{ Params: { id: string }; Body: Body }>(
    "/v1/patients/:id",
    { preHandler: requireSession },
    async (request) => {
      const id = asId(request.params.id, "病患");
      const clinicId = asId(request.body.clinicId, "院所");
      await assertClinicAccess(pool, request, clinicId);
      if (request.principal!.role === "Doctor") throw new Error("醫師不可編輯病患資料");
      const doctorName = optionalText(request.body.doctor);
      const result = await pool.query(
        `UPDATE patients SET chart_number=$3,name=$4,birth_date=$5,doctor_user_id=$6,doctor_name=$7,note=$8
         WHERE id=$1 AND clinic_id=$2 AND active=true`,
        [id, clinicId, requiredText(request.body.chartNumber, "病歷號"),
          requiredText(request.body.name, "病患姓名"), birthDate(request.body.birthDate),
          await resolveDoctor(pool, clinicId, doctorName), doctorName, optionalText(request.body.note)],
      );
      if (result.rowCount !== 1) throw new Error("找不到目前院所的病患資料");
      await audit(pool, request, "patient_updated", "patient", id, { clinicId });
      const row = await pool.query(`${patientSelect} WHERE p.id=$1`, [id]);
      return row.rows[0];
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { clinicId?: string } }>(
    "/v1/patients/:id",
    { preHandler: requireSession },
    async (request) => {
      const id = asId(request.params.id, "病患");
      const clinicId = asId(request.query.clinicId, "院所");
      await assertClinicAccess(pool, request, clinicId);
      if (request.principal!.role === "Doctor") throw new Error("醫師不可刪除病患資料");
      const result = await pool.query(
        "UPDATE patients SET active=false WHERE id=$1 AND clinic_id=$2 AND active=true",
        [id, clinicId],
      );
      if (result.rowCount !== 1) throw new Error("找不到目前院所的病患資料");
      await audit(pool, request, "patient_archived", "patient", id, { clinicId });
      return true;
    },
  );
}
