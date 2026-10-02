export type DraftPlan = { name: string; category: "植體" | "植體套件" | "器械"; brand: string; model: string; specification: string; quantity: number };
export type DraftTooth = { toothPosition: string; items: DraftPlan[] };
export type CentralDraft = { clinicId: number; patientId: number; doctorUserId: number | null; implantDate: string; note: string; teeth: DraftTooth[] };
export type DraftCreate = CentralDraft & { requestId: string };
export type ImplantSummary = { id: number; clinicId: number; patientId: number; patientName: string; chartNumber: string; doctorUserId: number | null; doctorName: string | null; implantDate: string; note: string; status: string; version: number; migrationState: string; cancellationReason: string; doctorSignedAt: string | null; closedAt: string | null };
export type ImplantDetail = ImplantSummary & { teeth: { id: number; toothPosition: string; items: (DraftPlan & { id: number; toothId: number })[] }[]; reservations: { id: string; planItemId: number; inventoryBatchId: number; state: string; quantity: number; pickedQuantity: number; usedQuantity: number; expectedReturnQuantity: number | null; returnedQuantity: number; refNumber: string; lotNumber: string }[]; assets: { id: string; kind: string; planItemId: number | null; reservationId: string | null; contentType: string; uploadedAt: string | null }[]; closure: { id: string; createdAt: string; snapshot: unknown } | null };
export type DraftCreationResult = { ok: true; record: ImplantDetail & { unchanged: boolean } } | { ok: false; pending: boolean; error: { status: number | null; code: string; message: string } };
function positive(value: unknown) { if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw Error("中央 ID 或版本格式錯誤"); return value; }
function text(value: unknown, limit: number, required = false) { if (typeof value !== "string") throw Error("草稿文字格式錯誤"); const s = value.trim(); if ((required && !s) || new TextEncoder().encode(s).length > limit) throw Error("草稿必填文字缺漏或超過上限"); return s; }
function row(value: unknown, keys: string[]) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw Error("草稿包含不允許的欄位"); return value as Record<string, unknown>; }
export function centralDraft(clinicId: number, value: unknown): CentralDraft {
  const input = row(value, ["patientId", "doctorUserId", "implantDate", "note", "teeth"]);
  const date = text(input.implantDate, 10, true); const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw Error("手術日期格式錯誤");
  if (!Array.isArray(input.teeth) || !input.teeth.length || input.teeth.length > 52) throw Error("須有 1 至 52 個牙位");
  const positions = new Set<string>(); let count = 0;
  const teeth = input.teeth.map(value => {
    const tooth = row(value, ["toothPosition", "items"]); const position = text(tooth.toothPosition, 2, true);
    if (!/^([1-4][1-8]|[5-8][1-5])$/.test(position) || positions.has(position)) throw Error("FDI 牙位格式錯誤或重複"); positions.add(position);
    if (!Array.isArray(tooth.items) || !tooth.items.length || tooth.items.length > 100) throw Error("每牙位須有 1 至 100 筆規格");
    const items = tooth.items.map(value => { const p = row(value, ["name", "category", "brand", "model", "specification", "quantity"]); const category = text(p.category, 50, true); const quantity = positive(p.quantity);
      if (!["植體", "植體套件", "器械"].includes(category) || quantity > 1000) throw Error("類別或預計數量格式錯誤"); count++;
      return { name: text(p.name, 200, true), category: category as DraftPlan["category"], brand: text(p.brand, 200), model: text(p.model, 200), specification: text(p.specification, 500), quantity };
    }); return { toothPosition: position, items };
  });
  if (count > 500) throw Error("個案最多 500 筆規格");
  const draft = { clinicId: positive(clinicId), patientId: positive(input.patientId), doctorUserId: input.doctorUserId === null ? null : positive(input.doctorUserId), implantDate: date, note: text(input.note, 16384), teeth };
  if (new TextEncoder().encode(JSON.stringify(draft)).length + 80 > 64 * 1024) throw Error("草稿請求超過 64 KiB");
  return draft;
}
export function draftCreate(value: unknown): DraftCreate {
  const input = row(value, ["clinicId", "patientId", "doctorUserId", "implantDate", "note", "teeth", "requestId"]);
  if (typeof input.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw Error("新增請求識別碼格式錯誤");
  const { clinicId, requestId, ...fields } = input;
  const result = { ...centralDraft(positive(clinicId), fields), requestId: requestId.toLowerCase() };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 64 * 1024) throw Error("草稿請求超過 64 KiB");
  return result;
}
