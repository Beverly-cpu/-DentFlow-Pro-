import { createHash } from "node:crypto";

export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
export type AssetManifest = {
  table: string; legacyId: number; field: string; dataUrlSha256: string; dataUrlBytes: number;
};

export function decodeAssetDataUrl(value: unknown) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 15 * 1024 * 1024) throw new Error("資產資料超過上限或格式錯誤");
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new Error("照片與簽名僅支援 PNG、JPEG、WebP 或 GIF Base64 Data URL");
  const contentType = match[1]!; const encoded = match[2]!;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES || bytes.toString("base64") !== encoded) throw new Error("資產 Base64 格式錯誤或超過 10 MB");
  const valid = contentType === "image/png" ? bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      && bytes.subarray(12, 16).toString("ascii") === "IHDR"
    : contentType === "image/jpeg" ? bytes.length >= 4 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) && bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))
    : contentType === "image/webp" ? bytes.length >= 16 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP"
    : bytes.length >= 13 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  if (!valid) throw new Error("資產內容與宣告的圖片格式不符");
  return { bytes, contentType, contentSha256: createHash("sha256").update(bytes).digest("hex"),
    dataUrlSha256: createHash("sha256").update(value, "utf8").digest("hex"), dataUrlBytes: Buffer.byteLength(value, "utf8") };
}

export function verifyStoredAsset(bytes: Uint8Array, hash: string, size: number) {
  if (bytes.byteLength !== size || createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error("物件儲存資產完整性驗證失敗");
}
