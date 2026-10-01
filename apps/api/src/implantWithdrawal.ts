import { createHash } from "node:crypto";
import { DraftError, draftId, draftRequestId } from "./implantDraft.js";

export function validateWithdrawal(body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["clinicId", "expectedVersion", "requestId", "confirmations"].includes(key))) throw new DraftError(400, "invalid_input", "取出請求包含不允許的欄位");
  if (!Array.isArray(body.confirmations) || !body.confirmations.length || body.confirmations.length > 500) throw new DraftError(400, "invalid_input", "須逐筆確認 1 至 500 筆預留品項");
  const ids = new Set<string>();
  const confirmations = body.confirmations.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new DraftError(400, "invalid_input", "取出確認格式錯誤");
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["reservationId", "quantity"].includes(key))) throw new DraftError(400, "invalid_input", "取出不得指定批次或成本");
    const reservationId = draftRequestId(row.reservationId); const quantity = draftId(row.quantity, "取出數量");
    if (quantity > 1000 || ids.has(reservationId)) throw new DraftError(400, "invalid_input", "預留品項重複或取出數量超過上限");
    ids.add(reservationId); return { reservationId, quantity };
  }).sort((a, b) => a.reservationId.localeCompare(b.reservationId));
  return { clinicId: draftId(body.clinicId, "院所"), expectedVersion: draftId(body.expectedVersion, "個案版本"), requestId: draftRequestId(body.requestId), confirmations };
}
export function withdrawalHash(caseId: number, input: ReturnType<typeof validateWithdrawal>) {
  return createHash("sha256").update(JSON.stringify({ caseId, operation: "withdraw", ...input })).digest("hex");
}
