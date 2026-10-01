import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { dispositionHash, validateDisposition } from "../src/implantDisposition.js";
import type { DispositionOperation } from "../src/implantDisposition.js";
import { registerImplantDispositionRoutes } from "../src/routes/implantDispositionRoutes.js";

async function run(options: { operation?: DispositionOperation; role?: SessionPrincipal["role"]; category?: string; used?: number; returning?: number;
  condition?: string; expected?: number | null; alreadyReturned?: number; version?: number; status?: string; access?: boolean; visible?: boolean;
  auditFailure?: boolean; previous?: "same" | "changed" } = {}) {
  const operation = options.operation ?? "usage"; const returning = operation === "return" || operation === "cancel_picked";
  const reservationId = "00000000-0000-4000-8000-000000000002";
  const payload = { clinicId: 10, expectedVersion: 3, requestId: "00000000-0000-4000-8000-000000000001",
    ...(operation === "surgery_complete" ? {} : returning ? { reason: "Unused sealed item", confirmations: [{ reservationId, quantity: options.returning ?? (operation === "cancel_picked" ? 2 : 1), returnCondition: options.condition ?? "sealed" }] }
      : { usages: [{ reservationId, usedQuantity: options.used ?? 1 }] }),
  };
  const statements: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: options.access === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT version,status")) return { rows: options.visible === false ? [] : [{ version: options.version ?? 3, status: options.status ?? (operation === "usage" ? "待術後紀錄" : operation === "return" ? "待歸回品項" : "已取出待手術") }], rowCount: 1 };
    if (sql.includes("SELECT request_hash AS")) return { rows: options.previous ? [{ hash: options.previous === "same" ? dispositionHash(1, operation, validateDisposition(payload, operation)) : "changed", result: { id: 1, version: 4 } }] : [], rowCount: 1 };
    if (sql.includes("FROM implant_stock_reservations r JOIN implant_draft_plan_items")) return { rows: [{ id: reservationId, batchId: 40, picked: 2, used: operation === "return" ? 1 : 0,
      expected: options.expected === undefined ? operation === "return" ? 1 : null : options.expected, returned: options.alreadyReturned ?? 0, category: options.category ?? "植體", unitCost: "1200.50" }], rowCount: 1 };
    if (sql.includes("FROM inventory_batches b")) return { rows: [{ id: 40, onHand: 3 }], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit failure");
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => { request.principal = { userId: 20, role: options.role ?? "Doctor", sessionId: "session", clinicId: 10, deviceId: "device" }; });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerImplantDispositionRoutes(app, pool);
  const paths = { surgery_complete: "surgery-complete", usage: "usage", return: "return-items", cancel_picked: "cancel-picked" };
  const response = await app.inject({ method: "POST", url: `/v1/implants/1/${paths[operation]}`, payload });
  await app.close(); return { status: response.statusCode, body: response.json(), statements };
}
test("surgery completion and post-op usage do not debit or credit stock", async () => {
  for (const operation of ["surgery_complete", "usage"] as const) {
    const r = await run({ operation }); assert.equal(r.status, 200); assert.equal(r.statements.some((s) => s.sql.startsWith("UPDATE inventory_balances")), false);
  }
  const used = await run({ used: 2 }); assert.equal(used.body.status, "已完成");
  const instrument = await run({ category: "器械", used: 2 }); assert.equal(instrument.body.status, "待歸回品項");
  const event = instrument.statements.find((s) => s.sql.includes("INSERT INTO implant_usage_events"))!; assert.deepEqual(event.params.slice(-3), [2, 0, 2]);
});
test("return and picked cancellation credit on-hand only and preserve original cost", async () => {
  for (const operation of ["return", "cancel_picked"] as const) {
    const r = await run({ operation }); assert.equal(r.status, 200); assert.equal(r.body.outstandingQuantity, 0);
    const balance = r.statements.find((s) => s.sql.startsWith("UPDATE inventory_balances"))!;
    assert.equal(balance.sql.includes("reserved="), false); assert.equal(balance.sql.includes("unit_cost="), false);
    const event = r.statements.find((s) => s.sql.includes("INSERT INTO inventory_return_events"))!;
    assert.equal(event.params[9], "1200.50"); assert.equal(r.statements.at(-1)!.sql, "COMMIT");
  }
});
test("partial return stays pending; overreturn, wrong condition and overuse are rejected", async () => {
  const partial = await run({ operation: "return", expected: 2 }); assert.equal(partial.body.status, "待歸回品項"); assert.equal(partial.body.outstandingQuantity, 1);
  for (const option of [{ operation: "return" as const, alreadyReturned: 1 }, { operation: "return" as const, condition: "reusable" },
    { operation: "cancel_picked" as const, returning: 1 }, { used: 3 }]) assert.equal((await run(option)).status, 400);
});
test("all disposition operations replay once and roll back if auditing fails", async () => {
  for (const operation of ["surgery_complete", "usage", "return", "cancel_picked"] as const) {
    const repeat = await run({ operation, previous: "same", version: 4 }); assert.equal(repeat.status, 200); assert.equal(repeat.statements.some((s) => s.sql.startsWith("UPDATE")), false);
    assert.equal((await run({ operation, previous: "changed" })).status, 409);
    const failed = await run({ operation, auditFailure: true }); assert.equal(failed.status, 400); assert.equal(failed.statements.at(-1)!.sql, "ROLLBACK");
  }
});
test("workflow, version, clinic and doctor visibility checks precede mutations", async () => {
  for (const option of [{ version: 4 }, { status: "已完成" }, { access: false }, { visible: false }]) {
    const r = await run(option); assert.ok([403, 404, 409].includes(r.status)); assert.equal(r.statements.some((s) => s.sql.startsWith("UPDATE")), false);
  }
  for (const role of ["Procurement", "Accountant"] as const) { const r = await run({ role }); assert.equal(r.status, 403); assert.equal(r.statements.length, 0); }
});
