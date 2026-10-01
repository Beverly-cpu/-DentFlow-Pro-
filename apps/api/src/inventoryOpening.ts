import { createHash } from "node:crypto";
import { DraftError, draftId, draftRequestId, draftText } from "./implantDraft.js";

export function validateInventoryOpening(value: Record<string, unknown>) {
  if (Object.keys(value).some((key) => !["clinicId", "expectedVersion", "countedQuantity", "unitCost", "reconciliationNote", "requestId"].includes(key))) {
    throw new DraftError(400, "invalid_input", "盤點啟用包含不允許的欄位");
  }
  const quantity = value.countedQuantity;
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1_000_000) throw new DraftError(400, "invalid_input", "盤點數量必須為 0 至 1000000 的整數");
  const cost = value.unitCost;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > 1_000_000_000 || !/^\d+(\.\d{1,2})?$/.test(String(cost))) {
    throw new DraftError(400, "invalid_input", "盤點單價必須明確提供，最多兩位小數且不得為負值");
  }
  return { clinicId: draftId(value.clinicId, "院所"), expectedVersion: draftId(value.expectedVersion, "庫存版本"),
    countedQuantity: quantity, unitCost: cost.toFixed(2), reconciliationNote: draftText(value.reconciliationNote, "盤點來源核對說明", 4000, true),
    requestId: draftRequestId(value.requestId) };
}
function normalize(value: string) { return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
export type BatchIdentity = { name: string; category: string; brand: string; model: string; specification: string; refNumber: string; lotNumber: string };
export function inventoryActivationIdentity(batch: BatchIdentity) {
  const ref = normalize(batch.refNumber); const lot = normalize(batch.lotNumber);
  // REF/LOT pairs are conservatively unique in a clinic, regardless of alias names.
  const fields = ref && lot ? ["ref-lot", ref, lot] : ["specification", ...[batch.name, batch.category, batch.brand, batch.model, batch.specification, batch.refNumber, batch.lotNumber].map(normalize)];
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}
export function inventoryOpeningHash(batchId: number, input: ReturnType<typeof validateInventoryOpening>) {
  return createHash("sha256").update(JSON.stringify({ batchId, ...input })).digest("hex");
}
