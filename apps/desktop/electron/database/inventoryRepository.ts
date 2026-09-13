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
