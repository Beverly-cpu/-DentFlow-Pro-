import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { orderIntent } from "../../shared/centralImplantOrders";
import type { OrderIntent } from "../../shared/centralImplantOrders";
export type OrderContext={serverUrl:string;actorUserId:number;clinicId:number};
function ready(){if(!safeStorage.isEncryptionAvailable()||(process.platform==="linux"&&["basic_text","unknown"].includes(safeStorage.getSelectedStorageBackend())))throw Error("系統尚未提供安全的加密儲存，暫停中央叫貨");}
function key(c:OrderContext){return JSON.stringify([c.serverUrl,c.actorUserId,c.clinicId,"implant-order"])}
function file(c:OrderContext){return path.join(app.getPath("userData"),"central-order-intents",createHash("sha256").update(key(c)).digest("hex")+".bin")}
export const encryptedOrderJournal={
 read(c:OrderContext):OrderIntent|null{ready();const p=file(c);if(!existsSync(p))return null;const value=orderIntent(JSON.parse(safeStorage.decryptString(readFileSync(p))));if(value.clinicId!==c.clinicId)throw Error("保存叫貨院所不符");return value;},
 save(c:OrderContext,input:OrderIntent){ready();const value=orderIntent(input);const previous=this.read(c);if(previous&&JSON.stringify(previous)!==JSON.stringify(value))throw Error("已有待確認叫貨，請先恢復原請求");const p=file(c);mkdirSync(path.dirname(p),{recursive:true,mode:0o700});const temp=p+"."+randomUUID()+".tmp";try{writeFileSync(temp,safeStorage.encryptString(JSON.stringify(value)),{flag:"wx",mode:0o600});renameSync(temp,p)}finally{if(existsSync(temp))unlinkSync(temp)}},
 clear(c:OrderContext,input:OrderIntent){const previous=this.read(c);if(previous&&JSON.stringify(previous)!==JSON.stringify(orderIntent(input)))throw Error("保存叫貨請求已變更，不可清除");const p=file(c);if(existsSync(p))unlinkSync(p);}
};