import pg from "pg";

import type { ApiConfig } from "./config.js";

const { Pool } = pg;

export function createDatabasePool(config: ApiConfig) {
  return new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
    application_name: "dentflow-api",
  });
}

export type DatabasePool = ReturnType<typeof createDatabasePool>;
