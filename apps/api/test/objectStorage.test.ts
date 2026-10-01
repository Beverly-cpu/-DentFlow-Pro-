import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { GetObjectCommand, GetPublicAccessBlockCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPrivateObjectStorage } from "../src/objectStorage.js";
import { loadConfig } from "../src/config.js";

test("S3 writes pin owner, enable encryption and checksum, and require all public blocks", async () => {
  const commands: { input: Record<string, unknown> }[] = []; let privateBucket = true;
  const client = { async send(command: GetObjectCommand | GetPublicAccessBlockCommand | PutObjectCommand) {
    commands.push(command as unknown as { input: Record<string, unknown> });
    if (command instanceof GetPublicAccessBlockCommand) return { PublicAccessBlockConfiguration: {
      BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: privateBucket,
    } };
    if (command instanceof GetObjectCommand) return { Body: Readable.from([Buffer.from("bytes")]), ContentLength: 5 };
    return {};
  } } as unknown as Pick<S3Client, "send">;
  const config = loadConfig({ DATABASE_URL: "postgresql://localhost/test", ASSET_BUCKET: "test-assets", ASSET_REGION: "ap-northeast-1", ASSET_BUCKET_OWNER: "123456789012" });
  const store = createPrivateObjectStorage(config, client)!;
  await store.put("key", Buffer.from("bytes"), "image/png", "a".repeat(64));
  assert.equal(commands[1]!.input.ExpectedBucketOwner, "123456789012");
  assert.equal(commands[1]!.input.ServerSideEncryption, "AES256");
  assert.equal(commands[1]!.input.ACL, undefined);
  assert.equal(commands[1]!.input.ChecksumSHA256, Buffer.from("a".repeat(64), "hex").toString("base64"));
  assert.equal(Buffer.from(await store.get("key")).toString(), "bytes");
  privateBucket = false; const before = commands.length;
  await assert.rejects(store.put("key", Buffer.from("bytes"), "image/png", "a".repeat(64)));
  assert.equal(commands.length, before + 1);
  await assert.rejects(store.get("key"));
});
