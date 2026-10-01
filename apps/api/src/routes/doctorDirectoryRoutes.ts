import type { FastifyInstance } from "fastify";
import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { draftId } from "../implantDraft.js";
export async function registerDoctorDirectoryRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.get<{ Querystring: { clinicId?: string } }>("/v1/doctors", { preHandler: requireSession }, async (request, reply) => {
    const p = request.principal!;
    if (!["Admin", "Assistant", "Doctor"].includes(p.role)) return reply.code(403).send({ error: "forbidden" });
    const clinicId = draftId(Number(request.query.clinicId), "院所");
    const access = await pool.query(`SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true`, [p.userId, clinicId]);
    if (!access.rows.length) return reply.code(403).send({ error: "forbidden" });
    const result = await pool.query(`SELECT u.id::int,u.id::int AS "userId",$1::int AS "clinicId",u.display_name AS name,
      u.account,''::text AS specialty,''::text AS phone,u.role,1::int AS "isActive",u.created_at AS "createdAt",u.updated_at AS "updatedAt"
      FROM users u JOIN user_clinics uc ON uc.user_id=u.id WHERE uc.clinic_id=$1 AND u.role='Doctor' AND u.active=true
      AND ($2<>'Doctor' OR u.id=$3) ORDER BY u.display_name,u.id`, [clinicId, p.role, p.userId]);
    await audit(pool, request, "doctor_directory_read", "clinic", clinicId); return result.rows;
  });
}
