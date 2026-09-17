import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import QRCode from "qrcode";
import type { DentflowMainLayoutContext } from "../layouts/MainLayout";

type Machine={id:number;name:string;type:string;serialNumber:string;qrToken:string;currentClinicId:number;clinicName:string;clinicCode:string;targetClinicName:string|null;status:string;isActive:number;lastConfirmedAt:string|null};
type Reservation={id:number;machineId:number;machineName:string;clinicId:number;clinicName:string;clinicCode:string;scheduledStartAt:string;scheduledEndAt:string;moverUserId:number;moverName:string;status:string;overrideReason:string};

const box:React.CSSProperties={background:"#fff",border:"1px solid #dfe7df",borderRadius:14,padding:18};
const field:React.CSSProperties={padding:"10px 12px",border:"1px solid #ced9cf",borderRadius:8,font:"inherit"};

export default function Machines(){
 const {session}=useOutletContext<DentflowMainLayoutContext>();
 const admin=session.role==="Admin";
 const [machines,setMachines]=useState<Machine[]>([]),[reservations,setReservations]=useState<Reservation[]>([]),[clinics,setClinics]=useState<DentflowClinicRecord[]>([]);
 const [error,setError]=useState(""),[qr,setQr]=useState<Record<number,string>>({}),[scanToken,setScanToken]=useState(""),[scanReservation,setScanReservation]=useState("");
 const [machineForm,setMachineForm]=useState({name:"",type:"導航機",serialNumber:""});
 const [reserve,setReserve]=useState({machineId:"",clinicId:String(session.clinicId),scheduledStartAt:"",scheduledEndAt:"",note:"",force:false,overrideReason:""});
 async function load(){try{const [m,r,c]=await Promise.all([window.dentflow.machines.list(),window.dentflow.machines.reservations(),window.dentflow.auth.activeClinics()]);setMachines(m);setReservations(r);setClinics(c);const pairs=await Promise.all(m.map(async(x:Machine)=>[x.id,await QRCode.toDataURL(x.qrToken,{width:180,margin:1})] as const));setQr(Object.fromEntries(pairs));}catch(e){setError(e instanceof Error?e.message:String(e));}}
 useEffect(()=>{void Promise.resolve().then(load);},[]);
 const [now]=useState(()=>Date.now());
 const reminders=useMemo(()=>reservations.filter(r=>{const start=new Date(r.scheduledStartAt).getTime();return (start-now>0&&start-now<=86400000)||(r.status==="搬運中"&&now-start>1800000);}),[reservations,now]);
 async function addMachine(){try{await window.dentflow.machines.create({...machineForm,clinicId:session.clinicId},session.userId);setMachineForm({name:"",type:"導航機",serialNumber:""});await load();}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function addReservation(){try{await window.dentflow.machines.reserve({...reserve,machineId:Number(reserve.machineId),clinicId:Number(reserve.clinicId),moverUserId:session.userId},session.userId);await load();}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function scan(action:"搬出"|"到院"){try{await window.dentflow.machines.scan(scanToken,Number(scanReservation),session.clinicId,action,session.userId);setScanToken("");await load();}catch(e){setError(e instanceof Error?e.message:String(e));}}
 return <section style={{padding:28,color:"#234634"}}><h1>大型機台管理</h1>{error&&<div style={{...box,background:"#fff0f0",color:"#a33",marginBottom:14}}>{error}</div>}
 {reminders.length>0&&<div style={{...box,background:"#fff8e7",marginBottom:14}}><strong>提醒</strong>{reminders.map(r=><div key={r.id}>{r.status==="搬運中"?"到院確認已逾時 30 分鐘":"預約將於 1 天內開始"}：{r.machineName} → {r.clinicName}</div>)}</div>}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:14}}>
  <div style={box}><h2>機台位置</h2>{machines.map(m=><div key={m.id} style={{borderTop:"1px solid #edf1ed",padding:"12px 0",display:"flex",gap:12}}><img src={qr[m.id]} width={90} height={90}/><div><strong>{m.name}</strong><div>{m.type}｜{m.serialNumber||"無序號"}</div><div>狀態：{m.status}</div><div>目前：{m.clinicName} {m.status==="搬運中"&&m.targetClinicName?`→ ${m.targetClinicName}`:""}</div>{admin&&<button onClick={()=>void window.dentflow.machines.setActive(m.id,!m.isActive,session.userId).then(load)}>{m.isActive?"停用":"啟用"}</button>}</div></div>)}</div>
  <div style={box}><h2>預約機台</h2><select style={field} value={reserve.machineId} onChange={e=>setReserve({...reserve,machineId:e.target.value})}><option value="">選擇機台</option>{machines.filter(m=>m.isActive).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><select style={field} value={reserve.clinicId} onChange={e=>setReserve({...reserve,clinicId:e.target.value})}>{clinics.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input style={field} type="datetime-local" value={reserve.scheduledStartAt} onChange={e=>setReserve({...reserve,scheduledStartAt:e.target.value})}/><input style={field} type="datetime-local" value={reserve.scheduledEndAt} onChange={e=>setReserve({...reserve,scheduledEndAt:e.target.value})}/>{admin&&<><label><input type="checkbox" checked={reserve.force} onChange={e=>setReserve({...reserve,force:e.target.checked})}/> 管理者強制覆寫衝突</label>{reserve.force&&<input style={field} placeholder="覆寫原因（必填）" value={reserve.overrideReason} onChange={e=>setReserve({...reserve,overrideReason:e.target.value})}/>}</>}<button onClick={()=>void addReservation()}>建立預約</button></div>
  <div style={box}><h2>QR 交接掃描</h2><input style={field} placeholder="掃描機台 QR Code" value={scanToken} onChange={e=>setScanToken(e.target.value)}/><select style={field} value={scanReservation} onChange={e=>setScanReservation(e.target.value)}><option value="">選擇預約</option>{reservations.map(r=><option key={r.id} value={r.id}>{r.machineName} → {r.clinicName}</option>)}</select><div><button onClick={()=>void scan("搬出")}>搬出確認</button><button onClick={()=>void scan("到院")}>到院確認</button></div></div>
  {admin&&<div style={box}><h2>新增機台</h2><input style={field} placeholder="機台名稱" value={machineForm.name} onChange={e=>setMachineForm({...machineForm,name:e.target.value})}/><select style={field} value={machineForm.type} onChange={e=>setMachineForm({...machineForm,type:e.target.value})}><option>導航機</option><option>水雷射</option><option>其他大型機台</option></select><input style={field} placeholder="序號" value={machineForm.serialNumber} onChange={e=>setMachineForm({...machineForm,serialNumber:e.target.value})}/><button onClick={()=>void addMachine()}>新增機台</button></div>}
 </div></section>;
}
