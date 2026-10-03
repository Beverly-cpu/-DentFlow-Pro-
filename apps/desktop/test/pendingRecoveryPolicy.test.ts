import assert from "node:assert/strict";
import test from "node:test";
import { CentralApiError } from "../electron/remote/centralApiError";
import { canClearPendingAfterError } from "../electron/remote/pendingRecoveryPolicy";

test("deterministic client errors may clear the encrypted pending request", () => {
  for (const status of [400, 403, 404, 409]) {
    assert.equal(canClearPendingAfterError(new CentralApiError(status, "deterministic", "known result")), true);
  }
});

test("network, server and unknown errors preserve the exact pending request for retry", () => {
  assert.equal(canClearPendingAfterError(new Error("network failed")), false);
  assert.equal(canClearPendingAfterError(new CentralApiError(500, "server_error", "uncertain result")), false);
  assert.equal(canClearPendingAfterError(new CentralApiError(503, "unavailable", "uncertain result")), false);
});
