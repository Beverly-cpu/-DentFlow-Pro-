import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { DatabasePool } from "../src/database.js";
import type { SessionPrincipal } from "../src/auth.js";
import { registerDoctorDirectoryRoutes } from "../src/routes/doctorDirectoryRoutes.js";
async function run(role: SessionPrincipal["role"], allowed = true) {
  const statements: string[] = []; const query = async (sql: string) => { statements.push(sql); return { rows: sql.includes("SELECT 1 FROM user_clinics") ? allowed ? [{ ok: 1 }] : [] : [], rowCount: 1 }; };
  const app = Fastify(); app.decorateRequest("principal", null); app.addHook("preHandler", async r => { r.principal = { userId: 20, role, clinicId: 10, deviceId: "device", sessionId: "session" }; });
  await registerDoctorDirectoryRoutes(app, { query } as unknown as DatabasePool); const r = await app.inject("/v1/doctors?clinicId=10"); await app.close(); return { status: r.statusCode, statements };
}
test("central doctor directory is scoped, active, clinical-role only, Doctor self-only and audited", async () => {
  for (const role of ["Admin", "Assistant", "Doctor"] as const) { const r = await run(role); assert.equal(r.status, 200); assert.ok(r.statements.some(s => s.includes("u.role='Doctor' AND u.active=true") && s.includes("u.id=$3"))); assert.ok(r.statements.some(s => s.includes("INSERT INTO audit_events"))); }
  for (const role of ["Accountant", "Procurement"] as const) { const r = await run(role); assert.equal(r.status, 403); assert.equal(r.statements.length, 0); }
  assert.equal((await run("Assistant", false)).status, 403);
});
