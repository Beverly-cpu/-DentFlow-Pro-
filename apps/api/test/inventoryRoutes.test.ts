import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { inventoryOpeningHash, validateInventoryOpening } from "../src/inventoryOpening.js";
import { registerInventoryRoutes } from "../src/routes/inventoryRoutes.js";
import { openingFixture } from "./inventoryOpeningFixture.js";

async function run(options: { role?: SessionPrincipal["role"]; operation?: "activate" | "list" | "opening"; access?: boolean;
  existing?: "same" | "changed"; version?: number; state?: string; duplicate?: boolean; auditFailure?: boolean } = {}) {
  const statements: { sql: string; params: unknown[] }[] = []; let released = false;
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: options.access === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT inventory_batch_id AS")) return { rows: options.existing ? [{ batchId: "40", hash: options.existing === "same" ? inventoryOpeningHash(40, validateInventoryOpening(openingFixture())) : "changed" }] : [], rowCount: 1 };
    if (sql.includes("SELECT name,category")) return { rows: [{ name: "Implant", category: "植體", brand: "Brand", model: "Model", specification: "4 x 10", refNumber: "REF", lotNumber: "LOT", version: options.version ?? 1, state: options.state ?? "legacy_staged" }], rowCount: 1 };
    if (sql.includes("UPDATE inventory_batches") && options.duplicate) throw Object.assign(new Error("duplicate"), { code: "23505", constraint: "inventory_active_identity_unique" });
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit failure");
    if (sql.includes("FROM inventory_batches b JOIN inventory_balances")) return { rows: [{ id: 40, onHand: 3, reserved: 0, available: 3, version: 2 }], rowCount: 1 };
    if (sql.includes("FROM inventory_openings WHERE inventory_batch_id")) return { rows: [{ countedQuantity: 3, unitCost: "1200.50" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, connect: async () => ({ query, release() { released = true; } }) } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => { request.principal = { userId: 1, role: options.role ?? "Admin", sessionId: "session", clinicId: 10, deviceId: "device" }; });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerInventoryRoutes(app, pool);
  const operation = options.operation ?? "activate";
  const response = await app.inject(operation === "activate" ? { method: "POST", url: "/v1/inventory/40/activate", payload: openingFixture() }
    : { method: "GET", url: operation === "list" ? "/v1/inventory?clinicId=10" : "/v1/inventory/40/opening?clinicId=10" });
  await app.close(); return { status: response.statusCode, body: response.json(), statements, released };
}
test("opening uses counted quantity, pins cost, and commits activation, balance, record and audit together", async () => {
  const r = await run(); assert.equal(r.status, 200); assert.equal(r.body.unchanged, false);
  const stock = r.statements.find((s) => s.sql.includes("INSERT INTO inventory_balances"))!; assert.deepEqual(stock.params, [40, 10, 3, "1200.50"]);
  assert.equal(r.statements.at(-1)!.sql, "COMMIT"); assert.equal(r.released, true);
  assert.equal(r.statements.some((s) => s.sql.includes("legacy_inventory_mappings")), false);
});
test("opening replay never adds stock; changed request conflicts", async () => {
  const r = await run({ existing: "same" }); assert.equal(r.status, 200); assert.equal(r.body.unchanged, true);
  assert.equal(r.statements.some((s) => s.sql.includes("INSERT INTO inventory_balances")), false);
  assert.equal((await run({ existing: "changed" })).body.error, "request_conflict");
});
test("stale, active and duplicate batches cannot create an opening", async () => {
  for (const option of [{ version: 2 }, { state: "active" }, { duplicate: true }]) {
    const r = await run(option); assert.equal(r.status, 409); assert.equal(r.statements.at(-1)!.sql, "ROLLBACK");
    assert.equal(r.statements.some((s) => s.sql.includes("INSERT INTO inventory_balances")), false);
  }
});
test("audit failure rolls back the balance and activation; only admin may activate", async () => {
  const r = await run({ auditFailure: true }); assert.equal(r.status, 400); assert.equal(r.statements.at(-1)!.sql, "ROLLBACK");
  for (const role of ["Assistant", "Doctor", "Accountant", "Procurement"] as const) {
    const denied = await run({ role }); assert.equal(denied.status, 403); assert.equal(denied.statements.length, 0);
  }
  assert.equal((await run({ access: false })).status, 403);
});
test("cost is omitted at query level for clinical roles, while financial reads remain authorized", async () => {
  for (const role of ["Assistant", "Doctor"] as const) {
    const r = await run({ operation: "list", role }); assert.equal(r.status, 200);
    assert.equal(r.statements.some((s) => s.sql.includes("unit_cost")), false);
    assert.equal((await run({ operation: "opening", role })).status, 403);
  }
  for (const role of ["Admin", "Procurement", "Accountant"] as const) {
    assert.equal((await run({ operation: "opening", role })).status, 200);
  }
});
