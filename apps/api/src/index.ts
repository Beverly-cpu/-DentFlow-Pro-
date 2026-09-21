import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabasePool } from "./database.js";
import { runMigrations } from "./migrations.js";

const config = loadConfig();
const pool = createDatabasePool(config);
const app = buildApp(config, pool);

async function shutdown(signal: string) {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await runMigrations(pool);
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.fatal({ err: error }, "DentFlow API failed to start");
  await pool.end();
  process.exitCode = 1;
}
