import assert from "node:assert/strict";
import test from "node:test";

import { collectLegacyImplantReferences, inventorySnapshotHash, validateLegacyInventory } from "../src/legacyResources.js";
import { implantFixture } from "./implantFixture.js";
import { inventoryFixture } from "./resourceFixture.js";

test("inventory snapshots preserve source quantity, REF/LOT, costs and timestamps", () => {
  const result = validateLegacyInventory(inventoryFixture());
  assert.equal(result.quantity, 5); assert.equal(result.unitCost, 1200);
  assert.equal(result.refNumber, "REF-001"); assert.equal(result.lotNumber, "LOT-001");
  assert.equal(result.createdAt, "2026-09-01 12:00:00");
});

test("inventory fingerprints ignore JSON key order and detect source changes", () => {
  const original = inventoryFixture();
  const reordered = Object.fromEntries(Object.entries(original).reverse());
  const hash = inventorySnapshotHash(validateLegacyInventory(original));
  assert.equal(hash, inventorySnapshotHash(validateLegacyInventory(reordered)));
  assert.notEqual(hash, inventorySnapshotHash(validateLegacyInventory({ ...original, quantity: 6 })));
  assert.notEqual(hash, inventorySnapshotHash(validateLegacyInventory({ ...original, lotNumber: "LOT-002" })));
});

test("invalid inventory IDs, quantities, costs, expiry and oversized UTF-8 notes are rejected", () => {
  for (const patch of [{ legacyId: "100" }, { quantity: -1 }, { quantity: 1.5 }, { unitCost: -1 },
    { expiryDate: "2026-02-30" }, { clinicCode: "" }, { name: " " }, { note: "診".repeat(6000) }]) {
    assert.throws(() => validateLegacyInventory({ ...inventoryFixture(), ...patch }));
  }
});

test("only allowlisted inventory snapshot fields are stored", () => {
  const result = validateLegacyInventory({ ...inventoryFixture(), passwordHash: "secret", token: "secret", centralUserId: 9 });
  assert.equal("passwordHash" in result, false); assert.equal("token" in result, false);
  assert.equal("centralUserId" in result, false);
});

test("implant reference collection deduplicates IDs and distinguishes doctor IDs from user IDs", () => {
  const fixture = implantFixture();
  Object.assign(fixture.snapshot.case, { inventoryItemId: 100, orderedByUserId: 3, doctorSignedByUserId: 4 });
  Object.assign(fixture.snapshot.reservations[0]!, { pickedByUserId: 3 });
  const result = collectLegacyImplantReferences(fixture.snapshot);
  assert.deepEqual(result, { inventory: [100], users: [2, 3, 4] });
  assert.equal(result.users.includes(9), false);
});

test("null actor references remain absent; invalid source IDs produce a conflict", () => {
  const fixture = implantFixture();
  Object.assign(fixture.snapshot.case, { orderedByUserId: null });
  assert.deepEqual(collectLegacyImplantReferences(fixture.snapshot).users, [2]);
  Object.assign(fixture.snapshot.case, { orderedByUserId: -1 });
  assert.throws(() => collectLegacyImplantReferences(fixture.snapshot));
});
