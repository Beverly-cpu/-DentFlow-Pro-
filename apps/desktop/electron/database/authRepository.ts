import bcrypt from "bcrypt";

import { getDatabase } from "./db";
import {
  isDentflowRole,
  type DentflowRole,
} from "../../src/utils/permissions";

export type AuthSession = {
  userId: number;
  userName: string;
  clinicId: number;
  clinicName: string;
  role: DentflowRole;
};

type AccountRow = {
  id: number;
  name: string;
  account: string;
  passwordHash: string;
  role: string;
  isActive: number;
};

export function needsInitialSetup() {
  const row = getDatabase()
    .prepare("SELECT COUNT(*) AS count FROM doctors")
    .get() as { count: number };

  return row.count === 0;
}

export function createInitialAdmin(
  name: string,
  account: string,
  password: string,
): AuthSession {
  const normalizedName = name.trim();
  const normalizedAccount = account.trim();

  if (!normalizedName || !normalizedAccount || password.length < 8) {
    throw new Error("請填寫名稱與帳號，密碼至少需要 8 個字元。");
  }

  const database = getDatabase();

  return database.transaction(() => {
    if (!needsInitialSetup()) {
      throw new Error("系統已完成初始設定。");
    }

    const result = database
      .prepare(
        `INSERT INTO doctors (
          name, account, passwordHash, specialty, phone, role, isActive
        ) VALUES (?, ?, ?, '', '', 'Admin', 1)`,
      )
      .run(normalizedName, normalizedAccount, bcrypt.hashSync(password, 10));

    return {
      userId: Number(result.lastInsertRowid),
      userName: normalizedName,
      clinicId: 1,
      clinicName: "DentFlow 診所",
      role: "Admin",
    };
  })();
}

export function authenticate(account: string, password: string): AuthSession {
  const row = getDatabase()
    .prepare(
      `SELECT id, name, account, passwordHash, role, isActive
       FROM doctors WHERE account = ?`,
    )
    .get(account.trim()) as AccountRow | undefined;

  if (!row || row.isActive !== 1 || !bcrypt.compareSync(password, row.passwordHash)) {
    throw new Error("帳號、密碼錯誤，或此帳號已停用。");
  }

  if (!isDentflowRole(row.role)) {
    throw new Error("帳號角色設定無效，請聯絡管理者。");
  }

  return {
    userId: row.id,
    userName: row.name,
    clinicId: 1,
    clinicName: "DentFlow 診所",
    role: row.role,
  };
}
