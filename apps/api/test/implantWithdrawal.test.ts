import assert from "node:assert/strict";
import test from "node:test";
import { validateWithdrawal, withdrawalHash } from "../src/implantWithdrawal.js";
const common = { clinicId: 10, expectedVersion: 2, requestId: "00000000-0000-4000-8000-000000000001" };
const a = { reservationId: "00000000-0000-4000-8000-000000000002", quantity: 2 };
const b = { reservationId: "00000000-0000-4000-8000-000000000003", quantity: 1 };
test("withdrawal requires explicit bounded confirmations and has stable retry identity", () => {
  const first = validateWithdrawal({ ...common, confirmations: [a, b] });
  assert.equal(withdrawalHash(1, first), withdrawalHash(1, validateWithdrawal({ ...common, confirmations: [b, a] })));
  assert.notEqual(withdrawalHash(1, first), withdrawalHash(2, first));
  for (const confirmations of [[], [a, a], [{ ...a, quantity: 0 }], [{ ...a, quantity: 1001 }], [{ ...a, reservationId: "old-id" }], [{ ...a, unitCost: 1 }], [{ ...a, inventoryBatchId: 40 }]]) {
    assert.throws(() => validateWithdrawal({ ...common, confirmations }));
  }
  assert.throws(() => validateWithdrawal({ ...common, confirmations: [a], unitCost: 1 }));
});
