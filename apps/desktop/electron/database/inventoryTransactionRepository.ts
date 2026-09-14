import {
  getDatabase,
} from "./db";

/* =========================================================
   Types
========================================================= */

export type InventoryTransactionType =
  | "入庫"
  | "手術取出"
  | "手術歸回"
  | "歸回"
  | "手動調整"
  | "耗材使用"
  | "耗材取消歸回";

export type InventoryTransactionRecord = {
  id: number;

  clinicId: number;

  inventoryItemId: number;

  implantId:
    number | null;

  implantToothId:
    number | null;

  implantItemId:
    number | null;

  implantPlanItemId:
    number | null;

  implantUsageItemId:
    number | null;

  type:
    InventoryTransactionType;

  quantityChange: number;

  quantityBefore: number;

  quantityAfter: number;

  /**
   * 此筆異動發生當下的單位成本快照。
   * 舊資料可能為 0。
   */
  unitCost: number;

  /**
   * 此筆異動的成本總額快照。
   * 使用絕對異動數量計算，方向由 quantityChange 判斷。
   */
  totalCost: number;

  note: string;

  createdAt: string;

  /* =======================================================
     Inventory Information
  ======================================================= */

  inventoryName: string;

  inventoryCategory: string;

  inventoryBrand: string;

  inventoryModel: string;

  inventorySpecification: string;

  inventoryRefNumber: string;

  inventoryLotNumber: string;

  inventoryExpiryDate: string;

  /* =======================================================
     Optional Implant Information
  ======================================================= */

  patientName:
    string | null;

  patientChartNumber:
    string | null;

  doctorName:
    string | null;

  toothPosition:
    string | null;
};

/* =========================================================
   Raw DB Row
========================================================= */

type RawInventoryTransactionRow = {
  id: number;

  clinicId: number;

  inventoryItemId: number;

  implantId:
    number | null;

  implantToothId:
    number | null;

  implantItemId:
    number | null;

  implantPlanItemId:
    number | null;

  implantUsageItemId:
    number | null;

  type: string;

  quantityChange: number;

  quantityBefore: number;

  quantityAfter: number;

  unitCost:
    number | null;

  totalCost:
    number | null;

  note: string;

  createdAt: string;

  inventoryName:
    string | null;

  inventoryCategory:
    string | null;

  inventoryBrand:
    string | null;

  inventoryModel:
    string | null;

  inventorySpecification:
    string | null;

  inventoryRefNumber:
    string | null;

  inventoryLotNumber:
    string | null;

  inventoryExpiryDate:
    string | null;

  patientName:
    string | null;

  patientChartNumber:
    string | null;

  doctorName:
    string | null;

  toothPosition:
    string | null;
};

/* =========================================================
   Constants
========================================================= */

const VALID_TRANSACTION_TYPES =
  new Set<InventoryTransactionType>([
    "入庫",
    "手術取出",
    "手術歸回",
    "歸回",
    "手動調整",
    "耗材使用",
    "耗材取消歸回",
  ]);

/* =========================================================
   Helpers
========================================================= */

function assertPositiveInteger(
  value: number,
  label: string,
) {
  ensureInventoryTransactionCostColumns();

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

function ensureInventoryTransactionCostColumns() {
  const db =
    getDatabase();

  const columns =
    db
      .prepare(
        "PRAGMA table_info(inventoryTransactions)",
      )
      .all() as {
      name: string;
    }[];

  const names =
    new Set(
      columns.map(
        (column) =>
          column.name,
      ),
    );

  if (
    !names.has(
      "unitCost",
    )
  ) {
    db.exec(
      `
        ALTER TABLE inventoryTransactions
        ADD COLUMN unitCost REAL NOT NULL DEFAULT 0
      `,
    );
  }

  if (
    !names.has(
      "totalCost",
    )
  ) {
    db.exec(
      `
        ALTER TABLE inventoryTransactions
        ADD COLUMN totalCost REAL NOT NULL DEFAULT 0
      `,
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
  );
}

function normalizeNullableText(
  value:
    string |
    null |
    undefined,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(
      value,
    );

  return text || null;
}

function normalizeTransactionType(
  value: string,
):
  InventoryTransactionType {
  if (
    VALID_TRANSACTION_TYPES.has(
      value as
        InventoryTransactionType,
    )
  ) {
    return value as
      InventoryTransactionType;
  }

  /*
   * inventoryTransactions.type 是 TEXT。
   *
   * 如果舊資料庫內存在尚未加入 TypeScript union
   * 的 legacy type，不讓整個查詢直接失敗。
   *
   * 正式新增 transaction type 時，
   * 仍應同步補到上方 union。
   */
  return "手動調整";
}

function mapTransaction(
  row:
    RawInventoryTransactionRow,
):
  InventoryTransactionRecord {
  return {
    id:
      row.id,

    clinicId:
      row.clinicId,

    inventoryItemId:
      row.inventoryItemId,

    implantId:
      row.implantId,

    implantToothId:
      row.implantToothId,

    implantItemId:
      row.implantItemId,

    implantPlanItemId:
      row.implantPlanItemId,

    implantUsageItemId:
      row.implantUsageItemId,

    type:
      normalizeTransactionType(
        row.type,
      ),

    quantityChange:
      row.quantityChange,

    quantityBefore:
      row.quantityBefore,

    quantityAfter:
      row.quantityAfter,

    unitCost:
      Number(
        row.unitCost ??
          0,
      ),

    totalCost:
      Number(
        row.totalCost ??
          0,
      ),

    note:
      normalizeText(
        row.note,
      ),

    createdAt:
      row.createdAt,

    inventoryName:
      normalizeText(
        row.inventoryName,
      ),

    inventoryCategory:
      normalizeText(
        row.inventoryCategory,
      ),

    inventoryBrand:
      normalizeText(
        row.inventoryBrand,
      ),

    inventoryModel:
      normalizeText(
        row.inventoryModel,
      ),

    inventorySpecification:
      normalizeText(
        row.inventorySpecification,
      ),

    inventoryRefNumber:
      normalizeText(
        row.inventoryRefNumber,
      ),

    inventoryLotNumber:
      normalizeText(
        row.inventoryLotNumber,
      ),

    inventoryExpiryDate:
      normalizeText(
        row.inventoryExpiryDate,
      ),

    patientName:
      normalizeNullableText(
        row.patientName,
      ),

    patientChartNumber:
      normalizeNullableText(
        row.patientChartNumber,
      ),

    doctorName:
      normalizeNullableText(
        row.doctorName,
      ),

    toothPosition:
      normalizeNullableText(
        row.toothPosition,
      ),
  };
}

/* =========================================================
   Base SELECT
========================================================= */

/*
 * IMPORTANT
 *
 * inventoryTransactions 現在沒有 toothPosition 欄位。
 *
 * 植體牙位來源：
 *
 * inventoryTransactions.implantToothId
 *              ↓
 * implantTeeth.id
 *              ↓
 * implantTeeth.toothPosition
 *
 * 一般耗材：
 *
 * implantId = NULL
 * implantToothId = NULL
 *
 * 因此：
 *
 * patientName = NULL
 * doctorName = NULL
 * toothPosition = NULL
 *
 * 這是正確行為。
 */
const BASE_TRANSACTION_SELECT = `
  SELECT
    t.id,

    t.clinicId,

    t.inventoryItemId,

    t.implantId,

    t.implantToothId,

    t.implantItemId,

    t.implantPlanItemId,

    t.implantUsageItemId,

    t.type,

    t.quantityChange,

    t.quantityBefore,

    t.quantityAfter,

    t.unitCost,

    t.totalCost,

    t.note,

    t.createdAt,

    inv.name
      AS inventoryName,

    inv.category
      AS inventoryCategory,

    inv.brand
      AS inventoryBrand,

    inv.model
      AS inventoryModel,

    inv.specification
      AS inventorySpecification,

    inv.refNumber
      AS inventoryRefNumber,

    inv.lotNumber
      AS inventoryLotNumber,

    inv.expiryDate
      AS inventoryExpiryDate,

    p.name
      AS patientName,

    p.chartNumber
      AS patientChartNumber,

    d.name
      AS doctorName,

    it.toothPosition
      AS toothPosition

  FROM inventoryTransactions t

  INNER JOIN inventory inv
    ON inv.id = t.inventoryItemId
    AND inv.clinicId = t.clinicId

  LEFT JOIN implants i
    ON i.id = t.implantId
    AND i.clinicId = t.clinicId

  LEFT JOIN patients p
    ON p.id = i.patientId
    AND p.clinicId = t.clinicId

  LEFT JOIN doctors d
    ON d.id = i.doctorId

  LEFT JOIN implantTeeth it
    ON it.id = t.implantToothId
    AND it.implantId = i.id
`;

/* =========================================================
   All Transactions By Clinic
========================================================= */

export function getInventoryTransactions(
  clinicId: number,
):
  InventoryTransactionRecord[] {
  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  const rows =
    db
      .prepare(`
        ${BASE_TRANSACTION_SELECT}

        WHERE t.clinicId = ?

        ORDER BY
          t.createdAt DESC,
          t.id DESC
      `)
      .all(
        clinicId,
      ) as
      RawInventoryTransactionRow[];

  return rows.map(
    mapTransaction,
  );
}

/* =========================================================
   Transactions By Inventory Item
========================================================= */

export function getInventoryTransactionsByItem(
  inventoryItemId: number,
  clinicId: number,
):
  InventoryTransactionRecord[] {
  assertPositiveInteger(
    inventoryItemId,
    "庫存品項 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  /*
   * 確認 inventory item 屬於目前院所。
   */
  const inventoryItem =
    db
      .prepare(`
        SELECT
          id

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
        }
      | undefined;

  if (!inventoryItem) {
    return [];
  }

  const rows =
    db
      .prepare(`
        ${BASE_TRANSACTION_SELECT}

        WHERE t.inventoryItemId = ?
          AND t.clinicId = ?

        ORDER BY
          t.createdAt DESC,
          t.id DESC
      `)
      .all(
        inventoryItemId,
        clinicId,
      ) as
      RawInventoryTransactionRow[];

  return rows.map(
    mapTransaction,
  );
}

/* =========================================================
   Transactions By Implant
========================================================= */

export function getInventoryTransactionsByImplant(
  implantId: number,
  clinicId: number,
):
  InventoryTransactionRecord[] {
  assertPositiveInteger(
    implantId,
    "植體紀錄 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  /*
   * 先驗證 implant 確實屬於目前院所。
   */
  const implant =
    db
      .prepare(`
        SELECT
          id

        FROM implants

        WHERE id = ?
          AND clinicId = ?

        LIMIT 1
      `)
      .get(
        implantId,
        clinicId,
      ) as
      | {
          id: number;
        }
      | undefined;

  if (!implant) {
    return [];
  }

  const rows =
    db
      .prepare(`
        ${BASE_TRANSACTION_SELECT}

        WHERE t.implantId = ?
          AND t.clinicId = ?

        ORDER BY
          t.createdAt ASC,
          t.id ASC
      `)
      .all(
        implantId,
        clinicId,
      ) as
      RawInventoryTransactionRow[];

  return rows.map(
    mapTransaction,
  );
}

/* =========================================================
   Transactions By Implant Tooth
========================================================= */

export function getInventoryTransactionsByImplantTooth(
  implantToothId: number,
  clinicId: number,
):
  InventoryTransactionRecord[] {
  assertPositiveInteger(
    implantToothId,
    "植體牙位 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  /*
   * 確認牙位所屬 implant 屬於目前院所。
   */
  const tooth =
    db
      .prepare(`
        SELECT
          it.id

        FROM implantTeeth it

        INNER JOIN implants i
          ON i.id = it.implantId

        WHERE it.id = ?
          AND i.clinicId = ?

        LIMIT 1
      `)
      .get(
        implantToothId,
        clinicId,
      ) as
      | {
          id: number;
        }
      | undefined;

  if (!tooth) {
    return [];
  }

  const rows =
    db
      .prepare(`
        ${BASE_TRANSACTION_SELECT}

        WHERE t.implantToothId = ?
          AND t.clinicId = ?

        ORDER BY
          t.createdAt ASC,
          t.id ASC
      `)
      .all(
        implantToothId,
        clinicId,
      ) as
      RawInventoryTransactionRow[];

  return rows.map(
    mapTransaction,
  );
}

/* =========================================================
   Transactions By Legacy Implant Item
========================================================= */

export function getInventoryTransactionsByImplantItem(
  implantItemId: number,
  clinicId: number,
):
  InventoryTransactionRecord[] {
  assertPositiveInteger(
    implantItemId,
    "植體品項 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  const rows =
    db
      .prepare(`
        ${BASE_TRANSACTION_SELECT}

        WHERE t.implantItemId = ?
          AND t.clinicId = ?

        ORDER BY
          t.createdAt ASC,
          t.id ASC
      `)
      .all(
        implantItemId,
        clinicId,
      ) as
      RawInventoryTransactionRow[];

  return rows.map(
    mapTransaction,
  );
}

/* =========================================================
   Transactions By Implant Plan Item
========================================================= */

export function getInventoryTransactionsByImplantPlanItem(
  implantPlanItemId: number,
  clinicId: number,
):
  InventoryTransactionRecord[] {
  assertPositiveInteger(
    implantPlanItemId,
    "植體計畫品項 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  /*
   * 驗證 plan item 的 implant 屬於目前院所。
   */
  const planItem =
    db
      .prepare(`
        SELECT
          ipi.id

        FROM implantPlanItems ipi

        INNER JOIN implants i
          ON i.id = ipi.implantId

        WHERE ipi.id = ?
          AND i.clinicId = ?

        LIMIT 1
      `)
      .get(
        implantPlanItemId,
        clinicId,
      ) as
      | {
          id: number;
        }
      | undefined;

  if (!planItem) {
    return [];
  }

  const rows =
    db
      .prepare(`
        ${BASE_TRANSACTION_SELECT}

        WHERE t.implantPlanItemId = ?
          AND t.clinicId = ?

        ORDER BY
          t.createdAt ASC,
          t.id ASC
      `)
      .all(
        implantPlanItemId,
        clinicId,
      ) as
      RawInventoryTransactionRow[];

  return rows.map(
    mapTransaction,
  );
}

/* =========================================================
   Transactions By Implant Usage Item
========================================================= */

export function getInventoryTransactionsByImplantUsageItem(
  implantUsageItemId: number,
  clinicId: number,
):
  InventoryTransactionRecord[] {
  assertPositiveInteger(
    implantUsageItemId,
    "植體實際使用品項 ID",
  );

  assertPositiveInteger(
    clinicId,
    "院所 ID",
  );

  const db =
    getDatabase();

  /*
   * 驗證 usage item 的 implant 屬於目前院所。
   */
  const usageItem =
    db
      .prepare(`
        SELECT
          iui.id

        FROM implantUsageItems iui

        INNER JOIN implants i
          ON i.id = iui.implantId

        WHERE iui.id = ?
          AND i.clinicId = ?

        LIMIT 1
      `)
      .get(
        implantUsageItemId,
        clinicId,
      ) as
      | {
          id: number;
        }
      | undefined;

  if (!usageItem) {
    return [];
  }

  const rows =
    db
      .prepare(`
        ${BASE_TRANSACTION_SELECT}

        WHERE t.implantUsageItemId = ?
          AND t.clinicId = ?

        ORDER BY
          t.createdAt ASC,
          t.id ASC
      `)
      .all(
        implantUsageItemId,
        clinicId,
      ) as
      RawInventoryTransactionRow[];

  return rows.map(
    mapTransaction,
  );
}