import { CentralApiError } from "./centralApiError";
import type { PatientTransport } from "./patientClient";
import { orderIntent, cancelOrderIntent } from "../../shared/centralImplantOrders";
import type { OrderIntent, OrderResult } from "../../shared/centralImplantOrders";
import { encryptedOrderJournal, type OrderContext } from "./encryptedOrderJournal";
const positive=(v:number)=>{if(!Number.isSafeInteger(v)||v<=0)throw Error("中央 ID 格式錯誤");return v};
export function createRemoteImplantOrderClient(api:PatientTransport,serverUrl:()=>string){
 const context=async(clinicId:number):Promise<OrderContext>=>{const p=await api.get<{canOrder:boolean;actorUserId:number}>(`/v1/implants/order-access?clinicId=${positive(clinicId)}`);if(!p.canOrder)throw new CentralApiError(403,"forbidden","無權執行中央叫貨");return{serverUrl:serverUrl(),clinicId,actorUserId:positive(p.actorUserId)}};
 return {
  async pending(clinicId:number){return encryptedOrderJournal.read(await context(clinicId));},
  async order(clinicId:number,value:unknown):Promise<{ok:true;record:OrderResult}|{ok:false;pending:boolean;error:{status:number|null;code:string;message:string}}>{
   let c:OrderContext|undefined;let request:OrderIntent|undefined;let saved=false;let sent=false;
   try{request=orderIntent(value);if(request.clinicId!==positive(clinicId))throw Error("叫貨院所不符");c=await context(clinicId);encryptedOrderJournal.save(c,request);saved=true;sent=true;
    const {caseId,...body}=request;const record=await api.post<OrderResult>(`/v1/implants/${caseId}/order`,body);encryptedOrderJournal.clear(c,request);return{ok:true,record};
   }catch(error){if(sent&&saved&&c&&request&&error instanceof CentralApiError&&[400,403,404].includes(error.status)){try{encryptedOrderJournal.clear(c,request);saved=false}catch { /* preserve the original pending journal on cleanup failure */ }}
    return{ok:false,pending:saved,error:{status:error instanceof CentralApiError?error.status:null,code:error instanceof CentralApiError?error.code:"request_failed",message:error instanceof Error?error.message:String(error)}};}
  },
  async cancel(clinicId:number,value:unknown){const request=cancelOrderIntent(value);if(request.clinicId!==positive(clinicId))throw Error("取消叫貨院所不符");const {caseId,...body}=request;return api.post<OrderResult>(`/v1/implants/${caseId}/cancel-order`,body);}
 };
}