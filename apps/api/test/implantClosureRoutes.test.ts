import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { DatabasePool } from "../src/database.js";
import type { SessionPrincipal } from "../src/auth.js";
import { decodeAssetDataUrl } from "../src/assetData.js";
import { clinicalRequestHash } from "../src/implantClosure.js";
import { registerImplantClosureRoutes } from "../src/routes/implantClosureRoutes.js";
import { imageDataUrl } from "./assetFixture.js";
const key = "00000000-0000-4000-8000-000000000001";
const common = { clinicId: 10, expectedVersion: 8, requestId: key };
async function run(path: string, body: Record<string, unknown>, options: { role?: SessionPrincipal["role"]; missing?: boolean; signed?: boolean; stale?: boolean; storageFailure?: boolean; corrupt?: boolean; auditFailure?: boolean; uploaded?: boolean; inaccessible?: boolean; completionStale?: boolean; replayClose?: boolean } = {}) {
  const statements: string[] = []; const transfers: string[] = []; let caseReads = 0;
  const query = async (sql: string) => {
    statements.push(sql);
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT version,status,doctor_signature_asset_id")) {
      caseReads++; return { rows: options.inaccessible ? [] : [{ version: options.stale || (options.completionStale && caseReads === 2) ? 9 : 8, status: "已完成", doctorId: 20, signatureId: options.signed ? key : null, signedVersion: options.signed ? 7 : null }], rowCount: 1 };
    }
    if (sql.includes("FROM implant_clinical_assets WHERE actor_user_id")) return { rows: options.uploaded ? [{ id: key, state: "uploaded", hash: clinicalRequestHash({ caseId: 40, clinicId: 10, expectedVersion: 8, kind: body.kind, planItemId: body.planItemId ?? null, reservationId: null, contentHash: decodeAssetDataUrl(imageDataUrl).contentSha256, contentType: "image/png" }), result: { version: 9 } }] : [], rowCount: 1 };
    if (sql.includes("SELECT upload_state AS state")) return { rows: [{ state: "pending" }], rowCount: 1 };
    if (sql.includes("SELECT r.id FROM implant_stock_reservations")) return { rows: options.missing ? [{ id: key }] : [], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM implant_usage_events") || sql.includes("SELECT 1 FROM implant_draft_plan_items") || sql.includes("SELECT 1 FROM implant_clinical_assets WHERE id=")) return { rows: [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("FROM implant_closures WHERE actor_user_id")) return { rows: options.replayClose ? [{ hash: clinicalRequestHash({ caseId: 40, clinicId: 10, expectedVersion: 8, operation: "close" }), result: { status: "已結案", version: 9 } }] : [], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure && (transfers.length || path === "close")) throw new Error("audit failure");
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (r) => { r.principal = { role: options.role ?? "Doctor", userId: 20, clinicId: 10, deviceId: "device-a", sessionId: key }; });
  app.setErrorHandler((e, _r, reply) => reply.code(400).send({ error: e.message }));
  await registerImplantClosureRoutes(app, pool, { async assertPrivate() {}, async put() { assert.equal(statements.at(-1), "COMMIT"); transfers.push("put"); if (options.storageFailure) throw Error("storage"); }, async get() { transfers.push("get"); return options.corrupt ? Buffer.from("wrong") : decodeAssetDataUrl(imageDataUrl).bytes; } });
  const r = await app.inject({ method: "POST", url: `/v1/implants/40/${path}`, payload: body }); await app.close(); return { status: r.statusCode, body: r.json(), statements, transfers };
}
const signature = { ...common, kind: "doctor_signature", dataUrl: imageDataUrl };
test("designated doctor signs only complete records; storage verification precedes atomic signature", async () => {
  const r = await run("clinical-assets", signature); assert.equal(r.status, 200); assert.deepEqual(r.transfers, ["put", "get"]); assert.ok(r.statements.some(s => s.includes("doctor_signed_version=version")));
  for (const options of [{ role: "Assistant" as const }, { missing: true }, { stale: true }, { inaccessible: true }, { signed: true }]) { const rejected = await run("clinical-assets", signature, options); assert.notEqual(rejected.status, 200); assert.deepEqual(rejected.transfers, []); }
});
test("failed or corrupt transfers retain pending intent; completion audit and stale signature roll back", async () => {
  for (const options of [{ storageFailure: true }, { corrupt: true }]) { const r = await run("clinical-assets", signature, options); assert.equal(r.status, 503); assert.equal(r.statements.at(-1), "COMMIT"); }
  for (const options of [{ auditFailure: true }, { completionStale: true }]) { const r = await run("clinical-assets", signature, options); assert.notEqual(r.status, 200); assert.equal(r.statements.at(-1), "ROLLBACK"); }
});
test("uploaded request replay returns stored result without transfer or version update", async () => {
  const r = await run("clinical-assets", signature, { uploaded: true, signed: true }); assert.equal(r.status, 200); assert.equal(r.body.unchanged, true); assert.deepEqual(r.transfers, []); assert.equal(r.statements.some(s => s.startsWith("UPDATE")), false);
});
test("closure requires signed current revision and complete evidence, preserves receipt and audits atomically", async () => {
  const r = await run("close", common, { signed: true }); assert.equal(r.status, 200); assert.equal(r.body.status, "已結案"); assert.ok(r.statements.some(s => s.includes("INSERT INTO implant_closures")));
  for (const options of [{ signed: false }, { signed: true, missing: true }, { signed: true, auditFailure: true }, { role: "Accountant" as const }]) assert.notEqual((await run("close", common, options)).status, 200);
  const replay = await run("close", common, { replayClose: true, signed: true }); assert.equal(replay.body.unchanged, true); assert.equal(replay.statements.some(s => s.startsWith("UPDATE")), false);
});
