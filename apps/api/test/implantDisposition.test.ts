import assert from "node:assert/strict";
import test from "node:test";
import { dispositionHash, expectedReturn, validateDisposition } from "../src/implantDisposition.js";
const common = { clinicId: 10, expectedVersion: 3, requestId: "00000000-0000-4000-8000-000000000001" };
const a = "00000000-0000-4000-8000-000000000002"; const b = "00000000-0000-4000-8000-000000000003";
test("post-op usage distinguishes consumed implants from reusable instruments", () => {
  assert.equal(expectedReturn("植體", 3, 2), 1); assert.equal(expectedReturn("植體套件", 2, 0), 2);
  assert.equal(expectedReturn("器械", 1, 1), 1); assert.equal(expectedReturn("器械", 1, 0), 1);
  assert.throws(() => expectedReturn("植體", 2, 3));
  const first = validateDisposition({ ...common, usages: [{ reservationId: a, usedQuantity: 0 }, { reservationId: b, usedQuantity: 1 }] }, "usage");
  const second = validateDisposition({ ...common, usages: [{ reservationId: b, usedQuantity: 1 }, { reservationId: a, usedQuantity: 0 }] }, "usage");
  assert.equal(dispositionHash(1, "usage", first), dispositionHash(1, "usage", second));
});
test("returns require positive quantities, unique central reservations and explicit condition", () => {
  const row = { reservationId: a, quantity: 1, returnCondition: "sealed" };
  assert.equal(validateDisposition({ ...common, reason: "Unused sealed item", confirmations: [row] }, "return").entries[0]!.returnCondition, "sealed");
  for (const confirmations of [[row, row], [{ ...row, quantity: 0 }], [{ ...row, returnCondition: undefined }], [{ ...row, unitCost: 10 }], [{ ...row, inventoryBatchId: 1 }]]) {
    assert.throws(() => validateDisposition({ ...common, reason: "Return", confirmations }, "return"));
  }
  assert.throws(() => validateDisposition({ ...common, reason: "", confirmations: [row] }, "cancel_picked"));
  assert.throws(() => validateDisposition({ ...common, status: "已完成" }, "surgery_complete"));
});
