import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { decodeAssetDataUrl, verifyStoredAsset } from "../src/assetData.js";
import { loadConfig } from "../src/config.js";

import { imageDataUrl } from "./assetFixture.js";

test("asset hash pins both original Data URL and decoded bytes", () => {
  const asset = decodeAssetDataUrl(imageDataUrl);
  assert.equal(asset.dataUrlSha256, createHash("sha256").update(imageDataUrl).digest("hex"));
  assert.equal(asset.dataUrlBytes, Buffer.byteLength(imageDataUrl));
  assert.doesNotThrow(() => verifyStoredAsset(asset.bytes, asset.contentSha256, asset.bytes.length));
  assert.throws(() => verifyStoredAsset(Buffer.from("changed"), asset.contentSha256, asset.bytes.length));
  assert.throws(() => verifyStoredAsset(asset.bytes, "0".repeat(64), asset.bytes.length));
});

test("assets reject active content, MIME spoofing, malformed base64 and oversized bytes", () => {
  for (const value of [null, "data:image/svg+xml;base64,PHN2Zz4=", imageDataUrl.replace("image/png", "image/jpeg"),
    imageDataUrl.slice(0, -1), "data:image/png;base64,aGVsbG8=", "data:image/png;base64," + Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64")]) {
    assert.throws(() => decodeAssetDataUrl(value));
  }
});

test("storage configuration requires a pinned bucket owner and region", () => {
  const base = { DATABASE_URL: "postgresql://localhost/test", NODE_ENV: "test" };
  assert.equal(loadConfig(base).assetStorage, undefined);
  assert.throws(() => loadConfig({ ...base, ASSET_BUCKET: "test-assets" }));
  assert.throws(() => loadConfig({ ...base, ASSET_BUCKET: "test-assets", ASSET_REGION: "ap-northeast-1", ASSET_BUCKET_OWNER: "wrong" }));
  assert.deepEqual(loadConfig({ ...base, ASSET_BUCKET: "test-assets", ASSET_REGION: "ap-northeast-1", ASSET_BUCKET_OWNER: "123456789012" }).assetStorage,
    { bucket: "test-assets", region: "ap-northeast-1", expectedBucketOwner: "123456789012" });
});
