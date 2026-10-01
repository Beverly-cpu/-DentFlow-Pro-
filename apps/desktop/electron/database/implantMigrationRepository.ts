import { createHash } from "node:crypto";

import { getDatabase } from "./db";

type Row = Record<string, unknown>;
type Asset = {
  table: string; legacyId: number; field: string; dataUrlSha256: string; dataUrlBytes: number;
};

// Fixed queries also prove that the requested child belongs to this case.
export function getLegacyImplantAsset(implantId: number, asset: Asset): string | null {
  const db = getDatabase();
  let row: { value: unknown } | undefined;
  if (asset.table === "implants" && asset.field === "doctorSignature") {
    row = db.prepare("SELECT doctorSignature AS value FROM implants WHERE id=? AND id=?").get(asset.legacyId, implantId) as typeof row;
  } else if (asset.table === "implantPlanItems" && asset.field === "instrumentPhotoDataUrl") {
    row = db.prepare(`SELECT p.instrumentPhotoDataUrl AS value FROM implantPlanItems p
      JOIN implantTeeth t ON t.id=p.implantToothId WHERE p.id=? AND t.implantId=?`).get(asset.legacyId, implantId) as typeof row;
  } else if (asset.table === "implantUsageItems" && asset.field === "refLotPhotoDataUrl") {
    row = db.prepare(`SELECT u.refLotPhotoDataUrl AS value FROM implantUsageItems u
      JOIN implantPlanItems p ON p.id=u.implantPlanItemId JOIN implantTeeth t ON t.id=p.implantToothId
      WHERE u.id=? AND t.implantId=?`).get(asset.legacyId, implantId) as typeof row;
  }
  const value = row?.value;
  return typeof value === "string" && Buffer.byteLength(value, "utf8") === asset.dataUrlBytes
    && createHash("sha256").update(value, "utf8").digest("hex") === asset.dataUrlSha256 ? value : null;
}
export type LegacyImplantMigrationRecord = {
  clinicCode: string;
  snapshot: {
    case: Row; teeth: Row[]; planItems: Row[]; usageItems: Row[];
    reservations: Row[]; returnAudits: Row[]; legacyItems: Row[];
  };
  assets: Asset[];
};

// Read each case and its children from one SQLite transaction. LEFT JOINs retain
// incomplete historical rows so the server can report a conflict, not lose data.
export function getLegacyImplantsForMigration(): LegacyImplantMigrationRecord[] {
  const db = getDatabase();
  return db.transaction(() => {
    const cases = db.prepare(`SELECT i.*, c.code AS clinicCode FROM implants i
      LEFT JOIN clinics c ON c.id=i.clinicId ORDER BY i.id`).all() as Row[];
    return cases.map((row) => {
      const id = Number(row.id);
      const clinicCode = String(row.clinicCode ?? "");
      delete row.clinicCode;
      const teeth = db.prepare("SELECT * FROM implantTeeth WHERE implantId=? ORDER BY id").all(id) as Row[];
      const planItems = db.prepare(`SELECT p.* FROM implantPlanItems p
        JOIN implantTeeth t ON t.id=p.implantToothId WHERE t.implantId=? ORDER BY p.id`).all(id) as Row[];
      const usageItems = db.prepare(`SELECT u.*, v.name AS inventoryItemName,
        v.category AS inventoryCategory,v.brand AS inventoryBrand,v.model AS inventoryModel,
        v.specification AS inventorySpecification,v.refNumber AS inventoryRefNumber,
        v.lotNumber AS inventoryLotNumber,v.expiryDate AS inventoryExpiryDate,
        tx.unitCost AS unitCost,tx.totalCost AS totalCost
        FROM implantUsageItems u
        JOIN implantPlanItems p ON p.id=u.implantPlanItemId
        JOIN implantTeeth t ON t.id=p.implantToothId
        LEFT JOIN inventory v ON v.id=u.inventoryItemId
        LEFT JOIN inventoryTransactions tx ON tx.id=(SELECT x.id FROM inventoryTransactions x
          WHERE x.implantUsageItemId=u.id AND x.type='手術取出' ORDER BY x.id DESC LIMIT 1)
        WHERE t.implantId=? ORDER BY u.id`).all(id) as Row[];
      const reservations = db.prepare("SELECT * FROM implantReservations WHERE implantId=? ORDER BY id").all(id) as Row[];
      const returnAudits = db.prepare(`SELECT a.*, u.name AS actorName FROM implantReturnAudits a
        LEFT JOIN users u ON u.id=a.actorUserId WHERE a.implantId=? ORDER BY a.id`).all(id) as Row[];
      const legacyItems = db.prepare(`SELECT i.*,v.name AS inventoryItemName,
        v.refNumber AS inventoryRefNumber,v.lotNumber AS inventoryLotNumber
        FROM implantItems i JOIN implantTeeth t ON t.id=i.implantToothId
        LEFT JOIN inventory v ON v.id=i.inventoryItemId WHERE t.implantId=? ORDER BY i.id`).all(id) as Row[];
      const assets: Asset[] = [];
      function removeAsset(table: string, record: Row, field: string) {
        const value = record[field];
        if (typeof value === "string" && value.length) {
          assets.push({ table, legacyId: Number(record.id), field,
            dataUrlSha256: createHash("sha256").update(value, "utf8").digest("hex"),
            dataUrlBytes: Buffer.byteLength(value, "utf8") });
        }
        delete record[field];
      }
      removeAsset("implants", row, "doctorSignature");
      for (const item of planItems) removeAsset("implantPlanItems", item, "instrumentPhotoDataUrl");
      for (const item of usageItems) removeAsset("implantUsageItems", item, "refLotPhotoDataUrl");
      return { clinicCode, snapshot: { case: row, teeth, planItems, usageItems, reservations, returnAudits, legacyItems }, assets };
    });
  })();
}
