import { randomBytes } from "node:crypto";
import { getDatabase } from "./db";

export type MachineInput = { name: string; type: string; serialNumber: string; clinicId: number };
export type ReservationInput = {
  machineId: number; clinicId: number; scheduledStartAt: string; scheduledEndAt: string;
  moverUserId: number; note: string; force?: boolean; overrideReason?: string;
};

function actor(userId: number, roles: string[]) {
  const row = getDatabase().prepare(`SELECT id, role FROM users WHERE id = ? AND isActive = 1`).get(userId) as {id:number;role:string}|undefined;
  if (!row || !roles.includes(row.role)) throw new Error("您沒有大型機台操作權限");
  return row;
}

export function ensureMachineSchema() {
  getDatabase().exec(`
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
  `);
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
    c.name clinicName, c.code clinicCode, u.name moverName
    FROM machineReservations r JOIN machines m ON m.id=r.machineId
    JOIN clinics c ON c.id=r.clinicId JOIN users u ON u.id=r.moverUserId
    WHERE r.status <> '已取消' ORDER BY r.scheduledStartAt`).all();
}
export function createMachine(input: MachineInput, actorUserId: number) {
  actor(actorUserId,["Admin"]);
  if (!input.name.trim() || !input.type.trim()) throw new Error("請輸入機台名稱與類型");
  const token = `MACHINE-${randomBytes(16).toString("hex")}`;
  const result=getDatabase().prepare(`INSERT INTO machines(name,type,serialNumber,qrToken,currentClinicId,lastConfirmedAt,lastConfirmedByUserId)
    VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,?)`).run(input.name.trim(),input.type.trim(),input.serialNumber.trim(),token,input.clinicId,actorUserId);
  return getDatabase().prepare(`${selectMachine} WHERE m.id=?`).get(Number(result.lastInsertRowid));
}
export function setMachineActive(id:number,isActive:boolean,actorUserId:number){
  actor(actorUserId,["Admin"]); getDatabase().prepare(`UPDATE machines SET isActive=?,status=CASE WHEN ?=1 THEN '在院可用' ELSE '停用' END,updatedAt=CURRENT_TIMESTAMP WHERE id=?`).run(isActive?1:0,isActive?1:0,id); return true;
}
export function createMachineReservation(input:ReservationInput,actorUserId:number){
  const currentActor=actor(actorUserId,["Admin","Assistant"]);
  if(!input.scheduledStartAt||!input.scheduledEndAt||new Date(input.scheduledStartAt)>=new Date(input.scheduledEndAt)) throw new Error("預約開始與結束時間不正確");
  const machine=getDatabase().prepare(`SELECT * FROM machines WHERE id=?`).get(input.machineId) as {isActive:number;status:string}|undefined;
  if(!machine||!machine.isActive||machine.status==="維修中"||machine.status==="停用") throw new Error("機台目前停用或維修中");
  const start=new Date(input.scheduledStartAt).getTime()-60*60*1000,end=new Date(input.scheduledEndAt).getTime()+60*60*1000;
  const conflict=getDatabase().prepare(`SELECT id FROM machineReservations WHERE machineId=? AND status<>'已取消'
    AND datetime(scheduledStartAt) < datetime(?) AND datetime(scheduledEndAt) > datetime(?) LIMIT 1`).get(input.machineId,new Date(end).toISOString(),new Date(start).toISOString());
  if(conflict && !(input.force&&currentActor.role==="Admin"&&input.overrideReason?.trim())) throw new Error("此時段與既有預約或搬運緩衝時間衝突");
  const result=getDatabase().prepare(`INSERT INTO machineReservations(machineId,clinicId,scheduledStartAt,scheduledEndAt,moverUserId,note,overrideReason,createdByUserId)
    VALUES(?,?,?,?,?,?,?,?)`).run(input.machineId,input.clinicId,input.scheduledStartAt,input.scheduledEndAt,input.moverUserId,input.note.trim(),input.overrideReason?.trim()??"",actorUserId);
  return {id:Number(result.lastInsertRowid)};
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
