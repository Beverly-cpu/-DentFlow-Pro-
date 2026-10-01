import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { validateWithdrawal, withdrawalHash } from "../src/implantWithdrawal.js";
import { registerImplantWithdrawalRoutes } from "../src/routes/implantWithdrawalRoutes.js";

async function run(options: { role?: SessionPrincipal["role"]; ledger?: boolean; access?: boolean; visible?: boolean; status?: string;
  version?: number; confirmationMismatch?: boolean; shortage?: boolean; expired?: boolean; previous?: "same" | "changed"; auditFailure?: boolean } = {}) {
  const reservationId = "00000000-0000-4000-8000-000000000002";
  const payload = { clinicId: 10, expectedVersion: 2, requestId: "00000000-0000-4000-8000-000000000001", confirmations: [{ reservationId, quantity: 2 }] };
  const statements: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: options.access === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT version,status")) return { rows: options.visible === false ? [] : [{ version: options.version ?? 2, status: options.status ?? "醫師已叫貨", patientId: "50" }], rowCount: 1 };
    if (sql.includes("SELECT request_hash AS")) return { rows: options.previous ? [{ hash: options.previous === "same" ? withdrawalHash(1, validateWithdrawal(payload)) : "changed", result: { id: 1, version: 3 } }] : [], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM patients")) return { rows: [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT id,inventory_batch_id")) return { rows: [{ id: reservationId, batchId: 40, quantity: options.confirmationMismatch ? 1 : 2 }], rowCount: 1 };
    if (sql.includes("FROM inventory_batches b JOIN inventory_balances")) return { rows: [{ id: 40, onHand: options.shortage ? 1 : 5, reserved: 2, unitCost: "1200.50", expired: options.expired ?? false }], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit failure");
    if (sql.includes("FROM inventory_withdrawal_events")) return { rows: [{ quantity: 2, unitCost: "1200.50", totalCost: "2401.00" }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => { request.principal = { userId: 20, role: options.role ?? "Doctor", sessionId: "session", clinicId: 10, deviceId: "device" }; });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerImplantWithdrawalRoutes(app, pool);
  const response = await app.inject(options.ledger ? { method: "GET", url: "/v1/implants/1/withdrawal-ledger?clinicId=10" } : { method: "POST", url: "/v1/implants/1/withdraw", payload });
  await app.close(); return { status: response.statusCode, body: response.json(), statements };
}
test("withdrawal debits on-hand and reserved once, snapshots server cost and commits all records", async () => {
  const r = await run(); assert.equal(r.status, 200); assert.equal(r.body.version, 3);
  assert.deepEqual(r.statements.find((s) => s.sql.startsWith("UPDATE inventory_balances"))!.params, [40, 2]);
  const picked = r.statements.find((s) => s.sql.startsWith("UPDATE implant_stock_reservations"))!;
  assert.deepEqual(picked.params.slice(1), ["1200.50", 20]);
  const event = r.statements.find((s) => s.sql.includes("INSERT INTO inventory_withdrawal_events"))!;
  assert.deepEqual(event.params.slice(2), [40, 10, 2, "1200.50", -2, 3, 0]);
  assert.equal(r.body.unitCost, undefined); assert.equal(r.statements.at(-1)!.sql, "COMMIT");
});
test("retry bypasses duplicate debit while changed request conflicts", async () => {
  const r = await run({ previous: "same", version: 3, status: "已取出待手術" }); assert.equal(r.status, 200); assert.equal(r.body.unchanged, true);
  assert.equal(r.statements.some((s) => s.sql.startsWith("UPDATE")), false);
  assert.equal((await run({ previous: "changed" })).body.error, "request_conflict");
});
test("missing confirmations, stale versions, expired lots and invalid workflow never debit", async () => {
  for (const option of [{ confirmationMismatch: true }, { version: 3 }, { expired: true }, { shortage: true }, { status: "已取出待手術" }]) {
    const r = await run(option); assert.ok([400, 409].includes(r.status)); assert.equal(r.statements.some((s) => s.sql.startsWith("UPDATE inventory_balances")), false);
  }
});
test("audit failure rolls back debit, pick records, request and cost events", async () => {
  const r = await run({ auditFailure: true }); assert.equal(r.status, 400); assert.equal(r.statements.at(-1)!.sql, "ROLLBACK");
});
test("clinical write authorization and financial cost isolation are enforced", async () => {
  for (const role of ["Accountant", "Procurement"] as const) assert.equal((await run({ role })).status, 403);
  assert.equal((await run({ visible: false })).status, 404); assert.equal((await run({ access: false })).status, 403);
  for (const role of ["Doctor", "Assistant"] as const) { const r = await run({ ledger: true, role }); assert.equal(r.status, 403); assert.equal(r.statements.length, 0); }
  for (const role of ["Admin", "Accountant", "Procurement"] as const) assert.equal((await run({ ledger: true, role })).status, 200);
});
