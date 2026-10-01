import { createHash } from "node:crypto";
import { DraftError, draftId, draftRequestId, draftText } from "./implantDraft.js";

export type DispositionOperation = "surgery_complete" | "usage" | "return" | "cancel_picked";
type Entry = { reservationId: string; quantity: number; returnCondition: "sealed" | "reusable" | "" };
export function validateDisposition(body: Record<string, unknown>, operation: DispositionOperation) {
  const returning = operation === "return" || operation === "cancel_picked";
  const field = returning ? "confirmations" : "usages";
  const allowed = ["clinicId", "expectedVersion", "requestId", ...(operation === "surgery_complete" ? [] : [field]), ...(returning ? ["reason"] : [])];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new DraftError(400, "invalid_input", "術後請求包含不允許的欄位");
  const input = { clinicId: draftId(body.clinicId, "院所"), expectedVersion: draftId(body.expectedVersion, "個案版本"), requestId: draftRequestId(body.requestId),
    reason: returning ? draftText(body.reason, "歸回原因", 2000, true) : "", entries: [] as Entry[] };
  if (operation === "surgery_complete") return input;
  const values = body[field];
  if (!Array.isArray(values) || !values.length || values.length > 500) throw new DraftError(400, "invalid_input", "須逐筆提供 1 至 500 項紀錄");
  const ids = new Set<string>();
  input.entries = values.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new DraftError(400, "invalid_input", "品項紀錄格式錯誤");
    const row = value as Record<string, unknown>;
    const fields = returning ? ["reservationId", "quantity", "returnCondition"] : ["reservationId", "usedQuantity"];
    if (Object.keys(row).some((key) => !fields.includes(key))) throw new DraftError(400, "invalid_input", "品項紀錄包含不允許的欄位");
    const reservationId = draftRequestId(row.reservationId); const quantity = row[returning ? "quantity" : "usedQuantity"];
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < (returning ? 1 : 0) || quantity > 1000 || ids.has(reservationId)) {
      throw new DraftError(400, "invalid_input", "品項重複或數量不正確");
    }
    ids.add(reservationId);
    let returnCondition: Entry["returnCondition"] = "";
    if (returning) {
      if (row.returnCondition !== "sealed" && row.returnCondition !== "reusable") throw new DraftError(400, "invalid_input", "歸回須確認未拆封或可重複使用狀態");
      returnCondition = row.returnCondition;
    }
    return { reservationId, quantity, returnCondition };
  }).sort((a, b) => a.reservationId.localeCompare(b.reservationId));
  return input;
}
export function dispositionHash(caseId: number, operation: DispositionOperation, input: ReturnType<typeof validateDisposition>) {
  return createHash("sha256").update(JSON.stringify({ caseId, operation, ...input })).digest("hex");
}
export function expectedReturn(category: string, picked: number, used: number) {
  if (!Number.isSafeInteger(used) || used < 0 || used > picked) throw new DraftError(400, "usage_exceeds_pick", "實際使用量不可超過已取出量");
  return category === "器械" ? picked : picked - used;
}
