import helmet from "@fastify/helmet";
import Fastify from "fastify";

import type { ApiConfig } from "./config.js";
import type { DatabasePool } from "./database.js";
import { registerAuthHook } from "./auth.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerClinicRoutes } from "./routes/clinicRoutes.js";

export function buildApp(config: ApiConfig, pool: DatabasePool) {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    requestIdHeader: "x-request-id",
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
  });

  void app.register(helmet, {
    contentSecurityPolicy: false,
  });

  app.decorateRequest("principal", null);
  app.addHook("preHandler", registerAuthHook(pool));

  app.get("/health", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return {
        status: "ok",
        service: "dentflow-api",
        database: "ok",
        time: new Date().toISOString(),
      };
    } catch (error) {
      app.log.error({ err: error }, "database health check failed");
      return reply.code(503).send({
        status: "unavailable",
        service: "dentflow-api",
        database: "unavailable",
        time: new Date().toISOString(),
      });
    }
  });

  app.get("/ready", async (_request, reply) => {
    try {
      const result = await pool.query<{ pending: string }>(`
        SELECT count(*)::text AS pending
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'schema_migrations'
      `);
      if (result.rows[0]?.pending !== "1") throw new Error("database migrations not initialized");
      return { status: "ready", service: "dentflow-api" };
    } catch (error) {
      app.log.warn({ err: error }, "readiness check failed");
      return reply.code(503).send({ status: "not-ready", service: "dentflow-api" });
    }
  });

  void registerAuthRoutes(app, pool);
  void registerClinicRoutes(app, pool);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    const message = error instanceof Error ? error.message : "伺服器錯誤";
    void reply.code(400).send({ error: "request_failed", message });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: "not_found", message: "找不到 API 路徑" });
  });

  return app;
}
