import { loadConfig } from "./config.js";
import { createDatabasePool } from "./database.js";
import { runMigrations } from "./migrations.js";

const pool = createDatabasePool(loadConfig());

try {
  await runMigrations(pool);
  process.stdout.write("DentFlow database migrations completed.\n");
} finally {
  await pool.end();
}
