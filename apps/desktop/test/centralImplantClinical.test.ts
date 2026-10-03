import assert from "node:assert/strict";
import test from "node:test";
import { assetIntent,closeIntent } from "../shared/centralImplantClinical";
const id="123e4567-e89b-42d3-a456-426614174000";
test("central clinical intents bind assets and validate signature/closure",()=>{
 assert.equal(assetIntent({caseId:1,clinicId:2,expectedVersion:3,requestId:id,kind:"ref_lot_photo",reservationId:id,dataUrl:"data:image/jpeg;base64,AA=="}).reservationId,id);
 assert.throws(()=>assetIntent({caseId:1,clinicId:2,expectedVersion:3,requestId:id,kind:"doctor_signature",dataUrl:"data:image/jpeg;base64,AA=="}));
 assert.equal(assetIntent({caseId:1,clinicId:2,expectedVersion:3,requestId:id,kind:"ref_lot_photo",reservationId:id,dataUrl:"data:image/png;base64,AA=="}).requestId,id);
 assert.deepEqual(closeIntent({caseId:1,clinicId:2,expectedVersion:3,requestId:id}),{caseId:1,clinicId:2,expectedVersion:3,requestId:id});
});
