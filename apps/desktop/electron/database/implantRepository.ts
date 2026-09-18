import {
  getDatabase,
} from "./db";

/* =========================================================
   Implant Status
========================================================= */

export type ImplantStatus =
  | "待醫師叫貨"
  | "醫師已叫貨"
  | "已取出待手術"
  | "待術後紀錄"
  | "待歸回品項"
  | "已完成"
  | "已結案"
  | "已取消";

export type ImplantReservationRecord = {
  id: number;
  implantPlanItemId: number;
  reservedQuantity: number;
  pickedQuantity: number;
  usedQuantity: number;
  returnedQuantity: number;
  reservedAt: string | null;
  pickedAt: string | null;
  returnedAt: string | null;
};

/* =========================================================
   Plan Input

   術前只記錄規格。
   不記錄 REF / LOT / inventoryItemId。
========================================================= */

export type ImplantPlanItemInput = {
  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  quantity: number;
};

/* =========================================================
   Tooth Input
========================================================= */

export type ImplantToothInput = {
  toothPosition: string;

  items:
    ImplantPlanItemInput[];
};

/* =========================================================
   Implant Input
========================================================= */

export type ImplantInput = {
  patientId: number;

  doctorId:
    number | null;

  implantDate: string;

  note: string;

  status:
    ImplantStatus;

  teeth:
    ImplantToothInput[];
};

/* =========================================================
   Post-op Usage
========================================================= */

export type ImplantUsageSelectionInput = {
  inventoryItemId: number;

  quantity: number;
};

export type ImplantUsageInput = {
  implantPlanItemId: number;

  usages:
    ImplantUsageSelectionInput[];

  instrumentPhotoDataUrl?: string;
};

/* =========================================================
   Legacy Return
========================================================= */

export type ImplantReturnInput = {
  implantItemId: number;

  quantity: number;

  note?: string;
};

/* =========================================================
   Record Types
========================================================= */

export type ImplantUsageItemRecord = {
  id: number;

  implantPlanItemId: number;

  inventoryItemId: number;

  quantity: number;

  note: string;

  inventoryItemName: string;

  inventoryCategory: string;

  inventoryBrand: string;

  inventoryModel: string;

  inventorySpecification:
    string;

  inventoryRefNumber:
    string;

  inventoryLotNumber:
    string;

  inventoryExpiryDate:
    string;

  inventoryQuantity:
    number;

  /*
   * 植體實際使用當下的不可變成本快照。
   * 不使用目前 inventory.unitCost 回推歷史成本。
   */
  unitCost: number;

  totalCost: number;

  createdAt: string;

  updatedAt: string;
};

export type ImplantPlanItemRecord = {
  id: number;

  implantToothId: number;

  legacyImplantItemId:
    number | null;

  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  /*
   * DB 欄位是 plannedQuantity。
   * Renderer 繼續使用 quantity。
   */
  quantity: number;

  note: string;

  instrumentPhotoDataUrl: string;

  usageItems:
    ImplantUsageItemRecord[];

  createdAt: string;

  updatedAt: string;
};

export type ImplantToothRecord = {
  id: number;

  implantId: number;

  toothPosition: string;

  items:
    ImplantPlanItemRecord[];

  createdAt: string;

  updatedAt: string;
};

/* =========================================================
   Implant Record

   新增：
   clinicId
   clinicCode
   clinicName

   讓目前院所與多院所模式都知道案件來源。
========================================================= */

export type ImplantRecord = {
  id: number;

  clinicId: number;

  clinicCode: string;

  clinicName: string;

  patientId: number;

  doctorId:
    number | null;

  implantDate: string;

  note: string;

  status:
    ImplantStatus;

  patientName: string;

  patientChartNumber: string;

  doctorName:
    string | null;

  orderedAt: string | null;
  pickedAt: string | null;
  surgeryCompletedAt: string | null;
  returnedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  orderedByUserId: number | null;
  pickedByUserId: number | null;
  surgeryCompletedByUserId: number | null;
  returnedByUserId: number | null;
  closedByUserId: number | null;
  cancelledByUserId: number | null;
  doctorSignedAt: string | null;
  doctorSignature: string;
  doctorSignedByUserId: number | null;
  reservations: ImplantReservationRecord[];

  teeth:
    ImplantToothRecord[];

  createdAt: string;

  updatedAt: string;
};

/* =========================================================
   Internal DB Types
========================================================= */

type ImplantBaseRow = {
  id: number;

  clinicId: number;

  clinicCode: string;

  clinicName: string;

  patientId: number;

  doctorId:
    number | null;

  implantDate: string;

  note: string;

  status:
    ImplantStatus;

  patientName: string;

  patientChartNumber: string;

  doctorName:
    string | null;

  orderedAt: string | null;
  pickedAt: string | null;
  surgeryCompletedAt: string | null;
  returnedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  orderedByUserId: number | null;
  pickedByUserId: number | null;
  surgeryCompletedByUserId: number | null;
  returnedByUserId: number | null;
  closedByUserId: number | null;
  cancelledByUserId: number | null;
  doctorSignedAt: string | null;
  doctorSignature: string;
  doctorSignedByUserId: number | null;

  createdAt: string;

  updatedAt: string;
};

type ImplantToothRow = {
  id: number;

  implantId: number;

  toothPosition: string;

  createdAt: string;

  updatedAt: string;
};

type ImplantPlanItemRow = {
  id: number;

  implantToothId: number;

  legacyImplantItemId:
    number | null;

  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  quantity: number;

  note: string;

  instrumentPhotoDataUrl: string;

  createdAt: string;

  updatedAt: string;
};

type InventoryLookupRow = {
  id: number;

  clinicId: number;

  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  refNumber: string;

  lotNumber: string;

  expiryDate: string;

  quantity: number;

  unitCost: number;
};

type LegacyImplantItemRow = {
  id: number;

  implantToothId: number;

  inventoryItemId: number;

  quantity: number;

  deductedQuantity: number;

  usedQuantity: number;

  returnedQuantity: number;

  toothPosition: string;
};

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

  isActive: number;
};

/* =========================================================
   Base SELECT

   Patient 必須與 Implant 屬於同一 Clinic。
========================================================= */

const implantBaseSelect = `
  SELECT
    implants.id,

    implants.clinicId,

    clinics.code
      AS clinicCode,

    clinics.name
      AS clinicName,

    implants.patientId,

    implants.doctorId,

    implants.implantDate,

    implants.note,

    implants.status,

    implants.orderedAt,
    implants.pickedAt,
    implants.surgeryCompletedAt,
    implants.returnedAt,
    implants.closedAt,
    implants.cancelledAt,
    implants.cancelReason,
    implants.orderedByUserId,
    implants.pickedByUserId,
    implants.surgeryCompletedByUserId,
    implants.returnedByUserId,
    implants.closedByUserId,
    implants.cancelledByUserId,
    implants.doctorSignedAt,
    implants.doctorSignature,
    implants.doctorSignedByUserId,

    implants.createdAt,

    implants.updatedAt,

    patients.name
      AS patientName,

    patients.chartNumber
      AS patientChartNumber,

    doctors.name
      AS doctorName

  FROM implants

  INNER JOIN clinics
    ON clinics.id =
       implants.clinicId

  INNER JOIN patients
    ON patients.id =
       implants.patientId

    AND patients.clinicId =
        implants.clinicId

  LEFT JOIN doctors
    ON doctors.id =
       implants.doctorId
`;

/* =========================================================
   Clinic Helpers
========================================================= */

function getClinic(
  clinicId: number,
):
  ClinicRow | null {
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

function ensureWorkflowActor(
  userId: number,
  clinicId: number,
) {
  validatePositiveInteger(userId, "操作者 ID");
  const actor = getDatabase().prepare(`
    SELECT users.id
    FROM users
    INNER JOIN userClinics ON userClinics.userId = users.id
    WHERE users.id = ? AND users.isActive = 1 AND userClinics.clinicId = ?
    LIMIT 1
  `).get(userId, clinicId);
  if (!actor) throw new Error("操作者不存在、已停用或不屬於目前院所");
}

/* =========================================================
   Doctor Helpers
========================================================= */

function getDoctor(
  doctorId: number,
):
  DoctorRow | null {
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
          userId,
          isActive

        FROM doctors

        WHERE id = ?
      `)
      .get(
        doctorId,
      ) as
      | DoctorRow
      | undefined;

  return doctor ?? null;
}

function ensureDoctorClinic(
  doctorId: number,
  clinicId: number,
) {
  const doctor =
    getDoctor(
      doctorId,
    );

  if (!doctor) {
    throw new Error(
      "找不到指定的醫師",
    );
  }

  const database =
    getDatabase();

  const membership =
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

  if (!membership) {
    throw new Error(
      "此醫師不屬於目前院所",
    );
  }

  return doctor;
}

/* =========================================================
   Get All - Current Clinic
========================================================= */

export function getImplants(
  clinicId: number,
):
  ImplantRecord[] {
  ensureActiveClinic(
    clinicId,
  );

  const database =
    getDatabase();

  const rows =
    database
      .prepare(`
        ${implantBaseSelect}

        WHERE
          implants.clinicId = ?

        ORDER BY
          implants.implantDate DESC,
          implants.id DESC
      `)
      .all(
        clinicId,
      ) as
      ImplantBaseRow[];

  return rows.map(
    buildImplantRecord,
  );
}

/* =========================================================
   Get By ID - Current Clinic
========================================================= */

export function getImplantById(
  id: number,
  clinicId: number,
):
  ImplantRecord {
  validatePositiveInteger(
    id,
    "植體個案 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  const database =
    getDatabase();

  const row =
    database
      .prepare(`
        ${implantBaseSelect}

        WHERE
          implants.id = ?

          AND implants.clinicId = ?

        LIMIT 1
      `)
      .get(
        id,
        clinicId,
      ) as
      | ImplantBaseRow
      | undefined;

  if (!row) {
    throw new Error(
      "找不到目前院所的植體個案",
    );
  }

  return buildImplantRecord(
    row,
  );
}

/* =========================================================
   Get By Patient - Current Clinic
========================================================= */

export function getImplantsByPatient(
  patientId: number,
  clinicId: number,
):
  ImplantRecord[] {
  validatePositiveInteger(
    patientId,
    "病患 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  const database =
    getDatabase();

  const patient =
    database
      .prepare(`
        SELECT id

        FROM patients

        WHERE
          id = ?

          AND clinicId = ?
      `)
      .get(
        patientId,
        clinicId,
      );

  if (!patient) {
    throw new Error(
      "找不到目前院所的病患",
    );
  }

  const rows =
    database
      .prepare(`
        ${implantBaseSelect}

        WHERE
          implants.patientId = ?

          AND implants.clinicId = ?

        ORDER BY
          implants.implantDate DESC,
          implants.id DESC
      `)
      .all(
        patientId,
        clinicId,
      ) as
      ImplantBaseRow[];

  return rows.map(
    buildImplantRecord,
  );
}

/* =========================================================
   Get By Doctor - Current Clinic
========================================================= */

export function getImplantsByDoctor(
  doctorId: number,
  clinicId: number,
):
  ImplantRecord[] {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  ensureDoctorClinic(
    doctorId,
    clinicId,
  );

  const database =
    getDatabase();

  const rows =
    database
      .prepare(`
        ${implantBaseSelect}

        WHERE
          implants.doctorId = ?

          AND implants.clinicId = ?

        ORDER BY
          implants.implantDate DESC,
          implants.id DESC
      `)
      .all(
        doctorId,
        clinicId,
      ) as
      ImplantBaseRow[];

  return rows.map(
    buildImplantRecord,
  );
}

/* =========================================================
   Doctor - All Practice Clinics

   不接受 Renderer 傳 clinicIds。

   doctorId
   → doctorClinics
   → 真正執業院所
   → implants
========================================================= */

export function getImplantsByDoctorAllClinics(
  doctorId: number,
):
  ImplantRecord[] {
  validatePositiveInteger(
    doctorId,
    "醫師 ID",
  );

  const doctor =
    getDoctor(
      doctorId,
    );

  if (!doctor) {
    throw new Error(
      "找不到指定的醫師",
    );
  }

  if (
    doctor.isActive !==
    1
  ) {
    throw new Error(
      "此醫師目前已停用",
    );
  }

  const database =
    getDatabase();

  const membership =
    database
      .prepare(`
        SELECT doctorId

        FROM doctorClinics

        WHERE
          doctorId = ?

        LIMIT 1
      `)
      .get(
        doctorId,
      );

  if (!membership) {
    throw new Error(
      "此醫師尚未設定執業院所",
    );
  }

  const rows =
    database
      .prepare(`
        ${implantBaseSelect}

        WHERE
          implants.doctorId = ?

          AND clinics.isActive = 1

          AND EXISTS (
            SELECT
              1

            FROM doctorClinics dc

            WHERE
              dc.doctorId = ?

              AND dc.clinicId =
                  implants.clinicId
          )

        ORDER BY
          implants.implantDate DESC,
          implants.id DESC
      `)
      .all(
        doctorId,
        doctorId,
      ) as
      ImplantBaseRow[];

  return rows.map(
    buildImplantRecord,
  );
}

/* =========================================================
   Doctor User - All Clinics

   Doctor 登入時建議使用這個。

   userId
   → doctors.userId
   → doctorClinics
   ∩
   userClinics
   → implants

   也就是 Doctor 執業院所
   與登入帳號授權院所必須同時成立。
========================================================= */

export function getImplantsByDoctorUserAllClinics(
  userId: number,
):
  ImplantRecord[] {
  validatePositiveInteger(
    userId,
    "使用者 ID",
  );

  const database =
    getDatabase();

  const doctor =
    database
      .prepare(`
        SELECT
          id,
          userId,
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

  if (
    doctor.isActive !==
    1
  ) {
    throw new Error(
      "此醫師目前已停用",
    );
  }

  const rows =
    database
      .prepare(`
        ${implantBaseSelect}

        WHERE
          implants.doctorId = ?

          AND clinics.isActive = 1

          AND EXISTS (
            SELECT
              1

            FROM doctorClinics dc

            WHERE
              dc.doctorId = ?

              AND dc.clinicId =
                  implants.clinicId
          )

          AND EXISTS (
            SELECT
              1

            FROM userClinics uc

            WHERE
              uc.userId = ?

              AND uc.clinicId =
                  implants.clinicId
          )

        ORDER BY
          implants.implantDate DESC,
          implants.id DESC
      `)
      .all(
        doctor.id,
        doctor.id,
        userId,
      ) as
      ImplantBaseRow[];

  return rows.map(
    buildImplantRecord,
  );
}

/* =========================================================
   Build Implant
========================================================= */

function buildImplantRecord(
  row: ImplantBaseRow,
):
  ImplantRecord {
  return {
    ...row,

    reservations: getImplantReservations(row.id),

    teeth:
      getImplantTeeth(
        row.id,
      ),
  };
}

function getImplantReservations(
  implantId: number,
): ImplantReservationRecord[] {
  return getDatabase()
    .prepare(`
      SELECT id, implantPlanItemId, reservedQuantity, pickedQuantity,
             usedQuantity, returnedQuantity, reservedAt, pickedAt, returnedAt
      FROM implantReservations
      WHERE implantId = ?
      ORDER BY id ASC
    `)
    .all(implantId) as ImplantReservationRecord[];
}

/* =========================================================
   Teeth
========================================================= */

function getImplantTeeth(
  implantId: number,
):
  ImplantToothRecord[] {
  const database =
    getDatabase();

  const rows =
    database
      .prepare(`
        SELECT
          id,
          implantId,
          toothPosition,
          createdAt,
          updatedAt

        FROM implantTeeth

        WHERE
          implantId = ?

        ORDER BY
          id ASC
      `)
      .all(
        implantId,
      ) as
      ImplantToothRow[];

  return rows.map(
    (
      tooth,
    ) => ({
      ...tooth,

      items:
        getImplantPlanItems(
          tooth.id,
        ),
    }),
  );
}

/* =========================================================
   Plan Items
========================================================= */

function getImplantPlanItems(
  implantToothId: number,
):
  ImplantPlanItemRecord[] {
  const database =
    getDatabase();

  const rows =
    database
      .prepare(`
        SELECT
          id,

          implantToothId,

          legacyImplantItemId,

          name,

          category,

          brand,

          model,

          specification,

          plannedQuantity
            AS quantity,

          note,

          instrumentPhotoDataUrl,

          createdAt,

          updatedAt

        FROM implantPlanItems

        WHERE
          implantToothId = ?

        ORDER BY
          id ASC
      `)
      .all(
        implantToothId,
      ) as
      ImplantPlanItemRow[];

  return rows.map(
    (
      row,
    ) => ({
      ...row,

      usageItems:
        getImplantUsageItems(
          row.id,
        ),
    }),
  );
}

/* =========================================================
   Usage Items
========================================================= */

function getImplantUsageItems(
  implantPlanItemId: number,
):
  ImplantUsageItemRecord[] {
  const database =
    getDatabase();

  return database
    .prepare(`
      SELECT
        implantUsageItems.id,

        implantUsageItems.implantPlanItemId,

        implantUsageItems.inventoryItemId,

        implantUsageItems.quantity,

        implantUsageItems.note,

        inventory.name
          AS inventoryItemName,

        inventory.category
          AS inventoryCategory,

        inventory.brand
          AS inventoryBrand,

        inventory.model
          AS inventoryModel,

        inventory.specification
          AS inventorySpecification,

        inventory.refNumber
          AS inventoryRefNumber,

        inventory.lotNumber
          AS inventoryLotNumber,

        inventory.expiryDate
          AS inventoryExpiryDate,

        inventory.quantity
          AS inventoryQuantity,

        COALESCE(
          usageTransaction.unitCost,
          0
        )
          AS unitCost,

        COALESCE(
          usageTransaction.totalCost,
          0
        )
          AS totalCost,

        implantUsageItems.createdAt,

        implantUsageItems.updatedAt

      FROM implantUsageItems

      INNER JOIN inventory
        ON inventory.id =
           implantUsageItems.inventoryItemId

      LEFT JOIN inventoryTransactions
        AS usageTransaction
        ON usageTransaction.id = (
          SELECT
            transactionRow.id

          FROM inventoryTransactions
            AS transactionRow

          WHERE
            transactionRow.implantUsageItemId =
              implantUsageItems.id

            AND transactionRow.type =
              '手術取出'

          ORDER BY
            transactionRow.id DESC

          LIMIT 1
        )

      WHERE
        implantUsageItems.implantPlanItemId = ?

      ORDER BY
        implantUsageItems.id ASC
    `)
    .all(
      implantPlanItemId,
    ) as
    ImplantUsageItemRecord[];
}

/* =========================================================
   Create Implant

   clinicId 由 IPC / Session 決定。
   不從 ImplantInput 接收。
========================================================= */

export function createImplant(
  clinicId: number,
  input: ImplantInput,
):
  ImplantRecord {
  ensureActiveClinic(
    clinicId,
  );

  validateImplantInput(
    input,
  );

  validateReferences(
    clinicId,
    input.patientId,
    input.doctorId,
  );

  if (
    input.status !==
    "待醫師叫貨"
  ) {
    throw new Error(
      "新植體個案必須從「待醫師叫貨」開始",
    );
  }

  const database =
    getDatabase();

  const transaction =
    database.transaction(
      () => {
        const result =
          database
            .prepare(`
              INSERT INTO implants (
                clinicId,

                patientId,

                doctorId,

                inventoryItemId,

                toothPosition,

                brand,

                model,

                diameter,

                length,

                lotNumber,

                expiryDate,

                implantDate,

                note,

                status,

                inventoryDeducted,

                inventoryReturned
              )

              VALUES (
                ?,

                ?,

                ?,

                NULL,

                '',

                '',

                '',

                '',

                '',

                '',

                '',

                ?,

                ?,

                '待醫師叫貨',

                0,

                0
              )
            `)
            .run(
              clinicId,

              input.patientId,

              input.doctorId,

              input.implantDate,

              input.note.trim(),
            );

        const implantId =
          Number(
            result.lastInsertRowid,
          );

        insertTeethAndPlans(
          implantId,
          input.teeth,
        );

        return implantId;
      },
    );

  const implantId =
    transaction();

  return getImplantById(
    implantId,
    clinicId,
  );
}

/* =========================================================
   Insert Teeth + Plans

   同牙位、同規格自動合併。
   REF / LOT 不參與。
========================================================= */

function insertTeethAndPlans(
  implantId: number,
  teeth:
    ImplantToothInput[],
) {
  const database =
    getDatabase();

  const insertTooth =
    database.prepare(`
      INSERT INTO implantTeeth (
        implantId,
        toothPosition
      )

      VALUES (
        ?,
        ?
      )
    `);

  const insertPlan =
    database.prepare(`
      INSERT INTO implantPlanItems (
        implantToothId,

        legacyImplantItemId,

        name,

        category,

        brand,

        model,

        specification,

        plannedQuantity,

        note
      )

      VALUES (
        ?,

        NULL,

        ?,

        ?,

        ?,

        ?,

        ?,

        ?,

        ''
      )
    `);

  for (
    const tooth of
    teeth
  ) {
    const toothResult =
      insertTooth.run(
        implantId,
        tooth.toothPosition.trim(),
      );

    const implantToothId =
      Number(
        toothResult.lastInsertRowid,
      );

    const mergedItems =
      mergeSamePlanItems(
        tooth.items,
      );

    for (
      const item of
      mergedItems
    ) {
      insertPlan.run(
        implantToothId,

        item.name.trim(),

        item.category.trim(),

        item.brand.trim(),

        item.model.trim(),

        item.specification.trim(),

        item.quantity,
      );
    }
  }
}

/* =========================================================
   Update Implant
========================================================= */

export function updateImplant(
  id: number,
  clinicId: number,
  input: ImplantInput,
):
  ImplantRecord {
  validatePositiveInteger(
    id,
    "植體個案 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  const current =
    getImplantById(
      id,
      clinicId,
    );

  validateImplantInput(
    input,
  );

  validateReferences(
    clinicId,
    input.patientId,
    input.doctorId,
  );

  if (
    input.status !==
    current.status
  ) {
    throw new Error(
      "植體狀態不可由編輯功能直接修改，請使用流程按鈕",
    );
  }

  const canEditPlans =
    current.status ===
      "待醫師叫貨" ||
    current.status ===
      "醫師已叫貨";

  const database =
    getDatabase();

  const transaction =
    database.transaction(
      () => {
        const result =
          database
            .prepare(`
              UPDATE implants

              SET
                patientId = ?,

                doctorId = ?,

                implantDate = ?,

                note = ?,

                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE
                id = ?

                AND clinicId = ?
            `)
            .run(
              input.patientId,

              input.doctorId,

              input.implantDate,

              input.note.trim(),

              id,

              clinicId,
            );

        if (
          result.changes !==
          1
        ) {
          throw new Error(
            "植體個案修改失敗",
          );
        }

        if (
          !canEditPlans
        ) {
          assertPlanUnchanged(
            current.teeth,
            input.teeth,
          );

          return;
        }

        if (
          hasUsageRecords(
            id,
            clinicId,
          )
        ) {
          throw new Error(
            "此個案已有實際 REF / LOT 使用紀錄，無法修改植體規格",
          );
        }

        database
          .prepare(`
            DELETE FROM implantTeeth

            WHERE
              implantId = ?

              AND EXISTS (
                SELECT
                  1

                FROM implants

                WHERE
                  implants.id =
                    implantTeeth.implantId

                  AND implants.clinicId = ?
              )
          `)
          .run(
            id,
            clinicId,
          );

        insertTeethAndPlans(
          id,
          input.teeth,
        );

        if (current.status === "醫師已叫貨") {
          database.prepare(`
            INSERT INTO implantReservations (
              implantId, implantPlanItemId, reservedQuantity, reservedAt
            )
            SELECT ?, id, plannedQuantity, CURRENT_TIMESTAMP
            FROM implantPlanItems
            WHERE implantToothId IN (
              SELECT id FROM implantTeeth WHERE implantId = ?
            )
          `).run(id, id);
        }
      },
    );

  transaction();

  return getImplantById(
    id,
    clinicId,
  );
}

/* =========================================================
   Update Status
========================================================= */

export function updateImplantStatus(
  id: number,
  clinicId: number,
  status: ImplantStatus,
  actorUserId: number,
):
  ImplantRecord {
  validatePositiveInteger(
    id,
    "植體個案 ID",
  );

  ensureActiveClinic(
    clinicId,
  );
  ensureWorkflowActor(actorUserId, clinicId);

  validateStatus(
    status,
  );

  const current =
    getImplantById(
      id,
      clinicId,
    );

  if (
    current.status ===
      "待醫師叫貨" &&
    status ===
      "醫師已叫貨"
  ) {
    const database = getDatabase();
    database.transaction(() => {
      database.prepare(`
        INSERT INTO implantReservations (
          implantId, implantPlanItemId, reservedQuantity, reservedAt
        )
        SELECT ?, id, plannedQuantity, CURRENT_TIMESTAMP
        FROM implantPlanItems
        WHERE implantToothId IN (
          SELECT id FROM implantTeeth WHERE implantId = ?
        )
        ON CONFLICT(implantPlanItemId) DO UPDATE SET
          reservedQuantity = excluded.reservedQuantity,
          reservedAt = CURRENT_TIMESTAMP,
          updatedAt = CURRENT_TIMESTAMP
      `).run(id, id);

      database.prepare(`
        UPDATE implants SET status = '醫師已叫貨',
          orderedAt = CURRENT_TIMESTAMP, orderedByUserId = ?, updatedAt = CURRENT_TIMESTAMP
        WHERE id = ? AND clinicId = ?
      `).run(actorUserId, id, clinicId);
    })();
    return getImplantById(id, clinicId);
  }

  if (
    current.status ===
      "醫師已叫貨" &&
    status ===
      "已取出待手術"
  ) {
    return confirmImplantWithdrawal(
      id,
      clinicId,
      actorUserId,
    );
  }

  if (
    current.status ===
      "已取出待手術" &&
    status ===
      "待術後紀錄"
  ) {
    return setSimpleStatus(
      id,
      clinicId,
      status,
    );
  }

  if (
    current.status ===
    "待術後紀錄"
  ) {
    throw new Error(
      "請先完成術後實際 REF / LOT 使用紀錄",
    );
  }

  if (
    current.status ===
      "待歸回品項" &&
    status ===
      "已完成"
  ) {
    return completeLegacyImplantCase(
      id,
      clinicId,
    );
  }

  if (
    current.status ===
    "已完成"
  ) {
    if (status === "已結案") {
      return closeImplantCase(id, clinicId, actorUserId);
    }
    throw new Error("此植體個案已完成，僅能執行結案");
  }

  if (current.status === "已結案" || current.status === "已取消") {
    throw new Error("此植體個案已結束，無法再變更狀態");
  }

  throw new Error(
    `不允許從「${current.status}」直接變更為「${status}」`,
  );
}

/* =========================================================
   Simple Status
========================================================= */

function setSimpleStatus(
  id: number,
  clinicId: number,
  status: ImplantStatus,
):
  ImplantRecord {
  const database =
    getDatabase();

  const result =
    database
      .prepare(`
        UPDATE implants

        SET
          status = ?,

          updatedAt =
            CURRENT_TIMESTAMP

        WHERE
          id = ?

          AND clinicId = ?
      `)
      .run(
        status,
        id,
        clinicId,
      );

  if (
    result.changes !==
    1
  ) {
    throw new Error(
      "植體狀態更新失敗",
    );
  }

  return getImplantById(
    id,
    clinicId,
  );
}

/* =========================================================
   Confirm Withdrawal

   這一步只代表助理已取出預計規格。

   不指定特定 REF / LOT。
   不扣特定 inventoryItemId。
========================================================= */

export function confirmImplantWithdrawal(
  implantId: number,
  clinicId: number,
  actorUserId: number,
):
  ImplantRecord {
  validatePositiveInteger(
    implantId,
    "植體個案 ID",
  );

  ensureActiveClinic(
    clinicId,
  );
  ensureWorkflowActor(actorUserId, clinicId);

  const current =
    getImplantById(
      implantId,
      clinicId,
    );

  if (
    current.status !==
    "醫師已叫貨"
  ) {
    throw new Error(
      "只有「醫師已叫貨」的個案可以確認取出",
    );
  }

  if (
    current.teeth.length ===
    0
  ) {
    throw new Error(
      "此個案尚未設定牙位",
    );
  }

  for (
    const tooth of
    current.teeth
  ) {
    if (
      tooth.items.length ===
      0
    ) {
      throw new Error(
        `牙位 #${tooth.toothPosition} 尚未設定植體規格`,
      );
    }
  }

  const database =
    getDatabase();

  const transaction = database.transaction(() => {
    database.prepare(`
      UPDATE implantReservations
      SET pickedQuantity = reservedQuantity,
          pickedAt = CURRENT_TIMESTAMP,

          pickedByUserId = ?,
          updatedAt = CURRENT_TIMESTAMP
      WHERE implantId = ?
    `).run(actorUserId, implantId);

    const result = database.prepare(`
        UPDATE implants

        SET
          status =
            '已取出待手術',

          inventoryDeducted = 0,

          inventoryReturned = 0,

          pickedAt = CURRENT_TIMESTAMP,

          pickedByUserId = ?,

          updatedAt =
            CURRENT_TIMESTAMP

        WHERE
          id = ?

          AND clinicId = ?

          AND status =
            '醫師已叫貨'
      `).run(actorUserId, implantId, clinicId);

    if (result.changes !== 1) {
      throw new Error("個案狀態已被其他操作修改，請重新整理");
    }
  });

  transaction();

  return getImplantById(
    implantId,
    clinicId,
  );
}

/* =========================================================
   Record Actual Usage

   待術後紀錄才選真正使用的 REF / LOT。

   重要：
   Inventory 必須與 Implant 同 Clinic。
========================================================= */

export function recordImplantUsage(
  implantId: number,
  clinicId: number,
  inputs:
    ImplantUsageInput[],
  actorUserId: number,
):
  ImplantRecord {
  validatePositiveInteger(
    implantId,
    "植體個案 ID",
  );

  ensureActiveClinic(
    clinicId,
  );
  ensureWorkflowActor(actorUserId, clinicId);

  if (
    !Array.isArray(
      inputs,
    )
  ) {
    throw new Error(
      "術後使用資料格式不正確",
    );
  }

  const database =
    getDatabase();

  const current =
    getImplantById(
      implantId,
      clinicId,
    );

  if (
    current.status !==
    "待術後紀錄"
  ) {
    throw new Error(
      "只有「待術後紀錄」的個案可以登錄實際 REF / LOT",
    );
  }

  if (
    hasUsageRecords(
      implantId,
      clinicId,
    )
  ) {
    throw new Error(
      "此個案已經有實際使用紀錄，請勿重複登錄",
    );
  }

  const allPlans =
    current.teeth.flatMap(
      (
        tooth,
      ) =>
        tooth.items.map(
          (
            plan,
          ) => ({
            tooth,
            plan,
          }),
        ),
    );

  if (
    allPlans.length ===
    0
  ) {
    throw new Error(
      "此個案沒有植體規格資料",
    );
  }

  /*
   * 每個 Plan 都必須送回。
   *
   * 如果某規格實際完全沒使用：
   *
   * usages: []
   */
  if (
    inputs.length !==
    allPlans.length
  ) {
    throw new Error(
      "請完整確認每一筆植體規格的術後使用情況",
    );
  }

  const planMap =
    new Map<
      number,
      {
        tooth:
          ImplantToothRecord;

        plan:
          ImplantPlanItemRecord;
      }
    >();

  for (
    const entry of
    allPlans
  ) {
    planMap.set(
      entry.plan.id,
      entry,
    );
  }

  const seenPlanIds =
    new Set<number>();

  /*
   * 同一 Inventory LOT
   * 可能跨不同 Plan 使用。
   *
   * 所以最後要彙總檢查庫存。
   */
  const totalRequired =
    new Map<
      number,
      number
    >();

  /* =======================================================
     Validate
  ======================================================= */

  for (
    const input of
    inputs
  ) {
    validatePositiveInteger(
      input.implantPlanItemId,
      "植體規格 ID",
    );

    if (
      seenPlanIds.has(
        input.implantPlanItemId,
      )
    ) {
      throw new Error(
        `植體規格 #${input.implantPlanItemId} 重複`,
      );
    }

    seenPlanIds.add(
      input.implantPlanItemId,
    );

    const entry =
      planMap.get(
        input.implantPlanItemId,
      );

    if (!entry) {
      throw new Error(
        "術後資料包含不屬於此個案的植體規格",
      );
    }

    if (
      !Array.isArray(
        input.usages,
      )
    ) {
      throw new Error(
        "REF / LOT 使用資料格式不正確",
      );
    }

    if (entry.plan.category === "器械") {
      const photo = String(input.instrumentPhotoDataUrl ?? "").trim();
      if (!photo.startsWith("data:image/") || photo.length < 200) {
        throw new Error(`器械「${entry.plan.name}」請先拍照留存`);
      }
      if (photo.length > 7_000_000) {
        throw new Error(`器械「${entry.plan.name}」照片過大，請重新拍照`);
      }
      if (input.usages.length > 0) {
        throw new Error("器械只需拍照留存，不記錄 REF / LOT");
      }
      continue;
    }

    const selectedInventoryIds =
      new Set<number>();

    let usedQuantity =
      0;

    for (
      const usage of
      input.usages
    ) {
      validatePositiveInteger(
        usage.inventoryItemId,
        "庫存品項 ID",
      );

      if (
        !Number.isInteger(
          usage.quantity,
        ) ||
        usage.quantity <= 0
      ) {
        throw new Error(
          "實際使用數量必須是大於 0 的整數",
        );
      }

      if (
        selectedInventoryIds.has(
          usage.inventoryItemId,
        )
      ) {
        throw new Error(
          "同一 REF / LOT 請合併數量，不要重複選擇",
        );
      }

      selectedInventoryIds.add(
        usage.inventoryItemId,
      );

      /*
       * 同時檢查：
       * Clinic
       * name
       * category
       * brand
       * model
       * specification
       */
      validateInventoryMatchesPlan(
        clinicId,
        usage.inventoryItemId,
        entry.plan,
      );

      usedQuantity +=
        usage.quantity;

      totalRequired.set(
        usage.inventoryItemId,

        (
          totalRequired.get(
            usage.inventoryItemId,
          ) ?? 0
        ) +
          usage.quantity,
      );
    }

    /*
     * 可少於 planned quantity。
     * 例如叫 2 支但實際使用 1 支。
     *
     * 沒使用則 usages: []。
     */
    if (
      usedQuantity >
      entry.plan.quantity
    ) {
      throw new Error(
        `牙位 #${entry.tooth.toothPosition}｜${formatPlanLabel(
          entry.plan,
        )} 預計 ${entry.plan.quantity} 隻，實際使用 ${usedQuantity} 隻，超過預計數量`,
      );
    }
  }

  for (
    const entry of
    allPlans
  ) {
    if (
      !seenPlanIds.has(
        entry.plan.id,
      )
    ) {
      throw new Error(
        `牙位 #${entry.tooth.toothPosition} 尚未確認術後使用`,
      );
    }
  }

  /* =======================================================
     Aggregate Inventory Check
  ======================================================= */

  for (
    const [
      inventoryItemId,
      requiredQuantity,
    ] of
    totalRequired
  ) {
    const inventory =
      getInventoryById(
        inventoryItemId,
        clinicId,
      );

    if (
      inventory.quantity <
      requiredQuantity
    ) {
      throw new Error(
        `${formatInventoryLabel(
          inventory,
        )} 庫存不足，目前 ${inventory.quantity}，本次需要 ${requiredQuantity}`,
      );
    }
  }

  /* =======================================================
     Transaction
  ======================================================= */

  const transaction =
    database.transaction(
      () => {
        const insertUsage =
          database.prepare(`
            INSERT INTO implantUsageItems (
              implantPlanItemId,

              inventoryItemId,

              quantity,

              note
            )

            VALUES (
              ?,
              ?,
              ?,
              ?
            )
          `);

        const saveInstrumentPhoto =
          database.prepare(`
            UPDATE implantPlanItems
            SET instrumentPhotoDataUrl = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ? AND category = '器械'
          `);

        const getInventoryQuantity =
          database.prepare(`
            SELECT
              quantity,
              unitCost

            FROM inventory

            WHERE
              id = ?

              AND clinicId = ?
          `);

        const deductInventory =
          database.prepare(`
            UPDATE inventory

            SET
              quantity =
                quantity - ?,

              updatedAt =
                CURRENT_TIMESTAMP

            WHERE
              id = ?

              AND clinicId = ?

              AND quantity >= ?
          `);

        const insertTransaction =
          database.prepare(`
            INSERT INTO inventoryTransactions (
              clinicId,

              inventoryItemId,

              implantId,

              implantToothId,

              implantItemId,

              implantPlanItemId,

              implantUsageItemId,

              type,

              quantityChange,

              quantityBefore,

              quantityAfter,

              unitCost,

              totalCost,

              note
            )

            VALUES (
              ?,

              ?,

              ?,

              ?,

              NULL,

              ?,

              ?,

              '手術取出',

              ?,

              ?,

              ?,

              ?,

              ?,

              ?
            )
          `);

        for (
          const input of
          inputs
        ) {
          const entry =
            planMap.get(
              input.implantPlanItemId,
            );

          if (!entry) {
            throw new Error(
              "找不到植體規格資料",
            );
          }

          if (entry.plan.category === "器械") {
            saveInstrumentPhoto.run(
              String(input.instrumentPhotoDataUrl ?? "").trim(),
              entry.plan.id,
            );
            continue;
          }

          for (
            const usage of
            input.usages
          ) {
            const before =
              getInventoryQuantity
                .get(
                  usage.inventoryItemId,
                  clinicId,
                ) as
                | {
                    quantity:
                      number;

                    unitCost:
                      number;
                  }
                | undefined;

            if (!before) {
              throw new Error(
                "找不到目前院所實際使用的庫存品項",
              );
            }

            const quantityBefore =
              before.quantity;

            const quantityAfter =
              quantityBefore -
              usage.quantity;

            /*
             * 使用成本必須取「扣庫存前」的成本快照。
             * inventory.unitCost 是目前批次的移動加權平均成本。
             * 寫入 transaction 後，歷史報表不再依賴未來的庫存成本。
             */
            const unitCost =
              Number(
                before.unitCost ??
                  0,
              );

            const totalCost =
              Math.round(
                unitCost *
                  usage.quantity *
                  100,
              ) /
              100;

            const deduction =
              deductInventory.run(
                usage.quantity,

                usage.inventoryItemId,

                clinicId,

                usage.quantity,
              );

            if (
              deduction.changes !==
              1
            ) {
              throw new Error(
                "庫存數量已被其他操作修改，請重新整理後再試",
              );
            }

            const usageResult =
              insertUsage.run(
                entry.plan.id,

                usage.inventoryItemId,

                usage.quantity,

                "術後實際使用",
              );

            const usageItemId =
              Number(
                usageResult.lastInsertRowid,
              );

            const inventory =
              getInventoryById(
                usage.inventoryItemId,
                clinicId,
              );

            insertTransaction.run(
              clinicId,

              usage.inventoryItemId,

              implantId,

              entry.tooth.id,

              entry.plan.id,

              usageItemId,

              -usage.quantity,

              quantityBefore,

              quantityAfter,

              unitCost,

              totalCost,

              [
                `植體個案 #${implantId}`,

                `牙位 #${entry.tooth.toothPosition}`,

                formatPlanLabel(
                  entry.plan,
                ),

                inventory.refNumber
                  ? `REF ${inventory.refNumber}`
                  : "",

                inventory.lotNumber
                  ? `LOT ${inventory.lotNumber}`
                  : "",

                `實際使用 ${usage.quantity} 隻`,
              ]
                .filter(
                  Boolean,
                )
                .join(
                  "｜",
                ),
            );
          }
        }

        /*
         * 新版：
         *
         * 術後紀錄完成後直接已完成。
         *
         * 未使用的預計數量不是特定 LOT，
         * 因此不需要歸回庫存。
         */
        database.prepare(`
          UPDATE implantReservations
          SET usedQuantity = COALESCE((
                SELECT SUM(quantity) FROM implantUsageItems
                WHERE implantPlanItemId = implantReservations.implantPlanItemId
              ), 0),
              returnedQuantity = MAX(
                pickedQuantity - COALESCE((
                  SELECT SUM(quantity) FROM implantUsageItems
                  WHERE implantPlanItemId = implantReservations.implantPlanItemId
                ), 0), 0),
              returnedAt = CASE WHEN pickedQuantity > COALESCE((
                SELECT SUM(quantity) FROM implantUsageItems
                WHERE implantPlanItemId = implantReservations.implantPlanItemId
              ), 0) THEN CURRENT_TIMESTAMP ELSE returnedAt END,
              updatedAt = CURRENT_TIMESTAMP
          WHERE implantId = ?
        `).run(implantId);

        const completeResult =
          database
            .prepare(`
              UPDATE implants

              SET
                status =
                  '已完成',

                surgeryCompletedAt = CURRENT_TIMESTAMP,

                surgeryCompletedByUserId = ?,

                returnedAt = CASE
                  WHEN EXISTS (
                    SELECT 1 FROM implantReservations
                    WHERE implantId = ? AND returnedQuantity > 0
                  ) THEN CURRENT_TIMESTAMP ELSE returnedAt END,

                returnedByUserId = CASE
                  WHEN EXISTS (
                    SELECT 1 FROM implantReservations
                    WHERE implantId = ? AND returnedQuantity > 0
                  ) THEN ? ELSE returnedByUserId END,

                inventoryDeducted =
                  CASE
                    WHEN EXISTS (
                      SELECT
                        1

                      FROM implantUsageItems iu

                      INNER JOIN implantPlanItems ip
                        ON ip.id =
                           iu.implantPlanItemId

                      INNER JOIN implantTeeth it
                        ON it.id =
                           ip.implantToothId

                      WHERE
                        it.implantId =
                          implants.id
                    )

                    THEN 1
                    ELSE 0
                  END,

                inventoryReturned = 1,

                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE
                id = ?

                AND clinicId = ?

                AND status =
                  '待術後紀錄'
            `)
            .run(
              actorUserId,
              implantId,
              implantId,
              actorUserId,
              implantId,
              clinicId,
            );

        if (
          completeResult.changes !==
          1
        ) {
          throw new Error(
            "個案流程已被其他操作修改，請重新整理後再試",
          );
        }
      },
    );

  transaction();

  return getImplantById(
    implantId,
    clinicId,
  );
}

/* =========================================================
   Validate Inventory Matches Plan

   REF / LOT 不需要與 Plan 比對，
   因為術前本來就沒有 REF / LOT。

   只比對產品身分：
   name
   category
   brand
   model
   specification

   並且 inventory.clinicId
   必須與 implant.clinicId 相同。
========================================================= */

function validateInventoryMatchesPlan(
  clinicId: number,
  inventoryItemId: number,
  plan:
    ImplantPlanItemRecord,
) {
  const inventory =
    getInventoryById(
      inventoryItemId,
      clinicId,
    );

  const checks: Array<
    [
      string,
      string,
      string,
    ]
  > = [
    [
      "品項名稱",
      inventory.name,
      plan.name,
    ],

    [
      "類別",
      inventory.category,
      plan.category,
    ],

    [
      "品牌",
      inventory.brand,
      plan.brand,
    ],

    [
      "型號",
      inventory.model,
      plan.model,
    ],

    [
      "規格",
      inventory.specification,
      plan.specification,
    ],
  ];

  for (
    const [
      label,
      inventoryValue,
      planValue,
    ] of
    checks
  ) {
    if (
      normalizeText(
        inventoryValue,
      ) !==
      normalizeText(
        planValue,
      )
    ) {
      throw new Error(
        `所選 REF / LOT 的${label}與術前植體規格不一致`,
      );
    }
  }

  if (
    inventory.category !==
      "植體" &&
    inventory.category !==
      "植體套件"
  ) {
    throw new Error(
      "植體個案只能使用「植體」或「植體套件」庫存",
    );
  }
}

/* =========================================================
   Inventory Lookup - Clinic Safe
========================================================= */

function getInventoryById(
  inventoryItemId: number,
  clinicId: number,
):
  InventoryLookupRow {
  validatePositiveInteger(
    inventoryItemId,
    "庫存品項 ID",
  );

  validatePositiveInteger(
    clinicId,
    "院所 ID",
  );

  const database =
    getDatabase();

  const inventory =
    database
      .prepare(`
        SELECT
          id,

          clinicId,

          name,

          category,

          brand,

          model,

          specification,

          refNumber,

          lotNumber,

          expiryDate,

          quantity,

          unitCost

        FROM inventory

        WHERE
          id = ?

          AND clinicId = ?
      `)
      .get(
        inventoryItemId,
        clinicId,
      ) as
      | InventoryLookupRow
      | undefined;

  if (!inventory) {
    throw new Error(
      "找不到目前院所指定的庫存品項",
    );
  }

  return inventory;
}

/* =========================================================
   Has Usage Records

   必須先確認 Implant 是該 Clinic。
========================================================= */

function hasUsageRecords(
  implantId: number,
  clinicId: number,
):
  boolean {
  const database =
    getDatabase();

  const row =
    database
      .prepare(`
        SELECT
          implantUsageItems.id

        FROM implantUsageItems

        INNER JOIN implantPlanItems
          ON implantPlanItems.id =
             implantUsageItems.implantPlanItemId

        INNER JOIN implantTeeth
          ON implantTeeth.id =
             implantPlanItems.implantToothId

        INNER JOIN implants
          ON implants.id =
             implantTeeth.implantId

        WHERE
          implants.id = ?

          AND implants.clinicId = ?

        LIMIT 1
      `)
      .get(
        implantId,
        clinicId,
      );

  return Boolean(
    row,
  );
}

/* =========================================================
   Legacy Return

   僅舊版「待歸回品項」使用。

   同樣加入 Clinic 隔離。
========================================================= */

export function returnImplantInventory(
  implantId: number,
  clinicId: number,
  input: ImplantReturnInput,
):
  ImplantRecord {
  validatePositiveInteger(
    implantId,
    "植體個案 ID",
  );

  validatePositiveInteger(
    input.implantItemId,
    "舊版植體明細 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  if (
    !Number.isInteger(
      input.quantity,
    ) ||
    input.quantity <= 0
  ) {
    throw new Error(
      "歸回數量必須是大於 0 的整數",
    );
  }

  const current =
    getImplantById(
      implantId,
      clinicId,
    );

  if (
    current.status !==
    "待歸回品項"
  ) {
    throw new Error(
      "只有舊版「待歸回品項」個案可以使用此功能",
    );
  }

  const database =
    getDatabase();

  const transaction =
    database.transaction(
      () => {
        const item =
          database
            .prepare(`
              SELECT
                implantItems.id,

                implantItems.implantToothId,

                implantItems.inventoryItemId,

                implantItems.quantity,

                implantItems.deductedQuantity,

                implantItems.usedQuantity,

                implantItems.returnedQuantity,

                implantTeeth.toothPosition

              FROM implantItems

              INNER JOIN implantTeeth
                ON implantTeeth.id =
                   implantItems.implantToothId

              INNER JOIN implants
                ON implants.id =
                   implantTeeth.implantId

              WHERE
                implantItems.id = ?

                AND implants.id = ?

                AND implants.clinicId = ?
            `)
            .get(
              input.implantItemId,
              implantId,
              clinicId,
            ) as
            | LegacyImplantItemRow
            | undefined;

        if (!item) {
          throw new Error(
            "找不到此院所個案的舊版植體明細",
          );
        }

        const returnable =
          item.deductedQuantity -
          item.usedQuantity -
          item.returnedQuantity;

        if (
          input.quantity >
          returnable
        ) {
          throw new Error(
            `最多只能歸回 ${returnable} 隻`,
          );
        }

        const inventory =
          getInventoryById(
            item.inventoryItemId,
            clinicId,
          );

        const quantityBefore =
          inventory.quantity;

        const quantityAfter =
          quantityBefore +
          input.quantity;

        const updateInventoryResult =
          database
            .prepare(`
              UPDATE inventory

              SET
                quantity =
                  quantity + ?,

                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE
                id = ?

                AND clinicId = ?
            `)
            .run(
              input.quantity,

              item.inventoryItemId,

              clinicId,
            );

        if (
          updateInventoryResult.changes !==
          1
        ) {
          throw new Error(
            "歸回庫存失敗",
          );
        }

        const updateLegacyResult =
          database
            .prepare(`
              UPDATE implantItems

              SET
                returnedQuantity =
                  returnedQuantity + ?,

                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE
                id = ?
            `)
            .run(
              input.quantity,

              input.implantItemId,
            );

        if (
          updateLegacyResult.changes !==
          1
        ) {
          throw new Error(
            "舊版植體歸回紀錄更新失敗",
          );
        }

        const legacyPlan =
          database
            .prepare(`
              SELECT id

              FROM implantPlanItems

              WHERE
                legacyImplantItemId = ?
            `)
            .get(
              item.id,
            ) as
            | {
                id: number;
              }
            | undefined;

        database
          .prepare(`
            INSERT INTO inventoryTransactions (
              clinicId,

              inventoryItemId,

              implantId,

              implantToothId,

              implantItemId,

              implantPlanItemId,

              implantUsageItemId,

              type,

              quantityChange,

              quantityBefore,

              quantityAfter,

              note
            )

            VALUES (
              ?,

              ?,

              ?,

              ?,

              ?,

              ?,

              NULL,

              '手術歸回',

              ?,

              ?,

              ?,

              ?
            )
          `)
          .run(
            clinicId,

            item.inventoryItemId,

            implantId,

            item.implantToothId,

            item.id,

            legacyPlan?.id ??
              null,

            input.quantity,

            quantityBefore,

            quantityAfter,

            [
              `舊版植體個案 #${implantId}`,

              `牙位 #${item.toothPosition}`,

              inventory.refNumber
                ? `REF ${inventory.refNumber}`
                : "",

              inventory.lotNumber
                ? `LOT ${inventory.lotNumber}`
                : "",

              `歸回 ${input.quantity} 隻`,

              input.note?.trim() ??
                "",
            ]
              .filter(
                Boolean,
              )
              .join(
                "｜",
              ),
          );

        const unresolved =
          getLegacyUnresolvedCount(
            implantId,
            clinicId,
          );

        if (
          unresolved ===
          0
        ) {
          database
            .prepare(`
              UPDATE implants

              SET
                status =
                  '已完成',

                inventoryReturned = 1,

                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE
                id = ?

                AND clinicId = ?
            `)
            .run(
              implantId,
              clinicId,
            );
        }
      },
    );

  transaction();

  return getImplantById(
    implantId,
    clinicId,
  );
}

/* =========================================================
   Legacy Unresolved
========================================================= */

function getLegacyUnresolvedCount(
  implantId: number,
  clinicId: number,
):
  number {
  const database =
    getDatabase();

  const row =
    database
      .prepare(`
        SELECT
          COUNT(*) AS count

        FROM implantItems

        INNER JOIN implantTeeth
          ON implantTeeth.id =
             implantItems.implantToothId

        INNER JOIN implants
          ON implants.id =
             implantTeeth.implantId

        WHERE
          implants.id = ?

          AND implants.clinicId = ?

          AND
            implantItems.deductedQuantity
            >
            implantItems.usedQuantity +
            implantItems.returnedQuantity
      `)
      .get(
        implantId,
        clinicId,
      ) as {
      count: number;
    };

  return row.count;
}

/* =========================================================
   Complete Legacy Case
========================================================= */

function completeLegacyImplantCase(
  implantId: number,
  clinicId: number,
):
  ImplantRecord {
  const unresolved =
    getLegacyUnresolvedCount(
      implantId,
      clinicId,
    );

  if (
    unresolved >
    0
  ) {
    throw new Error(
      "仍有尚未歸回或處理的舊版植體品項",
    );
  }

  const database =
    getDatabase();

  const result =
    database
      .prepare(`
        UPDATE implants

        SET
          status =
            '已完成',

          inventoryReturned = 1,

          updatedAt =
            CURRENT_TIMESTAMP

        WHERE
          id = ?

          AND clinicId = ?

          AND status =
            '待歸回品項'
      `)
      .run(
        implantId,
        clinicId,
      );

  if (
    result.changes !==
    1
  ) {
    throw new Error(
      "植體個案完成失敗",
    );
  }

  return getImplantById(
    implantId,
    clinicId,
  );
}

export function cancelImplantCase(
  implantId: number,
  clinicId: number,
  reason: string,
  actorUserId: number,
): ImplantRecord {
  ensureWorkflowActor(actorUserId, clinicId);
  const current = getImplantById(implantId, clinicId);
  const normalizedReason = String(reason ?? "").trim();
  if (!normalizedReason) throw new Error("取消個案必須填寫原因");
  if (["待術後紀錄", "待歸回品項", "已完成", "已結案", "已取消"].includes(current.status)) {
    throw new Error("此流程階段不可取消個案");
  }

  const database = getDatabase();
  database.transaction(() => {
    database.prepare(`
      UPDATE implantReservations
      SET returnedQuantity = pickedQuantity,
          returnedAt = CASE WHEN pickedQuantity > 0 THEN CURRENT_TIMESTAMP ELSE returnedAt END,
          updatedAt = CURRENT_TIMESTAMP
      WHERE implantId = ?
    `).run(implantId);
    const result = database.prepare(`
      UPDATE implants SET status = '已取消', cancelledAt = CURRENT_TIMESTAMP,
        cancelledByUserId = ?,
        returnedAt = CASE WHEN EXISTS (
          SELECT 1 FROM implantReservations
          WHERE implantId = ? AND pickedQuantity > 0
        ) THEN CURRENT_TIMESTAMP ELSE returnedAt END,
        returnedByUserId = CASE WHEN EXISTS (
          SELECT 1 FROM implantReservations
          WHERE implantId = ? AND pickedQuantity > 0
        ) THEN ? ELSE returnedByUserId END,
        cancelReason = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ? AND clinicId = ?
    `).run(actorUserId, implantId, implantId, actorUserId, normalizedReason, implantId, clinicId);
    if (result.changes !== 1) throw new Error("取消植體個案失敗");
  })();
  return getImplantById(implantId, clinicId);
}

export function closeImplantCase(
  implantId: number,
  clinicId: number,
  actorUserId: number,
): ImplantRecord {
  ensureWorkflowActor(actorUserId, clinicId);
  const current = getImplantById(implantId, clinicId);
  if (!current.doctorSignedAt) {
    throw new Error("必須先由指定醫師簽名確認實際使用植體，才能正式結案");
  }
  const result = getDatabase().prepare(`
    UPDATE implants SET status = '已結案', closedAt = CURRENT_TIMESTAMP,
      closedByUserId = ?,
      updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND clinicId = ? AND status = '已完成'
  `).run(actorUserId, implantId, clinicId);
  if (result.changes !== 1) throw new Error("只有已完成手術的個案可以結案");
  return getImplantById(implantId, clinicId);
}

export function signImplantUsage(
  implantId: number,
  clinicId: number,
  doctorId: number,
  signature: string,
  actorUserId: number,
): ImplantRecord {
  ensureWorkflowActor(actorUserId, clinicId);
  validatePositiveInteger(doctorId, "醫師 ID");
  const normalizedSignature = String(signature ?? "").trim();
  if (!normalizedSignature) throw new Error("請輸入醫師簽名");
  if (normalizedSignature.length > 100) throw new Error("醫師簽名不可超過 100 個字元");

  const current = getImplantById(implantId, clinicId);
  if (current.status !== "已完成") throw new Error("只有已完成術後紀錄的個案可以簽名");
  if (current.doctorId !== doctorId) throw new Error("只有此個案指定的醫師可以簽名");
  if (current.doctorSignedAt) throw new Error("此個案已完成醫師簽名");

  const doctor = getDatabase().prepare(`
    SELECT doctors.id
    FROM doctors
    INNER JOIN doctorClinics ON doctorClinics.doctorId = doctors.id
    WHERE doctors.id = ? AND doctors.userId = ? AND doctors.isActive = 1
      AND doctorClinics.clinicId = ?
    LIMIT 1
  `).get(doctorId, actorUserId, clinicId);
  if (!doctor) throw new Error("目前登入帳號不是此個案指定醫師");

  const result = getDatabase().prepare(`
    UPDATE implants
    SET doctorSignature = ?, doctorSignedAt = CURRENT_TIMESTAMP,
      doctorSignedByUserId = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND clinicId = ? AND status = '已完成' AND doctorSignedAt IS NULL
  `).run(normalizedSignature, actorUserId, implantId, clinicId);
  if (result.changes !== 1) throw new Error("簽名失敗，請重新整理後再試");
  return getImplantById(implantId, clinicId);
}

/* =========================================================
   Delete Implant

   只允許尚未進入實際庫存流程的案件刪除。
========================================================= */

export function deleteImplant(
  id: number,
  clinicId: number,
):
  boolean {
  validatePositiveInteger(
    id,
    "植體個案 ID",
  );

  ensureActiveClinic(
    clinicId,
  );

  const current =
    getImplantById(
      id,
      clinicId,
    );

  if (
    current.status !==
      "待醫師叫貨" &&
    current.status !==
      "醫師已叫貨"
  ) {
    throw new Error(
      "此植體個案已進入手術或庫存流程，無法刪除",
    );
  }

  if (
    hasUsageRecords(
      id,
      clinicId,
    )
  ) {
    throw new Error(
      "此植體個案已有實際使用紀錄，無法刪除",
    );
  }

  const database =
    getDatabase();

  const legacyDeduction =
    database
      .prepare(`
        SELECT
          implantItems.id

        FROM implantItems

        INNER JOIN implantTeeth
          ON implantTeeth.id =
             implantItems.implantToothId

        INNER JOIN implants
          ON implants.id =
             implantTeeth.implantId

        WHERE
          implants.id = ?

          AND implants.clinicId = ?

          AND implantItems.deductedQuantity > 0

        LIMIT 1
      `)
      .get(
        id,
        clinicId,
      );

  if (
    legacyDeduction
  ) {
    throw new Error(
      "此舊版植體個案已有庫存取出紀錄，無法刪除",
    );
  }

  const result =
    database
      .prepare(`
        DELETE FROM implants

        WHERE
          id = ?

          AND clinicId = ?
      `)
      .run(
        id,
        clinicId,
      );

  return (
    result.changes ===
    1
  );
}

/* =========================================================
   Validate Implant Input
========================================================= */

function validateImplantInput(
  input: ImplantInput,
) {
  validatePositiveInteger(
    input.patientId,
    "病患 ID",
  );

  if (
    input.doctorId !==
      null
  ) {
    validatePositiveInteger(
      input.doctorId,
      "醫師 ID",
    );
  }

  if (
    !String(
      input.implantDate ??
        "",
    ).trim()
  ) {
    throw new Error(
      "請輸入植體手術日期",
    );
  }

  validateStatus(
    input.status,
  );

  if (
    !Array.isArray(
      input.teeth,
    ) ||
    input.teeth.length ===
      0
  ) {
    throw new Error(
      "請至少設定一個牙位",
    );
  }

  const toothPositions =
    new Set<string>();

  for (
    const tooth of
    input.teeth
  ) {
    const toothPosition =
      String(
        tooth.toothPosition ??
          "",
      ).trim();

    if (
      !toothPosition
    ) {
      throw new Error(
        "牙位不可空白",
      );
    }

    const normalizedTooth =
      normalizeText(
        toothPosition,
      );

    if (
      toothPositions.has(
        normalizedTooth,
      )
    ) {
      throw new Error(
        `牙位 #${toothPosition} 重複`,
      );
    }

    toothPositions.add(
      normalizedTooth,
    );

    if (
      !Array.isArray(
        tooth.items,
      ) ||
      tooth.items.length ===
        0
    ) {
      throw new Error(
        `牙位 #${toothPosition} 尚未設定植體規格`,
      );
    }

    for (
      const item of
      tooth.items
    ) {
      if (
        !String(
          item.name ??
            "",
        ).trim()
      ) {
        throw new Error(
          `牙位 #${toothPosition} 的品項名稱不可空白`,
        );
      }

      if (
        !String(
          item.category ??
            "",
        ).trim()
      ) {
        throw new Error(
          `牙位 #${toothPosition} 的品項類別不可空白`,
        );
      }

      if (
        item.category !==
          "植體" &&
        item.category !==
          "植體套件" &&
        item.category !==
          "器械"
      ) {
        throw new Error(
          "植體個案只能規劃「植體」、「植體套件」或「器械」",
        );
      }

      if (
        !Number.isInteger(
          item.quantity,
        ) ||
        item.quantity <= 0
      ) {
        throw new Error(
          `牙位 #${toothPosition} 的預計數量必須是大於 0 的整數`,
        );
      }
    }
  }
}

/* =========================================================
   Validate Status
========================================================= */

function validateStatus(
  status:
    ImplantStatus,
) {
  const validStatuses:
    ImplantStatus[] = [
      "待醫師叫貨",
      "醫師已叫貨",
      "已取出待手術",
      "待術後紀錄",
      "待歸回品項",
      "已完成",
      "已結案",
      "已取消",
    ];

  if (
    !validStatuses.includes(
      status,
    )
  ) {
    throw new Error(
      "植體流程狀態不正確",
    );
  }
}

/* =========================================================
   Validate References

   Patient:
   patient.clinicId === clinicId

   Doctor:
   doctorClinics 必須包含 clinicId
========================================================= */

function validateReferences(
  clinicId: number,
  patientId: number,
  doctorId:
    number | null,
) {
  const database =
    getDatabase();

  const patient =
    database
      .prepare(`
        SELECT
          id

        FROM patients

        WHERE
          id = ?

          AND clinicId = ?
      `)
      .get(
        patientId,
        clinicId,
      );

  if (!patient) {
    throw new Error(
      "找不到目前院所指定的病患",
    );
  }

  if (
    doctorId !==
    null
  ) {
    const doctor =
      ensureDoctorClinic(
        doctorId,
        clinicId,
      );

    if (
      doctor.isActive !==
      1
    ) {
      throw new Error(
        "此醫師目前已停用",
      );
    }
  }
}

/* =========================================================
   Merge Same Plan Items

   REF / LOT 不參與 Identity。
========================================================= */

function mergeSamePlanItems(
  items:
    ImplantPlanItemInput[],
):
  ImplantPlanItemInput[] {
  const merged =
    new Map<
      string,
      ImplantPlanItemInput
    >();

  for (
    const rawItem of
    items
  ) {
    const item:
      ImplantPlanItemInput = {
      name:
        String(
          rawItem.name ??
            "",
        ).trim(),

      category:
        String(
          rawItem.category ??
            "",
        ).trim(),

      brand:
        String(
          rawItem.brand ??
            "",
        ).trim(),

      model:
        String(
          rawItem.model ??
            "",
        ).trim(),

      specification:
        String(
          rawItem.specification ??
            "",
        ).trim(),

      quantity:
        rawItem.quantity,
    };

    const key =
      createPlanIdentity(
        item,
      );

    const existing =
      merged.get(
        key,
      );

    if (
      existing
    ) {
      existing.quantity +=
        item.quantity;
    } else {
      merged.set(
        key,
        {
          ...item,
        },
      );
    }
  }

  return Array.from(
    merged.values(),
  );
}

/* =========================================================
   Plan Identity

   不包含：
   REF
   LOT
   expiryDate
   inventoryItemId
========================================================= */

function createPlanIdentity(
  item: {
    name: string;

    category: string;

    brand: string;

    model: string;

    specification: string;
  },
) {
  return [
    item.name,

    item.category,

    item.brand,

    item.model,

    item.specification,
  ]
    .map(
      normalizeText,
    )
    .join(
      "||",
    );
}

/* =========================================================
   Assert Plan Unchanged
========================================================= */

function assertPlanUnchanged(
  currentTeeth:
    ImplantToothRecord[],
  inputTeeth:
    ImplantToothInput[],
) {
  const currentMap =
    normalizeTeethForComparison(
      currentTeeth.map(
        (
          tooth,
        ) => ({
          toothPosition:
            tooth.toothPosition,

          items:
            tooth.items.map(
              (
                item,
              ) => ({
                name:
                  item.name,

                category:
                  item.category,

                brand:
                  item.brand,

                model:
                  item.model,

                specification:
                  item.specification,

                quantity:
                  item.quantity,
              }),
            ),
        }),
      ),
    );

  const inputMap =
    normalizeTeethForComparison(
      inputTeeth,
    );

  if (
    JSON.stringify(
      currentMap,
    ) !==
    JSON.stringify(
      inputMap,
    )
  ) {
    throw new Error(
      "此個案已進入手術流程，不能再修改牙位或植體規格",
    );
  }
}

/* =========================================================
   Normalize Teeth Compare
========================================================= */

function normalizeTeethForComparison(
  teeth:
    ImplantToothInput[],
) {
  return teeth
    .map(
      (
        tooth,
      ) => ({
        toothPosition:
          normalizeText(
            tooth.toothPosition,
          ),

        items:
          mergeSamePlanItems(
            tooth.items,
          )
            .map(
              (
                item,
              ) => ({
                identity:
                  createPlanIdentity(
                    item,
                  ),

                quantity:
                  item.quantity,
              }),
            )
            .sort(
              (
                a,
                b,
              ) =>
                a.identity.localeCompare(
                  b.identity,
                ),
            ),
      }),
    )
    .sort(
      (
        a,
        b,
      ) =>
        a.toothPosition.localeCompare(
          b.toothPosition,
        ),
    );
}

/* =========================================================
   Helpers
========================================================= */

function validatePositiveInteger(
  value: number,
  fieldName: string,
) {
  if (
    !Number.isInteger(
      value,
    ) ||
    value <= 0
  ) {
    throw new Error(
      `${fieldName}格式不正確`,
    );
  }
}

function normalizeText(
  value:
    string | null | undefined,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase();
}

function formatPlanLabel(
  plan:
    ImplantPlanItemRecord,
) {
  return [
    plan.name,

    plan.brand,

    plan.model,

    plan.specification,
  ]
    .filter(
      Boolean,
    )
    .join(
      " ",
    );
}

function formatInventoryLabel(
  inventory:
    InventoryLookupRow,
) {
  return [
    inventory.name,

    inventory.brand,

    inventory.model,

    inventory.specification,

    inventory.refNumber
      ? `REF ${inventory.refNumber}`
      : "",

    inventory.lotNumber
      ? `LOT ${inventory.lotNumber}`
      : "",
  ]
    .filter(
      Boolean,
    )
    .join(
      "｜",
    );
}
