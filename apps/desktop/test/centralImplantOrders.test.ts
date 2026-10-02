import { describe, expect, it } from "vitest";
import { cancelOrderIntent, orderIntent } from "../shared/centralImplantOrders";
const id="123e4567-e89b-42d3-a456-426614174000";
describe("central implant order intents",()=>{
 it("normalizes deterministic allocations",()=>{expect(orderIntent({caseId:9,clinicId:2,expectedVersion:4,requestId:id,allocations:[{planItemId:2,inventoryBatchId:8,quantity:1},{planItemId:1,inventoryBatchId:7,quantity:2}]}).allocations.map(x=>x.planItemId)).toEqual([1,2])});
 it("rejects duplicate batch allocation per plan",()=>{expect(()=>orderIntent({caseId:9,clinicId:2,expectedVersion:4,requestId:id,allocations:[{planItemId:1,inventoryBatchId:7,quantity:1},{planItemId:1,inventoryBatchId:7,quantity:1}]})).toThrow()});
 it("requires cancellation reason",()=>{expect(()=>cancelOrderIntent({caseId:9,clinicId:2,expectedVersion:4,requestId:id,reason:" "})).toThrow()});
});