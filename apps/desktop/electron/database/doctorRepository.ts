import bcrypt from "bcrypt";
import { getDatabase } from "./db";

export type DoctorRecord = {
  id: number;
  name: string;
  account: string;
  specialty: string;
  phone: string;
  role: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export type DoctorInput = {
  name: string;
  account: string;
  password?: string;
  specialty: string;
  phone: string;
  role: string;
  isActive?: boolean;
};

export function getDoctors(): DoctorRecord[] {
  const database = getDatabase();

  const statement = database.prepare(`
    SELECT
      id,
      name,
      account,
      specialty,
      phone,
      role,
      isActive,
      createdAt,
      updatedAt
    FROM doctors
    ORDER BY id DESC
  `);

  return statement.all() as DoctorRecord[];
}

export function createDoctor(input: DoctorInput): DoctorRecord {
  const database = getDatabase();

  if (!input.name.trim()) {
    throw new Error("醫師姓名為必填");
  }

  if (!input.account.trim()) {
    throw new Error("登入帳號為必填");
  }

  if (!input.password?.trim()) {
    throw new Error("密碼為必填");
  }

  const passwordHash = bcrypt.hashSync(input.password, 10);

  const statement = database.prepare(`
    INSERT INTO doctors (
      name,
      account,
      passwordHash,
      specialty,
      phone,
      role,
      isActive
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    input.name.trim(),
    input.account.trim(),
    passwordHash,
    input.specialty?.trim() ?? "",
    input.phone?.trim() ?? "",
    input.role?.trim() || "Doctor",
    input.isActive === false ? 0 : 1,
  );

  return getDoctorById(Number(result.lastInsertRowid));
}

export function updateDoctor(
  id: number,
  input: DoctorInput,
): DoctorRecord {
  const database = getDatabase();

  if (!input.name.trim()) {
    throw new Error("醫師姓名為必填");
  }

  if (!input.account.trim()) {
    throw new Error("登入帳號為必填");
  }

  if (input.password?.trim()) {
    const passwordHash = bcrypt.hashSync(input.password, 10);

    database
      .prepare(`
        UPDATE doctors
        SET
          name = ?,
          account = ?,
          passwordHash = ?,
          specialty = ?,
          phone = ?,
          role = ?,
          isActive = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        input.name.trim(),
        input.account.trim(),
        passwordHash,
        input.specialty?.trim() ?? "",
        input.phone?.trim() ?? "",
        input.role?.trim() || "Doctor",
        input.isActive === false ? 0 : 1,
        id,
      );
  } else {
    database
      .prepare(`
        UPDATE doctors
        SET
          name = ?,
          account = ?,
          specialty = ?,
          phone = ?,
          role = ?,
          isActive = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        input.name.trim(),
        input.account.trim(),
        input.specialty?.trim() ?? "",
        input.phone?.trim() ?? "",
        input.role?.trim() || "Doctor",
        input.isActive === false ? 0 : 1,
        id,
      );
  }

  return getDoctorById(id);
}

export function deleteDoctor(id: number): boolean {
  const database = getDatabase();

  const result = database
    .prepare(`
      DELETE FROM doctors
      WHERE id = ?
    `)
    .run(id);

  return result.changes > 0;
}

export function getDoctorById(id: number): DoctorRecord {
  const database = getDatabase();

  const doctor = database
    .prepare(`
      SELECT
        id,
        name,
        account,
        specialty,
        phone,
        role,
        isActive,
        createdAt,
        updatedAt
      FROM doctors
      WHERE id = ?
    `)
    .get(id) as DoctorRecord | undefined;

  if (!doctor) {
    throw new Error("找不到醫師資料");
  }

  return doctor;
}