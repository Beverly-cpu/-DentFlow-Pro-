import type { FastifyInstance, FastifyRequest } from "fastify";

import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";

type Body = Record<string, unknown>;

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

async function resolveDoctor(pool: DatabasePool, clinicId: number, doctorName: string) {
  if (!doctorName) return null;
  const result = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u JOIN user_clinics uc ON uc.user_id=u.id
     WHERE uc.clinic_id=$1 AND u.role='Doctor' AND u.active=true AND u.display_name=$2
     ORDER BY u.id LIMIT 2`,
    [clinicId, doctorName],
  );
  return result.rows.length === 1 ? Number(result.rows[0]!.id) : null;
}

export async function registerPatientRoutes(app: FastifyInstance, pool: DatabasePool) {
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
