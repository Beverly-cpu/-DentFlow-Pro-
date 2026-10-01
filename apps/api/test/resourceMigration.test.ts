import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import type { DatabasePool } from "../src/database.js";
import type { SessionPrincipal } from "../src/auth.js";
import { inventorySnapshotHash, validateLegacyInventory } from "../src/legacyResources.js";
import { registerResourceMigrationRoutes } from "../src/routes/resourceMigrationRoutes.js";
import { implantFixture } from "./implantFixture.js";
import { inventoryFixture } from "./resourceFixture.js";

async function run(kind: "inventory" | "users" | "references", options: {
  authenticated?: boolean; role?: SessionPrincipal["role"]; sourceId?: string; count?: number;
  clinic?: boolean; target?: boolean; existing?: "same" | "different"; incompatible?: boolean;
  missingInventory?: boolean; missingUsers?: boolean; auditFailure?: boolean; pageSize?: number;
} = {}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  let released = false;
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT c.id FROM clinics")) return { rows: options.clinic === false ? [] : [{ id: "10" }], rowCount: 1 };
    if (sql.includes("snapshot_hash AS hash FROM legacy_inventory_mappings")) return { rows: options.existing ? [{ clinicId: "10",
      hash: options.existing === "same" ? inventorySnapshotHash(validateLegacyInventory(inventoryFixture())) : "changed" }] : [], rowCount: 1 };
    if (sql.includes("INSERT INTO inventory_batches")) return { rows: [{ id: "40" }], rowCount: 1 };
    if (sql.includes("SELECT u.id FROM users")) return { rows: options.target === false ? [] : [{ id: "20" }], rowCount: 1 };
    if (sql.includes('source_account AS account,source_role AS role')) return { rows: options.existing ? [{ userId: options.existing === "same" ? "20" : "99", account: "assistant", role: "Assistant" }] : [], rowCount: 1 };
    if (sql.includes("user_id<>")) return { rows: [], rowCount: options.incompatible ? 1 : 0 };
    if (sql.includes('m.implant_case_id AS id')) return { rows: Array.from({ length: options.pageSize ?? 1 }, (_, i) => ({ id: String(i + 1), clinicId: "10", snapshot: implantFixture().snapshot })), rowCount: 1 };
    if (sql.includes("SELECT inventory_batch_id AS id")) return { rows: options.missingInventory ? [] : [{ id: "40" }], rowCount: 1 };
    if (sql.includes("SELECT user_id AS id")) return { rows: options.missingUsers ? [] : [{ id: "20" }], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit unavailable");
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, async connect() { return { query, release() { released = true; } }; } } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => {
    if (options.authenticated === false) return;
    request.principal = { sessionId: "session", userId: 1, role: options.role ?? "Admin", clinicId: 10, deviceId: "device-a" };
  });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerResourceMigrationRoutes(app, pool);
  const collection = kind === "references" ? {} : { [kind]: Array.from({ length: options.count ?? 1 }, () =>
    kind === "inventory" ? inventoryFixture() : { legacyId: 2, clinicCode: "TPE", account: " Assistant ", role: "Assistant" }) };
  const response = await app.inject({ method: "POST",
    url: kind === "references" ? "/v1/migrations/implants/resolve-references" : `/v1/migrations/${kind}/import`,
    payload: { sourceId: options.sourceId ?? "device-a", ...collection },
  });
  await app.close(); return { status: response.statusCode, body: response.json(), statements, released };
}

test("inventory import stores a source snapshot without creating an operational quantity", async () => {
  const result = await run("inventory"); assert.equal(result.status, 200); assert.equal(result.body.imported, 1);
  const snapshot = result.statements.find((s) => s.sql.includes("INSERT INTO legacy_inventory_mappings"))!;
  assert.equal(JSON.parse(String(snapshot.params[5])).quantity, 5);
  const core = result.statements.find((s) => s.sql.includes("INSERT INTO inventory_batches"))!;
  assert.equal(core.sql.includes("quantity"), false);
  assert.equal(result.statements.at(-1)!.sql, "COMMIT"); assert.equal(result.released, true);
});

test("inventory repeats are unchanged; changed snapshots and missing clinics conflict", async () => {
  assert.equal((await run("inventory", { existing: "same" })).body.unchanged, 1);
  for (const options of [{ existing: "different" as const }, { clinic: false }]) {
    const result = await run("inventory", options); assert.equal(result.body.conflicts.length, 1);
    assert.equal(result.statements.some((s) => s.sql.includes("INSERT INTO inventory_batches")), false);
  }
});

test("historic actor mapping never creates an account, password or clinic membership", async () => {
  const result = await run("users"); assert.equal(result.status, 200); assert.equal(result.body.mapped, 1);
  assert.ok(result.statements.some((s) => s.sql.includes("INSERT INTO legacy_user_mappings")));
  assert.equal(result.statements.some((s) => /INSERT INTO (users|user_clinics)|UPDATE users/.test(s.sql)), false);
  const lookup = result.statements.find((s) => s.sql.includes("SELECT u.id FROM users"))!;
  assert.equal(lookup.sql.includes("active=true"), false);
  assert.deepEqual(lookup.params, ["assistant", "Assistant", 10]);
});

test("actor repeats are unchanged; missing, changed and cross-clinic identities conflict", async () => {
  assert.equal((await run("users", { existing: "same" })).body.unchanged, 1);
  for (const options of [{ existing: "different" as const }, { target: false }, { incompatible: true }]) {
    const result = await run("users", options); assert.equal(result.body.conflicts.length, 1);
    assert.equal(result.statements.some((s) => s.sql.includes("INSERT INTO legacy_user_mappings")), false);
  }
});

test("all resource mutations reject unauthenticated roles and forged devices before database work", async () => {
  for (const kind of ["inventory", "users", "references"] as const) {
    for (const options of [{ authenticated: false }, { role: "Assistant" as const }, { role: "Doctor" as const }, { sourceId: "other-device" }]) {
      const result = await run(kind, options); assert.notEqual(result.status, 200); assert.equal(result.statements.length, 0);
    }
  }
  assert.equal((await run("inventory", { count: 101 })).statements.length, 0);
  assert.equal((await run("users", { count: 501 })).statements.length, 0);
});

test("reference resolution links mapped identities without rewriting the immutable snapshot", async () => {
  const result = await run("references"); assert.equal(result.status, 200);
  assert.equal(result.body.inventoryRefs, 1); assert.equal(result.body.userRefs, 1);
  assert.equal(result.body.missingInventory, 0); assert.equal(result.body.missingUsers, 0);
  assert.equal(result.statements.some((s) => s.sql.includes("SET snapshot=")), false);
  assert.equal(result.statements.some((s) => s.sql.includes("UPDATE implant_cases")), false);
});

test("unmapped references remain visible and pagination advances past each page", async () => {
  const missing = await run("references", { missingInventory: true, missingUsers: true });
  assert.equal(missing.body.missingInventory, 1); assert.equal(missing.body.missingUsers, 1);
  assert.equal(missing.statements.some((s) => s.sql.includes("INSERT INTO legacy_implant_")), false);
  const paged = await run("references", { pageSize: 50 }); assert.equal(paged.body.nextAfterId, 50);
});

test("audit failures roll back inventory, actor and reference transactions", async () => {
  for (const kind of ["inventory", "users", "references"] as const) {
    const result = await run(kind, { auditFailure: true }); assert.equal(result.status, 400);
    assert.equal(result.statements.at(-1)!.sql, "ROLLBACK"); assert.equal(result.released, true);
    assert.equal(result.statements.some((s) => s.sql === "COMMIT"), false);
  }
});
