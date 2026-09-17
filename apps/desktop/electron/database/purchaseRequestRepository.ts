import { getDatabase } from "./db";

export type PurchaseRequestRecord = {
  id: number;
  clinicId: number;
  inventoryItemId: number;
  inventoryName: string;
  quantity: number;
  note: string;
  status: "待採購" | "已處理";
  requestedByUserId: number;
  requestedByName: string;
  createdAt: string;
  processedAt: string | null;
};

function ensureTable() {
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS purchaseRequests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clinicId INTEGER NOT NULL,
      inventoryItemId INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '待採購',
      requestedByUserId INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processedAt TEXT,
      FOREIGN KEY (clinicId) REFERENCES clinics(id) ON DELETE RESTRICT,
      FOREIGN KEY (inventoryItemId) REFERENCES inventory(id) ON DELETE RESTRICT,
      FOREIGN KEY (requestedByUserId) REFERENCES users(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_purchaseRequests_clinic_status
      ON purchaseRequests(clinicId, status, createdAt DESC);
  `);
}

const selectSql = `
  SELECT pr.id, pr.clinicId, pr.inventoryItemId,
    inventory.name AS inventoryName, pr.quantity, pr.note, pr.status,
    pr.requestedByUserId, users.name AS requestedByName,
    pr.createdAt, pr.processedAt
  FROM purchaseRequests pr
  INNER JOIN inventory ON inventory.id = pr.inventoryItemId
  INNER JOIN users ON users.id = pr.requestedByUserId
`;

export function getPurchaseRequests(clinicId: number): PurchaseRequestRecord[] {
  ensureTable();
  return getDatabase().prepare(`${selectSql}
    WHERE pr.clinicId = ? ORDER BY pr.createdAt DESC, pr.id DESC
  `).all(clinicId) as PurchaseRequestRecord[];
}

export function createPurchaseRequest(
  clinicId: number,
  inventoryItemId: number,
  quantity: number,
  note: string,
  actorUserId: number,
): PurchaseRequestRecord {
  ensureTable();
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("叫貨數量必須是大於 0 的整數。");
  const db = getDatabase();
  const actor = db.prepare(`
    SELECT users.id FROM users
    INNER JOIN userClinics ON userClinics.userId = users.id
    WHERE users.id = ? AND users.isActive = 1 AND userClinics.clinicId = ?
      AND users.role IN ('Assistant', 'Admin', 'Procurement')
    LIMIT 1
  `).get(actorUserId, clinicId);
  if (!actor) throw new Error("此帳號無法在本院所發起叫貨。");
  const item = db.prepare(`SELECT id FROM inventory WHERE id = ? AND clinicId = ?`).get(inventoryItemId, clinicId);
  if (!item) throw new Error("找不到叫貨品項。");
  const result = db.prepare(`
    INSERT INTO purchaseRequests (clinicId, inventoryItemId, quantity, note, requestedByUserId)
    VALUES (?, ?, ?, ?, ?)
  `).run(clinicId, inventoryItemId, quantity, String(note ?? "").trim(), actorUserId);
  return db.prepare(`${selectSql} WHERE pr.id = ?`).get(Number(result.lastInsertRowid)) as PurchaseRequestRecord;
}

export function completePurchaseRequest(
  id: number,
  clinicId: number,
  actorUserId: number,
): PurchaseRequestRecord {
  ensureTable();
  const db = getDatabase();
  const actor = db.prepare(`
    SELECT users.id FROM users
    INNER JOIN userClinics ON userClinics.userId = users.id
    WHERE users.id = ? AND users.isActive = 1 AND userClinics.clinicId = ?
      AND users.role = 'Procurement' LIMIT 1
  `).get(actorUserId, clinicId);
  if (!actor) throw new Error("只有採購可完成叫貨需求。");
  const result = db.prepare(`
    UPDATE purchaseRequests SET status = '已處理', processedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND clinicId = ? AND status = '待採購'
  `).run(id, clinicId);
  if (!result.changes) throw new Error("叫貨需求不存在或已處理。");
  return db.prepare(`${selectSql} WHERE pr.id = ?`).get(id) as PurchaseRequestRecord;
}
