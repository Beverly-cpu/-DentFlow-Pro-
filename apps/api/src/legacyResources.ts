import { createHash } from "node:crypto";

import { positiveId } from "./legacyImplant.js";
import type { ImplantSnapshot } from "./legacyImplant.js";

export type LegacyInventory = {
  legacyId: number; clinicCode: string; name: string; category: string;
  brand: string; model: string; specification: string; refNumber: string;
  lotNumber: string; expiryDate: string; quantity: number; unitCost: number;
  safetyStock: number; note: string; createdAt: string; updatedAt: string;
};

export function validateLegacyInventory(value: unknown): LegacyInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("庫存資料格式錯誤");
  const raw = value as Record<string, unknown>;
  const row = { legacyId: positiveId(raw.legacyId, "舊庫存 ID") } as LegacyInventory;
  for (const key of ["clinicCode", "name", "category", "brand", "model", "specification", "refNumber",
    "lotNumber", "expiryDate", "note", "createdAt", "updatedAt"] as const) {
    if (typeof raw[key] !== "string") throw new Error(`庫存 ${key} 格式錯誤`);
    row[key] = raw[key];
  }
  row.clinicCode = row.clinicCode.trim().toUpperCase();
  if (!row.clinicCode || !row.name.trim() || !row.category.trim()) throw new Error("庫存院所、名稱及分類不可空白");
  for (const key of ["quantity", "safetyStock"] as const) {
    const number = raw[key];
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) throw new Error("庫存數量格式錯誤");
    row[key] = number;
  }
  if (typeof raw.unitCost !== "number" || !Number.isFinite(raw.unitCost) || raw.unitCost < 0) throw new Error("庫存成本格式錯誤");
  row.unitCost = raw.unitCost;
  const date = row.expiryDate;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error("庫存效期格式錯誤");
  if (Buffer.byteLength(JSON.stringify(row), "utf8") > 16_000) throw new Error("單筆庫存超過 16 KB");
  return row;
}

export function inventorySnapshotHash(row: LegacyInventory) {
  // Validator creates properties in a fixed order; caller-provided key order is ignored.
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

export function collectLegacyImplantReferences(snapshot: ImplantSnapshot) {
  const inventory = new Set<number>();
  const users = new Set<number>();
  function add(target: Set<number>, value: unknown) {
    if (value == null) return;
    target.add(positiveId(value, "歷史關聯 ID"));
  }
  add(inventory, snapshot.case.inventoryItemId);
  for (const row of [...snapshot.usageItems, ...snapshot.legacyItems]) add(inventory, row.inventoryItemId);
  for (const field of ["createdByUserId", "orderedByUserId", "pickedByUserId", "surgeryCompletedByUserId",
    "returnedByUserId", "closedByUserId", "cancelledByUserId", "doctorSignedByUserId"]) add(users, snapshot.case[field]);
  for (const row of snapshot.reservations) add(users, row.pickedByUserId);
  for (const row of snapshot.returnAudits) add(users, row.actorUserId);
  return { inventory: [...inventory].sort((a, b) => a - b), users: [...users].sort((a, b) => a - b) };
}
