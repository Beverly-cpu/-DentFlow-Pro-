import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { orderHash, validateImplantOrder } from "../src/implantOrder.js";
import { registerImplantOrderRoutes } from "../src/routes/implantOrderRoutes.js";

async function run(options: { cancel?: boolean; role?: SessionPrincipal["role"]; access?: boolean; visible?: boolean;
  version?: number; shortage?: boolean; expired?: boolean; mismatch?: boolean; auditFailure?: boolean; previous?: "same" | "changed" } = {}) {
  const cancel = options.cancel ?? false; const operation = cancel ? "cancel_order" : "order";
  const payload = { clinicId: 10, expectedVersion: 1, requestId: "00000000-0000-4000-8000-000000000001", ...(cancel ? { reason: "Before withdrawal" } : { allocations: [{ planItemId: 70, inventoryBatchId: 40, quantity: 2 }] }) };
  const statements: { sql: string; params: unknown[] }[] = [];
  const spec = { name: "Implant", category: "植體", brand: "Brand", model: "Model", specification: "4 x 10" };
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: options.access === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT version,status")) return { rows: options.visible === false ? [] : [{ version: options.version ?? 1, status: cancel ? "醫師已叫貨" : "待醫師叫貨", mode: cancel ? "central_workflow" : "central_draft", patientId: "50", doctorId: "20" }], rowCount: 1 };
    if (sql.includes("SELECT request_hash AS")) return { rows: options.previous ? [{ hash: options.previous === "same" ? orderHash(1, operation, validateImplantOrder(payload, cancel)) : "different", result: { id: 1, version: 2 } }] : [], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM patients") || sql.includes("SELECT 1 FROM users")) return { rows: [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("FROM implant_draft_plan_items")) return { rows: [{ ...spec, id: 70, quantity: 2 }], rowCount: 1 };
    if (sql.includes("FROM implant_stock_reservations")) return { rows: [{ planItemId: 70, inventoryBatchId: 40, quantity: 2 }], rowCount: 1 };
    if (sql.includes("FROM inventory_batches b JOIN inventory_balances")) return { rows: [{ ...spec, model: options.mismatch ? "Other" : spec.model, id: 40, onHand: options.shortage ? 1 : 5, reserved: cancel ? 2 : 0, expired: options.expired ?? false }], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit failure");
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => { request.principal = { userId: 20, role: options.role ?? "Doctor", sessionId: "session", clinicId: 10, deviceId: "device" }; });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerImplantOrderRoutes(app, pool);
  const response = await app.inject({ method: "POST", url: `/v1/implants/1/${cancel ? "cancel-order" : "order"}`, payload });
  await app.close(); return { status: response.statusCode, body: response.json(), statements };
}
test("order and cancel adjust only reserved stock and commit case, immutable events and audit", async () => {
  for (const cancel of [false, true]) {
    const r = await run({ cancel }); assert.equal(r.status, 200); assert.equal(r.body.version, 2);
    const stock = r.statements.find((s) => s.sql.startsWith("UPDATE inventory_balances"))!; assert.deepEqual(stock.params, [40, cancel ? -2 : 2]);
    assert.equal(stock.sql.includes("on_hand="), false); assert.ok(r.statements.some((s) => s.sql.includes("INSERT INTO inventory_reservation_events")));
    assert.equal(r.statements.at(-1)!.sql, "COMMIT");
  }
});
test("order retry and cancellation retry never touch stock twice", async () => {
  for (const cancel of [false, true]) {
    const r = await run({ cancel, previous: "same", version: 2 }); assert.equal(r.status, 200); assert.equal(r.body.unchanged, true);
    assert.equal(r.statements.some((s) => s.sql.startsWith("UPDATE")), false);
    assert.equal((await run({ cancel, previous: "changed" })).status, 409);
  }
});
test("old version, insufficient stock, expired lots and mismatched specs cannot reserve", async () => {
  for (const option of [{ version: 2 }, { shortage: true }, { expired: true }, { mismatch: true }]) {
    const r = await run(option); assert.ok([400, 409].includes(r.status));
    assert.equal(r.statements.some((s) => s.sql.startsWith("UPDATE inventory_balances")), false);
  }
  assert.equal((await run({ cancel: true, expired: true })).status, 200);
});
test("audit failure rolls back all order and cancellation effects", async () => {
  for (const cancel of [false, true]) { const r = await run({ cancel, auditFailure: true }); assert.equal(r.status, 400); assert.equal(r.statements.at(-1)!.sql, "ROLLBACK"); }
});
test("ordering roles, own-case visibility, clinic access and assistant rules remain enforced", async () => {
  for (const role of ["Admin", "Procurement", "Accountant"] as const) { const r = await run({ role }); assert.equal(r.status, 403); assert.equal(r.statements.length, 0); }
  assert.equal((await run({ visible: false })).status, 404); assert.equal((await run({ access: false })).status, 403);
  assert.equal((await run({ role: "Assistant" })).body.error, "assistant_order_incomplete");
  assert.equal((await run({ cancel: true, role: "Admin" })).status, 200);
});
