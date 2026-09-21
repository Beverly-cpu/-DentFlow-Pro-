import type { DatabasePool } from "./database.js";

type Queryable = Pick<DatabasePool, "query">;

export const roleLabels: Record<string, string> = {
  Doctor: "醫師",
  Assistant: "助理",
  Admin: "管理者",
  Accountant: "會計",
  Procurement: "採購",
};

export async function getClinicsForUser(pool: DatabasePool, userId: number) {
  const result = await pool.query(
    `SELECT c.id::int, c.code, c.name, c.active::int AS "isActive",
            uc.is_primary::int AS "isPrimary"
     FROM user_clinics uc
     JOIN clinics c ON c.id = uc.clinic_id
     WHERE uc.user_id = $1
     ORDER BY uc.is_primary DESC, c.name, c.id`,
    [userId],
  );
  return result.rows;
}

export async function getUserRecord(pool: DatabasePool, userId: number) {
  const result = await pool.query<{
    id: number;
    name: string;
    account: string;
    role: string;
    phone: string | null;
    email: string | null;
    isActive: number;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>(
    `SELECT id::int, display_name AS name, account, role, phone, email,
            active::int AS "isActive", last_login_at AS "lastLoginAt",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    phone: row.phone ?? "",
    email: row.email ?? "",
    roleLabel: roleLabels[row.role] ?? row.role,
    clinics: await getClinicsForUser(pool, row.id),
  };
}

export async function assertClinicIds(pool: Queryable, clinicIds: number[]) {
  const uniqueIds = [...new Set(clinicIds)];
  if (uniqueIds.length === 0 || uniqueIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("至少需要選擇一間有效院所");
  }
  const result = await pool.query<{ id: number }>(
    "SELECT id::int FROM clinics WHERE id = ANY($1::bigint[]) AND active = true",
    [uniqueIds],
  );
  if (result.rows.length !== uniqueIds.length) throw new Error("包含不存在或已停用的院所");
  return uniqueIds;
}

export async function replaceUserClinics(
  pool: Queryable,
  userId: number,
  clinicIds: number[],
  primaryClinicId: number | null,
) {
  const ids = await assertClinicIds(pool, clinicIds);
  if (primaryClinicId === null || !ids.includes(primaryClinicId)) {
    throw new Error("主要院所必須包含在授權院所中");
  }
  await pool.query("DELETE FROM user_clinics WHERE user_id = $1", [userId]);
  for (const clinicId of ids) {
    await pool.query(
      "INSERT INTO user_clinics (user_id, clinic_id, is_primary) VALUES ($1, $2, $3)",
      [userId, clinicId, clinicId === primaryClinicId],
    );
  }
}
