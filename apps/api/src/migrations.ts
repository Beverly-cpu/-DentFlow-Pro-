import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { DatabasePool } from "./database.js";

const migrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

export async function runMigrations(pool: DatabasePool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [742_019_337]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name))
      .sort();

    for (const name of files) {
      const alreadyApplied = await client.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1) AS exists",
        [name],
      );
      if (alreadyApplied.rows[0]?.exists) continue;

      const sql = await readFile(path.join(migrationsDirectory, name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [742_019_337]).catch(() => undefined);
    client.release();
  }
}
