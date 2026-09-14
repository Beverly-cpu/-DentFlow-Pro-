import { getDatabase } from "./db";

export type InventoryRecord = {
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
  safetyStock: number;
  unitCost: number;
  createdAt: string;
  updatedAt: string;
};

export type InventoryInput = {
  name: string;
  category: string;
  brand: string;
  model: string;
  specification: string;
  refNumber: string;
  lotNumber: string;
  expiryDate: string;
  safetyStock: number;
};

export type InventoryTransactionRecord = {
  id: number;
  clinicId: number;
  inventoryItemId: number;
  type: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number;
  totalCost: number;
  note: string;
  inventoryName: string;
  inventoryCategory: string;
  inventoryBrand: string;
  inventoryModel: string;
  inventorySpecification: string;
  inventoryRefNumber: string;
  inventoryLotNumber: string;
  inventoryExpiryDate: string;
  createdAt: string;
};

export function getInventory(clinicId: number): InventoryRecord[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM inventoryItems
       WHERE clinicId = ?
       ORDER BY name COLLATE NOCASE, id`,
    )
    .all(clinicId) as InventoryRecord[];
}

function validateInput(input: InventoryInput) {
  if (!input.name.trim() || !input.category.trim()) {
    throw new Error("品項名稱與分類為必填。");
  }

  if (!Number.isInteger(input.safetyStock) || input.safetyStock < 0) {
    throw new Error("安全庫存必須是大於或等於 0 的整數。");
  }
}

export function createInventoryItem(
  clinicId: number,
  input: InventoryInput,
): InventoryRecord {
  validateInput(input);
  const database = getDatabase();
  const result = database
    .prepare(
      `INSERT INTO inventoryItems (
        clinicId, name, category, brand, model, specification,
        refNumber, lotNumber, expiryDate, safetyStock
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      clinicId,
      input.name.trim(),
      input.category.trim(),
      input.brand.trim(),
      input.model.trim(),
      input.specification.trim(),
      input.refNumber.trim(),
      input.lotNumber.trim(),
      input.expiryDate.trim(),
      input.safetyStock,
    );

  return database
    .prepare("SELECT * FROM inventoryItems WHERE id = ?")
    .get(result.lastInsertRowid) as InventoryRecord;
}

export function updateInventoryItem(
  id: number,
  clinicId: number,
  input: InventoryInput,
): InventoryRecord {
  validateInput(input);
  const database = getDatabase();
  const result = database
    .prepare(
      `UPDATE inventoryItems SET
        name = ?, category = ?, brand = ?, model = ?, specification = ?,
        refNumber = ?, lotNumber = ?, expiryDate = ?, safetyStock = ?,
        updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND clinicId = ?`,
    )
    .run(
      input.name.trim(),
      input.category.trim(),
      input.brand.trim(),
      input.model.trim(),
      input.specification.trim(),
      input.refNumber.trim(),
      input.lotNumber.trim(),
      input.expiryDate.trim(),
      input.safetyStock,
      id,
      clinicId,
    );

  if (result.changes === 0) {
    throw new Error("找不到指定的庫存品項。");
  }

  return database
    .prepare("SELECT * FROM inventoryItems WHERE id = ?")
    .get(id) as InventoryRecord;
}

export function deleteInventoryItem(id: number, clinicId: number) {
  const database = getDatabase();
  const transactionCount = database
    .prepare(
      `SELECT COUNT(*) AS count FROM inventoryTransactions
       WHERE inventoryItemId = ? AND clinicId = ?`,
    )
    .get(id, clinicId) as { count: number };

  if (transactionCount.count > 0) {
    throw new Error("已有異動紀錄的品項不可刪除，請保留以確保稽核資料完整。");
  }

  return database
    .prepare("DELETE FROM inventoryItems WHERE id = ? AND clinicId = ?")
    .run(id, clinicId).changes > 0;
}

export function getInventoryTransactions(
  clinicId: number,
): InventoryTransactionRecord[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM inventoryTransactions
       WHERE clinicId = ?
       ORDER BY createdAt DESC, id DESC`,
    )
    .all(clinicId) as InventoryTransactionRecord[];
}

export function receiveInventory(
  inventoryItemId: number,
  clinicId: number,
  quantity: number,
  unitCost: number,
  note: string,
): InventoryRecord {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("入庫數量必須是大於 0 的整數。");
  }

  if (!Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error("單位成本不可小於 0。");
  }

  const database = getDatabase();

  return database.transaction(() => {
    const item = database
      .prepare(
        `SELECT * FROM inventoryItems
         WHERE id = ? AND clinicId = ?`,
      )
      .get(inventoryItemId, clinicId) as InventoryRecord | undefined;

    if (!item) {
      throw new Error("找不到指定的庫存品項。");
    }

    const quantityAfter = item.quantity + quantity;
    const totalCost = quantity * unitCost;
    const weightedUnitCost =
      quantityAfter === 0
        ? 0
        : (item.quantity * item.unitCost + totalCost) / quantityAfter;

    database
      .prepare(
        `UPDATE inventoryItems
         SET quantity = ?, unitCost = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ? AND clinicId = ?`,
      )
      .run(quantityAfter, weightedUnitCost, inventoryItemId, clinicId);

    database
      .prepare(
        `INSERT INTO inventoryTransactions (
          clinicId, inventoryItemId, type, quantityChange,
          quantityBefore, quantityAfter, unitCost, totalCost, note,
          inventoryName, inventoryCategory, inventoryBrand, inventoryModel,
          inventorySpecification, inventoryRefNumber, inventoryLotNumber,
          inventoryExpiryDate
        ) VALUES (?, ?, '入庫', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        clinicId,
        inventoryItemId,
        quantity,
        item.quantity,
        quantityAfter,
        unitCost,
        totalCost,
        note,
        item.name,
        item.category,
        item.brand,
        item.model,
        item.specification,
        item.refNumber,
        item.lotNumber,
        item.expiryDate,
      );

    return database
      .prepare("SELECT * FROM inventoryItems WHERE id = ?")
      .get(inventoryItemId) as InventoryRecord;
  })();
}
