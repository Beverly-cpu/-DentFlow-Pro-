import type { OpeningIntent } from "./centralInventory";
export function openingIntentKey(serverUrl: string, userId: number, clinicId: number) { return `dentflow-opening:${JSON.stringify([serverUrl, userId, clinicId])}`; }
export function validateOpeningIntent(value: unknown): OpeningIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("盤點請求格式錯誤");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(k => !["clinicId", "batchId", "expectedVersion", "countedQuantity", "unitCost", "reconciliationNote", "requestId"].includes(k))) throw Error("盤點請求包含不允許的欄位");
  for (const k of ["clinicId", "batchId", "expectedVersion"] as const) if (typeof row[k] !== "number" || !Number.isSafeInteger(row[k]) || row[k] <= 0) throw Error("院所、批次或版本格式錯誤");
  if (typeof row.countedQuantity !== "number" || !Number.isSafeInteger(row.countedQuantity) || row.countedQuantity < 0 || row.countedQuantity > 1_000_000) throw Error("實際盤點數量須為 0 至 1000000 的整數");
  if (typeof row.unitCost !== "number" || !Number.isFinite(row.unitCost) || row.unitCost < 0 || row.unitCost > 1_000_000_000 || !/^\d+(\.\d{1,2})?$/.test(String(row.unitCost))) throw Error("單價須為非負數，最多兩位小數");
  if (typeof row.reconciliationNote !== "string" || !row.reconciliationNote.trim() || new TextEncoder().encode(row.reconciliationNote.trim()).length > 4000) throw Error("請填寫不超過 4000 bytes 的盤點及來源核對說明");
  if (typeof row.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.requestId)) throw Error("盤點請求識別碼格式錯誤");
  return { clinicId: row.clinicId as number, batchId: row.batchId as number, expectedVersion: row.expectedVersion as number,
    countedQuantity: row.countedQuantity, unitCost: row.unitCost, reconciliationNote: row.reconciliationNote.trim(), requestId: row.requestId.toLowerCase() };
}
export function prepareOpening(clinicId: number, batchId: number, version: number, quantity: string, cost: string, note: string, requestId: string) {
  if (!/^\d+$/.test(quantity.trim()) || !/^\d+(\.\d{1,2})?$/.test(cost.trim())) throw Error("請明確填入整數盤點量與最多兩位小數的單價");
  return validateOpeningIntent({ clinicId, batchId, expectedVersion: version, countedQuantity: Number(quantity), unitCost: Number(cost), reconciliationNote: note, requestId });
}
export function mayReconcileFailure(status: number | null, code: string) {
  return (status === 400 && code === "invalid_input") || (status === 403 && code === "forbidden")
    || (status === 404 && code === "not_found") || (status === 409 && ["version_conflict", "already_active", "duplicate_batch"].includes(code));
}
export type IntentStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
export function saveOpeningIntent(storage: IntentStorage, key: string, value: OpeningIntent) {
  const body = JSON.stringify(validateOpeningIntent(value));
  const existing = storage.getItem(key);
  if (existing !== null && JSON.stringify(validateOpeningIntent(JSON.parse(existing))) !== body) throw Error("已有另一份待確認盤點請求，請先恢復並核對原請求。");
  storage.setItem(key, body);
}
export function finishOpeningIntent(storage: IntentStorage, key: string, value: OpeningIntent) {
  const existing = storage.getItem(key);
  if (existing !== null && JSON.stringify(validateOpeningIntent(JSON.parse(existing))) !== JSON.stringify(validateOpeningIntent(value))) throw Error("保存的請求已變更，請保留資料並重新核對。");
  storage.removeItem(key);
}
