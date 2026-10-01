import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { implantDraftHash, validateImplantDraft } from "../src/implantDraft.js";
import { registerImplantDraftRoutes } from "../src/routes/implantDraftRoutes.js";
import { draftRequestId, implantDraftFixture } from "./implantDraftFixture.js";

async function run(options: { operation?: "create" | "update" | "cancel" | "read" | "list"; role?: SessionPrincipal["role"];
  access?: boolean; patient?: boolean; doctor?: boolean; visible?: boolean; existing?: "same" | "changed";
  version?: number; status?: string; staged?: boolean; auditFailure?: boolean } = {}) {
  const statements: { sql: string; params: unknown[] }[] = []; let released = false;
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: options.access === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM patients")) return { rows: options.patient === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM users")) return { rows: options.doctor === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT id,clinic_id")) return { rows: options.existing ? [{ id: "40", clinicId: "10", hash: options.existing === "same" ? implantDraftHash(validateImplantDraft(implantDraftFixture())) : "different" }] : [], rowCount: 1 };
    if (sql.includes("SELECT version,status")) return { rows: options.staged ? [] : [{ version: options.version ?? 1, status: options.status ?? "待醫師叫貨" }], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM implant_cases")) return { rows: options.visible === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("INSERT INTO implant_cases")) return { rows: [{ id: "40" }], rowCount: 1 };
    if (sql.includes("INSERT INTO implant_draft_teeth")) return { rows: [{ id: "60" }], rowCount: 1 };
    if (sql.includes("FROM implant_draft_teeth")) return { rows: [{ id: 60, toothPosition: "36" }], rowCount: 1 };
    if (sql.includes("FROM implant_draft_plan_items")) return { rows: [{ id: 70, toothId: 60, quantity: 1 }], rowCount: 1 };
    if (sql.includes("FROM implant_cases i JOIN patients")) return { rows: [{ id: 40, clinicId: 10, patientId: 50, migrationState: "central_draft", version: 1 }], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit failure");
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, connect: async () => ({ query, release() { released = true; } }) } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => { request.principal = { userId: 1, role: options.role ?? "Admin", sessionId: "session", deviceId: "device", clinicId: 10 }; });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerImplantDraftRoutes(app, pool);
  const operation = options.operation ?? "create";
  const response = await app.inject(operation === "read" || operation === "list" ? { method: "GET", url: `/v1/implants${operation === "read" ? "/40" : ""}?clinicId=10` } : {
    method: operation === "update" ? "PUT" : "POST", url: `/v1/implants${operation === "create" ? "" : "/40"}${operation === "cancel" ? "/cancel" : ""}`,
    payload: operation === "cancel" ? { clinicId: 10, expectedVersion: 1, reason: "Cancelled before ordering" }
      : { ...implantDraftFixture(), ...(operation === "create" ? { requestId: draftRequestId } : { expectedVersion: 1 }) },
  });
  await app.close(); return { status: response.statusCode, body: response.json(), statements, released };
}
test("draft creation stores central IDs, specification plans and audit atomically", async () => {
  const r = await run(); assert.equal(r.status, 200); assert.equal(r.body.unchanged, false);
  const insert = r.statements.find((s) => s.sql.includes("INSERT INTO implant_cases"))!;
  assert.deepEqual(insert.params.slice(0, 3), [10, 50, 20]); assert.match(insert.sql, /central_draft/);
  assert.ok(r.statements.some((s) => s.sql.includes("INSERT INTO implant_draft_plan_items")));
  assert.equal(r.statements.at(-1)!.sql, "COMMIT"); assert.equal(r.released, true);
  assert.equal(r.statements.some((s) => /inventory|reservation/i.test(s.sql)), false);
});
test("identical create retry returns existing case; changed request never inserts", async () => {
  const same = await run({ existing: "same" }); assert.equal(same.status, 200); assert.equal(same.body.unchanged, true);
  assert.equal(same.statements.some((s) => s.sql.includes("INSERT INTO implant_cases")), false);
  const changed = await run({ existing: "changed" }); assert.equal(changed.status, 409); assert.equal(changed.body.error, "request_conflict");
});
test("update and cancel reject stale, canceled and staged cases before mutations", async () => {
  for (const operation of ["update", "cancel"] as const) for (const option of [{ version: 2 }, { status: "已取消" }, { staged: true }]) {
    const r = await run({ operation, ...option }); assert.ok([404, 409].includes(r.status));
    assert.equal(r.statements.some((s) => s.sql.includes("UPDATE implant_cases") || s.sql.startsWith("DELETE")), false);
  }
});
test("every draft mutation rolls back when auditing fails", async () => {
  for (const operation of ["create", "update", "cancel"] as const) {
    const r = await run({ operation, auditFailure: true }); assert.equal(r.status, 400);
    assert.equal(r.statements.at(-1)!.sql, "ROLLBACK"); assert.equal(r.statements.some((s) => s.sql === "COMMIT"), false);
  }
});
test("roles, clinic permissions and central references prevent unauthorized writes", async () => {
  for (const role of ["Doctor", "Accountant", "Procurement"] as const) { const r = await run({ role }); assert.equal(r.status, 403); assert.equal(r.statements.length, 0); }
  for (const option of [{ access: false }, { patient: false }, { doctor: false }]) {
    const r = await run(option); assert.ok([400, 403].includes(r.status)); assert.equal(r.statements.some((s) => s.sql.includes("INSERT INTO implant_cases")), false);
  }
});
test("reads keep authorization, case and child queries in one consistent snapshot", async () => {
  const r = await run({ operation: "read", role: "Doctor" }); assert.equal(r.status, 200);
  assert.equal(r.statements[0]!.sql, "BEGIN ISOLATION LEVEL REPEATABLE READ");
  assert.equal(r.body.teeth[0].items[0].id, 70); assert.equal(r.statements.at(-1)!.sql, "COMMIT");
  assert.equal((await run({ operation: "read", visible: false, role: "Doctor" })).status, 404);
  assert.equal((await run({ operation: "list", role: "Accountant" })).status, 403);
  const list = await run({ operation: "list", role: "Doctor" }); assert.equal(list.status, 200);
  const query = list.statements.find((s) => s.sql.includes("LIMIT 100"))!; assert.deepEqual(query.params.slice(-2), ["Doctor", 1]);
});
