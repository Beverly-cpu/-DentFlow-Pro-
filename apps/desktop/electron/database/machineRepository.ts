import { randomBytes } from "node:crypto";
import { getDatabase } from "./db";

export type MachineInput = { name: string; type: string; serialNumber: string; clinicId: number };
export type ReservationInput = {
  machineId: number; clinicId: number; scheduledStartAt: string; scheduledEndAt: string;
  moverUserId: number; note: string; force?: boolean; overrideReason?: string;
};

function validateReservationWindow(input: ReservationInput, excludeId?: number) {
  if (!input.scheduledStartAt || !input.scheduledEndAt || new Date(input.scheduledStartAt) >= new Date(input.scheduledEndAt)) {
    throw new Error("預約開始與結束時間不正確");
  }
  const machine = getDatabase().prepare(`SELECT * FROM machines WHERE id=?`).get(input.machineId) as {isActive:number;status:string}|undefined;
  if (!machine || !machine.isActive || machine.status === "維修中" || machine.status === "停用") {
    throw new Error("機台目前停用或維修中");
  }
  const mover = getDatabase().prepare(`
    SELECT id FROM users WHERE id = ? AND isActive = 1 AND role IN ('Admin','Assistant')
  `).get(input.moverUserId);
  if (!mover) throw new Error("請指定有效的搬運負責人");
  const start = new Date(input.scheduledStartAt).getTime() - 60 * 60 * 1000;
  const end = new Date(input.scheduledEndAt).getTime() + 60 * 60 * 1000;
  return getDatabase().prepare(`SELECT id FROM machineReservations
    WHERE machineId=? AND status<>'已取消' AND id<>?
      AND datetime(scheduledStartAt) < datetime(?) AND datetime(scheduledEndAt) > datetime(?)
    LIMIT 1`).get(input.machineId, excludeId ?? 0, new Date(end).toISOString(), new Date(start).toISOString());
}
export type MachineUsageInput = {
  machineId: number; clinicId: number; patientId: number; usageDate: string;
  toothPositions: string[]; doctorId: number;
};

function actor(userId: number, roles: string[]) {
  const row = getDatabase().prepare(`SELECT id, role FROM users WHERE id = ? AND isActive = 1`).get(userId) as {id:number;role:string}|undefined;
  if (!row || !roles.includes(row.role)) throw new Error("您沒有大型機台操作權限");
  return row;
}

export function ensureMachineSchema() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      serialNumber TEXT NOT NULL DEFAULT '', qrToken TEXT NOT NULL UNIQUE,
      currentClinicId INTEGER NOT NULL REFERENCES clinics(id), targetClinicId INTEGER REFERENCES clinics(id),
      status TEXT NOT NULL DEFAULT '在院可用', isActive INTEGER NOT NULL DEFAULT 1,
      lastConfirmedAt TEXT, lastConfirmedByUserId INTEGER REFERENCES users(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS machineReservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, machineId INTEGER NOT NULL REFERENCES machines(id),
      clinicId INTEGER NOT NULL REFERENCES clinics(id), scheduledStartAt TEXT NOT NULL, scheduledEndAt TEXT NOT NULL,
      moverUserId INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT '已預約', note TEXT NOT NULL DEFAULT '',
      overrideReason TEXT NOT NULL DEFAULT '', createdByUserId INTEGER NOT NULL REFERENCES users(id),
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS machineScans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, machineId INTEGER NOT NULL REFERENCES machines(id),
      reservationId INTEGER REFERENCES machineReservations(id), clinicId INTEGER NOT NULL REFERENCES clinics(id),
      actorUserId INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL,
      scannedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS machineUsageCredits (
      machineId INTEGER PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
      remainingUses INTEGER NOT NULL DEFAULT 0 CHECK (remainingUses >= 0),
      unitCost REAL NOT NULL DEFAULT 0 CHECK (unitCost >= 0),
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS machineUsageCreditPurchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machineId INTEGER NOT NULL REFERENCES machines(id), quantity INTEGER NOT NULL CHECK (quantity > 0),
      actorUserId INTEGER NOT NULL REFERENCES users(id), createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS machineUsageRecords (
      id INTEGER PRIMARY KEY AUTOINCREMENT, machineId INTEGER NOT NULL REFERENCES machines(id),
      clinicId INTEGER NOT NULL REFERENCES clinics(id), patientId INTEGER NOT NULL REFERENCES patients(id),
      patientNameSnapshot TEXT NOT NULL, patientBirthDateSnapshot TEXT NOT NULL DEFAULT '',
      usageDate TEXT NOT NULL, toothPositions TEXT NOT NULL, doctorId INTEGER NOT NULL REFERENCES doctors(id),
      status TEXT NOT NULL DEFAULT '待醫師簽名', signature TEXT NOT NULL DEFAULT '',
      signedAt TEXT, signedByUserId INTEGER REFERENCES users(id),
      createdByUserId INTEGER NOT NULL REFERENCES users(id), createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO machineUsageCredits(machineId)
      SELECT id FROM machines WHERE type LIKE '%導航%';
  `);

  const usageColumns = new Set((db.prepare("PRAGMA table_info(machineUsageRecords)").all() as Array<{name:string}>).map(column => column.name));
  if (!usageColumns.has("unitCostSnapshot")) db.exec("ALTER TABLE machineUsageRecords ADD COLUMN unitCostSnapshot REAL NOT NULL DEFAULT 0");
  if (!usageColumns.has("cancelledAt")) db.exec("ALTER TABLE machineUsageRecords ADD COLUMN cancelledAt TEXT");
  if (!usageColumns.has("cancelledByUserId")) db.exec("ALTER TABLE machineUsageRecords ADD COLUMN cancelledByUserId INTEGER REFERENCES users(id)");
  if (!usageColumns.has("cancellationReason")) db.exec("ALTER TABLE machineUsageRecords ADD COLUMN cancellationReason TEXT NOT NULL DEFAULT ''");
  if (!usageColumns.has("creditRestored")) db.exec("ALTER TABLE machineUsageRecords ADD COLUMN creditRestored INTEGER NOT NULL DEFAULT 0");

  const snapshotMigration = "2026-machine-usage-cost-snapshot-v1";
  if (!db.prepare("SELECT key FROM schemaMigrations WHERE key=?").get(snapshotMigration)) {
    db.transaction(() => {
      db.prepare(`UPDATE machineUsageRecords
        SET unitCostSnapshot=COALESCE((SELECT unitCost FROM machineUsageCredits WHERE machineId=machineUsageRecords.machineId),0)`
      ).run();
      db.prepare("INSERT INTO schemaMigrations(key) VALUES(?)").run(snapshotMigration);
    })();
  }
}

const selectMachine = `SELECT m.*, c.name clinicName, c.code clinicCode,
  tc.name targetClinicName, tc.code targetClinicCode
  FROM machines m JOIN clinics c ON c.id=m.currentClinicId
  LEFT JOIN clinics tc ON tc.id=m.targetClinicId`;

export function listMachines() {
  return getDatabase().prepare(`${selectMachine} ORDER BY m.name`).all();
}
export function listMachineReservations() {
  return getDatabase().prepare(`SELECT r.*, m.name machineName, m.type machineType,
    c.name clinicName, c.code clinicCode, u.name moverName, creator.name createdByName
    FROM machineReservations r JOIN machines m ON m.id=r.machineId
    JOIN clinics c ON c.id=r.clinicId JOIN users u ON u.id=r.moverUserId
    LEFT JOIN users creator ON creator.id=r.createdByUserId
    WHERE r.status <> '已取消' ORDER BY r.scheduledStartAt`).all();
}
export function listMachineMovers(actorUserId:number) {
  actor(actorUserId,["Admin","Assistant"]);
  return getDatabase().prepare(`SELECT DISTINCT u.id,u.name,u.role
    FROM users u JOIN userClinics uc ON uc.userId=u.id
    WHERE u.isActive=1 AND u.role IN ('Admin','Assistant') ORDER BY u.name`).all();
}
export function listMachineScans(actorUserId:number) {
  actor(actorUserId,["Admin","Assistant"]);
  return getDatabase().prepare(`SELECT s.id,s.machineId,s.reservationId,s.clinicId,s.actorUserId,s.action,s.scannedAt,
    m.name machineName,c.name clinicName,u.name actorName
    FROM machineScans s JOIN machines m ON m.id=s.machineId JOIN clinics c ON c.id=s.clinicId
    JOIN users u ON u.id=s.actorUserId ORDER BY datetime(s.scannedAt) DESC,s.id DESC LIMIT 200`).all();
}
export function createMachine(input: MachineInput, actorUserId: number) {
  actor(actorUserId,["Admin"]);
  if (!input.name.trim() || !input.type.trim()) throw new Error("請輸入機台名稱與類型");
  if(input.type.includes("導航") && getDatabase().prepare(`SELECT id FROM machines WHERE type LIKE '%導航%' AND isActive=1`).get()) throw new Error("植牙導航機台僅能啟用一台");
  const token = `MACHINE-${randomBytes(16).toString("hex")}`;
  const result=getDatabase().prepare(`INSERT INTO machines(name,type,serialNumber,qrToken,currentClinicId,lastConfirmedAt,lastConfirmedByUserId)
    VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,?)`).run(input.name.trim(),input.type.trim(),input.serialNumber.trim(),token,input.clinicId,actorUserId);
  const id=Number(result.lastInsertRowid);
  if(input.type.includes("導航")) getDatabase().prepare(`INSERT OR IGNORE INTO machineUsageCredits(machineId) VALUES(?)`).run(id);
  return getDatabase().prepare(`${selectMachine} WHERE m.id=?`).get(id);
}
export function setMachineActive(id:number,isActive:boolean,actorUserId:number){
  actor(actorUserId,["Admin"]); getDatabase().prepare(`UPDATE machines SET isActive=?,status=CASE WHEN ?=1 THEN '在院可用' ELSE '停用' END,updatedAt=CURRENT_TIMESTAMP WHERE id=?`).run(isActive?1:0,isActive?1:0,id); return true;
}
export function updateMachine(id:number,input:{name:string;type:string;serialNumber:string},actorUserId:number){
  actor(actorUserId,["Admin"]);
  const name=String(input.name??"").trim(),type=String(input.type??"").trim();
  if(!name||!type) throw new Error("請輸入機台名稱與類型");
  const result=getDatabase().prepare(`UPDATE machines SET name=?,type=?,serialNumber=?,updatedAt=CURRENT_TIMESTAMP WHERE id=?`).run(name,type,String(input.serialNumber??"").trim(),id);
  if(result.changes!==1) throw new Error("找不到指定機台");
  return getDatabase().prepare(`${selectMachine} WHERE m.id=?`).get(id);
}
export function createMachineReservation(input:ReservationInput,actorUserId:number){
  const currentActor=actor(actorUserId,["Admin","Assistant"]);
  const conflict=validateReservationWindow(input);
  if(conflict && !(input.force&&currentActor.role==="Admin"&&input.overrideReason?.trim())) throw new Error("此時段與既有預約或搬運緩衝時間衝突");
  const result=getDatabase().prepare(`INSERT INTO machineReservations(machineId,clinicId,scheduledStartAt,scheduledEndAt,moverUserId,note,overrideReason,createdByUserId)
    VALUES(?,?,?,?,?,?,?,?)`).run(input.machineId,input.clinicId,input.scheduledStartAt,input.scheduledEndAt,input.moverUserId,input.note.trim(),input.overrideReason?.trim()??"",actorUserId);
  return {id:Number(result.lastInsertRowid)};
}
export function updateMachineReservation(id:number,input:ReservationInput,actorUserId:number){
  const currentActor=actor(actorUserId,["Admin"]);
  const current=getDatabase().prepare(`SELECT status FROM machineReservations WHERE id=?`).get(id) as {status:string}|undefined;
  if(!current) throw new Error("找不到機台預約");
  if(current.status!=="已預約") throw new Error("只有尚未搬出的預約可以修改");
  const conflict=validateReservationWindow(input,id);
  if(conflict && !(input.force&&currentActor.role==="Admin"&&input.overrideReason?.trim())) throw new Error("此時段與既有預約或搬運緩衝時間衝突");
  const result=getDatabase().prepare(`UPDATE machineReservations SET machineId=?,clinicId=?,scheduledStartAt=?,scheduledEndAt=?,
    moverUserId=?,note=?,overrideReason=?,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND status='已預約'`).run(
      input.machineId,input.clinicId,input.scheduledStartAt,input.scheduledEndAt,input.moverUserId,
      input.note.trim(),input.overrideReason?.trim()??"",id);
  if(result.changes!==1) throw new Error("機台預約修改失敗");
  return {id};
}
export function cancelMachineReservation(id:number,reason:string,actorUserId:number){
  actor(actorUserId,["Admin"]);
  const normalized=String(reason??"").trim();
  if(!normalized) throw new Error("請輸入取消原因");
  const result=getDatabase().prepare(`UPDATE machineReservations SET status='已取消',note=CASE WHEN note='' THEN ? ELSE note||'｜取消：'||? END,
    overrideReason=?,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND status='已預約'`).run(`取消：${normalized}`,normalized,normalized,id);
  if(result.changes!==1) throw new Error("只有尚未搬出的預約可以取消");
  return true;
}
export function scanMachine(qrToken:string,reservationId:number,clinicId:number,action:"搬出"|"到院",actorUserId:number){
  actor(actorUserId,["Admin","Assistant"]); const db=getDatabase();
  const machine=db.prepare(`SELECT * FROM machines WHERE qrToken=?`).get(qrToken.trim()) as {id:number;currentClinicId:number;targetClinicId:number|null;status:string}|undefined;
  const reservation=db.prepare(`SELECT * FROM machineReservations WHERE id=?`).get(reservationId) as {id:number;machineId:number;clinicId:number}|undefined;
  if(!machine||!reservation||reservation.machineId!==machine.id) throw new Error("QR Code 或預約資料不正確");
  if(action==="搬出"){
    if(machine.status==="搬運中"||machine.currentClinicId!==clinicId) throw new Error("機台不在目前院所或已在搬運中");
    db.prepare(`UPDATE machines SET status='搬運中',targetClinicId=?,updatedAt=CURRENT_TIMESTAMP WHERE id=?`).run(reservation.clinicId,machine.id);
    db.prepare(`UPDATE machineReservations SET status='搬運中',updatedAt=CURRENT_TIMESTAMP WHERE id=?`).run(reservationId);
  }else{
    if(machine.status!=="搬運中"||machine.targetClinicId!==clinicId||reservation.clinicId!==clinicId) throw new Error("機台目的院所與目前院所不符");
    db.prepare(`UPDATE machines SET status='在院可用',currentClinicId=?,targetClinicId=NULL,lastConfirmedAt=CURRENT_TIMESTAMP,lastConfirmedByUserId=?,updatedAt=CURRENT_TIMESTAMP WHERE id=?`).run(clinicId,actorUserId,machine.id);
    db.prepare(`UPDATE machineReservations SET status='已到院',updatedAt=CURRENT_TIMESTAMP WHERE id=?`).run(reservationId);
  }
  db.prepare(`INSERT INTO machineScans(machineId,reservationId,clinicId,actorUserId,action) VALUES(?,?,?,?,?)`).run(machine.id,reservationId,clinicId,actorUserId,action);
  return db.prepare(`${selectMachine} WHERE m.id=?`).get(machine.id);
}

export function getMachineUsageCredits(machineId:number,actorUserId:number){
  const currentActor=actor(actorUserId,["Admin","Assistant","Doctor","Accountant"]);
  const row=getDatabase().prepare(`SELECT machineId,remainingUses,unitCost,updatedAt FROM machineUsageCredits WHERE machineId=?`).get(machineId) as {machineId:number;remainingUses:number;unitCost:number;updatedAt:string}|undefined;
  if(!row) throw new Error("找不到導航機使用額度");
  return currentActor.role==="Admin"||currentActor.role==="Accountant"?row:{machineId:row.machineId,remainingUses:row.remainingUses,updatedAt:row.updatedAt};
}

export function purchaseMachineUsageCredits(machineId:number,quantity:number,actorUserId:number){
  actor(actorUserId,["Admin","Assistant"]);
  if(!Number.isInteger(quantity)||quantity<=0) throw new Error("購買次數必須是大於 0 的整數");
  const db=getDatabase();
  return db.transaction(()=>{
    const result=db.prepare(`UPDATE machineUsageCredits SET remainingUses=remainingUses+?,updatedAt=CURRENT_TIMESTAMP WHERE machineId=?`).run(quantity,machineId);
    if(result.changes!==1) throw new Error("找不到導航機使用額度");
    db.prepare(`INSERT INTO machineUsageCreditPurchases(machineId,quantity,actorUserId) VALUES(?,?,?)`).run(machineId,quantity,actorUserId);
    return getMachineUsageCredits(machineId,actorUserId);
  })();
}

export function listMachineUsageCreditPurchases(machineId:number,actorUserId:number){
  actor(actorUserId,["Admin","Assistant","Accountant"]);
  return getDatabase().prepare(`SELECT p.id,p.machineId,p.quantity,p.actorUserId,p.createdAt,
    m.name machineName,u.name actorName
    FROM machineUsageCreditPurchases p
    JOIN machines m ON m.id=p.machineId JOIN users u ON u.id=p.actorUserId
    WHERE p.machineId=? ORDER BY datetime(p.createdAt) DESC,p.id DESC`).all(machineId);
}

export function updateMachineUsageCost(machineId:number,unitCost:number,actorUserId:number){
  actor(actorUserId,["Admin","Accountant"]);
  if(!Number.isFinite(unitCost)||unitCost<0) throw new Error("每次使用成本不可小於 0");
  const result=getDatabase().prepare(`UPDATE machineUsageCredits SET unitCost=?,updatedAt=CURRENT_TIMESTAMP WHERE machineId=?`).run(unitCost,machineId);
  if(result.changes!==1) throw new Error("找不到導航機使用額度");
  return getMachineUsageCredits(machineId,actorUserId);
}

export function listMachineUsageRecords(actorUserId:number){
  const currentActor=actor(actorUserId,["Admin","Assistant","Doctor","Accountant"]); const db=getDatabase();
  const doctor=currentActor.role==="Doctor"?db.prepare(`SELECT id FROM doctors WHERE userId=? AND isActive=1`).get(actorUserId) as {id:number}|undefined:undefined;
  if(currentActor.role==="Doctor"&&!doctor) return [];
  const rows=db.prepare(`SELECT ur.*,m.name machineName,c.name clinicName,c.code clinicCode,d.name doctorName,
    creator.name createdByName,canceller.name cancelledByName,ur.unitCostSnapshot unitCost
    FROM machineUsageRecords ur JOIN machines m ON m.id=ur.machineId JOIN clinics c ON c.id=ur.clinicId
    JOIN doctors d ON d.id=ur.doctorId LEFT JOIN users creator ON creator.id=ur.createdByUserId
    LEFT JOIN users canceller ON canceller.id=ur.cancelledByUserId
    ${doctor?"WHERE ur.doctorId = ?":""} ORDER BY date(ur.usageDate) DESC,ur.id DESC`).all(...(doctor?[doctor.id]:[])) as Array<Record<string,unknown>&{unitCost:number;toothPositions:string}>;
  return rows.map(row=>{
    const base={...row,toothPositions:JSON.parse(row.toothPositions||"[]")};
    if(currentActor.role==="Admin"||currentActor.role==="Accountant") return base;
    const safe={...base}; delete safe.unitCost; return safe;
  });
}

export function createMachineUsage(input:MachineUsageInput,actorUserId:number){
  actor(actorUserId,["Admin","Assistant"]); const db=getDatabase();
  const teeth=[...new Set((input.toothPositions??[]).map(value=>String(value).trim()).filter(Boolean))];
  if(!input.usageDate||teeth.length===0) throw new Error("請填寫使用日期與至少一個牙位");
  const patient=db.prepare(`SELECT id,clinicId,name,birthDate FROM patients WHERE id=?`).get(input.patientId) as {id:number;clinicId:number;name:string;birthDate:string}|undefined;
  if(!patient||patient.clinicId!==input.clinicId) throw new Error("病患與使用院所不符");
  const doctor=db.prepare(`SELECT d.id FROM doctors d JOIN doctorClinics dc ON dc.doctorId=d.id WHERE d.id=? AND dc.clinicId=? AND d.isActive=1`).get(input.doctorId,input.clinicId);
  if(!doctor) throw new Error("醫師未在此院所執業");
  const machine=db.prepare(`SELECT id FROM machines WHERE id=? AND type LIKE '%導航%' AND isActive=1`).get(input.machineId);
  if(!machine) throw new Error("找不到可用的植牙導航機");
  return db.transaction(()=>{
    const debit=db.prepare(`UPDATE machineUsageCredits SET remainingUses=remainingUses-1,updatedAt=CURRENT_TIMESTAMP WHERE machineId=? AND remainingUses>0`).run(input.machineId);
    if(debit.changes!==1) throw new Error("植牙導航機使用額度不足，請先購買額度");
    const cost=(db.prepare(`SELECT unitCost FROM machineUsageCredits WHERE machineId=?`).get(input.machineId) as {unitCost:number}).unitCost;
    const result=db.prepare(`INSERT INTO machineUsageRecords(machineId,clinicId,patientId,patientNameSnapshot,patientBirthDateSnapshot,usageDate,toothPositions,doctorId,createdByUserId,unitCostSnapshot)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(input.machineId,input.clinicId,input.patientId,patient.name,patient.birthDate,input.usageDate,JSON.stringify(teeth),input.doctorId,actorUserId,cost);
    return {id:Number(result.lastInsertRowid),remainingUses:(db.prepare(`SELECT remainingUses FROM machineUsageCredits WHERE machineId=?`).get(input.machineId) as {remainingUses:number}).remainingUses};
  })();
}

export function cancelMachineUsage(id:number,reason:string,actorUserId:number){
  actor(actorUserId,["Admin"]);
  const normalized=String(reason??"").trim();
  if(!normalized) throw new Error("請輸入取消使用紀錄的原因");
  const db=getDatabase();
  return db.transaction(()=>{
    const current=db.prepare(`SELECT id,machineId,status,creditRestored FROM machineUsageRecords WHERE id=?`).get(id) as {id:number;machineId:number;status:string;creditRestored:number}|undefined;
    if(!current) throw new Error("找不到導航機使用紀錄");
    if(current.status!=="待醫師簽名") throw new Error("只有尚未簽名的導航機使用紀錄可以取消");
    const changed=db.prepare(`UPDATE machineUsageRecords SET status='已取消',cancellationReason=?,cancelledAt=CURRENT_TIMESTAMP,
      cancelledByUserId=?,creditRestored=1,updatedAt=CURRENT_TIMESTAMP
      WHERE id=? AND status='待醫師簽名' AND creditRestored=0`).run(normalized,actorUserId,id);
    if(changed.changes!==1) throw new Error("此紀錄已取消或狀態已變更，請重新整理");
    db.prepare(`UPDATE machineUsageCredits SET remainingUses=remainingUses+1,updatedAt=CURRENT_TIMESTAMP WHERE machineId=?`).run(current.machineId);
    return true;
  })();
}

export function signMachineUsage(id:number,signature:string,actorUserId:number){
  actor(actorUserId,["Doctor"]); const normalized=String(signature??"").trim();
  if(!normalized.startsWith("data:image/png;base64,")||normalized.length<200) throw new Error("手寫簽名資料格式不正確，請清除後重新簽名");
  const db=getDatabase();
  return db.transaction(()=>{
    const usage=db.prepare(`SELECT mur.id,mur.status,mur.doctorId
      FROM machineUsageRecords mur
      JOIN doctors d ON d.id=mur.doctorId
      WHERE mur.id=? AND d.userId=? AND d.isActive=1`).get(id,actorUserId) as {id:number;status:string;doctorId:number}|undefined;
    if(!usage) throw new Error("此導航紀錄不屬於目前登入醫師");
    if(usage.status!=="待醫師簽名") throw new Error("此導航紀錄已完成簽名或無法簽名");
    const result=db.prepare(`UPDATE machineUsageRecords SET status='已簽名',signature=?,signedAt=CURRENT_TIMESTAMP,
      signedByUserId=?,updatedAt=CURRENT_TIMESTAMP WHERE id=? AND doctorId=? AND status='待醫師簽名'`)
      .run(normalized,actorUserId,id,usage.doctorId);
    if(result.changes!==1) throw new Error("簽名狀態已變更，請重新整理後再試");
    const saved=db.prepare(`SELECT signature,signedByUserId,signedAt,status FROM machineUsageRecords WHERE id=?`).get(id) as {signature:string;signedByUserId:number|null;signedAt:string|null;status:string}|undefined;
    if(!saved||saved.signature!==normalized||saved.signedByUserId!==actorUserId||!saved.signedAt||saved.status!=="已簽名") throw new Error("簽名未完整保存，請重新簽名");
    return true;
  })();
}
