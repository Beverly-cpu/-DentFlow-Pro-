import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { decodeAssetDataUrl } from "../src/assetData.js";
import { registerAssetRoutes } from "../src/routes/assetRoutes.js";
import { imageDataUrl } from "./assetFixture.js";

async function run(options: { role?: SessionPrincipal["role"]; source?: string; changed?: boolean; storageFailure?: boolean; auditFailure?: boolean; access?: boolean; uploaded?: boolean } = {}) {
  const decoded = decodeAssetDataUrl(imageDataUrl);
  const statements: string[] = []; const transfers: string[] = [];
  const query = async (sql: string) => {
    statements.push(sql);
    if (sql.includes("SELECT m.implant_case_id AS id")) return { rows: options.access === false ? [] : [{ id: "40", clinicId: "10", assets: [{ table: "implants", legacyId: 7, field: "doctorSignature", dataUrlSha256: decoded.dataUrlSha256, dataUrlBytes: decoded.dataUrlBytes }] }], rowCount: 1 };
    if (sql.includes("SELECT id,object_key")) return { rows: options.uploaded ? [{ id: "asset", key: "key", state: "uploaded", contentHash: decoded.contentSha256, dataUrlHash: decoded.dataUrlSha256, contentType: decoded.contentType, byteSize: decoded.bytes.length }] : [], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("UPDATE legacy_implant_snapshots")) return { rows: [{ pendingAssets: 0 }], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure && transfers.length) throw new Error("audit failure");
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => { request.principal = { userId: 1, role: options.role ?? "Admin", sessionId: "session", deviceId: "device-a", clinicId: 10 }; });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerAssetRoutes(app, pool, {
    async assertPrivate() {},
    async put() { assert.equal(statements.at(-1), "COMMIT"); transfers.push("put"); if (options.storageFailure) throw new Error("storage"); },
    async get() { transfers.push("get"); return decoded.bytes; },
  });
  const response = await app.inject({ method: "POST", url: "/v1/migrations/assets/upload", payload: {
    sourceId: options.source ?? "device-a", legacyImplantId: 7, table: "implants", legacyId: 7, field: "doctorSignature",
    dataUrl: options.changed ? imageDataUrl.replace("CAQAAAC1", "CAQAAAC2") : imageDataUrl,
  } });
  await app.close(); return { status: response.statusCode, body: response.json(), statements, transfers };
}

test("asset intent commits before storage; verified upload then audits completion", async () => {
  const r = await run(); assert.equal(r.status, 200); assert.equal(r.body.pendingAssets, 0);
  assert.deepEqual(r.transfers, ["put", "get"]); assert.equal(r.statements.filter((sql) => sql === "COMMIT").length, 2);
});
test("storage failure preserves durable pending intent without marking uploaded", async () => {
  const r = await run({ storageFailure: true }); assert.equal(r.status, 503);
  assert.equal(r.statements.at(-1), "COMMIT"); assert.equal(r.statements.some((sql) => sql.includes("UPDATE implant_assets")), false);
});
test("completion audit failure rolls back completion after the intent was committed", async () => {
  const r = await run({ auditFailure: true }); assert.equal(r.status, 400);
  assert.equal(r.statements.at(-1), "ROLLBACK"); assert.equal(r.statements.filter((sql) => sql === "COMMIT").length, 1);
});
test("repeated completed uploads do not rewrite storage", async () => {
  const r = await run({ uploaded: true }); assert.equal(r.status, 200); assert.equal(r.body.unchanged, true); assert.deepEqual(r.transfers, []);
});
test("unauthorized roles, other device, inaccessible case and changed originals never reach storage", async () => {
  for (const options of [{ role: "Assistant" as const }, { role: "Doctor" as const }, { source: "device-b" }, { access: false }, { changed: true }]) {
    const r = await run(options); assert.notEqual(r.status, 200); assert.deepEqual(r.transfers, []);
  }
});
