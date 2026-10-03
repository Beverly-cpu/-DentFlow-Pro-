import assert from "node:assert/strict";
import test from "node:test";
import { dispositionIntent } from "../shared/centralImplantDisposition";
const id="123e4567-e89b-42d3-a456-426614174000",rid="223e4567-e89b-42d3-a456-426614174000";
test("post-op disposition intents validate usage, return and cancellation",()=>{
 assert.equal(dispositionIntent({caseId:1,clinicId:2,expectedVersion:3,requestId:id,operation:"usage",usages:[{reservationId:rid,usedQuantity:0}]}).operation,"usage");
 assert.throws(()=>dispositionIntent({caseId:1,clinicId:2,expectedVersion:3,requestId:id,operation:"return",reason:"未使用",confirmations:[{reservationId:rid,quantity:1,returnCondition:"bad" as "sealed"}]}));
 assert.deepEqual(dispositionIntent({caseId:1,clinicId:2,expectedVersion:3,requestId:id,operation:"cancel_picked",reason:"手術取消",confirmations:[{reservationId:rid,quantity:1,returnCondition:"sealed"}]}).operation,"cancel_picked");
});
