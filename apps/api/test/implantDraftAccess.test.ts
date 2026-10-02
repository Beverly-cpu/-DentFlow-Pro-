import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { DatabasePool } from "../src/database.js";
import type { SessionPrincipal } from "../src/auth.js";
import { registerImplantDraftRoutes } from "../src/routes/implantDraftRoutes.js";
test("draft journal permission check uses current session actor, role and clinic access", async () => {
  for (const role of ["Admin", "Assistant", "Doctor", "Accountant", "Procurement"] as const) {
    const app = Fastify(); app.decorateRequest("principal", null); app.addHook("preHandler", async r => { r.principal = { role: role as SessionPrincipal["role"], userId: 20, clinicId: 10, deviceId: "device", sessionId: "session" }; });
    const query = async () => ({ rows: [{}], rowCount: 1 }); await registerImplantDraftRoutes(app, { query } as unknown as DatabasePool);
    const result = await app.inject("/v1/implants/draft-access?clinicId=10");
    if (["Accountant", "Procurement"].includes(role)) assert.equal(result.statusCode, 403);
    else { assert.equal(result.statusCode, 200); assert.equal(result.json().actorUserId, 20); assert.equal(result.json().canWrite, role !== "Doctor"); }
    await app.close();
  }
});
