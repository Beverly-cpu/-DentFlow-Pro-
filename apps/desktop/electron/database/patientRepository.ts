import {
  getDatabase,
} from "./db";

/* =========================================================
   Types
========================================================= */

export type PatientRecord = {
  id: number;

  clinicId: number;

  chartNumber: string;

  name: string;

  birthDate: string;

  phone: string;

  doctor: string;

  note: string;

  createdAt: string;

  updatedAt: string;
};

/*
 * 多院所瀏覽時使用。
 *
 * 保留 PatientRecord 所有欄位，
 * 額外帶回來源院所資訊。
 */
export type PatientWithClinicRecord =
  PatientRecord & {
    clinicCode: string;

    clinicName: string;
  };

export type PatientInput = {
  chartNumber: string;

  name: string;

  birthDate: string;

  phone: string;

  doctor: string;

  note: string;
};

/* =========================================================
   Internal Types
========================================================= */

type ClinicRow = {
  id: number;

  code: string;

  name: string;

  isActive: number;
};

type DoctorRow = {
  id: number;

  userId:
    number | null;

  name: string;

  isActive: number;
};

/* =========================================================
   Helpers
========================================================= */

function normalizeRequiredText(
  value: string,
  label: string,
) {
  const normalized =
    String(
      value ?? "",
    ).trim();

  if (!normalized) {
    throw new Error(
      `${label}不可空白`,
    );
  }

  return normalized;
}

function normalizeOptionalText(
  value: string,
) {
  return String(
    value ?? "",
  ).trim();
}

function getClinic(
  clinicId: number,
):
  ClinicRow | null {
  const db =
    getDatabase();

  const clinic =
    db
      .prepare(`
        SELECT
          id,
          code,
          name,
          isActive

        FROM clinics

        WHERE
          id = ?
      `)
      .get(
        clinicId,
      ) as
      | ClinicRow
      | undefined;

  return clinic ?? null;
}

function ensureActiveClinic(
  clinicId: number,
) {
  const clinic =
    getClinic(
      clinicId,
    );

  if (
    !clinic ||
    clinic.isActive !==
      1
  ) {
    throw new Error(
      "找不到有效院所",
    );
  }

  return clinic;
}

function getDoctor(
  doctorId: number,
):
  DoctorRow | null {
  const db =
    getDatabase();

  const doctor =
    db
      .prepare(`
        SELECT
          id,
          userId,
          name,
          isActive

        FROM doctors

        WHERE
          id = ?
      `)
      .get(
        doctorId,
      ) as
      | DoctorRow
      | undefined;

  return doctor ?? null;
}

function ensureDoctorExists(
  doctorId: number,
) {
  const doctor =
    getDoctor(
      doctorId,
    );

  if (!doctor) {
    throw new Error(
      "找不到醫師資料",
    );
  }

  return doctor;
}

function ensureDoctorClinic(
  doctorId: number,
  clinicId: number,
) {
  const db =
    getDatabase();

  const membership =
    db
      .prepare(`
        SELECT
          doctorId,
          clinicId

        FROM doctorClinics

        WHERE
          doctorId = ?

          AND clinicId = ?
      `)
      .get(
        doctorId,
        clinicId,
      ) as
      | {
          doctorId: number;

          clinicId: number;
        }
      | undefined;

  if (!membership) {
    throw new Error(
      "此醫師不屬於目前院所",
    );
  }
}

function validatePatientInput(
  input: PatientInput,
) {
  const chartNumber =
    normalizeRequiredText(
      input.chartNumber,
      "病歷號",
    );

  const name =
    normalizeRequiredText(
      input.name,
      "病患姓名",
    );

  const birthDate =
    normalizeOptionalText(
      input.birthDate,
    );

  const phone =
    normalizeOptionalText(
      input.phone,
    );

  const doctor =
    normalizeOptionalText(
      input.doctor,
    );

  const note =
    normalizeOptionalText(
      input.note,
    );

  return {
    chartNumber,
    name,
    birthDate,
    phone,
    doctor,
    note,
  };
}

function ensureChartNumberAvailable(
  chartNumber: string,
  excludePatientId?:
    number,
) {
  const db =
    getDatabase();

  let record:
    | {
        id: number;
      }
    | undefined;

  /*
   * 注意：
   *
   * 現有 DB patients.chartNumber
   * 是全資料庫 UNIQUE，
   * 所以目前仍然是跨院所唯一。
   *
   * 這裡不能擅自改成院所內唯一，
   * 否則會與現有 Schema 衝突。
   */
  if (
    excludePatientId ===
    undefined
  ) {
    record =
      db
        .prepare(`
          SELECT
            id

          FROM patients

          WHERE
            chartNumber = ?

          LIMIT 1
        `)
        .get(
          chartNumber,
        ) as
        | {
            id: number;
          }
        | undefined;
  } else {
    record =
      db
        .prepare(`
          SELECT
            id

          FROM patients

          WHERE
            chartNumber = ?

            AND id <> ?

          LIMIT 1
        `)
        .get(
          chartNumber,
          excludePatientId,
        ) as
        | {
            id: number;
          }
        | undefined;
  }

  if (record) {
    throw new Error(
      "此病歷號已存在",
    );
  }
}

/* =========================================================
   Common SELECT
========================================================= */

const patientSelect = `
  SELECT
    patients.id,

    patients.clinicId,

    patients.chartNumber,

    patients.name,

    patients.birthDate,

    patients.phone,

    patients.doctor,

    patients.note,

    patients.createdAt,

    patients.updatedAt

  FROM patients
`;

const patientWithClinicSelect = `
  SELECT
    patients.id,

    patients.clinicId,

    patients.chartNumber,

    patients.name,

    patients.birthDate,

    patients.phone,

    patients.doctor,

    patients.note,

    patients.createdAt,

    patients.updatedAt,

    clinics.code
      AS clinicCode,

    clinics.name
      AS clinicName

  FROM patients

  INNER JOIN clinics
    ON clinics.id =
       patients.clinicId
`;

/* =========================================================
   List - Current Clinic
========================================================= */

export function getPatients(
  clinicId: number,
):
  PatientRecord[] {
  ensureActiveClinic(
    clinicId,
  );

  const db =
    getDatabase();

  return db
    .prepare(`
      ${patientSelect}

      WHERE
        patients.clinicId = ?

      ORDER BY
        patients.name
          COLLATE NOCASE ASC,

        patients.id ASC
    `)
    .all(
      clinicId,
    ) as
    PatientRecord[];
}

/* =========================================================
   By ID - Current Clinic
========================================================= */

export function getPatientById(
  patientId: number,
  clinicId: number,
):
  PatientRecord | null {
  ensureActiveClinic(
    clinicId,
  );

  const db =
    getDatabase();

  const patient =
    db
      .prepare(`
        ${patientSelect}

        WHERE
          patients.id = ?

          AND patients.clinicId = ?

        LIMIT 1
      `)
      .get(
        patientId,
        clinicId,
      ) as
      | PatientRecord
      | undefined;

  return patient ?? null;
}

/* =========================================================
   Patients By Doctor - Current Clinic

   此 API 保留目前既有介面：

   getPatientsByDoctor(
     doctorId,
     clinicId,
   )

   ---------------------------------------------------------

   必須同時符合：

   1. Doctor 確實屬於 clinicId
   2. Patient 屬於 clinicId
   3. Implant 屬於 clinicId
   4. Implant.doctorId = doctorId

   避免跨院所資料混入。
========================================================= */

export function getPatientsByDoctor(
  doctorId: number,
  clinicId: number,
):
  PatientRecord[] {
  ensureActiveClinic(
    clinicId,
  );

  const doctor =
    ensureDoctorExists(
      doctorId,
    );

  if (
    doctor.isActive !==
    1
  ) {
    throw new Error(
      "此醫師目前已停用",
    );
  }

  ensureDoctorClinic(
    doctorId,
    clinicId,
  );

  const db =
    getDatabase();

  return db
    .prepare(`
      ${patientSelect}

      WHERE
        patients.clinicId = ?

        AND EXISTS (
          SELECT
            1

          FROM implants

          WHERE
            implants.patientId =
              patients.id

            AND implants.doctorId = ?

            AND implants.clinicId = ?

          LIMIT 1
        )

      ORDER BY
        patients.name
          COLLATE NOCASE ASC,

        patients.id ASC
    `)
    .all(
      clinicId,
      doctorId,
      clinicId,
    ) as
    PatientRecord[];
}

/* =========================================================
   Patients By Doctor - ALL Doctor Clinics

   新增：
   Doctor「全部我的院所」使用。

   ---------------------------------------------------------

   前端不傳 clinicIds。

   後端直接依：

   doctorClinics.doctorId = ?

   判斷此 Doctor 真正可查的院所。

   ---------------------------------------------------------

   回傳額外：

   clinicCode
   clinicName

   讓 Renderer 能清楚顯示病患來源院所。
========================================================= */

export function getPatientsByDoctorAllClinics(
  doctorId: number,
):
  PatientWithClinicRecord[] {
  const doctor =
    ensureDoctorExists(
      doctorId,
    );

  if (
    doctor.isActive !==
    1
  ) {
    throw new Error(
      "此醫師目前已停用",
    );
  }

  const db =
    getDatabase();

  /*
   * 至少必須有一筆 doctorClinics。
   */
  const membership =
    db
      .prepare(`
        SELECT
          doctorId

        FROM doctorClinics

        WHERE
          doctorId = ?

        LIMIT 1
      `)
      .get(
        doctorId,
      ) as
      | {
          doctorId: number;
        }
      | undefined;

  if (!membership) {
    throw new Error(
      "此醫師尚未設定執業院所",
    );
  }

  return db
    .prepare(`
      ${patientWithClinicSelect}

      WHERE
        clinics.isActive = 1

        AND EXISTS (
          SELECT
            1

          FROM doctorClinics dc

          WHERE
            dc.doctorId = ?

            AND dc.clinicId =
                patients.clinicId
        )

        AND EXISTS (
          SELECT
            1

          FROM implants

          WHERE
            implants.patientId =
              patients.id

            AND implants.doctorId = ?

            /*
             * Implant 與 Patient
             * 必須屬於相同院所。
             */
            AND implants.clinicId =
                patients.clinicId

            /*
             * 再次確認該 Implant 院所
             * 真的是 Doctor 的執業院所。
             */
            AND EXISTS (
              SELECT
                1

              FROM doctorClinics dc2

              WHERE
                dc2.doctorId = ?

                AND dc2.clinicId =
                    implants.clinicId
            )

          LIMIT 1
        )

      ORDER BY
        clinics.name
          COLLATE NOCASE ASC,

        patients.name
          COLLATE NOCASE ASC,

        patients.id ASC
    `)
    .all(
      doctorId,
      doctorId,
      doctorId,
    ) as
    PatientWithClinicRecord[];
}

/* =========================================================
   Patients By User - ALL Doctor Clinics

   之後 Renderer 使用 session.userId
   時可直接呼叫。

   ---------------------------------------------------------

   userId
      ↓
   doctors.userId
      ↓
   doctor.id
      ↓
   doctorClinics
      ↓
   所有病患

   ---------------------------------------------------------

   這個 API 可以避免 Renderer 自己猜 doctorId。
========================================================= */

export function getPatientsByDoctorUserAllClinics(
  userId: number,
):
  PatientWithClinicRecord[] {
  const db =
    getDatabase();

  const doctor =
    db
      .prepare(`
        SELECT
          id,
          userId,
          name,
          isActive

        FROM doctors

        WHERE
          userId = ?

        LIMIT 1
      `)
      .get(
        userId,
      ) as
      | DoctorRow
      | undefined;

  if (!doctor) {
    throw new Error(
      "此登入使用者尚未連結醫師資料",
    );
  }

  return getPatientsByDoctorAllClinics(
    doctor.id,
  );
}

/* =========================================================
   Create
========================================================= */

export function createPatient(
  clinicId: number,
  input: PatientInput,
):
  PatientRecord {
  ensureActiveClinic(
    clinicId,
  );

  const normalized =
    validatePatientInput(
      input,
    );

  ensureChartNumberAvailable(
    normalized.chartNumber,
  );

  const db =
    getDatabase();

  const result =
    db
      .prepare(`
        INSERT INTO patients (
          clinicId,
          chartNumber,
          name,
          birthDate,
          phone,
          doctor,
          note
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `)
      .run(
        clinicId,
        normalized.chartNumber,
        normalized.name,
        normalized.birthDate,
        normalized.phone,
        normalized.doctor,
        normalized.note,
      );

  const patientId =
    Number(
      result.lastInsertRowid,
    );

  const patient =
    getPatientById(
      patientId,
      clinicId,
    );

  if (!patient) {
    throw new Error(
      "病患建立後讀取失敗",
    );
  }

  return patient;
}

/* =========================================================
   Update
========================================================= */

export function updatePatient(
  patientId: number,
  clinicId: number,
  input: PatientInput,
):
  PatientRecord {
  ensureActiveClinic(
    clinicId,
  );

  const current =
    getPatientById(
      patientId,
      clinicId,
    );

  if (!current) {
    throw new Error(
      "找不到目前院所的病患資料",
    );
  }

  const normalized =
    validatePatientInput(
      input,
    );

  ensureChartNumberAvailable(
    normalized.chartNumber,
    patientId,
  );

  const db =
    getDatabase();

  /*
   * clinicId 不存在 PatientInput，
   * 因此 update 無法把病患搬到其他院所。
   */
  const result =
    db
      .prepare(`
        UPDATE patients

        SET
          chartNumber = ?,
          name = ?,
          birthDate = ?,
          phone = ?,
          doctor = ?,
          note = ?,
          updatedAt =
            CURRENT_TIMESTAMP

        WHERE
          id = ?

          AND clinicId = ?
      `)
      .run(
        normalized.chartNumber,
        normalized.name,
        normalized.birthDate,
        normalized.phone,
        normalized.doctor,
        normalized.note,
        patientId,
        clinicId,
      );

  if (
    result.changes !==
    1
  ) {
    throw new Error(
      "病患資料更新失敗",
    );
  }

  const updated =
    getPatientById(
      patientId,
      clinicId,
    );

  if (!updated) {
    throw new Error(
      "病患資料更新後讀取失敗",
    );
  }

  return updated;
}

/* =========================================================
   Delete
========================================================= */

export function deletePatient(
  patientId: number,
  clinicId: number,
):
  boolean {
  ensureActiveClinic(
    clinicId,
  );

  const patient =
    getPatientById(
      patientId,
      clinicId,
    );

  if (!patient) {
    throw new Error(
      "找不到目前院所的病患資料",
    );
  }

  const db =
    getDatabase();

  /*
   * 必須同時限定 patientId + clinicId。
   *
   * 避免因錯誤 ID
   * 檢查到其他院所案件。
   */
  const implantReference =
    db
      .prepare(`
        SELECT
          id

        FROM implants

        WHERE
          patientId = ?

          AND clinicId = ?

        LIMIT 1
      `)
      .get(
        patientId,
        clinicId,
      ) as
      | {
          id: number;
        }
      | undefined;

  if (implantReference) {
    throw new Error(
      "此病患已有植體案件紀錄，無法刪除",
    );
  }

  const result =
    db
      .prepare(`
        DELETE FROM patients

        WHERE
          id = ?

          AND clinicId = ?
      `)
      .run(
        patientId,
        clinicId,
      );

  return (
    result.changes ===
    1
  );
}