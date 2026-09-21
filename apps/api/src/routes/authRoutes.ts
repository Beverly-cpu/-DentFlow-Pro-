import type { FastifyInstance } from "fastify";

import {
  audit, createSession, hashPassword, isRole, normalizeAccount, requireAdmin,
  requireSession, verifyPassword,
} from "../auth.js";
import type { DatabasePool } from "../database.js";
import { getClinicsForUser, getUserRecord, replaceUserClinics, roleLabels } from "../records.js";

type Body = Record<string, unknown>;
const asId = (value: unknown) => Number(value);

export async function registerAuthRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.get("/v1/setup/status", async () => {
    const result = await pool.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM users) AS exists");
    return { hasUsers: Boolean(result.rows[0]?.exists) };
  });

  app.get("/v1/auth/active-clinics", async () => {
    const result = await pool.query(
      `SELECT id::int, code, name, active::int AS "isActive", 0 AS "isPrimary"
       FROM clinics WHERE active = true ORDER BY name, id`,
    );
    return result.rows;
  });

  app.get<{ Querystring: { account?: string } }>("/v1/auth/clinics-for-account", async (request) => {
    const account = normalizeAccount(request.query.account);
    if (!account) return [];
    const user = await pool.query<{ id: number }>(
      "SELECT id::int FROM users WHERE lower(account) = $1 AND active = true",
      [account],
    );
    return user.rows[0] ? getClinicsForUser(pool, user.rows[0].id) : [];
  });

  app.post<{ Body: Body }>("/v1/setup/initial-admin", async (request, reply) => {
    const count = await pool.query<{ exists: boolean }>("SELECT EXISTS (SELECT 1 FROM users) AS exists");
    if (count.rows[0]?.exists) return reply.code(409).send({ error: "already_initialized", message: "系統已完成初始化" });
    const name = String(request.body.name ?? "").trim();
    const account = normalizeAccount(request.body.account);
    const clinicId = asId(request.body.clinicId);
    if (!name || !account || !Number.isInteger(clinicId)) throw new Error("初始化資料不完整");
    const passwordHash = await hashPassword(String(request.body.password ?? ""));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query<{ id: number }>(
        `INSERT INTO users (account, password_hash, display_name, role)
         VALUES ($1, $2, $3, 'Admin') RETURNING id::int`,
        [account, passwordHash, name],
      );
      await client.query(
        "INSERT INTO user_clinics (user_id, clinic_id, is_primary) VALUES ($1, $2, true)",
        [user.rows[0]!.id, clinicId],
      );
      await client.query("COMMIT");
      await audit(pool, request, "initial_admin_created", "user", user.rows[0]!.id);
      return getUserRecord(pool, user.rows[0]!.id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post<{ Body: Body }>("/v1/auth/login", async (request, reply) => {
    const account = normalizeAccount(request.body.account);
    const password = String(request.body.password ?? "");
    const clinicId = asId(request.body.clinicId);
    const deviceId = String(request.headers["x-device-id"] ?? "unknown-device").slice(0, 200);
    const result = await pool.query<{
      id: number; name: string; account: string; passwordHash: string; role: string; tokenVersion: number;
    }>(
      `SELECT id::int, display_name AS name, account, password_hash AS "passwordHash",
              role, token_version AS "tokenVersion"
       FROM users WHERE lower(account) = $1 AND active = true`,
      [account],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      await audit(pool, request, "login_failed", "user", undefined, { account });
      return reply.code(401).send({ error: "invalid_credentials", message: "帳號或密碼錯誤" });
    }
    const access = await pool.query<{ code: string; name: string }>(
      `SELECT c.code, c.name FROM user_clinics uc JOIN clinics c ON c.id = uc.clinic_id
       WHERE uc.user_id = $1 AND c.id = $2 AND c.active = true`,
      [user.id, clinicId],
    );
    if (!access.rows[0]) return reply.code(403).send({ error: "clinic_forbidden", message: "此帳號沒有該院所權限" });
    const session = await createSession(pool, { userId: user.id, tokenVersion: user.tokenVersion, clinicId, deviceId });
    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    const clinics = await getClinicsForUser(pool, user.id);
    request.principal = { sessionId: session.sessionId, userId: user.id, role: user.role as never, clinicId, deviceId };
    await audit(pool, request, "login_succeeded", "user", user.id);
    return {
      token: session.token,
      session: {
        userId: user.id, name: user.name, account: user.account, role: user.role,
        roleLabel: roleLabels[user.role] ?? user.role, clinicId, clinicCode: access.rows[0].code,
        clinicName: access.rows[0].name, clinics, loggedInAt: new Date().toISOString(),
      },
    };
  });

  app.get("/v1/auth/users", { preHandler: requireAdmin }, async () => {
    const ids = await pool.query<{ id: number }>("SELECT id::int FROM users ORDER BY display_name, id");
    return Promise.all(ids.rows.map((row) => getUserRecord(pool, row.id)));
  });

  app.get<{ Params: { id: string } }>("/v1/auth/users/:id", { preHandler: requireSession }, async (request, reply) => {
    const id = asId(request.params.id);
    if (request.principal!.role !== "Admin" && request.principal!.userId !== id) {
      return reply.code(403).send({ error: "forbidden", message: "無權查看此帳號" });
    }
    const user = await getUserRecord(pool, id);
    return user ?? reply.code(404).send({ error: "not_found", message: "找不到使用者" });
  });

  app.post<{ Body: Body }>("/v1/auth/users", { preHandler: requireAdmin }, async (request) => {
    const name = String(request.body.name ?? "").trim();
    const account = normalizeAccount(request.body.account);
    const role = request.body.role;
    if (!name || !account || !isRole(role)) throw new Error("使用者資料不完整");
    const passwordHash = await hashPassword(String(request.body.password ?? ""));
    const client = await pool.connect();
    let userId: number;
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: number }>(
        `INSERT INTO users (account, password_hash, display_name, role, phone, email, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::int`,
        [account, passwordHash, name, role, String(request.body.phone ?? "").trim() || null,
          String(request.body.email ?? "").trim() || null, request.body.isActive !== false],
      );
      userId = result.rows[0]!.id;
      await replaceUserClinics(client, userId, request.body.clinicIds as number[], asId(request.body.primaryClinicId));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
    await audit(pool, request, "user_created", "user", userId);
    return getUserRecord(pool, userId);
  });

  app.put<{ Params: { id: string }; Body: Body }>("/v1/auth/users/:id", { preHandler: requireAdmin }, async (request) => {
    const id = asId(request.params.id);
    const role = request.body.role;
    if (!isRole(role)) throw new Error("角色格式錯誤");
    const existing = await pool.query<{ role: string; active: boolean }>("SELECT role,active FROM users WHERE id=$1", [id]);
    if (!existing.rows[0]) throw new Error("找不到指定的使用者");
    if (existing.rows[0].role === "Admin" && (role !== "Admin" || !request.body.isActive)) {
      const others = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE role='Admin' AND active=true AND id<>$1", [id],
      );
      if (others.rows[0]?.count === "0") throw new Error("系統至少必須保留一個啟用中的管理者帳號");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE users SET display_name=$2, role=$3, phone=$4, email=$5, active=$6,
           token_version = CASE WHEN active <> $6 THEN token_version + 1 ELSE token_version END WHERE id=$1`,
        [id, String(request.body.name ?? "").trim(), role, String(request.body.phone ?? "").trim() || null,
          String(request.body.email ?? "").trim() || null, Boolean(request.body.isActive)],
      );
      await replaceUserClinics(client, id, request.body.clinicIds as number[], request.body.primaryClinicId === null ? null : asId(request.body.primaryClinicId));
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    await audit(pool, request, "user_updated", "user", id);
    return getUserRecord(pool, id);
  });

  app.delete<{ Params: { id: string } }>("/v1/auth/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const id = asId(request.params.id);
    if (id === request.principal!.userId) return reply.code(409).send({ error: "self_delete", message: "不可刪除目前登入帳號" });
    const target = await pool.query<{ role: string; active: boolean }>("SELECT role,active FROM users WHERE id=$1", [id]);
    if (target.rows[0]?.role === "Admin" && target.rows[0].active) {
      const others = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE role='Admin' AND active=true AND id<>$1", [id],
      );
      if (others.rows[0]?.count === "0") return reply.code(409).send({ error: "last_admin", message: "系統至少必須保留一個啟用中的管理者帳號" });
    }
    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    await audit(pool, request, "user_deleted", "user", id);
    return { success: true };
  });

  app.post<{ Body: Body }>("/v1/auth/change-password", { preHandler: requireSession }, async (request, reply) => {
    const userId = asId(request.body.userId);
    if (userId !== request.principal!.userId) return reply.code(403).send({ error: "forbidden", message: "只能變更自己的密碼" });
    const row = await pool.query<{ hash: string }>("SELECT password_hash AS hash FROM users WHERE id=$1", [userId]);
    if (!row.rows[0] || !(await verifyPassword(String(request.body.currentPassword ?? ""), row.rows[0].hash))) {
      return reply.code(401).send({ error: "invalid_password", message: "目前密碼錯誤" });
    }
    const hash = await hashPassword(String(request.body.newPassword ?? ""));
    await pool.query("UPDATE users SET password_hash=$2, token_version=token_version+1 WHERE id=$1", [userId, hash]);
    await audit(pool, request, "password_changed", "user", userId);
    return { success: true };
  });

  app.post<{ Body: Body }>("/v1/auth/reset-password", { preHandler: requireAdmin }, async (request) => {
    const userId = asId(request.body.userId);
    const hash = await hashPassword(String(request.body.newPassword ?? ""));
    await pool.query("UPDATE users SET password_hash=$2, token_version=token_version+1 WHERE id=$1", [userId, hash]);
    await audit(pool, request, "password_reset", "user", userId);
    return { success: true };
  });

  app.put<{ Params: { id: string }; Body: Body }>("/v1/auth/users/:id/clinics", { preHandler: requireAdmin }, async (request) => {
    const id = asId(request.params.id);
    await replaceUserClinics(pool, id, request.body.clinicIds as number[], request.body.primaryClinicId === null ? null : asId(request.body.primaryClinicId));
    await audit(pool, request, "user_clinics_updated", "user", id);
    return getUserRecord(pool, id);
  });

  app.get<{ Params: { clinicId: string } }>("/v1/auth/clinic-access/:clinicId", { preHandler: requireSession }, async (request) => {
    const clinicId = asId(request.params.clinicId);
    const result = await pool.query<{ allowed: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
        WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true) AS allowed`,
      [request.principal!.userId, clinicId],
    );
    if (result.rows[0]?.allowed) {
      await pool.query("UPDATE sessions SET selected_clinic_id=$2 WHERE id=$1", [request.principal!.sessionId, clinicId]);
      request.principal!.clinicId = clinicId;
    }
    return Boolean(result.rows[0]?.allowed);
  });
}
