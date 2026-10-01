import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { SessionPrincipal } from "../src/auth.js";
import type { DatabasePool } from "../src/database.js";
import { registerInventoryRoutes } from "../src/routes/inventoryRoutes.js";
async function run(role: SessionPrincipal["role"], access = true, found = true) {
  const sqls: string[] = []; const query = async (sql: string) => { sqls.push(sql); if (sql.includes("SELECT 1 FROM user_clinics")) return { rows: access ? [{}] : [], rowCount: 1 }; if (sql.includes("SELECT 1 FROM inventory_batches")) return { rows: found ? [{}] : [], rowCount: 1 }; return { rows: sql.includes("FROM legacy_inventory_mappings") ? [{ sourceId: "device-a", legacyInventoryId: 5, snapshot: { quantity: 99, unitCost: 123 } }] : [], rowCount: 1 }; };
  const app = Fastify(); app.decorateRequest("principal", null); app.addHook("preHandler", async r => { r.principal = { role, userId: 1, clinicId: 10, deviceId: "device", sessionId: "session" }; });
  await registerInventoryRoutes(app, { query } as unknown as DatabasePool); const result = await app.inject("/v1/inventory/50/sources?clinicId=10"); await app.close(); return { status: result.statusCode, body: result.json(), sqls };
}
test("source inspection is admin-only, scoped and audited, with snapshots independent of opening quantities", async () => {
  const result = await run("Admin"); assert.equal(result.status, 200); assert.equal(result.body.items[0].snapshot.quantity, 99); assert.ok(result.sqls.some(s => s.includes("INSERT INTO audit_events"))); assert.ok(result.sqls.some(s => s.includes("inventory_batch_id=$1 AND clinic_id=$2")));
  for (const role of ["Doctor", "Assistant", "Accountant", "Procurement"] as const) { const denied = await run(role); assert.equal(denied.status, 403); assert.equal(denied.sqls.length, 0); }
  assert.equal((await run("Admin", false)).status, 403); assert.equal((await run("Admin", true, false)).status, 404);
});
