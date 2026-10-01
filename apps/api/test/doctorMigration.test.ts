import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { registerDoctorMigrationRoutes } from "../src/routes/doctorMigrationRoutes.js";

async function runImport(options: {
  role?: SessionPrincipal["role"];
  sourceId?: string;
  target?: boolean;
  existingUserId?: string;
  incompatible?: boolean;
  auditFailure?: boolean;
  count?: number;
} = {}) {
  const statements: string[] = [];
  let released = false;
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql.includes("FROM clinics c")) return { rows: options.target === false ? [] : [{ clinicId: "10", userId: "20" }], rowCount: 1 };
      if (sql.includes('SELECT doctor_user_id AS "userId"')) return {
        rows: options.existingUserId ? [{ userId: options.existingUserId }] : [], rowCount: options.existingUserId ? 1 : 0,
      };
      if (sql.includes("doctor_user_id<>")) return { rows: [], rowCount: options.incompatible ? 1 : 0 };
      if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit unavailable");
      return { rows: [], rowCount: 1 };
    },
    release() { released = true; },
  };
  const pool = { async connect() { return client; } } as unknown as DatabasePool;
  const app = Fastify();
  app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => {
    request.principal = {
      sessionId: "session", userId: 1, role: options.role ?? "Admin", clinicId: 10, deviceId: "device-a",
    };
  });
  await registerDoctorMigrationRoutes(app, pool);
  const response = await app.inject({
    method: "POST", url: "/v1/migrations/doctors/import",
    payload: {
      sourceId: options.sourceId ?? "device-a",
      doctors: Array.from({ length: options.count ?? 1 }, () => ({ legacyId: 7, clinicCode: "TPE", account: "doctor" })),
    },
  });
  await app.close();
  return { status: response.statusCode, body: response.json(), statements, released };
}

test("doctor mapping commits with its audit event and releases the transaction", async () => {
  const result = await runImport();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { mapped: 1, unchanged: 0, conflicts: [] });
  assert.ok(result.statements.some((sql) => sql.includes("pg_advisory_xact_lock")));
  assert.ok(result.statements.some((sql) => sql.includes("INSERT INTO legacy_doctor_mappings")));
  assert.ok(result.statements.some((sql) => sql.includes("INSERT INTO audit_events")));
  assert.equal(result.statements.at(-1), "COMMIT");
  assert.equal(result.released, true);
});

test("repeat uploads leave the established doctor identity unchanged", async () => {
  const result = await runImport({ existingUserId: "20", role: "Assistant" });
  assert.equal(result.body.unchanged, 1);
  assert.equal(result.statements.some((sql) => sql.includes("INSERT INTO legacy_doctor_mappings")), false);
});

test("missing clinic access or doctor account records a conflict without mapping", async () => {
  const result = await runImport({ target: false });
  assert.equal(result.body.conflicts.length, 1);
  assert.equal(result.body.mapped, 0);
  assert.equal(result.statements.some((sql) => sql.includes("INSERT INTO legacy_doctor_mappings")), false);
});

test("existing and cross-clinic identity conflicts never overwrite a mapping", async () => {
  for (const options of [{ existingUserId: "99" }, { incompatible: true }]) {
    const result = await runImport(options);
    assert.equal(result.body.conflicts.length, 1);
    assert.equal(result.body.mapped, 0);
    assert.equal(result.statements.some((sql) => sql.includes("INSERT INTO legacy_doctor_mappings")), false);
  }
});

test("unauthorized roles and forged device IDs never open a transaction", async () => {
  for (const role of ["Doctor", "Accountant", "Procurement"] as const) {
    const result = await runImport({ role });
    assert.equal(result.status, 403);
    assert.equal(result.statements.length, 0);
  }
  const forged = await runImport({ sourceId: "device-b" });
  assert.equal(forged.status, 500);
  assert.equal(forged.statements.length, 0);
});

test("oversized batches are rejected before database changes", async () => {
  const result = await runImport({ count: 501 });
  assert.equal(result.statements.length, 0);
  assert.equal(result.status, 500);
});

test("an audit failure rolls back doctor mappings", async () => {
  const result = await runImport({ auditFailure: true });
  assert.equal(result.status, 500);
  assert.equal(result.statements.at(-1), "ROLLBACK");
  assert.equal(result.statements.includes("COMMIT"), false);
  assert.equal(result.released, true);
});
