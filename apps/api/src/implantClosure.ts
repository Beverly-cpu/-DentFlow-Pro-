import { createHash } from "node:crypto";
import { decodeAssetDataUrl } from "./assetData.js";
import { DraftError, draftId, draftRequestId } from "./implantDraft.js";
export type ClinicalAssetKind = "instrument_photo" | "ref_lot_photo" | "doctor_signature";
export function closureInput(value: unknown, asset = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DraftError(400, "invalid_input", "請求格式錯誤");
  const row = value as Record<string, unknown>;
  const allowed = ["clinicId", "expectedVersion", "requestId", ...(asset ? ["kind", "planItemId", "reservationId", "dataUrl"] : [])];
  if (Object.keys(row).some((key) => !allowed.includes(key))) throw new DraftError(400, "invalid_input", "請求包含不允許的欄位");
  return { row, clinicId: draftId(row.clinicId, "院所"), expectedVersion: draftId(row.expectedVersion, "個案版本"), requestId: draftRequestId(row.requestId) };
}
export function clinicalAssetInput(value: unknown) {
  const input = closureInput(value, true); const { row } = input;
  if (typeof row.kind !== "string" || !["instrument_photo", "ref_lot_photo", "doctor_signature"].includes(row.kind)) throw new DraftError(400, "invalid_input", "臨床資產類型錯誤");
  const kind = row.kind as ClinicalAssetKind;
  const planItemId = kind === "instrument_photo" ? draftId(row.planItemId, "中央規格") : null;
  const reservationId = kind === "ref_lot_photo" ? draftRequestId(row.reservationId) : null;
  if ((kind !== "instrument_photo" && row.planItemId !== undefined) || (kind !== "ref_lot_photo" && row.reservationId !== undefined)) throw new DraftError(400, "invalid_input", "資產類型與引用欄位不符");
  const decoded = decodeAssetDataUrl(row.dataUrl);
  if (kind === "doctor_signature" && (decoded.contentType !== "image/png" || decoded.dataUrlBytes > 2_000_000)) throw new DraftError(400, "invalid_input", "醫師簽名須為不超過 2 MB 的 PNG Data URL");
  return { clinicId: input.clinicId, expectedVersion: input.expectedVersion, requestId: input.requestId, kind, planItemId, reservationId, decoded };
}
export function clinicalRequestHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
