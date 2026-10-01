import { createHash } from "node:crypto";

export class DraftError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export function draftId(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new DraftError(400, "invalid_input", `${label}格式錯誤`);
  return value;
}
export function draftText(value: unknown, label: string, maximum: number, required = false) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") throw new DraftError(400, "invalid_input", `${label}格式錯誤`);
  const result = value.trim();
  if ((required && !result) || Buffer.byteLength(result, "utf8") > maximum) throw new DraftError(400, "invalid_input", `${label}不可空白或超過上限`);
  return result;
}
function row(value: unknown, allowed: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DraftError(400, "invalid_input", "草稿資料格式錯誤");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) throw new DraftError(400, "invalid_input", "草稿包含不允許的欄位");
  return result;
}
export function draftRequestId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new DraftError(400, "invalid_input", "新增請求必須有 UUID v4 requestId");
  }
  return value.toLowerCase();
}
export function validateImplantDraft(value: unknown) {
  const input = row(value, ["clinicId", "patientId", "doctorUserId", "implantDate", "note", "teeth", "expectedVersion", "requestId"]);
  const clinicId = draftId(input.clinicId, "院所"); const patientId = draftId(input.patientId, "中央病患");
  const doctorUserId = input.doctorUserId == null ? null : draftId(input.doctorUserId, "中央醫師");
  const implantDate = draftText(input.implantDate, "手術日期", 10, true);
  const parsed = new Date(`${implantDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(implantDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== implantDate) {
    throw new DraftError(400, "invalid_input", "手術日期格式錯誤");
  }
  if (!Array.isArray(input.teeth) || !input.teeth.length || input.teeth.length > 52) throw new DraftError(400, "invalid_input", "牙位數量須為 1 至 52");
  const positions = new Set<string>(); let itemCount = 0;
  const teeth = input.teeth.map((value) => {
    const tooth = row(value, ["toothPosition", "items"]); const position = draftText(tooth.toothPosition, "FDI 牙位", 2, true);
    if (!/^([1-4][1-8]|[5-8][1-5])$/.test(position) || positions.has(position)) throw new DraftError(400, "invalid_input", "FDI 牙位格式錯誤或重複");
    positions.add(position);
    if (!Array.isArray(tooth.items) || !tooth.items.length || tooth.items.length > 100) throw new DraftError(400, "invalid_input", "每牙位須有 1 至 100 筆術前規格");
    const items = tooth.items.map((value) => {
      const item = row(value, ["name", "category", "brand", "model", "specification", "quantity"]);
      const category = draftText(item.category, "類別", 50, true);
      if (!["植體", "植體套件", "器械"].includes(category)) throw new DraftError(400, "invalid_input", "術前規格類別不正確");
      const quantity = draftId(item.quantity, "預計數量");
      if (quantity > 1000) throw new DraftError(400, "invalid_input", "單品項預計數量上限 1000");
      itemCount++;
      return { name: draftText(item.name, "品項名稱", 200, true), category, brand: draftText(item.brand, "品牌", 200),
        model: draftText(item.model, "型號", 200), specification: draftText(item.specification, "規格", 500), quantity };
    });
    return { toothPosition: position, items };
  });
  if (itemCount > 500) throw new DraftError(400, "invalid_input", "單案術前規格上限 500");
  return { clinicId, patientId, doctorUserId, implantDate, note: draftText(input.note, "備註", 16_384), teeth };
}
export type ImplantDraft = ReturnType<typeof validateImplantDraft>;
export function implantDraftHash(input: ImplantDraft) {
  return createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
}
