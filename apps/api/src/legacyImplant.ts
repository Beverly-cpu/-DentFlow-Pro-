import { createHash } from "node:crypto";

type Row = Record<string, unknown>;
export type ImplantSnapshot = {
  case: Row; teeth: Row[]; planItems: Row[]; usageItems: Row[];
  reservations: Row[]; returnAudits: Row[]; legacyItems: Row[];
};
type Asset = { table: string; legacyId: number; field: string; dataUrlSha256: string; dataUrlBytes: number };
export type LegacyImplant = {
  clinicCode: string; snapshot: ImplantSnapshot; assets: Asset[];
};

const statuses = new Set(["待醫師叫貨", "醫師已叫貨", "已取出待手術", "待術後紀錄", "待歸回品項", "已完成", "已結案", "已取消"]);
export function positiveId(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}格式錯誤`);
  return value;
}
function record(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("個案資料格式錯誤");
  return value as Row;
}
function quantity(value: unknown, minimum = 0) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new Error("個案數量格式錯誤");
}
function uniqueIds(rows: Row[], label: string) {
  const ids = new Set<number>();
  for (const row of rows) {
    const id = positiveId(row.id, label);
    if (ids.has(id)) throw new Error(`${label}重複`);
    ids.add(id);
  }
  return ids;
}
function belongs(value: unknown, ids: Set<number>, label: string) {
  if (!ids.has(positiveId(value, label))) throw new Error(`${label}關聯不屬於此個案`);
}
// Do not accept image content in the migration snapshot, even from an old client.
function rejectEmbeddedAssets(value: unknown) {
  if (typeof value === "string" && /^data:/i.test(value.trim())) throw new Error("照片與簽名須使用資產清單");
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/password|token|doctorSignature|PhotoDataUrl/i.test(key)) throw new Error("個案快照含不允許的欄位");
      rejectEmbeddedAssets(child);
    }
  }
}

export function validateLegacyImplant(value: unknown): LegacyImplant {
  const input = record(value);
  if (typeof input.clinicCode !== "string" || !input.clinicCode.trim()) throw new Error("院所代碼不可空白");
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > 1_000_000) throw new Error("單一個案資料超過 1 MB，請另行處理");
  const rawSnapshot = record(input.snapshot);
  const snapshot = { case: record(rawSnapshot.case) } as ImplantSnapshot;
  for (const key of ["teeth", "planItems", "usageItems", "reservations", "returnAudits", "legacyItems"] as const) {
    const rows = rawSnapshot[key];
    if (!Array.isArray(rows) || rows.length > 5000) throw new Error("個案明細格式錯誤或超過上限");
    snapshot[key] = rows.map(record);
  }
  rejectEmbeddedAssets(snapshot);
  const caseId = positiveId(snapshot.case.id, "舊個案 ID");
  positiveId(snapshot.case.clinicId, "舊院所 ID");
  positiveId(snapshot.case.patientId, "舊病患 ID");
  if (snapshot.case.doctorId !== null) positiveId(snapshot.case.doctorId, "舊醫師 ID");
  if (typeof snapshot.case.status !== "string" || !statuses.has(snapshot.case.status)) throw new Error("植體個案狀態不正確");
  if (typeof snapshot.case.note !== "string") throw new Error("個案備註格式錯誤");
  const date = snapshot.case.implantDate;
  if (typeof date !== "string" || (date !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date))) throw new Error("植體日期格式錯誤");
  const teeth = uniqueIds(snapshot.teeth, "牙位 ID");
  const plans = uniqueIds(snapshot.planItems, "術前品項 ID");
  uniqueIds(snapshot.usageItems, "使用品項 ID");
  const reservations = uniqueIds(snapshot.reservations, "預留 ID");
  uniqueIds(snapshot.returnAudits, "歸回稽核 ID");
  const legacyItems = uniqueIds(snapshot.legacyItems, "舊品項 ID");
  for (const row of snapshot.teeth) {
    belongs(row.implantId, new Set([caseId]), "牙位個案");
    if (typeof row.toothPosition !== "string" || !row.toothPosition.trim()) throw new Error("牙位不可空白");
  }
  for (const row of snapshot.planItems) {
    belongs(row.implantToothId, teeth, "術前品項牙位"); quantity(row.plannedQuantity, 1);
    if (row.legacyImplantItemId != null) belongs(row.legacyImplantItemId, legacyItems, "舊品項");
  }
  for (const row of snapshot.usageItems) {
    belongs(row.implantPlanItemId, plans, "使用品項計畫"); positiveId(row.inventoryItemId, "舊庫存 ID"); quantity(row.quantity, 1);
    for (const field of ["unitCost", "totalCost"] as const) {
      if (row[field] !== null && (typeof row[field] !== "number" || !Number.isFinite(row[field]) || row[field] < 0)) throw new Error("歷史成本格式錯誤");
    }
  }
  for (const row of snapshot.reservations) {
    belongs(row.implantId, new Set([caseId]), "預留個案"); belongs(row.implantPlanItemId, plans, "預留品項");
    for (const field of ["reservedQuantity", "pickedQuantity", "usedQuantity", "returnedQuantity"]) quantity(row[field]);
  }
  for (const row of snapshot.returnAudits) {
    belongs(row.implantId, new Set([caseId]), "歸回個案"); belongs(row.reservationId, reservations, "歸回預留");
    belongs(row.implantPlanItemId, plans, "歸回品項"); quantity(row.pickedQuantity); quantity(row.returnedQuantity);
    const reservation = snapshot.reservations.find((r) => r.id === row.reservationId)!;
    if (reservation.implantPlanItemId !== row.implantPlanItemId) throw new Error("歸回品項與預留紀錄不一致");
  }
  for (const row of snapshot.legacyItems) {
    belongs(row.implantToothId, teeth, "舊品項牙位"); positiveId(row.inventoryItemId, "舊庫存 ID"); quantity(row.quantity, 1);
    for (const field of ["deductedQuantity", "usedQuantity", "returnedQuantity"]) quantity(row[field]);
  }
  if (!Array.isArray(input.assets)) throw new Error("資產清單格式錯誤");
  const assetIds = new Set<string>();
  const assets = input.assets.map((value) => {
    const row = record(value);
    const allowed = new Map<string, { field: string; ids: Set<number> }>([
      ["implants", { field: "doctorSignature", ids: new Set([caseId]) }],
      ["implantPlanItems", { field: "instrumentPhotoDataUrl", ids: plans }],
      ["implantUsageItems", { field: "refLotPhotoDataUrl", ids: new Set(snapshot.usageItems.map((r) => Number(r.id))) }],
    ]);
    const owner = allowed.get(String(row.table));
    if (!owner || row.field !== owner.field) throw new Error("資產來源不正確");
    belongs(row.legacyId, owner.ids, "資產來源 ID");
    if (typeof row.dataUrlSha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.dataUrlSha256)) throw new Error("資產雜湊格式錯誤");
    positiveId(row.dataUrlBytes, "資產大小");
    const key = `${row.table}:${row.legacyId}:${row.field}`;
    if (assetIds.has(key)) throw new Error("資產重複");
    assetIds.add(key);
    return { table: String(row.table), legacyId: Number(row.legacyId), field: String(row.field),
      dataUrlSha256: row.dataUrlSha256, dataUrlBytes: Number(row.dataUrlBytes) };
  });
  return { clinicCode: input.clinicCode.trim().toUpperCase(), snapshot, assets };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}
export function implantSnapshotHash(value: LegacyImplant) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
