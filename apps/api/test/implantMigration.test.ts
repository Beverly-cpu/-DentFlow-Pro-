import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { implantSnapshotHash, validateLegacyImplant } from "../src/legacyImplant.js";
import { registerImplantMigrationRoutes } from "../src/routes/implantMigrationRoutes.js";
import { implantFixture } from "./implantFixture.js";

async function run(options: {
  role?: SessionPrincipal["role"]; authenticated?: boolean; sourceId?: string;
  clinic?: boolean; patient?: boolean; doctor?: boolean; existing?: "same" | "changed" | "otherClinic";
  auditFailure?: boolean; count?: number; malformed?: boolean;
  review?: boolean; reviewAccess?: boolean;
} = {}) {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  let released = false;
  const query = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT c.id FROM clinics")) return { rows: options.clinic === false ? [] : [{ id: "10" }], rowCount: 1 };
    if (sql.includes("FROM legacy_implant_mappings m JOIN legacy_implant_snapshots")) return {
      rows: options.existing ? [{ clinicId: options.existing === "otherClinic" ? "99" : "10",
        hash: options.existing === "changed" ? "different" : implantSnapshotHash(validateLegacyImplant(implantFixture())), pendingAssets: 1 }] : [], rowCount: 1,
    };
    if (sql.includes("FROM legacy_patient_mappings")) return { rows: options.patient === false ? [] : [{ id: "30" }], rowCount: 1 };
    if (sql.includes("FROM legacy_doctor_mappings")) return { rows: options.doctor === false ? [] : [{ id: "20" }], rowCount: 1 };
    if (sql.includes("INSERT INTO implant_cases")) return { rows: [{ id: "40" }], rowCount: 1 };
    if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit unavailable");
    if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: [], rowCount: options.reviewAccess === false ? 0 : 1 };
    return { rows: [], rowCount: 1 };
  };
  const pool = { query, async connect() { return { query, release() { released = true; } }; } } as unknown as DatabasePool;
  const app = Fastify();
  app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => {
    if (options.authenticated === false) return;
    request.principal = { sessionId: "session", userId: 1, role: options.role ?? "Admin", clinicId: 10, deviceId: "device-a" };
  });
  app.setErrorHandler((error, _request, reply) => reply.code(400).send({ error: error instanceof Error ? error.message : "error" }));
  await registerImplantMigrationRoutes(app, pool);
  const payload = implantFixture();
  if (options.malformed) payload.snapshot.teeth[0]!.implantId = 99;
  const response = await app.inject(options.review ? { method: "GET", url: "/v1/migrations/implants?clinicId=10" } : {
    method: "POST", url: "/v1/migrations/implants/import", payload: {
      sourceId: options.sourceId ?? "device-a", implants: Array.from({ length: options.count ?? 1 }, () => payload),
    },
  });
  await app.close();
  return { status: response.statusCode, body: response.json(), statements, released };
}

test("implant core uses mapped central IDs while the immutable snapshot keeps legacy IDs", async () => {
  const result = await run();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { imported: 1, unchanged: 0, pendingAssets: 1, conflicts: [] });
  const core = result.statements.find((s) => s.sql.includes("INSERT INTO implant_cases"))!;
  assert.deepEqual(core.params.slice(0, 3), [10, 30, 20]);
  const snapshot = result.statements.find((s) => s.sql.includes("INSERT INTO legacy_implant_snapshots"))!;
  assert.equal(JSON.parse(String(snapshot.params[1])).case.patientId, 8);
  assert.equal(snapshot.params[3], 1);
  assert.equal(result.statements.at(-1)!.sql, "COMMIT");
  assert.equal(result.released, true);
});

test("identical repeats do not insert or overwrite a case", async () => {
  const result = await run({ existing: "same" });
  assert.equal(result.body.unchanged, 1);
  assert.equal(result.statements.some((s) => s.sql.includes("INSERT INTO implant_cases")), false);
});

test("changed contents, changed clinics, absent mappings and malformed children produce conflicts", async () => {
  for (const options of [{ existing: "changed" as const }, { existing: "otherClinic" as const },
    { patient: false }, { doctor: false }, { clinic: false }, { malformed: true }]) {
    const result = await run(options);
    assert.equal(result.body.conflicts.length, 1);
    assert.equal(result.body.imported, 0);
    assert.equal(result.statements.some((s) => s.sql.includes("INSERT INTO implant_cases")), false);
  }
});

test("untrusted roles, unauthenticated requests, device changes and oversized batches cannot write", async () => {
  for (const options of [{ role: "Doctor" as const }, { role: "Accountant" as const },
    { role: "Procurement" as const }, { authenticated: false }, { sourceId: "device-b" }, { count: 51 }]) {
    const result = await run(options);
    assert.notEqual(result.status, 200);
    assert.equal(result.statements.length, 0);
  }
});

test("audit failure rolls back the core, mapping and snapshot transaction", async () => {
  const result = await run({ auditFailure: true });
  assert.equal(result.status, 400);
  assert.equal(result.statements.at(-1)!.sql, "ROLLBACK");
  assert.equal(result.statements.some((s) => s.sql === "COMMIT"), false);
  assert.equal(result.released, true);
});

test("migration review requires current clinic access and a migration role", async () => {
  const authorized = await run({ review: true });
  assert.equal(authorized.status, 200);
  assert.deepEqual(authorized.body, { items: [], nextAfterId: null });
  const foreign = await run({ review: true, reviewAccess: false });
  assert.equal(foreign.status, 400);
  assert.equal(foreign.statements.some((s) => s.sql.includes("FROM implant_cases")), false);
  const doctor = await run({ review: true, role: "Doctor" });
  assert.equal(doctor.statements.length, 0);
});
