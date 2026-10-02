export type WithdrawalConfirmation={reservationId:string;quantity:number};
export type WithdrawalIntent={caseId:number;clinicId:number;expectedVersion:number;requestId:string;confirmations:WithdrawalConfirmation[]};
export type WithdrawalResult={id:number;version:number;status:string;pickedCount:number;unchanged:boolean};
const positive=(v:unknown,n:string)=>{if(typeof v!=="number"||!Number.isSafeInteger(v)||v<=0)throw Error(n+"格式錯誤");return v};
const uuid=(v:unknown,n:string)=>{if(typeof v!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))throw Error(n+"格式錯誤");return v.toLowerCase()};
export function withdrawalIntent(value:unknown):WithdrawalIntent{if(!value||typeof value!=="object"||Array.isArray(value))throw Error("取出資料格式錯誤");const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!["caseId","clinicId","expectedVersion","requestId","confirmations"].includes(k)))throw Error("取出資料包含不允許欄位");
 if(!Array.isArray(v.confirmations)||!v.confirmations.length||v.confirmations.length>500)throw Error("須逐筆確認 1 至 500 筆預留品項");const seen=new Set<string>();
 const confirmations=v.confirmations.map(x=>{if(!x||typeof x!=="object"||Array.isArray(x))throw Error("取出確認格式錯誤");const r=x as Record<string,unknown>;if(Object.keys(r).some(k=>!["reservationId","quantity"].includes(k)))throw Error("取出確認包含不允許欄位");
 const reservationId=uuid(r.reservationId,"預留識別碼");if(seen.has(reservationId))throw Error("預留品項重複");seen.add(reservationId);return{reservationId,quantity:positive(r.quantity,"取出數量")};}).sort((a,b)=>a.reservationId.localeCompare(b.reservationId));
 return{caseId:positive(v.caseId,"個案"),clinicId:positive(v.clinicId,"院所"),expectedVersion:positive(v.expectedVersion,"版本"),requestId:uuid(v.requestId,"取出請求識別碼"),confirmations};}