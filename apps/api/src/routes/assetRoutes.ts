import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import { audit, requireAdmin, requireSession } from "../auth.js";
import { decodeAssetDataUrl, verifyStoredAsset } from "../assetData.js";
import type { AssetManifest } from "../assetData.js";
import type { DatabasePool } from "../database.js";
import { positiveId } from "../legacyImplant.js";
import type { PrivateObjectStorage } from "../objectStorage.js";

type AssetRow = {
  id: string; key: string; state: "pending" | "uploaded"; contentHash: string;
  dataUrlHash: string; contentType: string; byteSize: number;
};
function assertSource(value: unknown, deviceId: string) {
  if (typeof value !== "string" || !value || value.length > 200 || value !== deviceId) throw new Error("來源電腦必須與登入裝置相同");
  return value;
}

export async function registerAssetRoutes(app: FastifyInstance, pool: DatabasePool, store?: PrivateObjectStorage) {
  app.get("/v1/migrations/assets/status", { preHandler: requireAdmin }, async () => {
    if (!store) return { configured: false, ready: false };
    try { await store.assertPrivate(); return { configured: true, ready: true }; }
    catch { return { configured: true, ready: false }; }
  });

  app.get<{ Querystring: { sourceId?: string; afterId?: string } }>(
    "/v1/migrations/assets", { preHandler: requireAdmin }, async (request) => {
      const sourceId = assertSource(request.query.sourceId, request.principal!.deviceId);
      const afterId = request.query.afterId === undefined ? 0 : positiveId(Number(request.query.afterId), "分頁 ID");
      const cases = await pool.query<{ id: string; legacyId: string; assets: AssetManifest[]; pendingAssets: number }>(
        `SELECT m.implant_case_id AS id,m.legacy_implant_id AS "legacyId",s.assets,s.pending_asset_count AS "pendingAssets"
         FROM legacy_implant_mappings m JOIN legacy_implant_snapshots s ON s.implant_case_id=m.implant_case_id
         JOIN clinics c ON c.id=m.clinic_id AND c.active=true
         JOIN user_clinics uc ON uc.clinic_id=m.clinic_id AND uc.user_id=$3
         WHERE m.source_id=$1 AND m.implant_case_id>$2 ORDER BY m.implant_case_id LIMIT 25`,
        [sourceId, afterId, request.principal!.userId],
      );
      const uploaded = cases.rows.length ? await pool.query<{ caseId: string; table: string; legacyId: string; field: string; hash: string; id: string }>(
        `SELECT implant_case_id AS "caseId",owner_table AS table,legacy_owner_id AS "legacyId",
          owner_field AS field,data_url_sha256 AS hash,id
         FROM implant_assets WHERE implant_case_id=ANY($1::bigint[]) AND upload_state='uploaded'`,
        [cases.rows.map((row) => row.id)],
      ) : { rows: [] };
      return { cases: cases.rows.map((row) => ({ id: Number(row.id), legacyImplantId: Number(row.legacyId), pendingAssets: row.pendingAssets,
        assets: row.assets.map((manifest) => {
          const found = uploaded.rows.find((asset) => asset.caseId === row.id && asset.table === manifest.table
            && Number(asset.legacyId) === manifest.legacyId && asset.field === manifest.field && asset.hash === manifest.dataUrlSha256);
          return { ...manifest, uploaded: Boolean(found), assetId: found?.id ?? null };
        }),
      })), nextAfterId: cases.rows.length === 25 ? Number(cases.rows.at(-1)!.id) : null };
    },
  );

  app.post<{ Body: { sourceId?: unknown; legacyImplantId?: unknown; table?: unknown; legacyId?: unknown; field?: unknown; dataUrl?: unknown } }>(
    "/v1/migrations/assets/upload", { preHandler: requireAdmin, bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
      if (!store) return reply.code(503).send({ error: "storage_unavailable", message: "尚未設定私有資產儲存" });
      const sourceId = assertSource(request.body.sourceId, request.principal!.deviceId);
      const legacyImplantId = positiveId(request.body.legacyImplantId, "舊個案 ID");
      const legacyId = positiveId(request.body.legacyId, "資產來源 ID");
      const decoded = decodeAssetDataUrl(request.body.dataUrl);
      const client = await pool.connect();
      let asset: AssetRow; let caseId: number; let clinicId: number;
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sourceId]);
        const source = await client.query<{ id: string; clinicId: string; assets: AssetManifest[] }>(
          `SELECT m.implant_case_id AS id,m.clinic_id AS "clinicId",s.assets
           FROM legacy_implant_mappings m JOIN legacy_implant_snapshots s ON s.implant_case_id=m.implant_case_id
           JOIN clinics c ON c.id=m.clinic_id AND c.active=true
           JOIN user_clinics uc ON uc.clinic_id=m.clinic_id AND uc.user_id=$3
           WHERE m.source_id=$1 AND m.legacy_implant_id=$2`, [sourceId, legacyImplantId, request.principal!.userId],
        );
        const row = source.rows[0];
        if (!row) throw new Error("找不到可存取的來源植體個案");
        const manifest = row.assets.find((entry) => entry.table === request.body.table && entry.legacyId === legacyId && entry.field === request.body.field);
        if (!manifest || manifest.dataUrlSha256 !== decoded.dataUrlSha256 || manifest.dataUrlBytes !== decoded.dataUrlBytes) {
          throw new Error("照片／簽名與已匯入的來源雜湊不一致");
        }
        caseId = Number(row.id); clinicId = Number(row.clinicId);
        const existing = await client.query<AssetRow>(
          `SELECT id,object_key AS key,upload_state AS state,content_sha256 AS "contentHash",data_url_sha256 AS "dataUrlHash",
            content_type AS "contentType",byte_size AS "byteSize"
           FROM implant_assets WHERE implant_case_id=$1 AND owner_table=$2 AND legacy_owner_id=$3 AND owner_field=$4 FOR UPDATE`,
          [caseId, manifest.table, legacyId, manifest.field],
        );
        if (existing.rows[0]) {
          asset = existing.rows[0];
          if (asset.contentHash !== decoded.contentSha256 || asset.dataUrlHash !== decoded.dataUrlSha256
            || asset.byteSize !== decoded.bytes.length || asset.contentType !== decoded.contentType) throw new Error("既有資產身分不一致，禁止覆寫");
        } else {
          const id = randomUUID();
          asset = { id, key: `dentflow/clinics/${clinicId}/implants/${caseId}/${id}`, state: "pending",
            contentHash: decoded.contentSha256, dataUrlHash: decoded.dataUrlSha256, contentType: decoded.contentType, byteSize: decoded.bytes.length };
          await client.query(
            `INSERT INTO implant_assets
             (id,implant_case_id,source_id,clinic_id,owner_table,legacy_owner_id,owner_field,data_url_sha256,content_sha256,content_type,byte_size,object_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [id, caseId, sourceId, clinicId, manifest.table, legacyId, manifest.field, asset.dataUrlHash, asset.contentHash, asset.contentType, asset.byteSize, asset.key],
          );
          await audit(client, request, "legacy_asset_upload_pending", "implant_asset", id, { caseId, clinicId });
        }
        // Persist the intent before S3 writes. A crash leaves a known key in pending
        // state; retry uses the same immutable content and does not orphan objects.
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
      if (asset.state === "uploaded") return { assetId: asset.id, uploadState: "uploaded", unchanged: true };

      try {
        await store.put(asset.key, decoded.bytes, asset.contentType, asset.contentHash);
        verifyStoredAsset(await store.get(asset.key), asset.contentHash, asset.byteSize);
      } catch {
        request.log.warn({ assetId: asset.id }, "private asset transfer failed; upload intent retained for retry");
        return reply.code(503).send({ error: "storage_unavailable", message: "私有資產上傳或完整性核對失敗，保留來源供重試" });
      }
      const completed = await pool.connect();
      try {
        await completed.query("BEGIN");
        const access = await completed.query(
          `SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id AND c.active=true
           WHERE uc.user_id=$1 AND uc.clinic_id=$2`, [request.principal!.userId, clinicId],
        );
        if (!access.rows.length) throw new Error("診所存取權已變更，資產保留待確認狀態");
        await completed.query("SELECT id FROM implant_assets WHERE id=$1 FOR UPDATE", [asset.id]);
        await completed.query(
          `UPDATE implant_assets SET upload_state='uploaded',uploaded_at=now(),uploaded_by_user_id=$2
           WHERE id=$1 AND upload_state='pending'`, [asset.id, request.principal!.userId],
        );
        const count = await completed.query<{ pendingAssets: number }>(
          `UPDATE legacy_implant_snapshots s SET pending_asset_count=(
            SELECT count(*)::int FROM jsonb_array_elements(s.assets) entry WHERE NOT EXISTS (
              SELECT 1 FROM implant_assets a WHERE a.implant_case_id=s.implant_case_id AND a.upload_state='uploaded'
                AND a.owner_table=entry->>'table' AND a.legacy_owner_id=(entry->>'legacyId')::bigint
                AND a.owner_field=entry->>'field' AND a.data_url_sha256=entry->>'dataUrlSha256'
            )) WHERE s.implant_case_id=$1 RETURNING pending_asset_count AS "pendingAssets"`, [caseId],
        );
        await audit(completed, request, "legacy_asset_uploaded", "implant_asset", asset.id, { caseId, clinicId, byteSize: asset.byteSize, contentSha256: asset.contentHash });
        await completed.query("COMMIT");
        return { assetId: asset.id, uploadState: "uploaded", unchanged: false, pendingAssets: count.rows[0]!.pendingAssets };
      } catch (error) { await completed.query("ROLLBACK"); throw error; }
      finally { completed.release(); }
    },
  );

  app.get<{ Params: { id: string } }>("/v1/assets/:id", { preHandler: requireSession }, async (request, reply) => {
    const principal = request.principal!;
    if (!["Admin", "Assistant", "Doctor"].includes(principal.role)) return reply.code(403).send({ error: "forbidden", message: "無權讀取臨床資產" });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.params.id)) return reply.code(404).send({ error: "not_found" });
    const result = await pool.query<AssetRow>(
      `SELECT a.id,a.object_key AS key,a.content_sha256 AS "contentHash",a.content_type AS "contentType",a.byte_size AS "byteSize"
       FROM implant_assets a JOIN implant_cases i ON i.id=a.implant_case_id
       JOIN clinics c ON c.id=a.clinic_id AND c.active=true
       JOIN user_clinics uc ON uc.clinic_id=a.clinic_id AND uc.user_id=$2
       WHERE a.id=$1 AND a.upload_state='uploaded' AND ($3<>'Doctor' OR i.doctor_user_id=$2)`,
      [request.params.id, principal.userId, principal.role],
    );
    const asset = result.rows[0];
    if (!asset) return reply.code(404).send({ error: "not_found", message: "找不到可存取的資產" });
    if (!store) return reply.code(503).send({ error: "storage_unavailable", message: "尚未設定私有資產儲存" });
    let bytes;
    try { bytes = await store.get(asset.key); verifyStoredAsset(bytes, asset.contentHash, asset.byteSize); }
    catch { return reply.code(503).send({ error: "storage_unavailable", message: "資產讀取或完整性核對失敗" }); }
    await audit(pool, request, "implant_asset_read", "implant_asset", asset.id);
    return reply.header("cache-control", "private, no-store").header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox").type(asset.contentType).send(Buffer.from(bytes));
  });
}
