import assert from "node:assert/strict";
import test from "node:test";
import { createRemoteInventoryClient } from "../../desktop/electron/remote/inventoryClient.ts";
import { CentralApiError } from "../../desktop/electron/remote/centralApiError.ts";
import type { PatientTransport } from "../../desktop/electron/remote/patientClient.ts";
import { finishOpeningIntent, saveOpeningIntent, mayReconcileFailure, openingIntentKey, prepareOpening, validateOpeningIntent } from "../../desktop/shared/openingIntent.ts";
import { openingFixture } from "./inventoryOpeningFixture.js";
function client(error?: Error) {
  const calls: { path: string; body?: unknown }[] = [];
  const api = { async get(path: string) { calls.push({ path }); if (error) throw error; return { items: [], nextAfterId: null }; }, async post(path: string, body: unknown) { calls.push({ path, body }); if (error) throw error; return { unchanged: true }; } } as unknown as PatientTransport;
  return { inventory: createRemoteInventoryClient(api), calls };
}
test("opening form requires explicit quantities and costs, including explicit zero, without snapshot defaults", () => {
  const id = openingFixture().requestId;
  assert.equal(prepareOpening(10, 50, 1, "0", "0", "實際盤點確認為零", id).countedQuantity, 0);
  for (const [q, c] of [["", "0"], ["0", ""], ["1.2", "0"], ["1", "1.234"], ["1e2", "10"], ["-1", "1"]]) assert.throws(() => prepareOpening(10, 50, 1, q!, c!, "note", id));
  assert.throws(() => validateOpeningIntent({ ...openingFixture(), batchId: 50, actorUserId: 1 }));
});
test("persisted opening retains the exact key, batch and original version across reconstruction", async () => {
  const request = prepareOpening(10, 50, 1, "3", "1200.50", "確認同一實體庫存，排除其他來源", openingFixture().requestId);
  const restored = validateOpeningIntent(JSON.parse(JSON.stringify(request))); assert.deepEqual(restored, request);
  assert.notEqual(openingIntentKey("https://a", 1, 10), openingIntentKey("https://a", 2, 10)); assert.notEqual(openingIntentKey("https://a", 1, 10), openingIntentKey("https://b", 1, 10));
  const { inventory, calls } = client(); const { batchId, clinicId, ...input } = restored;
  assert.equal((await inventory.activate(batchId, clinicId, input)).ok, true);
  assert.equal(calls[0]!.path, "/v1/inventory/50/activate"); assert.deepEqual(calls[0]!.body, { ...input, clinicId });
});
test("inventory adapter preserves pagination and does not silently map read errors", async () => {
  const { inventory, calls } = client(); await inventory.list(10, 100); await inventory.staged(10); await inventory.opening(50, 10); await inventory.sources(50, 10);
  assert.deepEqual(calls.map(c => c.path), ["/v1/inventory?clinicId=10&afterId=100", "/v1/inventory/staged?clinicId=10", "/v1/inventory/50/opening?clinicId=10", "/v1/inventory/50/sources?clinicId=10"]);
  const failure = new CentralApiError(403, "forbidden", "denied"); await assert.rejects(client(failure).inventory.list(10), e => e === failure);
});
test("activation errors distinguish definite rollback from an unresolved network or duplicate request result", async () => {
  for (const error of [new Error("network"), new CentralApiError(503, "unavailable", "try again"), new CentralApiError(409, "request_conflict", "different")]) {
    const result = await client(error).inventory.activate(50, 10, openingFixture()); assert.equal(result.ok, false);
    if (!result.ok) assert.equal(mayReconcileFailure(result.error.status, result.error.code), false);
  }
  const conflict = await client(new CentralApiError(409, "version_conflict", "stale")).inventory.activate(50, 10, openingFixture());
  assert.equal(conflict.ok, false); if (!conflict.ok) assert.equal(mayReconcileFailure(conflict.error.status, conflict.error.code), true);
});

test("durable opening intent cannot be overwritten or cleared by a different request", () => {
  const request = prepareOpening(10, 50, 1, "3", "1200.50", "盤點核對", openingFixture().requestId);
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  saveOpeningIntent(storage, "intent", request); saveOpeningIntent(storage, "intent", request);
  assert.throws(() => saveOpeningIntent(storage, "intent", { ...request, countedQuantity: 99 }));
  assert.throws(() => finishOpeningIntent(storage, "intent", { ...request, expectedVersion: 2 }));
  assert.deepEqual(validateOpeningIntent(JSON.parse(values.get("intent")!)), request);
  finishOpeningIntent(storage, "intent", request); assert.equal(values.size, 0);
  const failed = { ...storage, setItem() { throw Error("storage full"); } }; assert.throws(() => saveOpeningIntent(failed, "intent", request));
});
