import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";

type Queryable = Pick<DatabasePool, "query">;
type Body = Record<string, unknown>;
class WriteError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function id(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new WriteError(400, "invalid_input", `${label}格式錯誤`);
  return value;
}
function text(value: unknown, label: string, maximum: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new WriteError(400, "invalid_input", `${label}格式錯誤`);
  const result = value.trim();
  if ((required && !result) || Buffer.byteLength(result, "utf8") > maximum) throw new WriteError(400, "invalid_input", `${label}不可空白或超過長度上限`);
  return result;
}
function date(value: unknown) {
  const result = text(value, "出生日期", 10);
  if (!result) return null;
  const parsed = new Date(`${result}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new WriteError(400, "invalid_input", "出生日期格式錯誤");
  }
  return result;
}
const select = `SELECT id::int,clinic_id::int AS "clinicId",chart_number AS "chartNumber",name,
  COALESCE(to_char(birth_date,'YYYY-MM-DD'),'') AS "birthDate",''::text AS phone,
  doctor_user_id::int AS "doctorUserId",doctor_name AS doctor,note,version,
  created_at AS "createdAt",updated_at AS "updatedAt",
  (SELECT code FROM clinics WHERE id=patients.clinic_id) AS "clinicCode",
  (SELECT name FROM clinics WHERE id=patients.clinic_id) AS "clinicName" FROM patients`;

async function doctor(client: Queryable, clinicId: number, body: Body) {
  const name = text(body.doctor, "醫師姓名", 200);
  if (body.doctorUserId === null) {
    if (name) throw new WriteError(400, "invalid_doctor", "未指定醫師時姓名必須留空");
    return { userId: null, name: "" };
  }
  if (body.doctorUserId === undefined && !name) return { userId: null, name: "" };
  const byId = body.doctorUserId !== undefined;
  const result = await client.query<{ id: string; name: string }>(
    `SELECT u.id,u.display_name AS name FROM users u JOIN user_clinics uc ON uc.user_id=u.id
     WHERE uc.clinic_id=$1 AND u.role='Doctor' AND u.active=true
       AND ${byId ? "u.id=$2" : "u.display_name=$2"} ORDER BY u.id LIMIT 2 FOR SHARE OF u,uc`,
    [clinicId, byId ? id(body.doctorUserId, "醫師帳號 ID") : name],
  );
  if (result.rows.length !== 1) throw new WriteError(400, "invalid_doctor", "醫師必須唯一對應啟用中且具有院所權限的中央帳號");
  return { userId: Number(result.rows[0]!.id), name: result.rows[0]!.name };
}

async function write(pool: DatabasePool, request: FastifyRequest, reply: FastifyReply, clinicId: number,
  operation: (client: Queryable) => Promise<unknown>) {
  const principal = request.principal!;
  if (!["Admin", "Assistant"].includes(principal.role)) return reply.code(403).send({ error: "forbidden", message: "無權修改病患資料" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock permission rows throughout the mutation, so concurrent revocation is ordered.
    const access = await client.query(
      `SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
       WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true FOR SHARE OF uc,c`, [principal.userId, clinicId],
    );
    if (!access.rows.length) throw new WriteError(403, "forbidden", "無權存取此院所病患資料");
    const result = await operation(client);
    await client.query("COMMIT"); return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof WriteError) return reply.code(error.status).send({ error: error.code, message: error.message });
    if ((error as { code?: string; constraint?: string }).code === "23505"
      && (error as { constraint?: string }).constraint === "patients_chart_number_unique") {
      return reply.code(409).send({ error: "chart_number_conflict", message: "病歷號已存在，請確認後重試" });
    }
    throw error;
  } finally { client.release(); }
}

export async function registerPatientWriteRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.post<{ Body: Body }>("/v1/patients", { preHandler: requireSession }, async (request, reply) => {
    const clinicId = id(request.body.clinicId, "院所");
    return write(pool, request, reply, clinicId, async (client) => {
      const assigned = await doctor(client, clinicId, request.body);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO patients(clinic_id,chart_number,name,birth_date,doctor_user_id,doctor_name,note)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [clinicId, text(request.body.chartNumber, "病歷號", 100, true), text(request.body.name, "姓名", 200, true),
          date(request.body.birthDate), assigned.userId, assigned.name, text(request.body.note, "備註", 16_384)],
      );
      const patientId = Number(inserted.rows[0]!.id);
      await audit(client, request, "patient_created", "patient", patientId, { clinicId, version: 1 });
      return (await client.query(`${select} WHERE id=$1`, [patientId])).rows[0];
    });
  });
  app.put<{ Params: { id: string }; Body: Body }>("/v1/patients/:id", { preHandler: requireSession }, async (request, reply) => {
    const clinicId = id(request.body.clinicId, "院所"); const patientId = id(Number(request.params.id), "病患");
    const version = id(request.body.expectedVersion, "病患版本");
    return write(pool, request, reply, clinicId, async (client) => {
      const assigned = await doctor(client, clinicId, request.body);
      const result = await client.query<{ version: number }>(
        `UPDATE patients SET chart_number=$3,name=$4,birth_date=$5,doctor_user_id=$6,doctor_name=$7,note=$8
         WHERE id=$1 AND clinic_id=$2 AND active=true AND version=$9 RETURNING version`,
        [patientId, clinicId, text(request.body.chartNumber, "病歷號", 100, true), text(request.body.name, "姓名", 200, true),
          date(request.body.birthDate), assigned.userId, assigned.name, text(request.body.note, "備註", 16_384), version],
      );
      if (!result.rows.length) {
        const exists = await client.query("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2 AND active=true", [patientId, clinicId]);
        throw new WriteError(exists.rows.length ? 409 : 404, exists.rows.length ? "version_conflict" : "not_found", exists.rows.length ? "病患已由其他電腦更新，請重新載入後再修改" : "找不到目前院所的病患資料");
      }
      await audit(client, request, "patient_updated", "patient", patientId, { clinicId, previousVersion: version, version: result.rows[0]!.version });
      return (await client.query(`${select} WHERE id=$1`, [patientId])).rows[0];
    });
  });
  app.delete<{ Params: { id: string }; Querystring: { clinicId?: string; expectedVersion?: string } }>(
    "/v1/patients/:id", { preHandler: requireSession }, async (request, reply) => {
      const clinicId = id(Number(request.query.clinicId), "院所"); const patientId = id(Number(request.params.id), "病患");
      const version = id(Number(request.query.expectedVersion), "病患版本");
      return write(pool, request, reply, clinicId, async (client) => {
        const result = await client.query<{ version: number }>(
          "UPDATE patients SET active=false WHERE id=$1 AND clinic_id=$2 AND active=true AND version=$3 RETURNING version",
          [patientId, clinicId, version],
        );
        if (!result.rows.length) {
          const exists = await client.query("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2 AND active=true", [patientId, clinicId]);
          throw new WriteError(exists.rows.length ? 409 : 404, exists.rows.length ? "version_conflict" : "not_found", exists.rows.length ? "病患已由其他電腦更新，請重新載入後再封存" : "找不到目前院所的病患資料");
        }
        await audit(client, request, "patient_archived", "patient", patientId, { clinicId, previousVersion: version, version: result.rows[0]!.version });
        return true;
      });
    },
  );
}
