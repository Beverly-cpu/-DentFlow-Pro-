import {
  getDatabase,
} from "./db";

/* =========================================================
   Types
========================================================= */

export type ClinicRecord = {
  id: number;
  code: string;
  name: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

export type ClinicInput = {
  code: string;
  name: string;
};

export type ClinicUpdateInput = {
  code: string;
  name: string;
};

export type ClinicWithStatsRecord =
  ClinicRecord & {
    userCount: number;
    doctorCount: number;
  };

/* =========================================================
   Internal Helpers
========================================================= */

function normalizeCode(
  value: string,
) {
  return value
    .trim()
    .toUpperCase();
}

function normalizeName(
  value: string,
) {
  return value.trim();
}

function assertPositiveInteger(
  value: number,
  label: string,
) {
  if (
    !Number.isInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new Error(
      `${label}格式錯誤。`,
    );
  }
}

function validateClinicInput(
  input: ClinicInput,
) {
  const code =
    normalizeCode(
      input.code,
    );

  const name =
    normalizeName(
      input.name,
    );

  if (!code) {
    throw new Error(
      "請輸入院所代碼。",
    );
  }

  if (!name) {
    throw new Error(
      "請輸入院所名稱。",
    );
  }

  if (
    code.length >
    50
  ) {
    throw new Error(
      "院所代碼不可超過 50 個字元。",
    );
  }

  if (
    name.length >
    100
  ) {
    throw new Error(
      "院所名稱不可超過 100 個字元。",
    );
  }

  return {
    code,
    name,
  };
}

function getClinicByIdInternal(
  clinicId: number,
):
  ClinicRecord | null {
  const db =
    getDatabase();

  return (
    db.prepare(
      `
        SELECT
          id,
          code,
          name,
          isActive,
          createdAt,
          updatedAt
        FROM clinics
        WHERE id = ?
        LIMIT 1
      `,
    ).get(
      clinicId,
    ) as
      | ClinicRecord
      | undefined
  ) ?? null;
}

function assertClinicExists(
  clinicId: number,
) {
  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const clinic =
    getClinicByIdInternal(
      clinicId,
    );

  if (!clinic) {
    throw new Error(
      "找不到指定院所。",
    );
  }

  return clinic;
}

function assertUserExists(
  userId: number,
) {
  assertPositiveInteger(
    userId,
    "使用者 ID",
  );

  const db =
    getDatabase();

  const user =
    db.prepare(
      `
        SELECT
          id
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
    ).get(
      userId,
    ) as
      | {
          id: number;
        }
      | undefined;

  if (!user) {
    throw new Error(
      "找不到指定使用者。",
    );
  }
}

function assertAdminUser(
  userId: number,
) {
  assertPositiveInteger(
    userId,
    "管理者 ID",
  );

  const db =
    getDatabase();

  const user =
    db.prepare(
      `
        SELECT
          id,
          role,
          isActive
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
    ).get(
      userId,
    ) as
      | {
          id: number;
          role: string;
          isActive: number;
        }
      | undefined;

  if (!user) {
    throw new Error(
      "找不到目前管理者帳號。",
    );
  }

  if (
    user.isActive !== 1
  ) {
    throw new Error(
      "目前管理者帳號已停用。",
    );
  }

  if (
    user.role !==
    "Admin"
  ) {
    throw new Error(
      "只有管理者可以管理院所。",
    );
  }

  return user;
}

function assertClinicCodeAvailable(
  code: string,
  excludeClinicId?: number,
) {
  const db =
    getDatabase();

  let duplicate:
    | {
        id: number;
      }
    | undefined;

  if (
    excludeClinicId !==
    undefined
  ) {
    duplicate =
      db.prepare(
        `
          SELECT
            id
          FROM clinics
          WHERE UPPER(code) = UPPER(?)
            AND id <> ?
          LIMIT 1
        `,
      ).get(
        code,
        excludeClinicId,
      ) as
        | {
            id: number;
          }
        | undefined;
  } else {
    duplicate =
      db.prepare(
        `
          SELECT
            id
          FROM clinics
          WHERE UPPER(code) = UPPER(?)
          LIMIT 1
        `,
      ).get(
        code,
      ) as
        | {
            id: number;
          }
        | undefined;
  }

  if (duplicate) {
    throw new Error(
      `院所代碼「${code}」已存在。`,
    );
  }
}

/* =========================================================
   Get Clinics
========================================================= */

export function getClinics():
  ClinicRecord[] {
  const db =
    getDatabase();

  return db.prepare(
    `
      SELECT
        id,
        code,
        name,
        isActive,
        createdAt,
        updatedAt
      FROM clinics
      ORDER BY
        isActive DESC,
        name COLLATE NOCASE ASC,
        id ASC
    `,
  ).all() as
    ClinicRecord[];
}

/* =========================================================
   Get Active Clinics
========================================================= */

export function getActiveClinics():
  ClinicRecord[] {
  const db =
    getDatabase();

  return db.prepare(
    `
      SELECT
        id,
        code,
        name,
        isActive,
        createdAt,
        updatedAt
      FROM clinics
      WHERE isActive = 1
      ORDER BY
        name COLLATE NOCASE ASC,
        id ASC
    `,
  ).all() as
    ClinicRecord[];
}

/* =========================================================
   Get Clinic By ID
========================================================= */

export function getClinicById(
  clinicId: number,
):
  ClinicRecord | null {
  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  return getClinicByIdInternal(
    clinicId,
  );
}

/* =========================================================
   Get Clinic With Statistics
========================================================= */

export function getClinicWithStats(
  clinicId: number,
):
  ClinicWithStatsRecord | null {
  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  return (
    db.prepare(
      `
        SELECT
          c.id,
          c.code,
          c.name,
          c.isActive,
          c.createdAt,
          c.updatedAt,

          (
            SELECT
              COUNT(*)
            FROM userClinics uc
            WHERE uc.clinicId = c.id
          ) AS userCount,

          (
            SELECT
              COUNT(*)
            FROM doctorClinics dc
            WHERE dc.clinicId = c.id
          ) AS doctorCount

        FROM clinics c
        WHERE c.id = ?
        LIMIT 1
      `,
    ).get(
      clinicId,
    ) as
      | ClinicWithStatsRecord
      | undefined
  ) ?? null;
}

/* =========================================================
   Get Clinics With Statistics
========================================================= */

export function getClinicsWithStats():
  ClinicWithStatsRecord[] {
  const db =
    getDatabase();

  return db.prepare(
    `
      SELECT
        c.id,
        c.code,
        c.name,
        c.isActive,
        c.createdAt,
        c.updatedAt,

        (
          SELECT
            COUNT(*)
          FROM userClinics uc
          WHERE uc.clinicId = c.id
        ) AS userCount,

        (
          SELECT
            COUNT(*)
          FROM doctorClinics dc
          WHERE dc.clinicId = c.id
        ) AS doctorCount

      FROM clinics c
      ORDER BY
        c.isActive DESC,
        c.name COLLATE NOCASE ASC,
        c.id ASC
    `,
  ).all() as
    ClinicWithStatsRecord[];
}

/* =========================================================
   Get Clinics By User
========================================================= */

export function getClinicsByUser(
  userId: number,
):
  ClinicRecord[] {
  assertUserExists(
    userId,
  );

  const db =
    getDatabase();

  return db.prepare(
    `
      SELECT
        c.id,
        c.code,
        c.name,
        c.isActive,
        c.createdAt,
        c.updatedAt
      FROM userClinics uc
      INNER JOIN clinics c
        ON c.id = uc.clinicId
      WHERE uc.userId = ?
      ORDER BY
        uc.isPrimary DESC,
        c.isActive DESC,
        c.name COLLATE NOCASE ASC,
        c.id ASC
    `,
  ).all(
    userId,
  ) as
    ClinicRecord[];
}

/* =========================================================
   Create Clinic
========================================================= */

/**
 * 建立新院所。
 *
 * 重要：
 * - creatorAdminUserId 必須是有效 Admin。
 * - 建立院所後，會自動將該 Admin 加入 userClinics。
 * - 若該 Admin 原本沒有主要院所，新院所會自動成為主要院所。
 */
export function createClinic(
  creatorAdminUserId: number,
  input: ClinicInput,
):
  ClinicRecord {
  const db =
    getDatabase();

  assertAdminUser(
    creatorAdminUserId,
  );

  const normalized =
    validateClinicInput(
      input,
    );

  assertClinicCodeAvailable(
    normalized.code,
  );

  const transaction =
    db.transaction(
      () => {
        const result =
          db.prepare(
            `
              INSERT INTO clinics (
                code,
                name,
                isActive,
                createdAt,
                updatedAt
              )
              VALUES (
                ?,
                ?,
                1,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
            `,
          ).run(
            normalized.code,
            normalized.name,
          );

        const clinicId =
          Number(
            result.lastInsertRowid,
          );

        const existingPrimary =
          db.prepare(
            `
              SELECT
                clinicId
              FROM userClinics
              WHERE userId = ?
                AND isPrimary = 1
              LIMIT 1
            `,
          ).get(
            creatorAdminUserId,
          ) as
            | {
                clinicId: number;
              }
            | undefined;

        const shouldBePrimary =
          existingPrimary
            ? 0
            : 1;

        db.prepare(
          `
            INSERT INTO userClinics (
              userId,
              clinicId,
              isPrimary,
              createdAt,
              updatedAt
            )
            VALUES (
              ?,
              ?,
              ?,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
            ON CONFLICT (
              userId,
              clinicId
            )
            DO UPDATE SET
              updatedAt =
                CURRENT_TIMESTAMP
          `,
        ).run(
          creatorAdminUserId,
          clinicId,
          shouldBePrimary,
        );

        const clinic =
          getClinicByIdInternal(
            clinicId,
          );

        if (!clinic) {
          throw new Error(
            "院所建立後讀取失敗。",
          );
        }

        return clinic;
      },
    );

  return transaction();
}

/* =========================================================
   Update Clinic
========================================================= */

export function updateClinic(
  clinicId: number,
  adminUserId: number,
  input:
    ClinicUpdateInput,
):
  ClinicRecord {
  const db =
    getDatabase();

  assertAdminUser(
    adminUserId,
  );

  assertClinicExists(
    clinicId,
  );

  const normalized =
    validateClinicInput(
      input,
    );

  assertClinicCodeAvailable(
    normalized.code,
    clinicId,
  );

  const transaction =
    db.transaction(
      () => {
        const result =
          db.prepare(
            `
              UPDATE clinics
              SET
                code = ?,
                name = ?,
                updatedAt =
                  CURRENT_TIMESTAMP
              WHERE id = ?
            `,
          ).run(
            normalized.code,
            normalized.name,
            clinicId,
          );

        if (
          result.changes !==
          1
        ) {
          throw new Error(
            "院所更新失敗。",
          );
        }

        const clinic =
          getClinicByIdInternal(
            clinicId,
          );

        if (!clinic) {
          throw new Error(
            "院所更新後讀取失敗。",
          );
        }

        return clinic;
      },
    );

  return transaction();
}

/* =========================================================
   Set Clinic Active
========================================================= */

/**
 * 啟用 / 停用院所。
 *
 * 院所採停用制，不直接 DELETE。
 * 這樣可以保留既有病患、植體、耗材、庫存及交易歷史。
 */
export function setClinicActive(
  clinicId: number,
  adminUserId: number,
  isActive: boolean,
):
  ClinicRecord {
  const db =
    getDatabase();

  assertAdminUser(
    adminUserId,
  );

  const clinic =
    assertClinicExists(
      clinicId,
    );

  const nextValue =
    isActive
      ? 1
      : 0;

  if (
    clinic.isActive ===
    nextValue
  ) {
    return clinic;
  }

  if (!isActive) {
    /*
     * 不允許停用最後一間啟用院所。
     */
    const activeCount =
      db.prepare(
        `
          SELECT
            COUNT(*) AS count
          FROM clinics
          WHERE isActive = 1
        `,
      ).get() as {
        count: number;
      };

    if (
      activeCount.count <=
      1
    ) {
      throw new Error(
        "系統至少必須保留一間啟用中的院所。",
      );
    }
  }

  const transaction =
    db.transaction(
      () => {
        const result =
          db.prepare(
            `
              UPDATE clinics
              SET
                isActive = ?,
                updatedAt =
                  CURRENT_TIMESTAMP
              WHERE id = ?
            `,
          ).run(
            nextValue,
            clinicId,
          );

        if (
          result.changes !==
          1
        ) {
          throw new Error(
            "院所狀態更新失敗。",
          );
        }

        /*
         * 若停用院所，不刪除 userClinics / doctorClinics。
         * 保留關聯與歷史。
         *
         * 但若有人把停用院所設為主要院所，
         * 需要盡量把主要院所轉移到其他啟用院所。
         */
        if (!isActive) {
          const affectedUsers =
            db.prepare(
              `
                SELECT
                  userId
                FROM userClinics
                WHERE clinicId = ?
                  AND isPrimary = 1
              `,
            ).all(
              clinicId,
            ) as Array<{
              userId: number;
            }>;

          for (
            const user of
            affectedUsers
          ) {
            const replacement =
              db.prepare(
                `
                  SELECT
                    uc.clinicId
                  FROM userClinics uc
                  INNER JOIN clinics c
                    ON c.id =
                      uc.clinicId
                  WHERE uc.userId = ?
                    AND uc.clinicId <> ?
                    AND c.isActive = 1
                  ORDER BY
                    uc.createdAt ASC,
                    uc.clinicId ASC
                  LIMIT 1
                `,
              ).get(
                user.userId,
                clinicId,
              ) as
                | {
                    clinicId: number;
                  }
                | undefined;

            if (
              replacement
            ) {
              db.prepare(
                `
                  UPDATE userClinics
                  SET
                    isPrimary = 0,
                    updatedAt =
                      CURRENT_TIMESTAMP
                  WHERE userId = ?
                `,
              ).run(
                user.userId,
              );

              db.prepare(
                `
                  UPDATE userClinics
                  SET
                    isPrimary = 1,
                    updatedAt =
                      CURRENT_TIMESTAMP
                  WHERE userId = ?
                    AND clinicId = ?
                `,
              ).run(
                user.userId,
                replacement.clinicId,
              );
            }
          }

          /*
           * Doctor primary clinic 同步。
           */
          const affectedDoctors =
            db.prepare(
              `
                SELECT
                  doctorId
                FROM doctorClinics
                WHERE clinicId = ?
                  AND isPrimary = 1
              `,
            ).all(
              clinicId,
            ) as Array<{
              doctorId: number;
            }>;

          for (
            const doctor of
            affectedDoctors
          ) {
            const replacement =
              db.prepare(
                `
                  SELECT
                    dc.clinicId
                  FROM doctorClinics dc
                  INNER JOIN clinics c
                    ON c.id =
                      dc.clinicId
                  WHERE dc.doctorId = ?
                    AND dc.clinicId <> ?
                    AND c.isActive = 1
                  ORDER BY
                    dc.createdAt ASC,
                    dc.clinicId ASC
                  LIMIT 1
                `,
              ).get(
                doctor.doctorId,
                clinicId,
              ) as
                | {
                    clinicId: number;
                  }
                | undefined;

            db.prepare(
              `
                UPDATE doctorClinics
                SET
                  isPrimary = 0,
                  updatedAt =
                    CURRENT_TIMESTAMP
                WHERE doctorId = ?
              `,
            ).run(
              doctor.doctorId,
            );

            if (
              replacement
            ) {
              db.prepare(
                `
                  UPDATE doctorClinics
                  SET
                    isPrimary = 1,
                    updatedAt =
                      CURRENT_TIMESTAMP
                  WHERE doctorId = ?
                    AND clinicId = ?
                `,
              ).run(
                doctor.doctorId,
                replacement.clinicId,
              );

              /*
               * doctors.clinicId 是 legacy /
               * primary clinic compatibility。
               */
              db.prepare(
                `
                  UPDATE doctors
                  SET
                    clinicId = ?,
                    updatedAt =
                      CURRENT_TIMESTAMP
                  WHERE id = ?
                `,
              ).run(
                replacement.clinicId,
                doctor.doctorId,
              );
            }
          }
        }

        const updatedClinic =
          getClinicByIdInternal(
            clinicId,
          );

        if (!updatedClinic) {
          throw new Error(
            "院所狀態更新後讀取失敗。",
          );
        }

        return updatedClinic;
      },
    );

  return transaction();
}

/* =========================================================
   Add User To Clinic
========================================================= */

/**
 * 將使用者加入指定院所。
 *
 * 這是後續 Settings / 使用者管理可以共用的底層方法。
 */
export function addUserToClinic(
  userId: number,
  clinicId: number,
  adminUserId: number,
):
  void {
  const db =
    getDatabase();

  assertAdminUser(
    adminUserId,
  );

  assertUserExists(
    userId,
  );

  const clinic =
    assertClinicExists(
      clinicId,
    );

  if (
    clinic.isActive !==
    1
  ) {
    throw new Error(
      "無法將使用者加入已停用的院所。",
    );
  }

  const transaction =
    db.transaction(
      () => {
        const existingPrimary =
          db.prepare(
            `
              SELECT
                clinicId
              FROM userClinics
              WHERE userId = ?
                AND isPrimary = 1
              LIMIT 1
            `,
          ).get(
            userId,
          ) as
            | {
                clinicId: number;
              }
            | undefined;

        db.prepare(
          `
            INSERT INTO userClinics (
              userId,
              clinicId,
              isPrimary,
              createdAt,
              updatedAt
            )
            VALUES (
              ?,
              ?,
              ?,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
            ON CONFLICT (
              userId,
              clinicId
            )
            DO UPDATE SET
              updatedAt =
                CURRENT_TIMESTAMP
          `,
        ).run(
          userId,
          clinicId,
          existingPrimary
            ? 0
            : 1,
        );
      },
    );

  transaction();
}

/* =========================================================
   Remove User From Clinic
========================================================= */

export function removeUserFromClinic(
  userId: number,
  clinicId: number,
  adminUserId: number,
):
  boolean {
  const db =
    getDatabase();

  assertAdminUser(
    adminUserId,
  );

  assertUserExists(
    userId,
  );

  assertClinicExists(
    clinicId,
  );

  const transaction =
    db.transaction(
      () => {
        const membership =
          db.prepare(
            `
              SELECT
                isPrimary
              FROM userClinics
              WHERE userId = ?
                AND clinicId = ?
              LIMIT 1
            `,
          ).get(
            userId,
            clinicId,
          ) as
            | {
                isPrimary: number;
              }
            | undefined;

        if (!membership) {
          return false;
        }

        const remaining =
          db.prepare(
            `
              SELECT
                uc.clinicId
              FROM userClinics uc
              INNER JOIN clinics c
                ON c.id =
                  uc.clinicId
              WHERE uc.userId = ?
                AND uc.clinicId <> ?
                AND c.isActive = 1
              ORDER BY
                uc.isPrimary DESC,
                uc.createdAt ASC,
                uc.clinicId ASC
            `,
          ).all(
            userId,
            clinicId,
          ) as Array<{
            clinicId: number;
          }>;

        if (
          remaining.length ===
          0
        ) {
          throw new Error(
            "使用者至少必須保留一間可登入院所。",
          );
        }

        const result =
          db.prepare(
            `
              DELETE FROM userClinics
              WHERE userId = ?
                AND clinicId = ?
            `,
          ).run(
            userId,
            clinicId,
          );

        if (
          membership.isPrimary ===
          1
        ) {
          db.prepare(
            `
              UPDATE userClinics
              SET
                isPrimary = 0,
                updatedAt =
                  CURRENT_TIMESTAMP
              WHERE userId = ?
            `,
          ).run(
            userId,
          );

          db.prepare(
            `
              UPDATE userClinics
              SET
                isPrimary = 1,
                updatedAt =
                  CURRENT_TIMESTAMP
              WHERE userId = ?
                AND clinicId = ?
            `,
          ).run(
            userId,
            remaining[0].clinicId,
          );
        }

        return (
          result.changes ===
          1
        );
      },
    );

  return transaction();
}

/* =========================================================
   Set User Primary Clinic
========================================================= */

export function setUserPrimaryClinic(
  userId: number,
  clinicId: number,
  adminUserId: number,
):
  void {
  const db =
    getDatabase();

  assertAdminUser(
    adminUserId,
  );

  assertUserExists(
    userId,
  );

  const clinic =
    assertClinicExists(
      clinicId,
    );

  if (
    clinic.isActive !==
    1
  ) {
    throw new Error(
      "停用中的院所不可設為主要院所。",
    );
  }

  const membership =
    db.prepare(
      `
        SELECT
          userId
        FROM userClinics
        WHERE userId = ?
          AND clinicId = ?
        LIMIT 1
      `,
    ).get(
      userId,
      clinicId,
    );

  if (!membership) {
    throw new Error(
      "此使用者尚未加入指定院所。",
    );
  }

  const transaction =
    db.transaction(
      () => {
        db.prepare(
          `
            UPDATE userClinics
            SET
              isPrimary = 0,
              updatedAt =
                CURRENT_TIMESTAMP
            WHERE userId = ?
          `,
        ).run(
          userId,
        );

        db.prepare(
          `
            UPDATE userClinics
            SET
              isPrimary = 1,
              updatedAt =
                CURRENT_TIMESTAMP
            WHERE userId = ?
              AND clinicId = ?
          `,
        ).run(
          userId,
          clinicId,
        );
      },
    );

  transaction();
}