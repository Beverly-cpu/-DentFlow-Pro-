import { GetObjectCommand, GetPublicAccessBlockCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import type { ApiConfig } from "./config.js";
import { MAX_ASSET_BYTES } from "./assetData.js";

export interface PrivateObjectStorage {
  assertPrivate(): Promise<void>;
  put(key: string, bytes: Uint8Array, contentType: string, sha256: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

export function createPrivateObjectStorage(config: ApiConfig, suppliedClient?: Pick<S3Client, "send">): PrivateObjectStorage | undefined {
  if (!config.assetStorage) return undefined;
  const options = config.assetStorage;
  const client = suppliedClient ?? new S3Client({ region: options.region, maxAttempts: 2 });
  const bucket = { Bucket: options.bucket, ExpectedBucketOwner: options.expectedBucketOwner };
  const store: PrivateObjectStorage = {
    async assertPrivate() {
      const result = await client.send(new GetPublicAccessBlockCommand(bucket), { abortSignal: AbortSignal.timeout(30_000) });
      const block = result.PublicAccessBlockConfiguration;
      if (!block?.BlockPublicAcls || !block.IgnorePublicAcls || !block.BlockPublicPolicy || !block.RestrictPublicBuckets) {
        throw new Error("儲存桶必須啟用全部四項 Block Public Access");
      }
    },
    async put(key, bytes, contentType, sha256) {
      await store.assertPrivate();
      await client.send(new PutObjectCommand({ ...bucket, Key: key, Body: bytes, ContentType: contentType,
        ContentLength: bytes.byteLength, ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
        Metadata: { "content-sha256": sha256 },
        ServerSideEncryption: options.kmsKeyId ? "aws:kms" : "AES256",
        ...(options.kmsKeyId ? { SSEKMSKeyId: options.kmsKeyId } : {}),
      }), { abortSignal: AbortSignal.timeout(30_000) });
    },
    async get(key) {
      await store.assertPrivate();
      const signal = AbortSignal.timeout(30_000);
      const result = await client.send(new GetObjectCommand({ ...bucket, Key: key }), { abortSignal: signal });
      if (!result.Body || result.ContentLength === undefined || result.ContentLength <= 0 || result.ContentLength > MAX_ASSET_BYTES) throw new Error("儲存資產大小超過上限或不存在");
      const body = result.Body;
      // Bound streamed bytes as well as the declared Content-Length.
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        signal.throwIfAborted(); size += chunk.byteLength;
        if (size > MAX_ASSET_BYTES) throw new Error("儲存資產大小超過上限");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
  };
  return store;
}
