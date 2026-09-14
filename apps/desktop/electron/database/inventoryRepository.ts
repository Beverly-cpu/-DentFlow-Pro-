import {
  getDatabase,
} from "./db";

/* =========================================================
   Types
========================================================= */

export type InventoryInput = {
  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  refNumber: string;

  lotNumber: string;

  expiryDate: string;

  quantity: number;

  safetyStock: number;

  /**
   * 單位成本。
   * 舊呼叫端可暫時不傳；未提供時新建批次以 0 儲存。
   */
  unitCost?: number;

  note: string;
};

export type InventoryRecord =
  Omit<InventoryInput, "unitCost"> & {
    id: number;

    unitCost: number;

    clinicId: number;

    createdAt: string;

    updatedAt: string;
  };

/* =========================================================
   Helpers
========================================================= */

function assertValidClinicId(
  clinicId: number,
) {
  if (
    !Number.isInteger(
      clinicId,
    ) ||
    clinicId <= 0
  ) {
    throw new Error(
      "院所 ID 無效。",
    );
  }
}

function assertValidInventoryId(
  id: number,
) {
  if (
    !Number.isInteger(
      id,
    ) ||
    id <= 0
  ) {
    throw new Error(
      "庫存品項 ID 無效。",
    );
  }
}

function assertValidQuantity(
  quantity: number,
  label = "庫存數量",
) {
  if (
    !Number.isInteger(
      quantity,
    ) ||
    quantity < 0
  ) {
    throw new Error(
      `${label}必須是 0 以上的整數。`,
    );
  }
}

function assertPositiveQuantity(
  quantity: number,
  label = "入庫數量",
) {
  if (
    !Number.isInteger(
      quantity,
    ) ||
    quantity <= 0
  ) {
    throw new Error(
      `${label}必須是大於 0 的整數。`,
    );
  }
}

function assertValidUnitCost(
  unitCost: number,
) {
  if (
    !Number.isFinite(
      unitCost,
    ) ||
    unitCost < 0
  ) {
    throw new Error(
      "單位成本必須是 0 以上的數字。",
    );
  }
}

/*
 * 舊資料庫相容：
 * 不刪除、不重建 inventory。
 * 若尚未有 unitCost 欄位，只新增欄位並以 0 補既有資料。
 *
 * 正式 schema migration 之後仍建議同步寫入 db.ts；
 * 這裡保留防護，避免既有安裝版本直接升級時查詢失敗。
 */
function ensureInventoryUnitCostColumn() {
  const db =
    getDatabase();

  const columns =
    db
      .prepare(
        "PRAGMA table_info(inventory)",
      )
      .all() as {
      name: string;
    }[];

  const hasUnitCost =
    columns.some(
      (column) =>
        column.name ===
        "unitCost",
    );

  if (!hasUnitCost) {
    db.exec(
      `
        ALTER TABLE inventory
        ADD COLUMN unitCost REAL NOT NULL DEFAULT 0
      `,
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
  value: unknown,
) {
  return String(
    value ?? "",
  ).trim();
}

function assertActiveClinic(
  clinicId: number,
) {
  assertValidClinicId(
    clinicId,
  );

  const db =
    getDatabase();

  ensureInventoryUnitCostColumn();

  ensureInventoryTransactionCostColumns();

  const clinic =
    db
      .prepare(
        `
          SELECT
            id,
            isActive
          FROM clinics
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(
        clinicId,
      ) as
      | {
          id: number;
          isActive: number;
        }
      | undefined;

  if (!clinic) {
    throw new Error(
      "找不到指定院所。",
    );
  }

  if (
    clinic.isActive !==
    1
  ) {
    throw new Error(
      "此院所目前未啟用。",
    );
  }
}

function mapInventoryRecord(
  row: unknown,
) {
  const record =
    row as
      InventoryRecord;

  return {
    ...record,

    unitCost:
      Number(
        record.unitCost ??
          0,
      ),
  };
}

function getInventoryItemOrThrow(
  id: number,
  clinicId: number,
) {
  assertValidInventoryId(
    id,
  );

  assertActiveClinic(
    clinicId,
  );

  const db =
    getDatabase();

  const row =
    db
      .prepare(
        `
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
            safetyStock,
            unitCost,
            note,
            createdAt,
            updatedAt
          FROM inventory
          WHERE id = ?
            AND clinicId = ?
          LIMIT 1
        `,
      )
      .get(
        id,
        clinicId,
      ) as
      | InventoryRecord
      | undefined;

  if (!row) {
    throw new Error(
      "找不到此院所的庫存品項。",
    );
  }

  return mapInventoryRecord(
    row,
  );
}

function normalizeInventoryInput(
  input: InventoryInput,
) {
  const quantity =
    Number(
      input.quantity,
    );

  const safetyStock =
    Number(
      input.safetyStock,
    );

  const unitCost =
    input.unitCost ===
      undefined
      ? 0
      : Number(
          input.unitCost,
        );

  assertValidQuantity(
    quantity,
  );

  assertValidQuantity(
    safetyStock,
    "安全庫存",
  );

  assertValidUnitCost(
    unitCost,
  );

  const name =
    normalizeText(
      input.name,
    );

  const category =
    normalizeText(
      input.category,
    );

  if (!name) {
    throw new Error(
      "請輸入品項名稱。",
    );
  }

  if (!category) {
    throw new Error(
      "請輸入品項類別。",
    );
  }

  return {
    name,

    category,

    brand:
      normalizeText(
        input.brand,
      ),

    model:
      normalizeText(
        input.model,
      ),

    specification:
      normalizeText(
        input.specification,
      ),

    refNumber:
      normalizeText(
        input.refNumber,
      ),

    lotNumber:
      normalizeText(
        input.lotNumber,
      ),

    expiryDate:
      normalizeText(
        input.expiryDate,
      ),

    quantity,

    safetyStock,

    unitCost,

    note:
      normalizeText(
        input.note,
      ),
  };
}

/* =========================================================
   Queries
========================================================= */

export function getInventoryItems(
  clinicId: number,
): InventoryRecord[] {
  assertActiveClinic(
    clinicId,
  );

  const db =
    getDatabase();

  const rows =
    db
      .prepare(
        `
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
            safetyStock,
            unitCost,
            note,
            createdAt,
            updatedAt
          FROM inventory
          WHERE clinicId = ?
          ORDER BY
            category COLLATE NOCASE ASC,
            name COLLATE NOCASE ASC,
            brand COLLATE NOCASE ASC,
            model COLLATE NOCASE ASC,
            specification COLLATE NOCASE ASC,
            expiryDate ASC,
            id ASC
        `,
      )
      .all(
        clinicId,
      ) as
      InventoryRecord[];

  return rows.map(
    mapInventoryRecord,
  );
}

export function getInventoryItemById(
  id: number,
  clinicId: number,
): InventoryRecord {
  return getInventoryItemOrThrow(
    id,
    clinicId,
  );
}

/* =========================================================
   Create
========================================================= */

export function createInventoryItem(
  clinicId: number,
  input: InventoryInput,
): InventoryRecord {
  assertActiveClinic(
    clinicId,
  );

  const normalized =
    normalizeInventoryInput(
      input,
    );

  const db =
    getDatabase();

  const transaction =
    db.transaction(
      () => {
        const result =
          db
            .prepare(
              `
                INSERT INTO inventory (
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
                  safetyStock,
                  unitCost,
                  note,
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
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  ?,
                  CURRENT_TIMESTAMP,
                  CURRENT_TIMESTAMP
                )
              `,
            )
            .run(
              clinicId,
              normalized.name,
              normalized.category,
              normalized.brand,
              normalized.model,
              normalized.specification,
              normalized.refNumber,
              normalized.lotNumber,
              normalized.expiryDate,
              normalized.quantity,
              normalized.safetyStock,
              normalized.unitCost,
              normalized.note,
            );

        const inventoryItemId =
          Number(
            result.lastInsertRowid,
          );

        /*
         * 初始數量大於 0 時，
         * 留下一筆真正的「入庫」異動。
         */
        if (
          normalized.quantity >
          0
        ) {
          db
            .prepare(
              `
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
                  '入庫',
                  ?,
                  0,
                  ?,
                  ?,
                  ?,
                  ?,
                  CURRENT_TIMESTAMP
                )
              `,
            )
            .run(
              clinicId,
              inventoryItemId,
              normalized.quantity,
              normalized.quantity,
              normalized.unitCost,
              Math.round(
                normalized.unitCost *
                  normalized.quantity *
                  100,
              ) / 100,
              normalized.note ||
                "建立庫存時的初始入庫",
            );
        }

        return inventoryItemId;
      },
    );

  const inventoryItemId =
    transaction();

  return getInventoryItemOrThrow(
    inventoryItemId,
    clinicId,
  );
}

/* =========================================================
   Update Metadata

   重要：
   一般編輯不能改實際 quantity。

   數量修改必須走：
   - receiveInventory()
   - adjustInventoryQuantity()
   - implantRepository 的實際使用流程
========================================================= */

export function updateInventoryItem(
  id: number,
  clinicId: number,
  input: InventoryInput,
): InventoryRecord {
  const existing =
    getInventoryItemOrThrow(
      id,
      clinicId,
    );

  const normalized =
    normalizeInventoryInput(
      input,
    );

  const db =
    getDatabase();

  db
    .prepare(
      `
        UPDATE inventory
        SET
          name = ?,
          category = ?,
          brand = ?,
          model = ?,
          specification = ?,
          refNumber = ?,
          lotNumber = ?,
          expiryDate = ?,

          /*
           * 一般基本資料編輯禁止變更實際庫存。
           */
          quantity = ?,

          safetyStock = ?,
          unitCost = ?,
          note = ?,
          updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
          AND clinicId = ?
      `,
    )
    .run(
      normalized.name,
      normalized.category,
      normalized.brand,
      normalized.model,
      normalized.specification,
      normalized.refNumber,
      normalized.lotNumber,
      normalized.expiryDate,

      existing.quantity,

      normalized.safetyStock,
      input.unitCost === undefined
        ? existing.unitCost
        : normalized.unitCost,
      normalized.note,

      id,
      clinicId,
    );

  return getInventoryItemOrThrow(
    id,
    clinicId,
  );
}

/* =========================================================
   Legacy Quantity Update

   舊程式相容用。

   不會寫 inventoryTransactions。

   新 UI 不應再使用這個函式做人工調整或入庫。
========================================================= */

export function updateInventoryQuantity(
  id: number,
  clinicId: number,
  quantity: number,
): InventoryRecord {
  getInventoryItemOrThrow(
    id,
    clinicId,
  );

  assertValidQuantity(
    quantity,
  );

  const db =
    getDatabase();

  const result =
    db
      .prepare(
        `
          UPDATE inventory
          SET
            quantity = ?,
            updatedAt = CURRENT_TIMESTAMP
          WHERE id = ?
            AND clinicId = ?
        `,
      )
      .run(
        quantity,
        id,
        clinicId,
      );

  if (
    result.changes ===
    0
  ) {
    throw new Error(
      "庫存數量更新失敗。",
    );
  }

  return getInventoryItemOrThrow(
    id,
    clinicId,
  );
}

/* =========================================================
   ★ 正式入庫 / 補貨

   quantity 代表「本次收到多少」。

   例如：
   目前 7
   本次收到 5

   → quantityBefore = 7
   → quantityChange = +5
   → quantityAfter = 12
   → type = 入庫

   與手動盤點完全分開。
========================================================= */

export function receiveInventory(
  id: number,
  clinicId: number,
  quantity: number,
  unitCost: number,
  note: string,
): InventoryRecord {
  assertValidInventoryId(
    id,
  );

  assertActiveClinic(
    clinicId,
  );

  assertPositiveQuantity(
    quantity,
  );

  const normalizedUnitCost =
    Number(
      unitCost,
    );

  assertValidUnitCost(
    normalizedUnitCost,
  );

  const normalizedNote =
    normalizeText(
      note,
    );

  if (!normalizedNote) {
    throw new Error(
      "請填寫入庫原因或來源。",
    );
  }

  const db =
    getDatabase();

  const transaction =
    db.transaction(
      () => {
        const existing =
          db
            .prepare(
              `
                SELECT
                  id,
                  clinicId,
                  quantity,
                  unitCost
                FROM inventory
                WHERE id = ?
                  AND clinicId = ?
                LIMIT 1
              `,
            )
            .get(
              id,
              clinicId,
            ) as
            | {
                id: number;
                clinicId: number;
                quantity: number;
                unitCost: number;
              }
            | undefined;

        if (!existing) {
          throw new Error(
            "找不到此院所的庫存品項。",
          );
        }

        const quantityBefore =
          Number(
            existing.quantity,
          );

        const quantityAfter =
          quantityBefore +
          quantity;

        const previousUnitCost =
          Number(
            existing.unitCost ??
              0,
          );

        /*
         * 同一庫存批次再次補貨時採移動加權平均成本：
         *
         * (原庫存數量 × 原單位成本 + 本次數量 × 本次單位成本)
         * ---------------------------------------------------
         *                    入庫後總數量
         *
         * 若原庫存為 0，則直接使用本次單位成本。
         */
        const weightedUnitCost =
          quantityBefore ===
          0
            ? normalizedUnitCost
            : (
                quantityBefore *
                  previousUnitCost +
                quantity *
                  normalizedUnitCost
              ) /
              quantityAfter;

        /*
         * 金額保留到小數第 4 位。
         * UI 顯示時可再依幣別格式化為 2 位。
         */
        const nextUnitCost =
          Math.round(
            weightedUnitCost *
              10000,
          ) /
          10000;

        const updateResult =
          db
            .prepare(
              `
                UPDATE inventory
                SET
                  quantity = ?,
                  unitCost = ?,
                  updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND clinicId = ?
              `,
            )
            .run(
              quantityAfter,
              nextUnitCost,
              id,
              clinicId,
            );

        if (
          updateResult.changes !==
          1
        ) {
          throw new Error(
            "庫存入庫更新失敗。",
          );
        }

        /*
         * 入庫成本使用「本次實際進貨價」留下快照，
         * 不使用入庫後的加權平均成本。
         *
         * 如此未來平均成本改變時，
         * 歷史進貨報表仍可還原當時的採購成本。
         */
        const totalCost =
          Math.round(
            normalizedUnitCost *
              quantity *
              100,
          ) /
          100;

        db
          .prepare(
            `
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
                '入庫',
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP
              )
            `,
          )
          .run(
            clinicId,
            id,
            quantity,
            quantityBefore,
            quantityAfter,
            normalizedUnitCost,
            totalCost,
            normalizedNote,
          );
      },
    );

  transaction();

  return getInventoryItemOrThrow(
    id,
    clinicId,
  );
}

/* =========================================================
   Audited Manual Adjustment

   quantity 代表「調整後的新總數量」。

   例如：
   目前 10
   調整後 7

   → quantityBefore = 10
   → quantityChange = -3
   → quantityAfter = 7
   → type = 手動調整
========================================================= */

export function adjustInventoryQuantity(
  id: number,
  clinicId: number,
  quantity: number,
  note: string,
): InventoryRecord {
  assertValidInventoryId(
    id,
  );

  assertActiveClinic(
    clinicId,
  );

  assertValidQuantity(
    quantity,
    "新庫存數量",
  );

  const normalizedNote =
    normalizeText(
      note,
    );

  if (!normalizedNote) {
    throw new Error(
      "請填寫庫存調整原因。",
    );
  }

  const db =
    getDatabase();

  const transaction =
    db.transaction(
      () => {
        const existing =
          db
            .prepare(
              `
                SELECT
                  id,
                  clinicId,
                  quantity,

                  unitCost
                FROM inventory
                WHERE id = ?
                  AND clinicId = ?
                LIMIT 1
              `,
            )
            .get(
              id,
              clinicId,
            ) as
            | {
                id: number;
                clinicId: number;
                quantity: number;

                unitCost: number;
              }
            | undefined;

        if (!existing) {
          throw new Error(
            "找不到此院所的庫存品項。",
          );
        }

        const quantityBefore =
          existing.quantity;

        const quantityAfter =
          quantity;

        if (
          quantityBefore ===
          quantityAfter
        ) {
          throw new Error(
            "新庫存數量與目前數量相同。",
          );
        }

        const quantityChange =
          quantityAfter -
          quantityBefore;

        /*
         * 手動調整使用「調整當下」的移動平均成本快照。
         * 不修改 inventory.unitCost；
         * totalCost 保存絕對異動金額，方向由 quantityChange 判斷。
         */
        const unitCost =
          Number(
            existing.unitCost ??
              0,
          );

        const totalCost =
          Math.round(
            Math.abs(
              quantityChange,
            ) *
              unitCost *
              100,
          ) /
          100;

        const updateResult =
          db
            .prepare(
              `
                UPDATE inventory
                SET
                  quantity = ?,
                  updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND clinicId = ?
              `,
            )
            .run(
              quantityAfter,
              id,
              clinicId,
            );

        if (
          updateResult.changes !==
          1
        ) {
          throw new Error(
            "庫存調整失敗。",
          );
        }

        db
          .prepare(
            `
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
                '手動調整',
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                CURRENT_TIMESTAMP
              )
            `,
          )
          .run(
            clinicId,
            id,
            quantityChange,
            quantityBefore,
            quantityAfter,

            unitCost,

            totalCost,
            normalizedNote,
          );
      },
    );

  transaction();

  return getInventoryItemOrThrow(
    id,
    clinicId,
  );
}

/* =========================================================
   Low Stock
========================================================= */

export function getLowStockItems(
  clinicId: number,
): InventoryRecord[] {
  assertActiveClinic(
    clinicId,
  );

  const db =
    getDatabase();

  const rows =
    db
      .prepare(
      `
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
          safetyStock,
          unitCost,
          note,
          createdAt,
          updatedAt
        FROM inventory
        WHERE clinicId = ?
          AND quantity <= safetyStock
        ORDER BY
          quantity ASC,
          safetyStock DESC,
          category COLLATE NOCASE ASC,
          name COLLATE NOCASE ASC,
          id ASC
      `,
    )
      .all(
        clinicId,
      ) as
      InventoryRecord[];

  return rows.map(
    mapInventoryRecord,
  );
}

/* =========================================================
   Delete

   為了保留追溯紀錄：
   只要已有異動紀錄或實際植體使用紀錄，
   就禁止直接刪除庫存批次。
========================================================= */

export function deleteInventoryItem(
  id: number,
  clinicId: number,
): boolean {
  getInventoryItemOrThrow(
    id,
    clinicId,
  );

  const db =
    getDatabase();

  const transactionCount =
    db
      .prepare(
        `
          SELECT
            COUNT(*) AS count
          FROM inventoryTransactions
          WHERE inventoryItemId = ?
            AND clinicId = ?
        `,
      )
      .get(
        id,
        clinicId,
      ) as {
      count: number;
    };

  if (
    Number(
      transactionCount.count,
    ) >
    0
  ) {
    throw new Error(
      "此庫存已有異動紀錄，為保留追溯資料，無法刪除。",
    );
  }

  /*
   * 再確認是否已被術後實際使用紀錄引用。
   *
   * 使用 parent implant.clinicId 判斷院所，
   * 防止跨院所誤判。
   */
  const usageCount =
    db
      .prepare(
        `
          SELECT
            COUNT(*) AS count
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
          WHERE implantUsageItems.inventoryItemId = ?
            AND implants.clinicId = ?
        `,
      )
      .get(
        id,
        clinicId,
      ) as {
      count: number;
    };

  if (
    Number(
      usageCount.count,
    ) >
    0
  ) {
    throw new Error(
      "此庫存已有植體實際使用紀錄，為保留醫療追溯資料，無法刪除。",
    );
  }

  const result =
    db
      .prepare(
        `
          DELETE FROM inventory
          WHERE id = ?
            AND clinicId = ?
        `,
      )
      .run(
        id,
        clinicId,
      );

  return (
    result.changes >
    0
  );
}
