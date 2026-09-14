import {
  getDatabase,
} from "./db";

/* =========================================================
   Types
========================================================= */

export type ConsumableUsageType =
  | "連針帶線"
  | "牙周藥膏"
  | "冷光藥劑"
  | "膠原蛋白"
  | "骨粉"
  | "再生膜"
  | "其他耗材";

export type ConsumableUsageStatus =
  | "待醫師簽名"
  | "已簽名"
  | "已取消";

export type ConsumableUsageItemInput = {
  inventoryItemId: number;
  quantity: number;
};

export type ConsumableUsageInput = {
  patientId: number;

  doctorId: number;

  usageType:
    ConsumableUsageType;

  usageDate: string;

  toothPosition?: string;

  note?: string;

  items:
    ConsumableUsageItemInput[];
};

export type ConsumableUsageItemRecord = {
  id: number;

  usageRecordId: number;

  inventoryItemId: number;

  quantity: number;

  inventoryName: string;

  inventoryCategory: string;

  inventoryBrand: string;

  inventoryModel: string;

  inventorySpecification: string;

  expiryDate: string;

  unitCost: number;

  totalCost: number;

  createdAt: string;
};

export type ConsumableUsageRecord = {
  id: number;

  clinicId: number;

  patientId: number;

  patientName: string;

  patientChartNumber: string;

  doctorId: number;

  doctorName: string;

  usageType:
    ConsumableUsageType;

  usageDate: string;

  toothPosition: string;

  note: string;

  status:
    ConsumableUsageStatus;

  doctorSignatureDataUrl:
    string | null;

  signedAt:
    string | null;

  cancelledAt:
    string | null;

  cancelReason: string;

  items:
    ConsumableUsageItemRecord[];

  createdAt: string;

  updatedAt: string;
};

/* =========================================================
   Internal Types
========================================================= */

type RawUsageRecord = {
  id: number;

  clinicId: number;

  patientId: number;

  patientName: string;

  patientChartNumber: string;

  doctorId: number;

  doctorName: string;

  usageType: string;

  usageDate: string;

  toothPosition: string;

  note: string;

  status: string;

  doctorSignatureDataUrl:
    string | null;

  signedAt:
    string | null;

  cancelledAt:
    string | null;

  cancelReason: string;

  createdAt: string;

  updatedAt: string;
};

type RawUsageItem = {
  id: number;

  usageRecordId: number;

  inventoryItemId: number;

  quantity: number;

  inventoryName: string;

  inventoryCategory: string;

  inventoryBrand: string;

  inventoryModel: string;

  inventorySpecification: string;

  expiryDate: string;

  unitCost: number;

  totalCost: number;

  createdAt: string;
};

type InventoryRow = {
  id: number;

  clinicId: number;

  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  expiryDate: string;

  quantity: number;

  unitCost: number;
};

type PatientRow = {
  id: number;

  clinicId: number;
};

type DoctorMembershipRow = {
  id: number;

  isActive: number;
};

/* =========================================================
   Constants
========================================================= */

const VALID_USAGE_TYPES =
  new Set<ConsumableUsageType>([
    "連針帶線",
    "牙周藥膏",
    "冷光藥劑",
    "膠原蛋白",
    "骨粉",
    "再生膜",
    "其他耗材",
  ]);

const SIGNATURE_MAX_LENGTH =
  2_000_000;

/* =========================================================
   Helpers
========================================================= */

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
      `${label}必須是大於 0 的整數。`,
    );
  }
}

function normalizeText(
  value:
    string |
    null |
    undefined,
) {
  return String(
    value ?? "",
  ).trim();
}

function normalizeCategory(
  value:
    string |
    null |
    undefined,
) {
  return normalizeText(
    value,
  );
}

function isImplantOrKitCategory(
  category: string,
) {
  const normalized =
    normalizeCategory(
      category,
    ).toLowerCase();

  return (
    normalized === "植體" ||
    normalized === "套件" ||
    normalized === "implant" ||
    normalized === "kit"
  );
}

function assertUsageType(
  value: string,
): asserts value is ConsumableUsageType {
  if (
    !VALID_USAGE_TYPES.has(
      value as ConsumableUsageType,
    )
  ) {
    throw new Error(
      "不支援的耗材使用類型。",
    );
  }
}

function normalizeStatus(
  value: string,
): ConsumableUsageStatus {
  if (
    value === "已簽名"
  ) {
    return "已簽名";
  }

  if (
    value === "已取消"
  ) {
    return "已取消";
  }

  return "待醫師簽名";
}

function assertInventoryMatchesUsageType(
  inventoryItem:
    InventoryRow,
  usageType:
    ConsumableUsageType,
) {
  const inventoryCategory =
    normalizeCategory(
      inventoryItem.category,
    );

  const expectedCategory =
    normalizeCategory(
      usageType,
    );

  if (
    inventoryCategory !==
    expectedCategory
  ) {
    throw new Error(
      `「${inventoryItem.name}」屬於「${inventoryCategory || "未分類"}」，不能登錄在「${usageType}」使用紀錄。`,
    );
  }
}

/* =========================================================
   Schema Helpers
========================================================= */

function tableHasColumn(
  tableName: string,
  columnName: string,
) {
  const db =
    getDatabase();

  const rows =
    db
      .prepare(
        `PRAGMA table_info(${tableName})`,
      )
      .all() as Array<{
        name: string;
      }>;

  return rows.some(
    (row) =>
      row.name ===
      columnName,
  );
}

function addColumnIfMissing(
  tableName: string,
  columnName: string,
  sqlDefinition: string,
) {
  const db =
    getDatabase();

  if (
    tableHasColumn(
      tableName,
      columnName,
    )
  ) {
    return;
  }

  db.exec(
    `ALTER TABLE ${tableName}
     ADD COLUMN ${columnName} ${sqlDefinition}`,
  );
}

/* =========================================================
   Schema
========================================================= */

export function ensureConsumableUsageSchema() {
  const db =
    getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS consumableUsageRecords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      clinicId INTEGER NOT NULL,

      patientId INTEGER NOT NULL,

      doctorId INTEGER NOT NULL,

      usageType TEXT NOT NULL,

      usageDate TEXT NOT NULL,

      toothPosition TEXT NOT NULL DEFAULT '',

      note TEXT NOT NULL DEFAULT '',

      status TEXT NOT NULL DEFAULT '待醫師簽名',

      doctorSignatureDataUrl TEXT,

      signedAt TEXT,

      cancelledAt TEXT,

      cancelReason TEXT NOT NULL DEFAULT '',

      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (clinicId)
        REFERENCES clinics(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (patientId)
        REFERENCES patients(id)
        ON DELETE RESTRICT,

      FOREIGN KEY (doctorId)
        REFERENCES doctors(id)
        ON DELETE RESTRICT
    );
  `);

  /*
   * 一般耗材刻意不存 REF / LOT。
   *
   * 舊版資料庫即使還有 legacy 欄位，
   * 也不刪、不重建，只是不再讀寫。
   */
  db.exec(`
    CREATE TABLE IF NOT EXISTS consumableUsageItems (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      usageRecordId INTEGER NOT NULL,

      inventoryItemId INTEGER NOT NULL,

      quantity INTEGER NOT NULL,

      inventoryName TEXT NOT NULL DEFAULT '',

      inventoryCategory TEXT NOT NULL DEFAULT '',

      inventoryBrand TEXT NOT NULL DEFAULT '',

      inventoryModel TEXT NOT NULL DEFAULT '',

      inventorySpecification TEXT NOT NULL DEFAULT '',

      expiryDate TEXT NOT NULL DEFAULT '',

      unitCost REAL NOT NULL DEFAULT 0,

      totalCost REAL NOT NULL DEFAULT 0,

      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (usageRecordId)
        REFERENCES consumableUsageRecords(id)
        ON DELETE CASCADE,

      FOREIGN KEY (inventoryItemId)
        REFERENCES inventory(id)
        ON DELETE RESTRICT
    );
  `);

  /* =======================================================
     Compatibility Migration
  ======================================================= */

  addColumnIfMissing(
    "consumableUsageRecords",
    "toothPosition",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageRecords",
    "note",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageRecords",
    "status",
    "TEXT NOT NULL DEFAULT '待醫師簽名'",
  );

  addColumnIfMissing(
    "consumableUsageRecords",
    "doctorSignatureDataUrl",
    "TEXT",
  );

  addColumnIfMissing(
    "consumableUsageRecords",
    "signedAt",
    "TEXT",
  );

  addColumnIfMissing(
    "consumableUsageRecords",
    "cancelledAt",
    "TEXT",
  );

  addColumnIfMissing(
    "consumableUsageRecords",
    "cancelReason",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageItems",
    "inventoryName",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageItems",
    "inventoryCategory",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageItems",
    "inventoryBrand",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageItems",
    "inventoryModel",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageItems",
    "inventorySpecification",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageItems",
    "expiryDate",
    "TEXT NOT NULL DEFAULT ''",
  );

  addColumnIfMissing(
    "consumableUsageItems",
    "unitCost",
    "REAL NOT NULL DEFAULT 0",
  );

  addColumnIfMissing(
    "consumableUsageItems",
    "totalCost",
    "REAL NOT NULL DEFAULT 0",
  );

  addColumnIfMissing(
    "inventoryTransactions",
    "unitCost",
    "REAL NOT NULL DEFAULT 0",
  );

  addColumnIfMissing(
    "inventoryTransactions",
    "totalCost",
    "REAL NOT NULL DEFAULT 0",
  );

  /* =======================================================
     Indexes
  ======================================================= */

  db.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_consumable_usage_records_clinic
    ON consumableUsageRecords (
      clinicId
    );

    CREATE INDEX IF NOT EXISTS
      idx_consumable_usage_records_clinic_type
    ON consumableUsageRecords (
      clinicId,
      usageType
    );

    CREATE INDEX IF NOT EXISTS
      idx_consumable_usage_records_patient
    ON consumableUsageRecords (
      clinicId,
      patientId
    );

    CREATE INDEX IF NOT EXISTS
      idx_consumable_usage_records_doctor
    ON consumableUsageRecords (
      clinicId,
      doctorId
    );

    CREATE INDEX IF NOT EXISTS
      idx_consumable_usage_records_status
    ON consumableUsageRecords (
      clinicId,
      status
    );

    CREATE INDEX IF NOT EXISTS
      idx_consumable_usage_items_record
    ON consumableUsageItems (
      usageRecordId
    );
  `);
}

/* =========================================================
   Clinic Validation
========================================================= */

function assertActiveClinic(
  clinicId: number,
) {
  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  const clinic =
    db
      .prepare(`
        SELECT id

        FROM clinics

        WHERE id = ?
          AND isActive = 1

        LIMIT 1
      `)
      .get(
        clinicId,
      ) as
      | {
          id: number;
        }
      | undefined;

  if (!clinic) {
    throw new Error(
      "找不到有效的院所。",
    );
  }
}

/* =========================================================
   Patient Validation
========================================================= */

function assertPatientInClinic(
  patientId: number,
  clinicId: number,
) {
  assertPositiveInteger(
    patientId,
    "病患 ID",
  );

  const db =
    getDatabase();

  const patient =
    db
      .prepare(`
        SELECT
          id,
          clinicId

        FROM patients

        WHERE id = ?
          AND clinicId = ?

        LIMIT 1
      `)
      .get(
        patientId,
        clinicId,
      ) as
      | PatientRow
      | undefined;

  if (!patient) {
    throw new Error(
      "找不到此院所的病患。",
    );
  }
}

/* =========================================================
   Doctor Validation
========================================================= */

function assertDoctorInClinic(
  doctorId: number,
  clinicId: number,
) {
  assertPositiveInteger(
    doctorId,
    "醫師 ID",
  );

  const db =
    getDatabase();

  const doctor =
    db
      .prepare(`
        SELECT
          d.id,
          d.isActive

        FROM doctors d

        INNER JOIN doctorClinics dc
          ON dc.doctorId = d.id

        WHERE d.id = ?
          AND dc.clinicId = ?
          AND d.isActive = 1

        LIMIT 1
      `)
      .get(
        doctorId,
        clinicId,
      ) as
      | DoctorMembershipRow
      | undefined;

  if (!doctor) {
    throw new Error(
      "找不到此院所的有效醫師。",
    );
  }
}

/* =========================================================
   Inventory Validation
========================================================= */

function getInventoryForClinic(
  inventoryItemId: number,
  clinicId: number,
) {
  assertPositiveInteger(
    inventoryItemId,
    "庫存品項 ID",
  );

  const db =
    getDatabase();

  const item =
    db
      .prepare(`
        SELECT
          id,

          clinicId,

          name,

          category,

          brand,

          model,

          specification,

          expiryDate,

          quantity,

          unitCost

        FROM inventory

        WHERE id = ?
          AND clinicId = ?

        LIMIT 1
      `)
      .get(
        inventoryItemId,
        clinicId,
      ) as
      | InventoryRow
      | undefined;

  if (!item) {
    throw new Error(
      "找不到此院所的庫存品項。",
    );
  }

  if (
    isImplantOrKitCategory(
      item.category,
    )
  ) {
    throw new Error(
      `「${item.name}」屬於植體或套件，請改由植體使用流程處理。`,
    );
  }

  return item;
}

/* =========================================================
   Record Mapping
========================================================= */

function getUsageItems(
  usageRecordId: number,
):
  ConsumableUsageItemRecord[] {
  const db =
    getDatabase();

  const rows =
    db
      .prepare(`
        SELECT
          id,

          usageRecordId,

          inventoryItemId,

          quantity,

          inventoryName,

          inventoryCategory,

          inventoryBrand,

          inventoryModel,

          inventorySpecification,

          expiryDate,

          unitCost,

          totalCost,

          createdAt

        FROM consumableUsageItems

        WHERE usageRecordId = ?

        ORDER BY id ASC
      `)
      .all(
        usageRecordId,
      ) as RawUsageItem[];

  return rows.map(
    (row) => ({
      id:
        row.id,

      usageRecordId:
        row.usageRecordId,

      inventoryItemId:
        row.inventoryItemId,

      quantity:
        row.quantity,

      inventoryName:
        row.inventoryName,

      inventoryCategory:
        row.inventoryCategory,

      inventoryBrand:
        row.inventoryBrand,

      inventoryModel:
        row.inventoryModel,

      inventorySpecification:
        row.inventorySpecification,

      expiryDate:
        row.expiryDate,

      unitCost:
        Number(row.unitCost ?? 0),

      totalCost:
        Number(row.totalCost ?? 0),

      createdAt:
        row.createdAt,
    }),
  );
}

function mapUsageRecord(
  row:
    RawUsageRecord,
):
  ConsumableUsageRecord {
  assertUsageType(
    row.usageType,
  );

  return {
    id:
      row.id,

    clinicId:
      row.clinicId,

    patientId:
      row.patientId,

    patientName:
      row.patientName,

    patientChartNumber:
      row.patientChartNumber,

    doctorId:
      row.doctorId,

    doctorName:
      row.doctorName,

    usageType:
      row.usageType,

    usageDate:
      row.usageDate,

    toothPosition:
      row.toothPosition ??
      "",

    note:
      row.note ??
      "",

    status:
      normalizeStatus(
        row.status,
      ),

    doctorSignatureDataUrl:
      row.doctorSignatureDataUrl,

    signedAt:
      row.signedAt,

    cancelledAt:
      row.cancelledAt,

    cancelReason:
      row.cancelReason ??
      "",

    items:
      getUsageItems(
        row.id,
      ),

    createdAt:
      row.createdAt,

    updatedAt:
      row.updatedAt,
  };
}

/* =========================================================
   Base SELECT
========================================================= */

const BASE_USAGE_SELECT = `
  SELECT
    cur.id,

    cur.clinicId,

    cur.patientId,

    p.name
      AS patientName,

    p.chartNumber
      AS patientChartNumber,

    cur.doctorId,

    d.name
      AS doctorName,

    cur.usageType,

    cur.usageDate,

    cur.toothPosition,

    cur.note,

    cur.status,

    cur.doctorSignatureDataUrl,

    cur.signedAt,

    cur.cancelledAt,

    cur.cancelReason,

    cur.createdAt,

    cur.updatedAt

  FROM consumableUsageRecords cur

  INNER JOIN patients p
    ON p.id = cur.patientId
    AND p.clinicId = cur.clinicId

  INNER JOIN doctors d
    ON d.id = cur.doctorId
`;

/* =========================================================
   Get By ID
========================================================= */

export function getConsumableUsageById(
  usageRecordId: number,
  clinicId: number,
):
  ConsumableUsageRecord | null {
  assertPositiveInteger(
    usageRecordId,
    "耗材使用紀錄 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  const row =
    db
      .prepare(`
        ${BASE_USAGE_SELECT}

        WHERE cur.id = ?
          AND cur.clinicId = ?

        LIMIT 1
      `)
      .get(
        usageRecordId,
        clinicId,
      ) as
      | RawUsageRecord
      | undefined;

  if (!row) {
    return null;
  }

  return mapUsageRecord(
    row,
  );
}

/* =========================================================
   List
========================================================= */

export function getConsumableUsageRecords(
  clinicId: number,
  usageType?:
    ConsumableUsageType,
):
  ConsumableUsageRecord[] {
  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  let rows:
    RawUsageRecord[];

  if (usageType) {
    assertUsageType(
      usageType,
    );

    rows =
      db
        .prepare(`
          ${BASE_USAGE_SELECT}

          WHERE cur.clinicId = ?
            AND cur.usageType = ?

          ORDER BY
            cur.usageDate DESC,
            cur.id DESC
        `)
        .all(
          clinicId,
          usageType,
        ) as RawUsageRecord[];
  } else {
    rows =
      db
        .prepare(`
          ${BASE_USAGE_SELECT}

          WHERE cur.clinicId = ?

          ORDER BY
            cur.usageDate DESC,
            cur.id DESC
        `)
        .all(
          clinicId,
        ) as RawUsageRecord[];
  }

  return rows.map(
    mapUsageRecord,
  );
}

/* =========================================================
   Create
========================================================= */

export function createConsumableUsage(
  clinicId: number,
  input:
    ConsumableUsageInput,
):
  ConsumableUsageRecord {
  assertActiveClinic(
    clinicId,
  );

  assertPatientInClinic(
    input.patientId,
    clinicId,
  );

  assertDoctorInClinic(
    input.doctorId,
    clinicId,
  );

  assertUsageType(
    input.usageType,
  );

  const usageDate =
    normalizeText(
      input.usageDate,
    );

  if (!usageDate) {
    throw new Error(
      "請輸入使用日期。",
    );
  }

  if (
    !Array.isArray(
      input.items,
    ) ||
    input.items.length ===
      0
  ) {
    throw new Error(
      "至少需要一個耗材品項。",
    );
  }

  /* =======================================================
     Aggregate duplicate inventoryItemId
  ======================================================= */

  const aggregated =
    new Map<
      number,
      number
    >();

  for (
    const item
    of input.items
  ) {
    assertPositiveInteger(
      item.inventoryItemId,
      "庫存品項 ID",
    );

    assertPositiveInteger(
      item.quantity,
      "使用數量",
    );

    aggregated.set(
      item.inventoryItemId,
      (
        aggregated.get(
          item.inventoryItemId,
        ) ??
        0
      ) +
        item.quantity,
    );
  }

  const normalizedItems =
    Array.from(
      aggregated.entries(),
    ).map(
      ([
        inventoryItemId,
        quantity,
      ]) => ({
        inventoryItemId,
        quantity,
      }),
    );

  /* =======================================================
     Pre-validation
  ======================================================= */

  for (
    const item
    of normalizedItems
  ) {
    const inventoryItem =
      getInventoryForClinic(
        item.inventoryItemId,
        clinicId,
      );

    /*
     * IMPORTANT
     *
     * 使用類型與庫存分類必須完全一致。
     */
    assertInventoryMatchesUsageType(
      inventoryItem,
      input.usageType,
    );

    if (
      inventoryItem.quantity <
      item.quantity
    ) {
      throw new Error(
        `「${inventoryItem.name}」庫存不足，目前庫存 ${inventoryItem.quantity}，需要 ${item.quantity}。`,
      );
    }
  }

  const db =
    getDatabase();

  const transaction =
    db.transaction(
      () => {
        const result =
          db
            .prepare(`
              INSERT INTO consumableUsageRecords (
                clinicId,

                patientId,

                doctorId,

                usageType,

                usageDate,

                toothPosition,

                note,

                status,

                doctorSignatureDataUrl,

                signedAt,

                cancelledAt,

                cancelReason,

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
                '待醫師簽名',
                NULL,
                NULL,
                NULL,
                '',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
            `)
            .run(
              clinicId,

              input.patientId,

              input.doctorId,

              input.usageType,

              usageDate,

              normalizeText(
                input.toothPosition,
              ),

              normalizeText(
                input.note,
              ),
            );

        const usageRecordId =
          Number(
            result.lastInsertRowid,
          );

        for (
          const item
          of normalizedItems
        ) {
          /*
           * Transaction 內重新讀取。
           */
          const inventoryItem =
            getInventoryForClinic(
              item.inventoryItemId,
              clinicId,
            );

          /*
           * 第二次確認分類。
           *
           * 避免 pre-validation 與 transaction
           * 之間庫存主檔分類被改動。
           */
          assertInventoryMatchesUsageType(
            inventoryItem,
            input.usageType,
          );

          const quantityBefore =
            inventoryItem.quantity;

          const quantityAfter =
            quantityBefore -
            item.quantity;

          const unitCost =
            Number(
              inventoryItem.unitCost ??
                0,
            );

          const totalCost =
            Math.round(
              unitCost *
                item.quantity *
                100,
            ) / 100;

          if (
            quantityAfter <
            0
          ) {
            throw new Error(
              `「${inventoryItem.name}」庫存不足。`,
            );
          }

          /*
           * Snapshot
           *
           * 不存 REF / LOT。
           */
          db
            .prepare(`
              INSERT INTO consumableUsageItems (
                usageRecordId,

                inventoryItemId,

                quantity,

                inventoryName,

                inventoryCategory,

                inventoryBrand,

                inventoryModel,

                inventorySpecification,

                expiryDate,

                unitCost,

                totalCost,

                createdAt
              )
              VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP
              )
            `)
            .run(
              usageRecordId,

              inventoryItem.id,

              item.quantity,

              inventoryItem.name,

              inventoryItem.category,

              inventoryItem.brand,

              inventoryItem.model,

              inventoryItem.specification,

              inventoryItem.expiryDate,

              unitCost,

              totalCost,
            );

          /*
           * Atomic deduction.
           */
          const stockUpdate =
            db
              .prepare(`
                UPDATE inventory

                SET
                  quantity =
                    quantity - ?,

                  updatedAt =
                    CURRENT_TIMESTAMP

                WHERE id = ?
                  AND clinicId = ?
                  AND quantity >= ?
              `)
              .run(
                item.quantity,

                inventoryItem.id,

                clinicId,

                item.quantity,
              );

          if (
            stockUpdate.changes !==
            1
          ) {
            throw new Error(
              `「${inventoryItem.name}」庫存不足或庫存已被其他操作變更，請重新整理後再試。`,
            );
          }

          /*
           * Inventory transaction.
           */
          db
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

                unitCost,

                totalCost,

                note,

                createdAt
              )
              VALUES (
                ?,
                ?,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                '耗材使用',
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP
              )
            `)
            .run(
              clinicId,

              inventoryItem.id,

              -item.quantity,

              quantityBefore,

              quantityAfter,

              unitCost,

              totalCost,

              `${input.usageType}使用紀錄 #${usageRecordId}`,
            );
        }

        return usageRecordId;
      },
    );

  const usageRecordId =
    transaction();

  const created =
    getConsumableUsageById(
      usageRecordId,
      clinicId,
    );

  if (!created) {
    throw new Error(
      "耗材使用紀錄建立後無法重新讀取。",
    );
  }

  return created;
}

/* =========================================================
   Doctor Signature
========================================================= */

export function signConsumableUsage(
  usageRecordId: number,
  clinicId: number,
  doctorId: number,
  signatureDataUrl: string,
):
  ConsumableUsageRecord {
  assertPositiveInteger(
    usageRecordId,
    "耗材使用紀錄 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  assertPositiveInteger(
    doctorId,
    "醫師 ID",
  );

  assertDoctorInClinic(
    doctorId,
    clinicId,
  );

  const signature =
    normalizeText(
      signatureDataUrl,
    );

  if (
    !signature.startsWith(
      "data:image/",
    )
  ) {
    throw new Error(
      "醫師簽名格式不正確。",
    );
  }

  if (
    signature.length >
    SIGNATURE_MAX_LENGTH
  ) {
    throw new Error(
      "醫師簽名圖片過大，請重新簽名。",
    );
  }

  const existing =
    getConsumableUsageById(
      usageRecordId,
      clinicId,
    );

  if (!existing) {
    throw new Error(
      "找不到耗材使用紀錄。",
    );
  }

  if (
    existing.doctorId !==
    doctorId
  ) {
    throw new Error(
      "只有此筆紀錄指定的醫師可以簽名。",
    );
  }

  if (
    existing.status ===
    "已取消"
  ) {
    throw new Error(
      "此筆耗材使用紀錄已取消，無法簽名。",
    );
  }

  if (
    existing.status ===
      "已簽名" ||
    existing.doctorSignatureDataUrl ||
    existing.signedAt
  ) {
    throw new Error(
      "此筆耗材使用紀錄已完成醫師簽名。",
    );
  }

  if (
    existing.status !==
    "待醫師簽名"
  ) {
    throw new Error(
      "目前紀錄狀態不允許醫師簽名。",
    );
  }

  const db =
    getDatabase();

  const result =
    db
      .prepare(`
        UPDATE consumableUsageRecords

        SET
          doctorSignatureDataUrl = ?,

          signedAt =
            CURRENT_TIMESTAMP,

          status =
            '已簽名',

          updatedAt =
            CURRENT_TIMESTAMP

        WHERE id = ?
          AND clinicId = ?
          AND doctorId = ?
          AND status =
            '待醫師簽名'
          AND doctorSignatureDataUrl IS NULL
          AND signedAt IS NULL
      `)
      .run(
        signature,

        usageRecordId,

        clinicId,

        doctorId,
      );

  if (
    result.changes !==
    1
  ) {
    throw new Error(
      "簽名失敗，紀錄可能已被其他操作更新，請重新整理後再試。",
    );
  }

  const signed =
    getConsumableUsageById(
      usageRecordId,
      clinicId,
    );

  if (!signed) {
    throw new Error(
      "簽名完成後無法重新讀取紀錄。",
    );
  }

  return signed;
}

/* =========================================================
   Cancel
========================================================= */

export function cancelConsumableUsage(
  usageRecordId: number,
  clinicId: number,
  reason: string,
):
  ConsumableUsageRecord {
  assertPositiveInteger(
    usageRecordId,
    "耗材使用紀錄 ID",
  );

  assertActiveClinic(
    clinicId,
  );

  const cancelReason =
    normalizeText(
      reason,
    );

  if (!cancelReason) {
    throw new Error(
      "取消耗材使用紀錄必須填寫原因。",
    );
  }

  if (
    cancelReason.length >
    1000
  ) {
    throw new Error(
      "取消原因不可超過 1000 個字元。",
    );
  }

  const existing =
    getConsumableUsageById(
      usageRecordId,
      clinicId,
    );

  if (!existing) {
    throw new Error(
      "找不到耗材使用紀錄。",
    );
  }

  if (
    existing.status ===
    "已簽名"
  ) {
    throw new Error(
      "已完成醫師簽名的耗材使用紀錄不可取消。",
    );
  }

  if (
    existing.status ===
    "已取消"
  ) {
    throw new Error(
      "此筆耗材使用紀錄已經取消。",
    );
  }

  if (
    existing.status !==
    "待醫師簽名"
  ) {
    throw new Error(
      "目前紀錄狀態不允許取消。",
    );
  }

  if (
    existing.doctorSignatureDataUrl ||
    existing.signedAt
  ) {
    throw new Error(
      "此筆紀錄已有醫師簽名資料，不允許取消。",
    );
  }

  if (
    existing.items.length ===
    0
  ) {
    throw new Error(
      "此筆耗材使用紀錄沒有可歸回的庫存品項。",
    );
  }

  const db =
    getDatabase();

  const transaction =
    db.transaction(
      () => {
        const current =
          db
            .prepare(`
              SELECT
                id,

                status,

                doctorSignatureDataUrl,

                signedAt

              FROM consumableUsageRecords

              WHERE id = ?
                AND clinicId = ?

              LIMIT 1
            `)
            .get(
              usageRecordId,
              clinicId,
            ) as
            | {
                id: number;

                status: string;

                doctorSignatureDataUrl:
                  string | null;

                signedAt:
                  string | null;
              }
            | undefined;

        if (!current) {
          throw new Error(
            "找不到耗材使用紀錄。",
          );
        }

        if (
          current.status !==
          "待醫師簽名"
        ) {
          throw new Error(
            "此筆紀錄目前已無法取消，請重新整理後再試。",
          );
        }

        if (
          current.doctorSignatureDataUrl ||
          current.signedAt
        ) {
          throw new Error(
            "此筆紀錄已有醫師簽名資料，不允許取消。",
          );
        }

        const usageItems =
          db
            .prepare(`
              SELECT
                id,

                inventoryItemId,

                quantity,

                inventoryName,

                unitCost,

                totalCost

              FROM consumableUsageItems

              WHERE usageRecordId = ?

              ORDER BY id ASC
            `)
            .all(
              usageRecordId,
            ) as Array<{
              id: number;

              inventoryItemId: number;

              quantity: number;

              inventoryName: string;

              unitCost: number;

              totalCost: number;
            }>;

        if (
          usageItems.length ===
          0
        ) {
          throw new Error(
            "此筆耗材使用紀錄沒有可歸回的品項。",
          );
        }

        /*
         * Compatibility:
         * 舊資料可能有重複 inventoryItemId，
         * 取消時再次合併。
         */
        const returnMap =
          new Map<
            number,
            {
              quantity: number;

              inventoryName: string;

              totalCost: number;
            }
          >();

        for (
          const usageItem
          of usageItems
        ) {
          assertPositiveInteger(
            usageItem.quantity,
            "原始耗材使用數量",
          );

          const previous =
            returnMap.get(
              usageItem.inventoryItemId,
            );

          if (previous) {
            previous.quantity +=
              usageItem.quantity;

            previous.totalCost +=
              Number(
                usageItem.totalCost ??
                  0,
              );
          } else {
            returnMap.set(
              usageItem.inventoryItemId,
              {
                quantity:
                  usageItem.quantity,

                inventoryName:
                  usageItem.inventoryName,

                totalCost:
                  Number(
                    usageItem.totalCost ??
                      0,
                  ),
              },
            );
          }
        }

        /*
         * Return stock.
         */
        for (
          const [
            inventoryItemId,
            returnItem,
          ]
          of returnMap.entries()
        ) {
          const inventoryItem =
            db
              .prepare(`
                SELECT
                  id,

                  clinicId,

                  name,

                  quantity

                FROM inventory

                WHERE id = ?
                  AND clinicId = ?

                LIMIT 1
              `)
              .get(
                inventoryItemId,
                clinicId,
              ) as
              | {
                  id: number;

                  clinicId: number;

                  name: string;

                  quantity: number;
                }
              | undefined;

          if (!inventoryItem) {
            throw new Error(
              `找不到原耗材庫存品項「${returnItem.inventoryName}」，無法完成取消歸回。`,
            );
          }

          const quantityBefore =
            inventoryItem.quantity;

          const quantityAfter =
            quantityBefore +
            returnItem.quantity;

          const returnTotalCost =
            Math.round(
              Number(
                returnItem.totalCost ??
                  0,
              ) * 100,
            ) / 100;

          const returnUnitCost =
            returnItem.quantity > 0
              ? Math.round(
                  (returnTotalCost /
                    returnItem.quantity) *
                    1000000,
                ) / 1000000
              : 0;

          const update =
            db
              .prepare(`
                UPDATE inventory

                SET
                  quantity =
                    quantity + ?,

                  updatedAt =
                    CURRENT_TIMESTAMP

                WHERE id = ?
                  AND clinicId = ?
              `)
              .run(
                returnItem.quantity,

                inventoryItemId,

                clinicId,
              );

          if (
            update.changes !==
            1
          ) {
            throw new Error(
              `「${inventoryItem.name}」庫存歸回失敗。`,
            );
          }

          db
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

                unitCost,

                totalCost,

                note,

                createdAt
              )
              VALUES (
                ?,
                ?,
                NULL,
                NULL,
                NULL,
                NULL,
                NULL,
                '耗材取消歸回',
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP
              )
            `)
            .run(
              clinicId,

              inventoryItemId,

              returnItem.quantity,

              quantityBefore,

              quantityAfter,

              returnUnitCost,

              returnTotalCost,

              `耗材使用紀錄 #${usageRecordId} 取消歸回：${cancelReason}`,
            );
        }

        const cancelUpdate =
          db
            .prepare(`
              UPDATE consumableUsageRecords

              SET
                status =
                  '已取消',

                cancelledAt =
                  CURRENT_TIMESTAMP,

                cancelReason =
                  ?,

                updatedAt =
                  CURRENT_TIMESTAMP

              WHERE id = ?
                AND clinicId = ?
                AND status =
                  '待醫師簽名'
                AND doctorSignatureDataUrl IS NULL
                AND signedAt IS NULL
            `)
            .run(
              cancelReason,

              usageRecordId,

              clinicId,
            );

        if (
          cancelUpdate.changes !==
          1
        ) {
          throw new Error(
            "取消失敗，紀錄可能已被其他操作更新。",
          );
        }
      },
    );

  transaction();

  const cancelled =
    getConsumableUsageById(
      usageRecordId,
      clinicId,
    );

  if (!cancelled) {
    throw new Error(
      "取消完成後無法重新讀取耗材使用紀錄。",
    );
  }

  return cancelled;
}

/* =========================================================
   By Doctor
========================================================= */

export function getConsumableUsageByDoctor(
  doctorId: number,
  clinicId: number,
  usageType?:
    ConsumableUsageType,
):
  ConsumableUsageRecord[] {
  assertPositiveInteger(
    doctorId,
    "醫師 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  assertDoctorInClinic(
    doctorId,
    clinicId,
  );

  const db =
    getDatabase();

  let rows:
    RawUsageRecord[];

  if (usageType) {
    assertUsageType(
      usageType,
    );

    rows =
      db
        .prepare(`
          ${BASE_USAGE_SELECT}

          WHERE cur.clinicId = ?
            AND cur.doctorId = ?
            AND cur.usageType = ?

          ORDER BY
            cur.usageDate DESC,
            cur.id DESC
        `)
        .all(
          clinicId,
          doctorId,
          usageType,
        ) as RawUsageRecord[];
  } else {
    rows =
      db
        .prepare(`
          ${BASE_USAGE_SELECT}

          WHERE cur.clinicId = ?
            AND cur.doctorId = ?

          ORDER BY
            cur.usageDate DESC,
            cur.id DESC
        `)
        .all(
          clinicId,
          doctorId,
        ) as RawUsageRecord[];
  }

  return rows.map(
    mapUsageRecord,
  );
}

/* =========================================================
   By Patient
========================================================= */

export function getConsumableUsageByPatient(
  patientId: number,
  clinicId: number,
  usageType?:
    ConsumableUsageType,
):
  ConsumableUsageRecord[] {
  assertPositiveInteger(
    patientId,
    "病患 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  assertPatientInClinic(
    patientId,
    clinicId,
  );

  const db =
    getDatabase();

  let rows:
    RawUsageRecord[];

  if (usageType) {
    assertUsageType(
      usageType,
    );

    rows =
      db
        .prepare(`
          ${BASE_USAGE_SELECT}

          WHERE cur.clinicId = ?
            AND cur.patientId = ?
            AND cur.usageType = ?

          ORDER BY
            cur.usageDate DESC,
            cur.id DESC
        `)
        .all(
          clinicId,
          patientId,
          usageType,
        ) as RawUsageRecord[];
  } else {
    rows =
      db
        .prepare(`
          ${BASE_USAGE_SELECT}

          WHERE cur.clinicId = ?
            AND cur.patientId = ?

          ORDER BY
            cur.usageDate DESC,
            cur.id DESC
        `)
        .all(
          clinicId,
          patientId,
        ) as RawUsageRecord[];
  }

  return rows.map(
    mapUsageRecord,
  );
}