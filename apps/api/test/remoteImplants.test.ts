import assert from "node:assert/strict";
import test from "node:test";
import { centralDraft, draftCreate } from "../../desktop/shared/centralImplants.ts";
import { createDraftJournal, journalKey } from "../../desktop/electron/remote/draftJournal.ts";
import { createRemoteImplantClient } from "../../desktop/electron/remote/implantClient.ts";
import { CentralApiError } from "../../desktop/electron/remote/centralApiError.ts";
import type { PatientTransport } from "../../desktop/electron/remote/patientClient.ts";
import { implantDraftFixture, draftRequestId } from "./implantDraftFixture.js";
function request() { return draftCreate({ ...implantDraftFixture(), requestId: draftRequestId }); }
function fixture(options: { failure?: Error; permission?: boolean; storageFailure?: boolean } = {}) {
  const files = new Map<string, Uint8Array>(); const events: string[] = []; const calls: { path: string; body?: unknown }[] = [];
  const journal = createDraftJournal({ read: k => files.get(k) ?? null, write(k, bytes) { events.push("save"); if (options.storageFailure) throw Error("encryption/storage failed"); files.set(k, bytes); }, remove(k) { events.push("clear"); files.delete(k); }, encrypt: value => Buffer.from(Buffer.from(value).toString("base64")), decrypt: bytes => Buffer.from(Buffer.from(bytes).toString(), "base64").toString() });
  const api = { async get(path: string) { calls.push({ path }); return path.includes("draft-access") ? { canWrite: options.permission !== false, actorUserId: 1 } : { items: [], nextAfterId: null }; }, async post(path: string, body: unknown) { calls.push({ path, body }); events.push("post"); if (options.failure) throw options.failure; return { id: 50, unchanged: true }; }, async put(path: string, body: unknown) { calls.push({ path, body }); return { id: 50 }; } } as unknown as PatientTransport;
  return { client: createRemoteImplantClient(api, journal, () => "https://central"), files, journal, events, calls };
}
test("desktop central draft validator rejects source IDs, invalid FDI, impossible dates and unbounded plans", () => {
  const { clinicId, ...input } = implantDraftFixture(); assert.equal(centralDraft(clinicId, input).patientId, 50);
  for (const body of [{ ...input, inventoryId: 1 }, { ...input, implantDate: "2026-02-30" }, { ...input, teeth: [...input.teeth, ...input.teeth] }, { ...input, doctorUserId: 0 }]) assert.throws(() => centralDraft(clinicId, body));
  assert.throws(() => draftCreate({ ...implantDraftFixture(), requestId: "bad" }));
});
test("new case journal saves encrypted bytes before POST and clears only confirmed matching request", async () => {
  const f = fixture(); const result = await f.client.create(10, request()); assert.equal(result.ok, true); assert.deepEqual(f.events, ["save", "post", "clear"]); assert.equal(f.files.size, 0);
  const context = { serverUrl: "https://central", actorUserId: 1, clinicId: 10 }; f.journal.save(context, request());
  assert.equal(Buffer.from([...f.files.values()][0]!).toString().includes('"patientId"'), false);
  assert.throws(() => f.journal.save(context, { ...request(), note: "different" })); assert.throws(() => f.journal.clear(context, { ...request(), note: "different" }));
  assert.deepEqual(f.journal.read(context), request()); assert.notEqual(journalKey(context), journalKey({ ...context, actorUserId: 2 })); assert.notEqual(journalKey(context), journalKey({ ...context, serverUrl: "https://other" }));
});
test("permission or encryption failure never submits a clinical draft", async () => {
  for (const options of [{ permission: false }, { storageFailure: true }]) { const f = fixture(options); assert.equal((await f.client.create(10, request())).ok, false); assert.equal(f.calls.some(c => c.path === "/v1/implants"), false); }
});
test("unresolved create preserves original content for retry; definite reference rejection may clear it", async () => {
  for (const failure of [new Error("response lost"), new CentralApiError(409, "request_conflict", "different"), new CentralApiError(503, "unavailable", "later")]) {
    const f = fixture({ failure }); const result = await f.client.create(10, request()); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.pending, true); assert.deepEqual(await f.client.pending(10), request());
  }
  const f = fixture({ failure: new CentralApiError(400, "invalid_patient", "archived") }); const result = await f.client.create(10, request()); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.pending, false); assert.equal(f.files.size, 0);
});
test("desktop draft edit and cancel preserve original expectedVersion and exact IDs", async () => {
  const f = fixture(); const { clinicId, ...input } = implantDraftFixture(); await f.client.update(50, clinicId, 7, input); await f.client.cancel(50, clinicId, 7, "取消尚未叫貨草稿");
  assert.equal((f.calls[0]!.body as { expectedVersion: number }).expectedVersion, 7); assert.equal(f.calls[0]!.path, "/v1/implants/50"); assert.equal((f.calls[1]!.body as { expectedVersion: number }).expectedVersion, 7); assert.equal(f.calls[1]!.path, "/v1/implants/50/cancel");
});
