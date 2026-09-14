import bcrypt from "bcrypt";

import {
  getDatabase,
} from "./db";

/* =========================================================
   Constants
========================================================= */

const PASSWORD_MIN_LENGTH =
  8;

const BCRYPT_ROUNDS =
  12;

/* =========================================================
   Public Types
========================================================= */

export type DoctorRecord = {
  id: number;

  /*
   * 為了既有 Renderer 相容：
   *
   * clinicId 表示「本次查詢的院所」。
   *
   * Doctor 真正的多院所關係
   * 由 doctorClinics 管理。
   */
  clinicId: number;

  userId:
    number | null;

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

  /*
   * 新增時必填。
   *
   * 修改時：
   * undefined / 空白
   * = 保留原密碼。
   */
  password?: string;

  specialty: string;

  phone: string;

  role: string;

  isActive?: number;

  /*
   * 保留既有 API 相容。
   *
   * 一般情況不需要手動指定，
   * Repository 會自動建立 / 連結 User。
   */
  userId?:
    number | null;
};

export type DoctorClinicRecord = {
  doctorId: number;

  clinicId: number;

  clinicCode: string;

  clinicName: string;

  clinicIsActive: number;

  isPrimary: number;

  createdAt: string;

  updatedAt: string;
};

/* =========================================================
   Internal Types
========================================================= */

type DoctorDbRow = {
  id: number;

  clinicId:
    number | null;

  userId:
    number | null;

  name: string;

  account: string;

  passwordHash: string;

  specialty: string;

  phone: string;

  role: string;

  isActive: number;

  createdAt: string;

  updatedAt: string;
};

type UserDbRow = {
  id: number;

  name: string;

  account: string;

  passwordHash: string;

  role: string;

  phone: string;

  email: string;

  isActive: number;

  lastLoginAt:
    string | null;

  createdAt: string;

  updatedAt: string;
};

type ClinicDbRow = {
  id: number;

  code: string;

  name: string;

  isActive: number;
};

/* =========================================================
   Helpers
========================================================= */

function normalizeText(
  value:
    string | null | undefined,
) {
  return String(
    value ?? "",
  ).trim();
}

function normalizeAccount(
  value:
    string | null | undefined,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase();
}

function normalizeIsActive(
  value:
    number | undefined,
) {
  return value === 0
    ? 0
    : 1;
}

function validatePositiveInteger(
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
      `${label}格式不正確`,
    );
  }
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
      "請輸入醫師姓名",
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
    account.length <
    3
  ) {
    throw new Error(
      "登入帳號至少需要 3 個字元",
    );
  }

  if (
    account.length >
    80
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
    value.length >
    200
  ) {
    throw new Error(
      "密碼長度過長",
    );
  }
}

function validateDoctorInput(
  input: DoctorInput,
) {
  validateName(
    input.name,
  );

  validateAccount(
    input.account,
  );

  /*
   * Doctor 專業主檔固定對應 Doctor 登入角色。
   *
   * role 欄位仍保留是為了舊資料相容。
   */
  if (
    input.role &&
    input.role !==
      "Doctor"
  ) {
    throw new Error(
      "醫師資料的登入角色必須為 Doctor",
    );
  }
}

/* =========================================================
   Clinic
========================================================= */

function getClinic(
  clinicId: number,
):
  ClinicDbRow | null {
  validatePositiveInteger(
    clinicId,
    "院所 ID",
  );

  const database =
    getDatabase();

  const clinic =
    database
      .prepare(`
        SELECT
          id,
          code,
          name,
          isActive

        FROM clinics

        WHERE id = ?
      `)
      .get(
        clinicId,
      ) as
      | ClinicDbRow
      | undefined;

  return (
    clinic ??
    null
  );
}

function ensureActiveClinic(
  clinicId: number,
):
  ClinicDbRow {
  const clinic =
    getClinic(
      clinicId,
    );

  if (!clinic) {
    throw new Error(
      "找不到指定的院所",
    );
  }

  if (
    clinic.isActive !==
    1
  ) {
    throw new Error(
      "此院所目前已停用",
    );
  }

  return clinic;
}

function ensureActiveClinics(
  clinicIds: number[],
) {
  if (
    clinicIds.length ===
    0
  ) {
    throw new Error(
      "醫師至少需要一間執業院所",
    );
  }

  const uniqueClinicIds = [
    ...new Set(
      clinicIds,
    ),
  ];

  for (
    const clinicId of
    uniqueClinicIds
  ) {
    ensureActiveClinic(
      clinicId,
    );
  }

  return uniqueClinicIds;
}

/* =========================================================
   Raw Doctor
========================================================= */

function getDoctorRaw(
  doctorId: number,
):
  DoctorDbRow | null {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  const database =
    getDatabase();

  const doctor =
    database
      .prepare(`
        SELECT
          id,
          clinicId,
          userId,
          name,
          account,
          passwordHash,
          specialty,
          phone,
          role,
          isActive,
          createdAt,
          updatedAt

        FROM doctors

        WHERE id = ?
      `)
      .get(
        doctorId,
      ) as
      | DoctorDbRow
      | undefined;

  return (
    doctor ??
    null
  );
}

function requireDoctorRaw(
  doctorId: number,
):
  DoctorDbRow {
  const doctor =
    getDoctorRaw(
      doctorId,
    );

  if (!doctor) {
    throw new Error(
      "找不到指定的醫師",
    );
  }

  return doctor;
}

/* =========================================================
   Raw User
========================================================= */

function getUserRaw(
  userId: number,
):
  UserDbRow | null {
  validatePositiveInteger(
    userId,
    "使用者 ID",
  );

  const database =
    getDatabase();

  const user =
    database
      .prepare(`
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
      `)
      .get(
        userId,
      ) as
      | UserDbRow
      | undefined;

  return (
    user ??
    null
  );
}

function findUserByAccount(
  account: string,
):
  UserDbRow | null {
  const database =
    getDatabase();

  const normalizedAccount =
    normalizeAccount(
      account,
    );

  const user =
    database
      .prepare(`
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
      `)
      .get(
        normalizedAccount,
      ) as
      | UserDbRow
      | undefined;

  return (
    user ??
    null
  );
}

/* =========================================================
   Membership Helpers
========================================================= */

function doctorHasClinic(
  doctorId: number,
  clinicId: number,
) {
  const database =
    getDatabase();

  const row =
    database
      .prepare(`
        SELECT
          doctorId

        FROM doctorClinics

        WHERE
          doctorId = ?
          AND clinicId = ?

        LIMIT 1
      `)
      .get(
        doctorId,
        clinicId,
      );

  return Boolean(
    row,
  );
}

function requireDoctorClinic(
  doctorId: number,
  clinicId: number,
) {
  ensureActiveClinic(
    clinicId,
  );

  const doctor =
    requireDoctorRaw(
      doctorId,
    );

  if (
    !doctorHasClinic(
      doctorId,
      clinicId,
    )
  ) {
    throw new Error(
      "此醫師不屬於目前院所",
    );
  }

  return doctor;
}

/* =========================================================
   Account Conflict
========================================================= */

function ensureDoctorAccountAvailable(
  account: string,
  excludeDoctorId?:
    number,
) {
  const database =
    getDatabase();

  const normalizedAccount =
    normalizeAccount(
      account,
    );

  const existing =
    excludeDoctorId
      ? database
          .prepare(`
            SELECT id

            FROM doctors

            WHERE
              LOWER(account) = ?
              AND id <> ?

            LIMIT 1
          `)
          .get(
            normalizedAccount,
            excludeDoctorId,
          )
      : database
          .prepare(`
            SELECT id

            FROM doctors

            WHERE
              LOWER(account) = ?

            LIMIT 1
          `)
          .get(
            normalizedAccount,
          );

  if (existing) {
    throw new Error(
      "此醫師登入帳號已被其他醫師使用",
    );
  }
}

function ensureUserAccountAvailable(
  account: string,
  allowedUserId:
    number | null,
) {
  const user =
    findUserByAccount(
      account,
    );

  if (
    user &&
    user.id !==
      allowedUserId
  ) {
    throw new Error(
      "此登入帳號已被其他系統使用者使用",
    );
  }
}

/* =========================================================
   User / Doctor Link Validation
========================================================= */

function ensureUserCanLinkToDoctor(
  userId: number,
  doctorId?:
    number,
):
  UserDbRow {
  const database =
    getDatabase();

  const user =
    getUserRaw(
      userId,
    );

  if (!user) {
    throw new Error(
      "找不到指定的登入帳號",
    );
  }

  if (
    user.role !==
    "Doctor"
  ) {
    throw new Error(
      "只能將 Doctor 角色的登入帳號連結到醫師資料",
    );
  }

  const linkedDoctor =
    doctorId
      ? database
          .prepare(`
            SELECT id

            FROM doctors

            WHERE
              userId = ?
              AND id <> ?

            LIMIT 1
          `)
          .get(
            userId,
            doctorId,
          )
      : database
          .prepare(`
            SELECT id

            FROM doctors

            WHERE userId = ?

            LIMIT 1
          `)
          .get(
            userId,
          );

  if (
    linkedDoctor
  ) {
    throw new Error(
      "此登入帳號已連結其他醫師",
    );
  }

  return user;
}

/* =========================================================
   Doctor Record Builder
========================================================= */

function toDoctorRecord(
  row: DoctorDbRow,
  queryClinicId: number,
):
  DoctorRecord {
  return {
    id:
      row.id,

    clinicId:
      queryClinicId,

    userId:
      row.userId,

    name:
      row.name,

    account:
      row.account,

    specialty:
      row.specialty,

    phone:
      row.phone,

    role:
      row.role,

    isActive:
      row.isActive,

    createdAt:
      row.createdAt,

    updatedAt:
      row.updatedAt,
  };
}

/* =========================================================
   List Doctors - Current Clinic
========================================================= */

export function getDoctors(
  clinicId: number,
):
  DoctorRecord[] {
  ensureActiveClinic(
    clinicId,
  );

  const database =
    getDatabase();

  const rows =
    database
      .prepare(`
        SELECT
          doctors.id,
          doctors.clinicId,
          doctors.userId,
          doctors.name,
          doctors.account,
          doctors.passwordHash,
          doctors.specialty,
          doctors.phone,
          doctors.role,
          doctors.isActive,
          doctors.createdAt,
          doctors.updatedAt

        FROM doctors

        INNER JOIN doctorClinics
          ON doctorClinics.doctorId =
             doctors.id

        WHERE
          doctorClinics.clinicId = ?

        ORDER BY
          doctors.isActive DESC,
          doctors.name ASC,
          doctors.id ASC
      `)
      .all(
        clinicId,
      ) as
      DoctorDbRow[];

  return rows.map(
    (
      row,
    ) =>
      toDoctorRecord(
        row,
        clinicId,
      ),
  );
}

/* =========================================================
   Active Doctors
========================================================= */

export function getActiveDoctors(
  clinicId: number,
):
  DoctorRecord[] {
  return getDoctors(
    clinicId,
  ).filter(
    (
      doctor,
    ) =>
      doctor.isActive ===
      1,
  );
}

/* =========================================================
   Doctor By ID
========================================================= */

export function getDoctorById(
  doctorId: number,
  clinicId: number,
):
  DoctorRecord | null {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  const database =
    getDatabase();

  const row =
    database
      .prepare(`
        SELECT
          doctors.id,
          doctors.clinicId,
          doctors.userId,
          doctors.name,
          doctors.account,
          doctors.passwordHash,
          doctors.specialty,
          doctors.phone,
          doctors.role,
          doctors.isActive,
          doctors.createdAt,
          doctors.updatedAt

        FROM doctors

        INNER JOIN doctorClinics
          ON doctorClinics.doctorId =
             doctors.id

        WHERE
          doctors.id = ?
          AND doctorClinics.clinicId = ?

        LIMIT 1
      `)
      .get(
        doctorId,
        clinicId,
      ) as
      | DoctorDbRow
      | undefined;

  if (!row) {
    return null;
  }

  return toDoctorRecord(
    row,
    clinicId,
  );
}

/* =========================================================
   Doctor By Account
========================================================= */

export function getDoctorByAccount(
  account: string,
  clinicId: number,
):
  DoctorRecord | null {
  ensureActiveClinic(
    clinicId,
  );

  const normalizedAccount =
    normalizeAccount(
      account,
    );

  if (
    !normalizedAccount
  ) {
    return null;
  }

  const database =
    getDatabase();

  const row =
    database
      .prepare(`
        SELECT
          doctors.id,
          doctors.clinicId,
          doctors.userId,
          doctors.name,
          doctors.account,
          doctors.passwordHash,
          doctors.specialty,
          doctors.phone,
          doctors.role,
          doctors.isActive,
          doctors.createdAt,
          doctors.updatedAt

        FROM doctors

        INNER JOIN doctorClinics
          ON doctorClinics.doctorId =
             doctors.id

        WHERE
          LOWER(doctors.account) = ?
          AND doctorClinics.clinicId = ?

        LIMIT 1
      `)
      .get(
        normalizedAccount,
        clinicId,
      ) as
      | DoctorDbRow
      | undefined;

  if (!row) {
    return null;
  }

  return toDoctorRecord(
    row,
    clinicId,
  );
}

export function getActiveDoctorByAccount(
  account: string,
  clinicId: number,
):
  DoctorRecord | null {
  const doctor =
    getDoctorByAccount(
      account,
      clinicId,
    );

  if (
    !doctor ||
    doctor.isActive !==
      1
  ) {
    return null;
  }

  return doctor;
}

/* =========================================================
   Doctor By User ID
========================================================= */

export function getDoctorByUserId(
  userId: number,
  clinicId: number,
):
  DoctorRecord | null {
  validatePositiveInteger(
    userId,
    "使用者 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  const database =
    getDatabase();

  const row =
    database
      .prepare(`
        SELECT
          doctors.id,
          doctors.clinicId,
          doctors.userId,
          doctors.name,
          doctors.account,
          doctors.passwordHash,
          doctors.specialty,
          doctors.phone,
          doctors.role,
          doctors.isActive,
          doctors.createdAt,
          doctors.updatedAt

        FROM doctors

        INNER JOIN doctorClinics
          ON doctorClinics.doctorId =
             doctors.id

        WHERE
          doctors.userId = ?
          AND doctorClinics.clinicId = ?

        LIMIT 1
      `)
      .get(
        userId,
        clinicId,
      ) as
      | DoctorDbRow
      | undefined;

  if (!row) {
    return null;
  }

  return toDoctorRecord(
    row,
    clinicId,
  );
}

export function getActiveDoctorByUserId(
  userId: number,
  clinicId: number,
):
  DoctorRecord | null {
  const doctor =
    getDoctorByUserId(
      userId,
      clinicId,
    );

  if (
    !doctor ||
    doctor.isActive !==
      1
  ) {
    return null;
  }

  return doctor;
}

/* =========================================================
   Doctor Clinics
========================================================= */

export function getDoctorClinics(
  doctorId: number,
):
  DoctorClinicRecord[] {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  requireDoctorRaw(
    doctorId,
  );

  const database =
    getDatabase();

  return database
    .prepare(`
      SELECT
        doctorClinics.doctorId,

        doctorClinics.clinicId,

        clinics.code
          AS clinicCode,

        clinics.name
          AS clinicName,

        clinics.isActive
          AS clinicIsActive,

        doctorClinics.isPrimary,

        doctorClinics.createdAt,

        doctorClinics.updatedAt

      FROM doctorClinics

      INNER JOIN clinics
        ON clinics.id =
           doctorClinics.clinicId

      WHERE
        doctorClinics.doctorId = ?

      ORDER BY
        doctorClinics.isPrimary DESC,
        clinics.name ASC,
        clinics.id ASC
    `)
    .all(
      doctorId,
    ) as
    DoctorClinicRecord[];
}

/* =========================================================
   Sync User Clinics From Doctor Clinics

   Doctor 登入權限與執業院所必須一致。

   doctorClinics
       ↓
   userClinics
========================================================= */

function syncDoctorUserClinics(
  doctorId: number,
) {
  const database =
    getDatabase();

  const doctor =
    requireDoctorRaw(
      doctorId,
    );

  if (
    doctor.userId ===
    null
  ) {
    return;
  }

  const memberships =
    database
      .prepare(`
        SELECT
          clinicId,
          isPrimary

        FROM doctorClinics

        WHERE
          doctorId = ?

        ORDER BY
          isPrimary DESC,
          clinicId ASC
      `)
      .all(
        doctorId,
      ) as Array<{
      clinicId: number;

      isPrimary: number;
    }>;

  database
    .prepare(`
      DELETE FROM userClinics

      WHERE userId = ?
    `)
    .run(
      doctor.userId,
    );

  if (
    memberships.length ===
    0
  ) {
    return;
  }

  const insert =
    database.prepare(`
      INSERT INTO userClinics (
        userId,
        clinicId,
        isPrimary
      )

      VALUES (
        ?,
        ?,
        ?
      )
    `);

  for (
    const membership of
    memberships
  ) {
    insert.run(
      doctor.userId,
      membership.clinicId,
      membership.isPrimary,
    );
  }
}

/* =========================================================
   Set Doctor Clinics
========================================================= */

export function setDoctorClinics(
  doctorId: number,
  clinicIds: number[],
  primaryClinicId: number,
):
  DoctorClinicRecord[] {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  validatePositiveInteger(
    primaryClinicId,
    "主要院所 ID",
  );

  requireDoctorRaw(
    doctorId,
  );

  const uniqueClinicIds =
    ensureActiveClinics(
      clinicIds,
    );

  if (
    !uniqueClinicIds.includes(
      primaryClinicId,
    )
  ) {
    throw new Error(
      "主要院所必須包含在執業院所內",
    );
  }

  const database =
    getDatabase();

  const transaction =
    database.transaction(
      () => {
        database
          .prepare(`
            DELETE FROM doctorClinics

            WHERE doctorId = ?
          `)
          .run(
            doctorId,
          );

        const insert =
          database.prepare(`
            INSERT INTO doctorClinics (
              doctorId,
              clinicId,
              isPrimary
            )

            VALUES (
              ?,
              ?,
              ?
            )
          `);

        for (
          const clinicId of
          uniqueClinicIds
        ) {
          insert.run(
            doctorId,
            clinicId,
            clinicId ===
              primaryClinicId
              ? 1
              : 0,
          );
        }

        /*
         * legacy / compatibility clinicId
         * 永遠指向主要院所。
         */
        database
          .prepare(`
            UPDATE doctors

            SET
              clinicId = ?,
              updatedAt =
                CURRENT_TIMESTAMP

            WHERE id = ?
          `)
          .run(
            primaryClinicId,
            doctorId,
          );

        /*
         * 登入帳號院所同步。
         */
        syncDoctorUserClinics(
          doctorId,
        );
      },
    );

  transaction();

  return getDoctorClinics(
    doctorId,
  );
}

/* =========================================================
   Add Doctor Clinic
========================================================= */

export function addDoctorClinic(
  doctorId: number,
  clinicId: number,
):
  DoctorClinicRecord[] {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  const doctor =
    requireDoctorRaw(
      doctorId,
    );

  const memberships =
    getDoctorClinics(
      doctorId,
    );

  if (
    memberships.some(
      (
        membership,
      ) =>
        membership.clinicId ===
        clinicId,
    )
  ) {
    return memberships;
  }

  const nextIds = [
    ...memberships.map(
      (
        membership,
      ) =>
        membership.clinicId,
    ),

    clinicId,
  ];

  const currentPrimary =
    memberships.find(
      (
        membership,
      ) =>
        membership.isPrimary ===
        1,
    );

  const primaryClinicId =
    currentPrimary?.clinicId ??
    doctor.clinicId ??
    clinicId;

  return setDoctorClinics(
    doctorId,
    nextIds,
    primaryClinicId,
  );
}

/* =========================================================
   Remove Doctor Clinic
========================================================= */

export function removeDoctorClinic(
  doctorId: number,
  clinicId: number,
):
  DoctorClinicRecord[] {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  validatePositiveInteger(
    clinicId,
    "院所 ID",
  );

  const memberships =
    getDoctorClinics(
      doctorId,
    );

  const target =
    memberships.find(
      (
        membership,
      ) =>
        membership.clinicId ===
        clinicId,
    );

  if (!target) {
    throw new Error(
      "此醫師沒有該院所的執業設定",
    );
  }

  if (
    memberships.length <=
    1
  ) {
    throw new Error(
      "醫師至少需要保留一間執業院所",
    );
  }

  const remaining =
    memberships.filter(
      (
        membership,
      ) =>
        membership.clinicId !==
        clinicId,
    );

  const nextPrimary =
    target.isPrimary ===
    1
      ? remaining[0]
          .clinicId
      : (
          remaining.find(
            (
              membership,
            ) =>
              membership.isPrimary ===
              1,
          )?.clinicId ??
          remaining[0]
            .clinicId
        );

  return setDoctorClinics(
    doctorId,

    remaining.map(
      (
        membership,
      ) =>
        membership.clinicId,
    ),

    nextPrimary,
  );
}

/* =========================================================
   Primary Clinic
========================================================= */

export function setDoctorPrimaryClinic(
  doctorId: number,
  clinicId: number,
):
  DoctorClinicRecord[] {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  validatePositiveInteger(
    clinicId,
    "院所 ID",
  );

  const memberships =
    getDoctorClinics(
      doctorId,
    );

  if (
    !memberships.some(
      (
        membership,
      ) =>
        membership.clinicId ===
        clinicId,
    )
  ) {
    throw new Error(
      "主要院所必須是醫師目前的執業院所",
    );
  }

  return setDoctorClinics(
    doctorId,

    memberships.map(
      (
        membership,
      ) =>
        membership.clinicId,
    ),

    clinicId,
  );
}

/* =========================================================
   Create / Repair Login User

   必須在 SQLite transaction 內呼叫。

   passwordHash 已在 transaction 外完成 bcrypt。
========================================================= */

function createOrLinkDoctorUser(
  input: {
    doctorId?:
      number;

    requestedUserId?:
      number | null;

    name: string;

    account: string;

    phone: string;

    isActive: number;

    passwordHash: string;
  },
):
  number {
  const database =
    getDatabase();

  const account =
    normalizeAccount(
      input.account,
    );

  let user:
    UserDbRow | null = null;

  /* =======================================================
     1. 明確指定 User
  ======================================================= */

  if (
    input.requestedUserId !==
      undefined &&
    input.requestedUserId !==
      null
  ) {
    user =
      ensureUserCanLinkToDoctor(
        input.requestedUserId,
        input.doctorId,
      );

    ensureUserAccountAvailable(
      account,
      user.id,
    );
  }

  /* =======================================================
     2. 按帳號找既有 Doctor User
  ======================================================= */

  if (!user) {
    const existing =
      findUserByAccount(
        account,
      );

    if (existing) {
      if (
        existing.role !==
        "Doctor"
      ) {
        throw new Error(
          "此登入帳號已屬於其他角色，無法建立醫師登入",
        );
      }

      ensureUserCanLinkToDoctor(
        existing.id,
        input.doctorId,
      );

      user =
        existing;
    }
  }

  /* =======================================================
     3. 不存在 → 建立 Doctor User
  ======================================================= */

  if (!user) {
    const result =
      database
        .prepare(`
          INSERT INTO users (
            name,
            account,
            passwordHash,
            role,
            phone,
            email,
            isActive
          )

          VALUES (
            ?,
            ?,
            ?,
            'Doctor',
            ?,
            '',
            ?
          )
        `)
        .run(
          input.name,
          account,
          input.passwordHash,
          input.phone,
          input.isActive,
        );

    return Number(
      result.lastInsertRowid,
    );
  }

  /* =======================================================
     4. 已存在 → 修復 / 同步
  ======================================================= */

  database
    .prepare(`
      UPDATE users

      SET
        name = ?,
        account = ?,
        passwordHash = ?,
        role = 'Doctor',
        phone = ?,
        isActive = ?,
        updatedAt =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `)
    .run(
      input.name,
      account,
      input.passwordHash,
      input.phone,
      input.isActive,
      user.id,
    );

  return user.id;
}

/* =========================================================
   Create Doctor

   建立流程：

   doctors
       ↓
   users
       ↓
   doctors.userId
       ↓
   doctorClinics
       ↓
   userClinics

   這樣新增完成後即可登入。
========================================================= */

export async function createDoctor(
  clinicId: number,
  input: DoctorInput,
):
  Promise<DoctorRecord> {
  ensureActiveClinic(
    clinicId,
  );

  validateDoctorInput(
    input,
  );

  const name =
    normalizeText(
      input.name,
    );

  const account =
    normalizeAccount(
      input.account,
    );

  const specialty =
    normalizeText(
      input.specialty,
    );

  const phone =
    normalizeText(
      input.phone,
    );

  const isActive =
    normalizeIsActive(
      input.isActive,
    );

  const password =
    String(
      input.password ?? "",
    );

  validatePassword(
    password,
  );

  ensureDoctorAccountAvailable(
    account,
  );

  /*
   * 如果 User 帳號已存在，
   * 只有未連結的 Doctor User 可以接手。
   */
  const existingUser =
    findUserByAccount(
      account,
    );

  if (
    existingUser
  ) {
    if (
      existingUser.role !==
      "Doctor"
    ) {
      throw new Error(
        "此登入帳號已被其他角色使用",
      );
    }

    ensureUserCanLinkToDoctor(
      existingUser.id,
    );
  }

  const passwordHash =
    await bcrypt.hash(
      password,
      BCRYPT_ROUNDS,
    );

  const database =
    getDatabase();

  const transaction =
    database.transaction(
      () => {
        /*
         * 先建立 / 修復 User。
         *
         * doctorId 此刻尚未存在，
         * 所以先不傳 doctorId。
         */
        const userId =
          createOrLinkDoctorUser({
            requestedUserId:
              input.userId,

            name,

            account,

            phone,

            isActive,

            passwordHash,
          });

        const result =
          database
            .prepare(`
              INSERT INTO doctors (
                clinicId,
                userId,
                name,
                account,
                passwordHash,
                specialty,
                phone,
                role,
                isActive
              )

              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                'Doctor',
                ?
              )
            `)
            .run(
              clinicId,
              userId,
              name,
              account,
              passwordHash,
              specialty,
              phone,
              isActive,
            );

        const doctorId =
          Number(
            result.lastInsertRowid,
          );

        database
          .prepare(`
            INSERT INTO doctorClinics (
              doctorId,
              clinicId,
              isPrimary
            )

            VALUES (
              ?,
              ?,
              1
            )
          `)
          .run(
            doctorId,
            clinicId,
          );

        syncDoctorUserClinics(
          doctorId,
        );

        return doctorId;
      },
    );

  const doctorId =
    transaction();

  const created =
    getDoctorById(
      doctorId,
      clinicId,
    );

  if (!created) {
    throw new Error(
      "醫師建立完成，但無法重新讀取資料",
    );
  }

  return created;
}

/* =========================================================
   Update Doctor

   password 空白：
   保留真正 users.passwordHash。

   這也能修復舊資料：
   doctors.userId = NULL
========================================================= */

export async function updateDoctor(
  doctorId: number,
  clinicId: number,
  input: DoctorInput,
):
  Promise<DoctorRecord> {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  const current =
    requireDoctorClinic(
      doctorId,
      clinicId,
    );

  validateDoctorInput(
    input,
  );

  const database =
    getDatabase();

  const name =
    normalizeText(
      input.name,
    );

  const account =
    normalizeAccount(
      input.account,
    );

  const specialty =
    normalizeText(
      input.specialty,
    );

  const phone =
    normalizeText(
      input.phone,
    );

  const isActive =
    normalizeIsActive(
      input.isActive,
    );

  ensureDoctorAccountAvailable(
    account,
    doctorId,
  );

  /* =======================================================
     Resolve User
  ======================================================= */

  let linkedUser:
    UserDbRow | null =
      null;

  /*
   * UI 如果明確傳 userId，
   * 優先採用。
   */
  if (
    input.userId !==
      undefined &&
    input.userId !==
      null
  ) {
    linkedUser =
      ensureUserCanLinkToDoctor(
        input.userId,
        doctorId,
      );
  } else if (
    current.userId !==
    null
  ) {
    linkedUser =
      getUserRaw(
        current.userId,
      );

    if (
      linkedUser &&
      linkedUser.role !==
        "Doctor"
    ) {
      throw new Error(
        "目前醫師連結的登入帳號不是 Doctor 角色",
      );
    }
  }

  /*
   * 舊資料 userId = NULL：
   * 嘗試依 account 找 User。
   */
  if (!linkedUser) {
    const accountUser =
      findUserByAccount(
        account,
      );

    if (
      accountUser
    ) {
      if (
        accountUser.role !==
        "Doctor"
      ) {
        throw new Error(
          "此登入帳號已被其他角色使用",
        );
      }

      ensureUserCanLinkToDoctor(
        accountUser.id,
        doctorId,
      );

      linkedUser =
        accountUser;
    }
  }

  ensureUserAccountAvailable(
    account,
    linkedUser?.id ??
      null,
  );

  /* =======================================================
     Password

     真正登入來源為 users。
  ======================================================= */

  const newPassword =
    String(
      input.password ?? "",
    );

  let passwordHash =
    linkedUser?.passwordHash ??
    current.passwordHash;

  if (
    newPassword.trim()
  ) {
    validatePassword(
      newPassword,
    );

    passwordHash =
      await bcrypt.hash(
        newPassword,
        BCRYPT_ROUNDS,
      );
  }

  const transaction =
    database.transaction(
      () => {
        let userId =
          linkedUser?.id ??
          null;

        /*
         * 如果沒有 User，
         * 使用目前可用的 passwordHash
         * 建立 Doctor User。
         *
         * 舊 doctors.passwordHash
         * 會因此被保留。
         */
        if (
          userId ===
          null
        ) {
          userId =
            createOrLinkDoctorUser({
              doctorId,

              requestedUserId:
                input.userId,

              name,

              account,

              phone,

              isActive,

              passwordHash,
            });
        } else {
          database
            .prepare(`
              UPDATE users

              SET
                name = ?,
                account = ?,
                passwordHash = ?,
                role = 'Doctor',
                phone = ?,
                isActive = ?,
                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE id = ?
            `)
            .run(
              name,
              account,
              passwordHash,
              phone,
              isActive,
              userId,
            );
        }

        const result =
          database
            .prepare(`
              UPDATE doctors

              SET
                userId = ?,
                name = ?,
                account = ?,
                passwordHash = ?,
                specialty = ?,
                phone = ?,
                role = 'Doctor',
                isActive = ?,
                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE id = ?
            `)
            .run(
              userId,
              name,
              account,
              passwordHash,
              specialty,
              phone,
              isActive,
              doctorId,
            );

        if (
          result.changes !==
          1
        ) {
          throw new Error(
            "醫師資料更新失敗",
          );
        }

        /*
         * 修復 / 同步登入院所。
         */
        syncDoctorUserClinics(
          doctorId,
        );
      },
    );

  transaction();

  const updated =
    getDoctorById(
      doctorId,
      clinicId,
    );

  if (!updated) {
    throw new Error(
      "醫師更新完成，但無法重新讀取資料",
    );
  }

  return updated;
}

/* =========================================================
   Delete / Remove Doctor

   多院所：
   只移除目前院所 membership，
   不破壞全域 Doctor identity。

   最後一間院所：
   若已有 Implant 歷史則禁止刪除。
   若無歷史才真正刪除 Doctor 與 Doctor User。
========================================================= */

export function deleteDoctor(
  doctorId: number,
  clinicId: number,
):
  boolean {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  validatePositiveInteger(
    clinicId,
    "院所 ID",
  );

  const doctor =
    requireDoctorClinic(
      doctorId,
      clinicId,
    );

  const memberships =
    getDoctorClinics(
      doctorId,
    );

  /* =======================================================
     多院所：
     只移除目前院所
  ======================================================= */

  if (
    memberships.length >
    1
  ) {
    removeDoctorClinic(
      doctorId,
      clinicId,
    );

    return true;
  }

  const database =
    getDatabase();

  /*
   * 有醫療歷史不能真正刪除。
   */
  const implant =
    database
      .prepare(`
        SELECT id

        FROM implants

        WHERE doctorId = ?

        LIMIT 1
      `)
      .get(
        doctorId,
      );

  if (implant) {
    throw new Error(
      "此醫師已有植體個案紀錄，無法刪除。若不再執業，請改為停用。",
    );
  }

  const transaction =
    database.transaction(
      () => {
        const linkedUserId =
          doctor.userId;

        const result =
          database
            .prepare(`
              DELETE FROM doctors

              WHERE id = ?
            `)
            .run(
              doctorId,
            );

        if (
          result.changes !==
          1
        ) {
          throw new Error(
            "醫師刪除失敗",
          );
        }

        /*
         * 若這個 User 沒有再連到其他 Doctor，
         * 且角色是 Doctor，
         * 一併清除登入帳號。
         *
         * userClinics 會因 FK CASCADE
         * 自動移除。
         */
        if (
          linkedUserId !==
          null
        ) {
          const stillLinked =
            database
              .prepare(`
                SELECT id

                FROM doctors

                WHERE userId = ?

                LIMIT 1
              `)
              .get(
                linkedUserId,
              );

          if (
            !stillLinked
          ) {
            database
              .prepare(`
                DELETE FROM users

                WHERE
                  id = ?
                  AND role =
                    'Doctor'
              `)
              .run(
                linkedUserId,
              );
          }
        }
      },
    );

  transaction();

  return true;
}