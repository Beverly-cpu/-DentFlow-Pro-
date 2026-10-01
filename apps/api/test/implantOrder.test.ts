import assert from "node:assert/strict";
import test from "node:test";
import { orderHash, sameSpecification, validateImplantOrder } from "../src/implantOrder.js";
const common = { clinicId: 10, expectedVersion: 1, requestId: "00000000-0000-4000-8000-000000000001" };
test("order identity normalizes allocation order and rejects duplicates, unknown fields and invalid quantities", () => {
  const a = { planItemId: 1, inventoryBatchId: 2, quantity: 1 }; const b = { planItemId: 1, inventoryBatchId: 3, quantity: 2 };
  const first = validateImplantOrder({ ...common, allocations: [a, b] }, false);
  const second = validateImplantOrder({ ...common, allocations: [b, a] }, false);
  assert.equal(orderHash(1, "order", first), orderHash(1, "order", second));
  assert.notEqual(orderHash(1, "order", first), orderHash(2, "order", first));
  for (const allocations of [[], [a, a], [{ ...a, quantity: -1 }], [{ ...a, quantity: 1001 }], [{ ...a, unitCost: 1 }], [{ ...a, planItemId: "1" }]]) {
    assert.throws(() => validateImplantOrder({ ...common, allocations }, false));
  }
  assert.throws(() => validateImplantOrder({ ...common, allocations: [a], status: "已完成" }, false));
  assert.throws(() => validateImplantOrder({ ...common, reason: "" }, true));
});
test("stock specification match includes name, category, brand, model and specification", () => {
  const plan = { name: "Implant", category: "植體", brand: "Brand", model: "M", specification: "4 x 10" };
  assert.equal(sameSpecification(plan, { ...plan, name: " Ｉｍｐｌａｎｔ ", specification: "4  x  10" }), true);
  assert.equal(sameSpecification(plan, { ...plan, model: "Different" }), false);
});
