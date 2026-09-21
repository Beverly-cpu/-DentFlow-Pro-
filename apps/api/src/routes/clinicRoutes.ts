import type { FastifyInstance } from "fastify";

import { audit, requireAdmin, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { getClinicsForUser } from "../records.js";

type Body = Record<string, unknown>;
const asId = (value: unknown) => Number(value);

const clinicSelect = `
  SELECT c.id::int, c.code, c.name, c.active::int AS "isActive",
         c.created_at AS "createdAt", c.updated_at AS "updatedAt"
  FROM clinics c`;

export async function registerClinicRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.get("/v1/clinics", { preHandler: requireAdmin }, async () => {
    const result = await pool.query(`${clinicSelect} ORDER BY c.name, c.id`);
    return result.rows;
  });

  app.get("/v1/clinics/active", { preHandler: requireSession }, async () => {
    const result = await pool.query(`${clinicSelect} WHERE c.active=true ORDER BY c.name, c.id`);
    return result.rows;
  });

  app.get<{ Params: { id: string } }>("/v1/clinics/:id", { preHandler: requireSession }, async (request, reply) => {
    const result = await pool.query(`${clinicSelect} WHERE c.id=$1`, [asId(request.params.id)]);
    return result.rows[0] ?? reply.code(404).send({ error: "not_found", message: "找不到院所" });
  });

  app.get("/v1/clinics-with-stats", { preHandler: requireAdmin }, async () => {
    const result = await pool.query(`
      SELECT c.id::int, c.code, c.name, c.active::int AS "isActive",
             c.created_at AS "createdAt", c.updated_at AS "updatedAt",
             count(DISTINCT uc.user_id)::int AS "userCount",
             count(DISTINCT uc.user_id) FILTER (WHERE u.role='Doctor')::int AS "doctorCount"
      FROM clinics c
      LEFT JOIN user_clinics uc ON uc.clinic_id=c.id
      LEFT JOIN users u ON u.id=uc.user_id
      GROUP BY c.id ORDER BY c.name, c.id`);
    return result.rows;
  });

  app.get<{ Params: { id: string } }>("/v1/clinics/:id/with-stats", { preHandler: requireAdmin }, async (request, reply) => {
    const result = await pool.query(`
      SELECT c.id::int, c.code, c.name, c.active::int AS "isActive",
             c.created_at AS "createdAt", c.updated_at AS "updatedAt",
             count(DISTINCT uc.user_id)::int AS "userCount",
             count(DISTINCT uc.user_id) FILTER (WHERE u.role='Doctor')::int AS "doctorCount"
      FROM clinics c LEFT JOIN user_clinics uc ON uc.clinic_id=c.id LEFT JOIN users u ON u.id=uc.user_id
      WHERE c.id=$1 GROUP BY c.id`, [asId(request.params.id)]);
    return result.rows[0] ?? reply.code(404).send({ error: "not_found", message: "找不到院所" });
  });

  app.get<{ Params: { userId: string } }>("/v1/users/:userId/clinics", { preHandler: requireSession }, async (request, reply) => {
    const userId = asId(request.params.userId);
    if (request.principal!.role !== "Admin" && request.principal!.userId !== userId) {
      return reply.code(403).send({ error: "forbidden", message: "無權查看此帳號院所" });
    }
    return getClinicsForUser(pool, userId);
  });

  app.post<{ Body: Body }>("/v1/clinics", { preHandler: requireAdmin }, async (request) => {
    const code = String(request.body.code ?? "").trim().toUpperCase();
    const name = String(request.body.name ?? "").trim();
    if (!code || !name) throw new Error("院所代碼與名稱不可空白");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: number }>(
        "INSERT INTO clinics (code,name) VALUES ($1,$2) RETURNING id::int", [code, name],
      );
      await client.query(
        "INSERT INTO user_clinics (user_id,clinic_id,is_primary) VALUES ($1,$2,false) ON CONFLICT DO NOTHING",
        [request.principal!.userId, result.rows[0]!.id],
      );
      await client.query("COMMIT");
      await audit(pool, request, "clinic_created", "clinic", result.rows[0]!.id);
      const row = await pool.query(`${clinicSelect} WHERE c.id=$1`, [result.rows[0]!.id]);
      return row.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

  app.put<{ Params: { id: string }; Body: Body }>("/v1/clinics/:id", { preHandler: requireAdmin }, async (request) => {
    const id = asId(request.params.id);
    await pool.query("UPDATE clinics SET code=$2,name=$3 WHERE id=$1", [id,
      String(request.body.code ?? "").trim().toUpperCase(), String(request.body.name ?? "").trim()]);
    await audit(pool, request, "clinic_updated", "clinic", id);
    const row = await pool.query(`${clinicSelect} WHERE c.id=$1`, [id]);
    return row.rows[0];
  });

  app.put<{ Params: { id: string }; Body: Body }>("/v1/clinics/:id/active", { preHandler: requireAdmin }, async (request) => {
    const id = asId(request.params.id);
    await pool.query("UPDATE clinics SET active=$2 WHERE id=$1", [id, Boolean(request.body.isActive)]);
    await audit(pool, request, "clinic_active_changed", "clinic", id, { isActive: Boolean(request.body.isActive) });
    return { success: true };
  });

  app.post<{ Params: { id: string }; Body: Body }>("/v1/clinics/:id/users", { preHandler: requireAdmin }, async (request) => {
    const clinicId = asId(request.params.id); const userId = asId(request.body.userId);
    await pool.query("INSERT INTO user_clinics (user_id,clinic_id,is_primary) VALUES ($1,$2,false) ON CONFLICT DO NOTHING", [userId, clinicId]);
    await audit(pool, request, "clinic_user_added", "clinic", clinicId, { userId });
    return { success: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>("/v1/clinics/:id/users/:userId", { preHandler: requireAdmin }, async (request) => {
    const clinicId = asId(request.params.id); const userId = asId(request.params.userId);
    await pool.query("DELETE FROM user_clinics WHERE user_id=$1 AND clinic_id=$2", [userId, clinicId]);
    await audit(pool, request, "clinic_user_removed", "clinic", clinicId, { userId });
    return { success: true };
  });

  app.put<{ Params: { id: string; userId: string } }>("/v1/clinics/:id/users/:userId/primary", { preHandler: requireAdmin }, async (request) => {
    const clinicId = asId(request.params.id); const userId = asId(request.params.userId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE user_clinics SET is_primary=false WHERE user_id=$1", [userId]);
      const result = await client.query("UPDATE user_clinics SET is_primary=true WHERE user_id=$1 AND clinic_id=$2", [userId, clinicId]);
      if (result.rowCount !== 1) throw new Error("使用者未獲授權此院所");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    await audit(pool, request, "clinic_primary_changed", "clinic", clinicId, { userId });
    return { success: true };
  });
}
