import assert from "node:assert/strict";
import test from "node:test";

import { implantSnapshotHash, validateLegacyImplant } from "../src/legacyImplant.js";
import { implantFixture } from "./implantFixture.js";

test("implant migration preserves REF/LOT, historical costs and source actor IDs", () => {
  const payload = validateLegacyImplant(implantFixture());
  assert.equal(payload.snapshot.usageItems[0]!.inventoryLotNumber, "LOT-001");
  assert.equal(payload.snapshot.usageItems[0]!.unitCost, 1200);
  assert.equal(payload.snapshot.case.createdByUserId, 2);
  assert.equal(payload.assets[0]!.dataUrlSha256, "a".repeat(64));
});

test("snapshot fingerprint is stable across object key order but detects content and asset changes", () => {
  const original = validateLegacyImplant(implantFixture());
  const reordered = { ...original, snapshot: { ...original.snapshot,
    case: Object.fromEntries(Object.entries(original.snapshot.case).reverse()) } };
  assert.equal(implantSnapshotHash(original), implantSnapshotHash(reordered));
  const changed = validateLegacyImplant(implantFixture());
  changed.snapshot.case.note = "changed";
  assert.notEqual(implantSnapshotHash(original), implantSnapshotHash(changed));
  changed.snapshot.case.note = original.snapshot.case.note;
  changed.assets[0]!.dataUrlSha256 = "b".repeat(64);
  assert.notEqual(implantSnapshotHash(original), implantSnapshotHash(changed));
});

test("foreign children and duplicate IDs cannot enter a case snapshot", () => {
  const invalid = [
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.teeth[0]!.implantId = 99; },
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.planItems[0]!.implantToothId = 99; },
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.usageItems[0]!.implantPlanItemId = 99; },
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.returnAudits[0]!.reservationId = 99; },
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.teeth.push({ ...x.snapshot.teeth[0]! }); },
  ];
  for (const mutate of invalid) {
    const payload = implantFixture(); mutate(payload);
    assert.throws(() => validateLegacyImplant(payload));
  }
});

test("asset owners, duplicates and hashes are checked", () => {
  for (const mutate of [
    (x: ReturnType<typeof implantFixture>) => { x.assets[0]!.legacyId = 99; },
    (x: ReturnType<typeof implantFixture>) => { x.assets[0]!.field = "passwordHash"; },
    (x: ReturnType<typeof implantFixture>) => { x.assets[0]!.dataUrlSha256 = "invalid"; },
    (x: ReturnType<typeof implantFixture>) => { x.assets.push({ ...x.assets[0]! }); },
  ]) {
    const payload = implantFixture(); mutate(payload);
    assert.throws(() => validateLegacyImplant(payload));
  }
});

test("embedded images, signatures and credentials are rejected", () => {
  for (const extra of [{ doctorSignature: "content" }, { note: "data:image/png;base64,test" }, { passwordHash: "hash" }]) {
    const payload = implantFixture(); Object.assign(payload.snapshot.case, extra);
    assert.throws(() => validateLegacyImplant(payload));
  }
});

test("invalid dates, status, negative costs and noninteger quantities are rejected", () => {
  for (const mutate of [
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.case.implantDate = "2026-02-30"; },
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.case.status = "unknown"; },
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.usageItems[0]!.unitCost = -1; },
    (x: ReturnType<typeof implantFixture>) => { x.snapshot.planItems[0]!.plannedQuantity = 1.5; },
  ]) {
    const payload = implantFixture(); mutate(payload);
    assert.throws(() => validateLegacyImplant(payload));
  }
  const tooLarge = implantFixture(); tooLarge.snapshot.case.note = "a".repeat(1_000_001);
  assert.throws(() => validateLegacyImplant(tooLarge), /1 MB/);
});

test("null doctor and missing historical cost remain explicit instead of becoming current IDs or costs", () => {
  const payload = implantFixture(); payload.snapshot.case.doctorId = null;
  Object.assign(payload.snapshot.usageItems[0]!, { unitCost: null, totalCost: null });
  const validated = validateLegacyImplant(payload);
  assert.equal(validated.snapshot.case.doctorId, null);
  assert.equal(validated.snapshot.usageItems[0]!.unitCost, null);
});
