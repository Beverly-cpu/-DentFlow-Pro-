import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { assertPassword, isRole, normalizeAccount } from "../src/auth.js";

test("loadConfig requires a database URL", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "test" }), /DATABASE_URL/);
});

test("loadConfig uses safe production defaults", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://example.invalid/dentflow",
  });
  assert.equal(config.databaseSsl, true);
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8787);
});

test("loadConfig accepts explicit local database settings", () => {
  const config = loadConfig({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://localhost/dentflow",
    DATABASE_SSL: "false",
    PORT: "9000",
  });
  assert.equal(config.databaseSsl, false);
  assert.equal(config.port, 9000);
});

test("authentication input helpers normalize and validate", () => {
  assert.equal(normalizeAccount("  Admin@Clinic  "), "admin@clinic");
  assert.equal(isRole("Doctor"), true);
  assert.equal(isRole("Owner"), false);
  assert.doesNotThrow(() => assertPassword("12345678"));
  assert.throws(() => assertPassword("short"), /8/);
});
