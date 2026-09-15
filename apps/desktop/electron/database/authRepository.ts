import bcrypt from "bcrypt";

import {
  getDatabase,
} from "./db";

/* =========================================================
   Constants
========================================================= */

const PASSWORD_MIN_LENGTH = 8;

const BCRYPT_ROUNDS = 12;

/* =========================================================
   Roles
========================================================= */

export type UserRole =
  | "Doctor"
  | "Assistant"
  | "Admin"
  | "Accountant"
  | "Procurement";

/* =========================================================
   Database Rows
========================================================= */

type ClinicRow = {
  id: number;
  code: string;
  name: string;
  isActive: number;
  createdAt?: string;
  updatedAt?: string;
};

type UserRow = {
  id: number;
  name: string;
  account: string;
  passwordHash: string;
  role: UserRole;
  phone: string | null;
  email: string | null;
  isActive: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserClinicRow = {
  id: number;
  code: string;
  name: string;
  isActive: number;
  isPrimary: number;
};

/* =========================================================
   Public Records
========================================================= */

export type AuthClinicRecord = {
  id: number;
  code: string;
  name: string;
  isActive: number;
  isPrimary: number;
};

export type AuthUserRecord = {
  id: number;
  name: string;
  account: string;
  role: UserRole;
  roleLabel: string;
  phone: string;
  email: string;
  isActive: number;
  lastLoginAt: string | null;
  clinics: AuthClinicRecord[];
  createdAt: string;
  updatedAt: string;
};

export type AuthSession = {
  userId: number;
  name: string;
  account: string;
  role: UserRole;
  roleLabel: string;
  clinicId: number;
  clinicCode: string;
  clinicName: string;
  clinics: AuthClinicRecord[];
  loggedInAt: string;
};

/* =========================================================
   Inputs
========================================================= */

export type LoginInput = {
  account: string;
  password: string;
  clinicId: number;
};

export type CreateInitialAdminInput = {
  name: string;
  account: string;
  password: string;
  clinicId: number;
};

export type CreateUserInput = {
  name: string;
  account: string;
  password: string;
  role: UserRole;
  phone?: string;
  email?: string;
  isActive?: boolean;
  clinicIds: number[];
  primaryClinicId: number;
};

export type UpdateUserInput = {
  name: string;
  role: UserRole;
  phone?: string;
  email?: string;
  isActive: boolean;
  clinicIds: number[];
  primaryClinicId:
    | number
    | null;
};

export type ChangePasswordInput = {
  userId: number;
  currentPassword: string;
  newPassword: string;
};

export type ResetPasswordInput = {
  userId: number;
  newPassword: string;
};

export type LocalAdminPasswordResetInput = {
  account: string;
  newPassword: string;
};

/* =========================================================
   Helpers
========================================================= */

function normalizeText(
  value:
    string | null | undefined,
) {
  return (
    value ?? ""
  ).trim();
}

function normalizeAccount(
  value: string,
) {
  return value
    .trim()
    .toLowerCase();
}

function normalizePositiveInteger(
  value: unknown,
  label: string,
) {
  const normalized =
    typeof value === "number"
      ? value
      : typeof value === "string" &&
          value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (
    !Number.isInteger(
      normalized,
    ) ||
    normalized <= 0
  ) {
    throw new Error(
      `${label}格式不正確`,
    );
  }

  return normalized;
}

function validatePositiveInteger(
  value: number,
  label: string,
) {
  normalizePositiveInteger(
    value,
    label,
  );
}

function validateName(
  value: string,
) {
  if (
    !normalizeText(
      value,
    )
  ) {
    throw new Error(
      "請輸入使用者姓名",
    );
  }
}

function validateAccount(
  value: string,
) {
  const account =
    normalizeAccount(
      value,
    );

  if (!account) {
    throw new Error(
      "請輸入登入帳號",
    );
  }

  if (
    account.length < 3
  ) {
    throw new Error(
      "登入帳號至少需要 3 個字元",
    );
  }

  if (
    account.length > 80
  ) {
    throw new Error(
      "登入帳號長度過長",
    );
  }

  if (
    !/^[a-z0-9._@-]+$/i.test(
      account,
    )
  ) {
    throw new Error(
      "登入帳號只能包含英文字母、數字、點、底線、@ 或連字號",
    );
  }
}

function validatePassword(
  value: string,
) {
  if (
    value.length <
    PASSWORD_MIN_LENGTH
  ) {
    throw new Error(
      `密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元`,
    );
  }

  if (
    value.length > 200
  ) {
    throw new Error(
      "密碼長度過長",
    );
  }
}

function validateRole(
  role: UserRole,
) {
  const roles:
    UserRole[] = [
      "Doctor",
      "Assistant",
      "Admin",
      "Accountant",
      "Procurement",
    ];

  if (
    !roles.includes(
      role,
    )
  ) {
    throw new Error(
      "使用者角色不正確",
    );
  }
}

function getRoleLabel(
  role: UserRole,
) {
  switch (
    role
  ) {
    case "Doctor":
      return "醫師";

    case "Assistant":
      return "助理";

    case "Admin":
      return "管理者";

    case "Accountant":
      return "會計";

    case "Procurement":
      return "採購";
  }
}

/* =========================================================
   Clinics
========================================================= */

function getUserClinicsInternal(
  userId: number,
): AuthClinicRecord[] {
  const database =
    getDatabase();

  return database
    .prepare(
      `
      SELECT
        clinics.id,
        clinics.code,
        clinics.name,
        clinics.isActive,
        userClinics.isPrimary

      FROM userClinics

      INNER JOIN clinics
        ON clinics.id =
           userClinics.clinicId

      WHERE
        userClinics.userId = ?

      ORDER BY
        userClinics.isPrimary DESC,
        clinics.name ASC,
        clinics.id ASC
      `,
    )
    .all(
      userId,
    ) as AuthClinicRecord[];
}

function getUserRecordInternal(
  user:
    UserRow,
): AuthUserRecord {
  return {
    id:
      user.id,

    name:
      user.name,

    account:
      user.account,

    role:
      user.role,

    roleLabel:
      getRoleLabel(
        user.role,
      ),

    phone:
      user.phone ?? "",

    email:
      user.email ?? "",

    isActive:
      user.isActive,

    lastLoginAt:
      user.lastLoginAt,

    clinics:
      getUserClinicsInternal(
        user.id,
      ),

    createdAt:
      user.createdAt,

    updatedAt:
      user.updatedAt,
  };
}

/* =========================================================
   Active Clinics
========================================================= */

export function getActiveClinics():
  AuthClinicRecord[] {
  const database =
    getDatabase();

  const rows =
    database
      .prepare(
        `
        SELECT
          id,
          code,
          name,
          isActive

        FROM clinics

        WHERE isActive = 1

        ORDER BY
          name ASC,
          id ASC
        `,
      )
      .all() as ClinicRow[];

  return rows.map(
    (
      clinic,
    ) => ({
      id:
        clinic.id,

      code:
        clinic.code,

      name:
        clinic.name,

      isActive:
        clinic.isActive,

      isPrimary:
        0,
    }),
  );
}

/* =========================================================
   Clinics For Account
========================================================= */

export function getClinicsForAccount(
  account: string,
):
  AuthClinicRecord[] {
  const database =
    getDatabase();

  const normalizedAccount =
    normalizeAccount(
      account,
    );

  if (
    !normalizedAccount
  ) {
    return [];
  }

  const user =
    database
      .prepare(
        `
        SELECT
          id

        FROM users

        WHERE
          LOWER(account) = ?
          AND isActive = 1
        `,
      )
      .get(
        normalizedAccount,
      ) as
      | {
          id: number;
        }
      | undefined;

  if (!user) {
    return [];
  }

  return (
    database
      .prepare(
        `
        SELECT
          clinics.id,
          clinics.code,
          clinics.name,
          clinics.isActive,
          userClinics.isPrimary

        FROM userClinics

        INNER JOIN clinics
          ON clinics.id =
             userClinics.clinicId

        WHERE
          userClinics.userId = ?
          AND clinics.isActive = 1

        ORDER BY
          userClinics.isPrimary DESC,
          clinics.name ASC
        `,
      )
      .all(
        user.id,
      ) as AuthClinicRecord[]
  );
}

/* =========================================================
   Has Users / Initial Admin State
========================================================= */

export function hasUsers() {
  const database =
    getDatabase();

  /*
   * Login.tsx 會使用 hasUsers()
   * 判斷系統是否已完成初始管理者設定。
   *
   * 因此這裡實際判斷的是：
   *
   * 「系統是否已存在至少一個 Admin」
   *
   * 而不是 users 表中是否存在任何角色。
   *
   * 這可以處理舊測試資料只存在：
   *
   * Doctor
   * Assistant
   * Accountant
   *
   * 但沒有 Admin 的情況。
   */

  const row =
    database
      .prepare(
        `
        SELECT
          COUNT(*) AS count

        FROM users

        WHERE role = 'Admin'
        `,
      )
      .get() as {
      count: number;
    };

  return (
    row.count > 0
  );
}

/* =========================================================
   Validate Clinic
========================================================= */

export function validateClinicAccess(
  userId: number,
  clinicId: number,
): AuthClinicRecord {
  validatePositiveInteger(
    userId,
    "使用者 ID",
  );

  validatePositiveInteger(
    clinicId,
    "院所 ID",
  );

  const database =
    getDatabase();

  const user =
    database
      .prepare(
        `
        SELECT
          id,
          isActive

        FROM users

        WHERE id = ?
        `,
      )
      .get(
        userId,
      ) as
      | {
          id: number;
          isActive: number;
        }
      | undefined;

  if (!user) {
    throw new Error(
      "找不到指定的使用者",
    );
  }

  if (
    user.isActive !== 1
  ) {
    throw new Error(
      "此帳號已停用",
    );
  }

  const clinic =
    database
      .prepare(
        `
        SELECT
          clinics.id,
          clinics.code,
          clinics.name,
          clinics.isActive,
          userClinics.isPrimary

        FROM userClinics

        INNER JOIN clinics
          ON clinics.id =
             userClinics.clinicId

        WHERE
          userClinics.userId = ?
          AND clinics.id = ?
        `,
      )
      .get(
        userId,
        clinicId,
      ) as
      | UserClinicRow
      | undefined;

  if (!clinic) {
    throw new Error(
      "此帳號沒有該院所的使用權限",
    );
  }

  if (
    clinic.isActive !== 1
  ) {
    throw new Error(
      "此院所目前已停用",
    );
  }

  return {
    id:
      clinic.id,

    code:
      clinic.code,

    name:
      clinic.name,

    isActive:
      clinic.isActive,

    isPrimary:
      clinic.isPrimary,
  };
}

/* =========================================================
   Login
========================================================= */

export async function login(
  input:
    LoginInput,
): Promise<AuthSession> {
  const database =
    getDatabase();

  const account =
    normalizeAccount(
      input.account,
    );

  validateAccount(
    account,
  );

  if (
    !input.password
  ) {
    throw new Error(
      "請輸入密碼",
    );
  }

  validatePositiveInteger(
    input.clinicId,
    "院所 ID",
  );

  const user =
    database
      .prepare(
        `
        SELECT
          id,
          name,
          account,
          passwordHash,
          role,
          phone,
          email,
          isActive,
          lastLoginAt,
          createdAt,
          updatedAt

        FROM users

        WHERE
          LOWER(account) = ?

        LIMIT 1
        `,
      )
      .get(
        account,
      ) as
      | UserRow
      | undefined;

  /*
   * 不特別告訴登入者：
   * 是帳號不存在還是密碼錯誤。
   */
  if (!user) {
    throw new Error(
      "帳號或密碼錯誤",
    );
  }

  if (
    user.isActive !== 1
  ) {
    throw new Error(
      "此帳號已停用",
    );
  }

  const passwordMatches =
    await bcrypt.compare(
      input.password,
      user.passwordHash,
    );

  if (
    !passwordMatches
  ) {
    throw new Error(
      "帳號或密碼錯誤",
    );
  }

  const clinic =
    validateClinicAccess(
      user.id,
      input.clinicId,
    );

  const loggedInAt =
    new Date()
      .toISOString();

  database
    .prepare(
      `
      UPDATE users

      SET
        lastLoginAt = ?,
        updatedAt = CURRENT_TIMESTAMP

      WHERE id = ?
      `,
    )
    .run(
      loggedInAt,
      user.id,
    );

  const clinics =
    getUserClinicsInternal(
      user.id,
    ).filter(
      (
        item,
      ) =>
        item.isActive === 1,
    );

  return {
    userId:
      user.id,

    name:
      user.name,

    account:
      user.account,

    role:
      user.role,

    roleLabel:
      getRoleLabel(
        user.role,
      ),

    clinicId:
      clinic.id,

    clinicCode:
      clinic.code,

    clinicName:
      clinic.name,

    clinics,

    loggedInAt,
  };
}

/* =========================================================
   Create Initial Admin
========================================================= */

export async function createInitialAdmin(
  input:
    CreateInitialAdminInput,
): Promise<AuthUserRecord> {
  const database =
    getDatabase();

  /*
   * hasUsers() 現在代表：
   *
   * 系統是否已存在 Admin。
   *
   * 因此即使資料庫已有 Doctor /
   * Assistant / Accountant，
   * 只要沒有 Admin，
   * 仍允許建立第一個管理者。
   */

  if (
    hasUsers()
  ) {
    throw new Error(
      "系統已存在管理者，無法再次建立初始管理者",
    );
  }

  validateName(
    input.name,
  );

  validateAccount(
    input.account,
  );

  validatePassword(
    input.password,
  );

  validatePositiveInteger(
    input.clinicId,
    "院所 ID",
  );

  const clinic =
    database
      .prepare(
        `
        SELECT
          id,
          code,
          name,
          isActive

        FROM clinics

        WHERE id = ?
        `,
      )
      .get(
        input.clinicId,
      ) as
      | ClinicRow
      | undefined;

  if (!clinic) {
    throw new Error(
      "找不到指定的院所",
    );
  }

  if (
    clinic.isActive !== 1
  ) {
    throw new Error(
      "指定的院所已停用",
    );
  }

  const account =
    normalizeAccount(
      input.account,
    );

  /*
   * 因為現在允許「已經存在其他角色帳號」
   * 的資料庫建立第一個 Admin，
   * 所以必須額外檢查帳號是否重複。
   */

  const existingAccount =
    database
      .prepare(
        `
        SELECT id

        FROM users

        WHERE LOWER(account) = ?

        LIMIT 1
        `,
      )
      .get(
        account,
      );

  if (
    existingAccount
  ) {
    throw new Error(
      "此登入帳號已經存在，請使用其他管理者帳號",
    );
  }

  const passwordHash =
    await bcrypt.hash(
      input.password,
      BCRYPT_ROUNDS,
    );

  const transaction =
    database.transaction(
      () => {
        /*
         * Transaction 內再次確認，
         * 避免初始化期間又產生 Admin。
         */

        const existingAdmin =
          database
            .prepare(
              `
              SELECT id

              FROM users

              WHERE role = 'Admin'

              LIMIT 1
              `,
            )
            .get();

        if (
          existingAdmin
        ) {
          throw new Error(
            "系統已存在管理者，無法再次建立初始管理者",
          );
        }

        const result =
          database
            .prepare(
              `
              INSERT INTO users (
                name,
                account,
                passwordHash,
                role,
                phone,
                email,
                isActive,
                lastLoginAt,
                createdAt,
                updatedAt
              )
              VALUES (
                ?,
                ?,
                ?,
                'Admin',
                '',
                '',
                1,
                NULL,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
              `,
            )
            .run(
              normalizeText(
                input.name,
              ),

              account,

              passwordHash,
            );

        const userId =
          Number(
            result.lastInsertRowid,
          );

        database
          .prepare(
            `
            INSERT INTO userClinics (
              userId,
              clinicId,
              isPrimary
            )
            VALUES (?, ?, 1)
            `,
          )
          .run(
            userId,
            input.clinicId,
          );

        return userId;
      },
    );

  const userId =
    transaction();

  return getUser(
    userId,
  );
}

/* =========================================================
   Users
========================================================= */

export function getUsers():
  AuthUserRecord[] {
  const database =
    getDatabase();

  const rows =
    database
      .prepare(
        `
        SELECT
          id,
          name,
          account,
          passwordHash,
          role,
          phone,
          email,
          isActive,
          lastLoginAt,
          createdAt,
          updatedAt

        FROM users

        ORDER BY
          isActive DESC,
          name ASC,
          id ASC
        `,
      )
      .all() as UserRow[];

  return rows.map(
    (
      user,
    ) =>
      getUserRecordInternal(
        user,
      ),
  );
}

/* =========================================================
   User
========================================================= */

export function getUser(
  userId: number,
): AuthUserRecord {
  validatePositiveInteger(
    userId,
    "使用者 ID",
  );

  const database =
    getDatabase();

  const user =
    database
      .prepare(
        `
        SELECT
          id,
          name,
          account,
          passwordHash,
          role,
          phone,
          email,
          isActive,
          lastLoginAt,
          createdAt,
          updatedAt

        FROM users

        WHERE id = ?
        `,
      )
      .get(
        userId,
      ) as
      | UserRow
      | undefined;

  if (!user) {
    throw new Error(
      "找不到指定的使用者",
    );
  }

  return getUserRecordInternal(
    user,
  );
}

/* =========================================================
   Set User Clinics
========================================================= */

export function setUserClinics(
  userId: number,
  clinicIds: number[],
  primaryClinicId:
    number | null,
) {
  const normalizedUserId =
    normalizePositiveInteger(
      userId,
      "使用者 ID",
    );

  if (
    !Array.isArray(
      clinicIds,
    ) ||
    clinicIds.length === 0
  ) {
    throw new Error(
      "至少需要指定一間院所",
    );
  }

  /*
   * HTML form values may arrive through IPC as strings such as "2".
   * Normalize them here before validating or writing userClinics.
   */
  const normalizedClinicIds =
    clinicIds.map(
      (clinicId) =>
        normalizePositiveInteger(
          clinicId,
          "院所 ID",
        ),
    );

  const uniqueClinicIds = [
    ...new Set(
      normalizedClinicIds,
    ),
  ];

  if (
    primaryClinicId === null ||
    primaryClinicId === undefined
  ) {
    throw new Error(
      "請設定主要院所",
    );
  }

  const normalizedPrimaryClinicId =
    normalizePositiveInteger(
      primaryClinicId,
      "主要院所 ID",
    );

  if (
    !uniqueClinicIds.includes(
      normalizedPrimaryClinicId,
    )
  ) {
    throw new Error(
      "主要院所必須包含在院所權限內",
    );
  }

  const database =
    getDatabase();

  const user =
    database
      .prepare(
        `
        SELECT id

        FROM users

        WHERE id = ?
        `,
      )
      .get(
        normalizedUserId,
      );

  if (!user) {
    throw new Error(
      "找不到指定的使用者",
    );
  }

  const placeholders =
    uniqueClinicIds
      .map(
        () => "?",
      )
      .join(
        ", ",
      );

  const activeClinics =
    database
      .prepare(
        `
        SELECT id

        FROM clinics

        WHERE
          id IN (${placeholders})
          AND isActive = 1
        `,
      )
      .all(
        ...uniqueClinicIds,
      ) as Array<{
      id: number;
    }>;

  if (
    activeClinics.length !==
    uniqueClinicIds.length
  ) {
    throw new Error(
      "指定的院所不存在或已停用",
    );
  }

  const transaction =
    database.transaction(
      () => {
        database
          .prepare(
            `
            DELETE FROM userClinics

            WHERE userId = ?
            `,
          )
          .run(
            normalizedUserId,
          );

        const insert =
          database.prepare(
            `
            INSERT INTO userClinics (
              userId,
              clinicId,
              isPrimary
            )
            VALUES (?, ?, ?)
            `,
          );

        for (
          const clinicId
          of uniqueClinicIds
        ) {
          insert.run(
            normalizedUserId,
            clinicId,
            clinicId ===
              normalizedPrimaryClinicId
              ? 1
              : 0,
          );
        }
      },
    );

  transaction();
}

/* =========================================================
   Create User
========================================================= */

export async function createUser(
  input:
    CreateUserInput,
): Promise<AuthUserRecord> {
  validateName(
    input.name,
  );

  validateAccount(
    input.account,
  );

  validatePassword(
    input.password,
  );

  validateRole(
    input.role,
  );

  if (
    input.clinicIds.length ===
    0
  ) {
    throw new Error(
      "至少需要指定一間院所",
    );
  }

  if (
    !input.clinicIds.includes(
      input.primaryClinicId,
    )
  ) {
    throw new Error(
      "主要院所必須包含在院所權限內",
    );
  }

  const database =
    getDatabase();

  const account =
    normalizeAccount(
      input.account,
    );

  const existing =
    database
      .prepare(
        `
        SELECT id

        FROM users

        WHERE LOWER(account) = ?
        `,
      )
      .get(
        account,
      );

  if (
    existing
  ) {
    throw new Error(
      "此登入帳號已經存在",
    );
  }

  const passwordHash =
    await bcrypt.hash(
      input.password,
      BCRYPT_ROUNDS,
    );

  const transaction =
    database.transaction(
      () => {
        const result =
          database
            .prepare(
              `
              INSERT INTO users (
                name,
                account,
                passwordHash,
                role,
                phone,
                email,
                isActive,
                lastLoginAt,
                createdAt,
                updatedAt
              )
              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                NULL,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
              `,
            )
            .run(
              normalizeText(
                input.name,
              ),

              account,

              passwordHash,

              input.role,

              normalizeText(
                input.phone,
              ),

              normalizeText(
                input.email,
              ),

              input.isActive ===
                false
                ? 0
                : 1,
            );

        const userId =
          Number(
            result.lastInsertRowid,
          );

        const clinicIds = [
          ...new Set(
            input.clinicIds,
          ),
        ];

        const placeholders =
          clinicIds
            .map(
              () => "?",
            )
            .join(
              ", ",
            );

        const validClinics =
          database
            .prepare(
              `
              SELECT id

              FROM clinics

              WHERE
                id IN (${placeholders})
                AND isActive = 1
              `,
            )
            .all(
              ...clinicIds,
            ) as Array<{
            id: number;
          }>;

        if (
          validClinics.length !==
          clinicIds.length
        ) {
          throw new Error(
            "指定的院所不存在或已停用",
          );
        }

        const insertClinic =
          database.prepare(
            `
            INSERT INTO userClinics (
              userId,
              clinicId,
              isPrimary
            )
            VALUES (?, ?, ?)
            `,
          );

        for (
          const clinicId
          of clinicIds
        ) {
          insertClinic.run(
            userId,

            clinicId,

            clinicId ===
              input.primaryClinicId
              ? 1
              : 0,
          );
        }

        return userId;
      },
    );

  const userId =
    transaction();

  return getUser(
    userId,
  );
}

/* =========================================================
   Update User
========================================================= */

export function updateUser(
  userId: number,
  input:
    UpdateUserInput,
): AuthUserRecord {
  validatePositiveInteger(
    userId,
    "使用者 ID",
  );

  validateName(
    input.name,
  );

  validateRole(
    input.role,
  );

  const database =
    getDatabase();

  const existing =
    database
      .prepare(
        `
        SELECT
          id,
          role,
          isActive

        FROM users

        WHERE id = ?
        `,
      )
      .get(
        userId,
      ) as
      | {
          id: number;
          role: UserRole;
          isActive: number;
        }
      | undefined;

  if (
    !existing
  ) {
    throw new Error(
      "找不到指定的使用者",
    );
  }

  /*
   * 防止系統沒有任何啟用中的管理者。
   */
  if (
    existing.role ===
      "Admin" &&
    (
      input.role !==
        "Admin" ||
      !input.isActive
    )
  ) {
    const activeAdminCount =
      database
        .prepare(
          `
          SELECT
            COUNT(*) AS count

          FROM users

          WHERE
            role = 'Admin'
            AND isActive = 1
            AND id <> ?
          `,
        )
        .get(
          userId,
        ) as {
        count: number;
      };

    if (
      activeAdminCount.count ===
      0
    ) {
      throw new Error(
        "系統至少必須保留一個啟用中的管理者帳號",
      );
    }
  }

  const transaction =
    database.transaction(
      () => {
        database
          .prepare(
            `
            UPDATE users

            SET
              name = ?,
              role = ?,
              phone = ?,
              email = ?,
              isActive = ?,
              updatedAt = CURRENT_TIMESTAMP

            WHERE id = ?
            `,
          )
          .run(
            normalizeText(
              input.name,
            ),

            input.role,

            normalizeText(
              input.phone,
            ),

            normalizeText(
              input.email,
            ),

            input.isActive
              ? 1
              : 0,

            userId,
          );

        setUserClinics(
          userId,

          input.clinicIds,

          input.primaryClinicId,
        );
      },
    );

  transaction();

  return getUser(
    userId,
  );
}

/* =========================================================
   Change Own Password
========================================================= */

export async function changePassword(
  input:
    ChangePasswordInput,
) {
  validatePositiveInteger(
    input.userId,
    "使用者 ID",
  );

  validatePassword(
    input.newPassword,
  );

  const database =
    getDatabase();

  const user =
    database
      .prepare(
        `
        SELECT
          id,
          passwordHash,
          isActive

        FROM users

        WHERE id = ?
        `,
      )
      .get(
        input.userId,
      ) as
      | {
          id: number;
          passwordHash: string;
          isActive: number;
        }
      | undefined;

  if (!user) {
    throw new Error(
      "找不到指定的使用者",
    );
  }

  if (
    user.isActive !== 1
  ) {
    throw new Error(
      "此帳號已停用",
    );
  }

  const matches =
    await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );

  if (
    !matches
  ) {
    throw new Error(
      "目前密碼不正確",
    );
  }

  const samePassword =
    await bcrypt.compare(
      input.newPassword,
      user.passwordHash,
    );

  if (
    samePassword
  ) {
    throw new Error(
      "新密碼不可與目前密碼相同",
    );
  }

  const passwordHash =
    await bcrypt.hash(
      input.newPassword,
      BCRYPT_ROUNDS,
    );

  database
    .prepare(
      `
      UPDATE users

      SET
        passwordHash = ?,
        updatedAt = CURRENT_TIMESTAMP

      WHERE id = ?
      `,
    )
    .run(
      passwordHash,
      input.userId,
    );

  return {
    success: true,
  };
}

/* =========================================================
   Administrator Reset Password
========================================================= */

export async function resetPassword(
  input:
    ResetPasswordInput,
) {
  validatePositiveInteger(
    input.userId,
    "使用者 ID",
  );

  validatePassword(
    input.newPassword,
  );

  const database =
    getDatabase();

  const user =
    database
      .prepare(
        `
        SELECT
          id,
          passwordHash

        FROM users

        WHERE id = ?
        `,
      )
      .get(
        input.userId,
      ) as
      | {
          id: number;
          passwordHash: string;
        }
      | undefined;

  if (!user) {
    throw new Error(
      "找不到指定的使用者",
    );
  }

  const samePassword =
    await bcrypt.compare(
      input.newPassword,
      user.passwordHash,
    );

  if (
    samePassword
  ) {
    throw new Error(
      "新密碼不可與目前密碼相同",
    );
  }

  const passwordHash =
    await bcrypt.hash(
      input.newPassword,
      BCRYPT_ROUNDS,
    );

  database
    .prepare(
      `
      UPDATE users

      SET
        passwordHash = ?,
        updatedAt = CURRENT_TIMESTAMP

      WHERE id = ?
      `,
    )
    .run(
      passwordHash,
      input.userId,
    );

  return {
    success: true,
  };
}

/* =========================================================
   LOCAL ADMIN RECOVERY
========================================================= */

export async function resetLocalAdminPassword(
  input:
    LocalAdminPasswordResetInput,
) {
  const database =
    getDatabase();

  const account =
    normalizeAccount(
      input.account,
    );

  validateAccount(
    account,
  );

  validatePassword(
    input.newPassword,
  );

  const user =
    database
      .prepare(
        `
        SELECT
          id,
          name,
          account,
          passwordHash,
          role,
          isActive

        FROM users

        WHERE
          LOWER(account) = ?

        LIMIT 1
        `,
      )
      .get(
        account,
      ) as
      | {
          id: number;
          name: string;
          account: string;
          passwordHash: string;
          role: UserRole;
          isActive: number;
        }
      | undefined;

  if (!user) {
    throw new Error(
      "找不到指定的管理者帳號",
    );
  }

  if (
    user.role !==
    "Admin"
  ) {
    throw new Error(
      "此帳號不是管理者帳號",
    );
  }

  const samePassword =
    await bcrypt.compare(
      input.newPassword,
      user.passwordHash,
    );

  if (
    samePassword
  ) {
    throw new Error(
      "新密碼不可與原密碼相同",
    );
  }

  const passwordHash =
    await bcrypt.hash(
      input.newPassword,
      BCRYPT_ROUNDS,
    );

  database
    .prepare(
      `
      UPDATE users

      SET
        passwordHash = ?,
        updatedAt = CURRENT_TIMESTAMP

      WHERE
        id = ?
        AND role = 'Admin'
      `,
    )
    .run(
      passwordHash,
      user.id,
    );

  return {
    success: true,

    userId:
      user.id,

    name:
      user.name,

    account:
      user.account,

    isActive:
      user.isActive,
  };
}

/* =========================================================
   Local Admin Accounts
========================================================= */

export function getLocalAdminAccounts() {
  const database =
    getDatabase();

  return database
    .prepare(
      `
      SELECT
        id,
        name,
        account,
        isActive,
        lastLoginAt

      FROM users

      WHERE role = 'Admin'

      ORDER BY
        isActive DESC,
        name ASC,
        id ASC
      `,
    )
    .all() as Array<{
    id: number;
    name: string;
    account: string;
    isActive: number;
    lastLoginAt:
      string | null;
  }>;
}

/* =========================================================
   Delete User
========================================================= */

export function deleteUser(
  userId: number,
) {
  validatePositiveInteger(
    userId,
    "使用者 ID",
  );

  const database =
    getDatabase();

  const user =
    database
      .prepare(
        `
        SELECT
          id,
          name,
          role,
          isActive

        FROM users

        WHERE id = ?
        `,
      )
      .get(
        userId,
      ) as
      | {
          id: number;
          name: string;
          role: UserRole;
          isActive: number;
        }
      | undefined;

  if (!user) {
    throw new Error(
      "找不到指定的使用者",
    );
  }

  if (
    user.role ===
      "Admin" &&
    user.isActive ===
      1
  ) {
    const otherAdmins =
      database
        .prepare(
          `
          SELECT
            COUNT(*) AS count

          FROM users

          WHERE
            role = 'Admin'
            AND isActive = 1
            AND id <> ?
          `,
        )
        .get(
          userId,
        ) as {
        count: number;
      };

    if (
      otherAdmins.count ===
      0
    ) {
      throw new Error(
        "無法刪除最後一個啟用中的管理者帳號",
      );
    }
  }

  const transaction =
    database.transaction(
      () => {
        database
          .prepare(
            `
            DELETE FROM userClinics

            WHERE userId = ?
            `,
          )
          .run(
            userId,
          );

        database
          .prepare(
            `
            DELETE FROM users

            WHERE id = ?
            `,
          )
          .run(
            userId,
          );
      },
    );

  transaction();

  return {
    success: true,
  };
}
