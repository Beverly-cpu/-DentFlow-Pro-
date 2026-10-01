import { createHash } from "node:crypto";
import { DraftError, draftId, draftRequestId, draftText } from "./implantDraft.js";

export type Allocation = { planItemId: number; inventoryBatchId: number; quantity: number };
export function validateImplantOrder(body: Record<string, unknown>, cancel: boolean) {
  const allowed = cancel ? ["clinicId", "expectedVersion", "requestId", "reason"] : ["clinicId", "expectedVersion", "requestId", "allocations"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new DraftError(400, "invalid_input", "叫貨請求包含不允許的欄位");
  const common = { clinicId: draftId(body.clinicId, "院所"), expectedVersion: draftId(body.expectedVersion, "個案版本"), requestId: draftRequestId(body.requestId) };
  if (cancel) return { ...common, reason: draftText(body.reason, "取消原因", 2000, true), allocations: [] as Allocation[] };
  if (!Array.isArray(body.allocations) || !body.allocations.length || body.allocations.length > 500) throw new DraftError(400, "invalid_input", "批次分配須有 1 至 500 筆");
  const pairs = new Set<string>();
  const allocations = body.allocations.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new DraftError(400, "invalid_input", "批次分配格式錯誤");
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["planItemId", "inventoryBatchId", "quantity"].includes(key))) throw new DraftError(400, "invalid_input", "分配不可指定其他欄位");
    const result = { planItemId: draftId(row.planItemId, "中央術前規格"), inventoryBatchId: draftId(row.inventoryBatchId, "中央庫存批次"), quantity: draftId(row.quantity, "分配數量") };
    const pair = `${result.planItemId}:${result.inventoryBatchId}`;
    if (result.quantity > 1000 || pairs.has(pair)) throw new DraftError(400, "invalid_input", "批次分配重複或數量超過上限");
    pairs.add(pair); return result;
  }).sort((a, b) => a.planItemId - b.planItemId || a.inventoryBatchId - b.inventoryBatchId);
  return { ...common, reason: "", allocations };
}
export function orderHash(caseId: number, operation: string, input: ReturnType<typeof validateImplantOrder>) {
  return createHash("sha256").update(JSON.stringify({ caseId, operation, ...input })).digest("hex");
}
export function sameSpecification(a: Record<string, unknown>, b: Record<string, unknown>) {
  const normalized = (v: unknown) => String(v ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  return ["name", "category", "brand", "model", "specification"].every((key) => normalized(a[key]) === normalized(b[key]));
}
