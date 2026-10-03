import assert from "node:assert/strict";
import test from "node:test";
import { cancelOrderIntent, orderIntent } from "../shared/centralImplantOrders";
const id="123e4567-e89b-42d3-a456-426614174000";
test("central implant order intents normalize and validate",()=>{
 assert.deepEqual(orderIntent({caseId:9,clinicId:2,expectedVersion:4,requestId:id,allocations:[{planItemId:2,inventoryBatchId:8,quantity:1},{planItemId:1,inventoryBatchId:7,quantity:2}]}).allocations.map(x=>x.planItemId),[1,2]);
 assert.throws(()=>orderIntent({caseId:9,clinicId:2,expectedVersion:4,requestId:id,allocations:[{planItemId:1,inventoryBatchId:7,quantity:1},{planItemId:1,inventoryBatchId:7,quantity:1}]}));
 assert.throws(()=>cancelOrderIntent({caseId:9,clinicId:2,expectedVersion:4,requestId:id,reason:" "}));
});
