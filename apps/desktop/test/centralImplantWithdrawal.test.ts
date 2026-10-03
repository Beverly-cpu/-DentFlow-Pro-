import assert from "node:assert/strict";
import test from "node:test";
import { withdrawalIntent } from "../shared/centralImplantWithdrawal";
const requestId="123e4567-e89b-42d3-a456-426614174000",reservationId="223e4567-e89b-42d3-a456-426614174000";
test("central withdrawal intent validates confirmations",()=>{
 assert.equal(withdrawalIntent({caseId:1,clinicId:2,expectedVersion:3,requestId,confirmations:[{reservationId,quantity:2}]}).confirmations[0]?.quantity,2);
 assert.throws(()=>withdrawalIntent({caseId:1,clinicId:2,expectedVersion:3,requestId,confirmations:[{reservationId,quantity:2},{reservationId,quantity:2}]}));
 assert.throws(()=>withdrawalIntent({caseId:1,clinicId:2,expectedVersion:3,requestId,confirmations:[{reservationId,quantity:2,unitCost:1}]}));
});
