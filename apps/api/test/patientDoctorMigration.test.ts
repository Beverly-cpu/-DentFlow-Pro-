import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import type { DatabasePool } from "../src/database.js";
import { registerPatientRoutes } from "../src/routes/patientRoutes.js";

async function importPatient(options: {
  matchCount?: number; doctorMapped?: boolean; assignedDoctor?: string | null;
  storedName?: string; auditFailure?: boolean;
} = {}) {
  const statements: string[] = [];
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql.includes("SELECT c.id FROM clinics")) return { rows: [{ id: "10" }], rowCount: 1 };
      if (sql.includes("FROM legacy_doctor_mappings")) return { rows: options.doctorMapped === false ? [] : [{ id: "20" }], rowCount: 1 };
      if (sql.includes('SELECT patient_id AS "patientId"')) return { rows: [{ patientId: "30", clinicId: "10" }], rowCount: 1 };
      if (sql.includes("FROM patients WHERE id=$1 FOR UPDATE")) return {
        rows: [{ doctorUserId: options.assignedDoctor ?? null, doctorName: options.storedName ?? "王醫師" }], rowCount: 1,
      };
      if (sql.includes("INSERT INTO audit_events") && options.auditFailure) throw new Error("audit unavailable");
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const app = Fastify();
  app.decorateRequest("principal", null);
  app.addHook("preHandler", async (request) => {
    request.principal = { sessionId: "session", userId: 1, role: "Admin", clinicId: 10, deviceId: "device-a" };
  });
  await registerPatientRoutes(app, { async connect() { return client; } } as unknown as DatabasePool);
  const response = await app.inject({ method: "POST", url: "/v1/migrations/patients/import", payload: {
    sourceId: "device-a", patients: [{ legacyId: 7, clinicCode: "TPE", chartNumber: "A001", name: "測試病患",
      doctor: "王醫師", legacyDoctorId: 8, doctorMatchCount: options.matchCount ?? 1 }],
  } });
  await app.close();
  return { status: response.statusCode, body: response.json(), statements };
}

test("a previously imported patient can gain a verified doctor association", async () => {
  const result = await importPatient();
  assert.equal(result.status, 200);
  assert.equal(result.body.conflicts.length, 0);
  assert.ok(result.statements.includes("UPDATE patients SET doctor_user_id=$2 WHERE id=$1"));
  assert.equal(result.statements.at(-1), "COMMIT");
});

test("ambiguous local names and missing central mappings cannot assign a doctor", async () => {
  for (const options of [{ matchCount: 2 }, { matchCount: 0 }, { doctorMapped: false }]) {
    const result = await importPatient(options);
    assert.equal(result.body.conflicts.length, 1);
    assert.equal(result.statements.some((sql) => sql.startsWith("UPDATE patients")), false);
  }
});

test("existing doctor assignments and changed names are protected", async () => {
  for (const options of [{ assignedDoctor: "99" }, { storedName: "李醫師" }]) {
    const result = await importPatient(options);
    assert.equal(result.body.conflicts.length, 1);
    assert.equal(result.statements.some((sql) => sql.startsWith("UPDATE patients")), false);
  }
  const same = await importPatient({ assignedDoctor: "20" });
  assert.equal(same.body.conflicts.length, 0);
  assert.equal(same.statements.some((sql) => sql.startsWith("UPDATE patients")), false);
});

test("patient doctor repair rolls back when its audit cannot be saved", async () => {
  const result = await importPatient({ auditFailure: true });
  assert.equal(result.status, 500);
  assert.equal(result.statements.at(-1), "ROLLBACK");
  assert.equal(result.statements.includes("COMMIT"), false);
});
