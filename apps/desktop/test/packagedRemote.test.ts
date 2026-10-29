import assert from "node:assert/strict";
import { test } from "node:test";
import { getDeploymentConfig } from "../electron/remote/serverConnection";

test("packaged app fails closed without server URL", () => {
  const before = process.env.DENTFLOW_SERVER_URL;
  const required = process.env.DENTFLOW_REQUIRE_REMOTE;
  try {
    delete process.env.DENTFLOW_SERVER_URL;
    delete process.env.DENTFLOW_REQUIRE_REMOTE;
    assert.throws(() => getDeploymentConfig(true), /DENTFLOW_SERVER_URL/);
    assert.equal(getDeploymentConfig(false).mode, "local");
  } finally {
    if (before === undefined) delete process.env.DENTFLOW_SERVER_URL;
    else process.env.DENTFLOW_SERVER_URL = before;
    if (required === undefined) delete process.env.DENTFLOW_REQUIRE_REMOTE;
    else process.env.DENTFLOW_REQUIRE_REMOTE = required;
  }
});

test("packaged app with HTTPS server URL uses remote mode", () => {
  const before = process.env.DENTFLOW_SERVER_URL;
  try {
    process.env.DENTFLOW_SERVER_URL = "https://api.example.test";
    assert.equal(getDeploymentConfig(true).mode, "remote");
  } finally {
    if (before === undefined) delete process.env.DENTFLOW_SERVER_URL;
    else process.env.DENTFLOW_SERVER_URL = before;
  }
});
