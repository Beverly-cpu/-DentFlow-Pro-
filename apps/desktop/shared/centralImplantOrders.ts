export type OrderAllocation = { planItemId: number; inventoryBatchId: number; quantity: number };
export type OrderIntent = { caseId: number; clinicId: number; expectedVersion: number; requestId: string; allocations: OrderAllocation[] };
export type CancelOrderIntent = { caseId: number; clinicId: number; expectedVersion: number; requestId: string; reason: string };
export type OrderResult = { id: number; version: number; status: string; reservationCount: number; unchanged: boolean };
const positive=(v:unknown,name:string)=>{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<=0)throw Error(name+"格式錯誤");return v};
const uuid=(v:unknown)=>{if(typeof v!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw Error("叫貨請求識別碼格式錯誤");return v.toLowerCase()};
export function orderIntent(value:unknown):OrderIntent{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("叫貨資料格式錯誤");const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!["caseId","clinicId","expectedVersion","requestId","allocations"].includes(k)))throw Error("叫貨資料包含不允許欄位");
 if(!Array.isArray(v.allocations)||!v.allocations.length||v.allocations.length>500)throw Error("批次分配須有 1 至 500 筆");
 const seen=new Set<string>();const allocations=v.allocations.map(x=>{if(!x||typeof x!=="object"||Array.isArray(x))throw Error("批次分配格式錯誤");const r=x as Record<string,unknown>;
  if(Object.keys(r).some(k=>!["planItemId","inventoryBatchId","quantity"].includes(k)))throw Error("批次分配包含不允許欄位");
  const a={planItemId:positive(r.planItemId,"規格"),inventoryBatchId:positive(r.inventoryBatchId,"庫存批次"),quantity:positive(r.quantity,"分配數量")};const key=a.planItemId+":"+a.inventoryBatchId;if(seen.has(key)||a.quantity>1000)throw Error("批次分配重複或數量超過上限");seen.add(key);return a;
 }).sort((a,b)=>a.planItemId-b.planItemId||a.inventoryBatchId-b.inventoryBatchId);
 return {caseId:positive(v.caseId,"個案"),clinicId:positive(v.clinicId,"院所"),expectedVersion:positive(v.expectedVersion,"版本"),requestId:uuid(v.requestId),allocations};
}
export function cancelOrderIntent(value:unknown):CancelOrderIntent{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("取消叫貨資料格式錯誤");const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!["caseId","clinicId","expectedVersion","requestId","reason"].includes(k)))throw Error("取消叫貨資料包含不允許欄位");
 if(typeof v.reason!=="string"||!v.reason.trim()||new TextEncoder().encode(v.reason.trim()).length>2000)throw Error("請填寫不超過 2000 bytes 的取消原因");
 return {caseId:positive(v.caseId,"個案"),clinicId:positive(v.clinicId,"院所"),expectedVersion:positive(v.expectedVersion,"版本"),requestId:uuid(v.requestId),reason:v.reason.trim()};
}