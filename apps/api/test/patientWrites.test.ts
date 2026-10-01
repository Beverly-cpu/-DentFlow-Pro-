import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { registerPatientWriteRoutes } from "../src/routes/patientWriteRoutes.js";

async function run(options: { method?: "POST" | "PUT" | "DELETE"; role?: SessionPrincipal["role"]; access?: boolean;
  stale?: boolean; exists?: boolean; auditFailure?: boolean; doctors?: number; body?: Record<string, unknown>; duplicate?: boolean } = {}) {
  const statements: { sql: string; params: unknown[] }[] = []; let released = false;
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: options.access === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("SELECT u.id,u.display_name")) return { rows: Array.from({ length: options.doctors ?? 1 }, () => ({ id: "20", name: "Central doctor" })), rowCount: 1 };
    if ((sql.includes("INSERT INTO patients") || sql.includes("UPDATE patients")) && options.duplicate) throw Object.assign(new Error("duplicate"), { code: "23505", constraint: "patients_chart_number_unique" });
    if (sql.includes("INSERT INTO patients")) return { rows: [{ id: "50" }], rowCount: 1 };
    if (sql.includes("UPDATE patients")) return { rows: options.stale ? [] : [{ version: 2 }], rowCount: 1 };
    if (sql.includes("SELECT 1 FROM patients")) return { rows: options.exists === false ? [] : [{ ok: 1 }], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit unavailable");
    if (sql.includes("FROM patients")) return { rows: [{ id: 50, version: 2, doctorUserId: 20 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, connect: async () => ({ query, release() { released = true; } }) } as unknown as DatabasePool;
  const app = Fastify(); app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => { request.principal = { userId: 1, role: options.role ?? "Admin", sessionId: "session", deviceId: "device", clinicId: 10 }; });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerPatientWriteRoutes(app, pool);
  const method = options.method ?? "PUT";
  const response = await app.inject({ method, url: method === "POST" ? "/v1/patients" : "/v1/patients/50" + (method === "DELETE" ? "?clinicId=10&expectedVersion=1" : ""),
    ...(method === "DELETE" ? {} : { payload: { clinicId: 10, chartNumber: "A001", name: "Patient", expectedVersion: 1, doctorUserId: 20, doctor: "Untrusted label", ...options.body } }),
  });
  await app.close(); return { status: response.statusCode, body: response.json(), statements, released };
}

test("patient create, edit and archive commit audit in the same transaction", async () => {
  for (const method of ["POST", "PUT", "DELETE"] as const) {
    const result = await run({ method }); assert.equal(result.status, 200);
    assert.equal(result.statements[0]!.sql, "BEGIN"); assert.equal(result.statements.at(-1)!.sql, "COMMIT");
    assert.ok(result.statements.some((s) => s.sql.includes("INSERT INTO audit_events"))); assert.equal(result.released, true);
    if (method !== "DELETE") {
      const mutation = result.statements.find((s) => s.sql.includes(method === "POST" ? "INSERT INTO patients" : "UPDATE patients"))!;
      const offset = method === "POST" ? 4 : 5;
      assert.equal(mutation.params[offset], 20); assert.equal(mutation.params[offset + 1], "Central doctor");
    }
  }
});
test("all patient writes roll back when audit fails", async () => {
  for (const method of ["POST", "PUT", "DELETE"] as const) {
    const r = await run({ method, auditFailure: true }); assert.equal(r.status, 400);
    assert.equal(r.statements.at(-1)!.sql, "ROLLBACK"); assert.equal(r.statements.some((s) => s.sql === "COMMIT"), false);
  }
});
test("stale edits and archives report conflict without audit or overwrite; hidden cases return 404", async () => {
  for (const method of ["PUT", "DELETE"] as const) {
    const r = await run({ method, stale: true }); assert.equal(r.status, 409); assert.equal(r.body.error, "version_conflict");
    assert.equal(r.statements.some((s) => s.sql.includes("INSERT INTO audit_events")), false);
    assert.equal((await run({ method, stale: true, exists: false })).status, 404);
  }
});
test("roles and revoked clinic access cannot mutate", async () => {
  for (const role of ["Doctor", "Accountant", "Procurement"] as const) {
    const r = await run({ role }); assert.equal(r.status, 403); assert.equal(r.statements.length, 0);
  }
  const r = await run({ access: false }); assert.equal(r.status, 403); assert.equal(r.statements.some((s) => s.sql.includes("UPDATE patients")), false);
});
test("ambiguous or inactive doctor, missing version, impossible date and duplicate chart are rejected", async () => {
  for (const options of [{ doctors: 0 }, { doctors: 2, body: { doctorUserId: undefined, doctor: "Same name" } },
    { body: { expectedVersion: undefined } }, { body: { birthDate: "2026-02-30" } }, { body: { name: {} } }, { body: { doctorUserId: null, doctor: "Mismatch" } }]) {
    assert.equal((await run(options)).status, 400);
  }
  const duplicate = await run({ duplicate: true }); assert.equal(duplicate.status, 409); assert.equal(duplicate.body.error, "chart_number_conflict");
});
