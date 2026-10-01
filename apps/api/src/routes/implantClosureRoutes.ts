import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { audit, requireSession } from "../auth.js";
import { verifyStoredAsset } from "../assetData.js";
import type { DatabasePool } from "../database.js";
import { DraftError, draftId, draftRequestId } from "../implantDraft.js";
import { clinicalAssetInput, clinicalRequestHash, closureInput } from "../implantClosure.js";
import type { ClinicalAssetKind } from "../implantClosure.js";
import type { PrivateObjectStorage } from "../objectStorage.js";

type Queryable = Pick<DatabasePool, "query">;
type Case = { version: number; status: string; signatureId: string | null; doctorId: number | null; signedVersion: number | null };
type Asset = { id: string; hash: string; key: string; state: string; result: Record<string, unknown> | null; expectedVersion: number };
async function lockedCase(client: Queryable, request: FastifyRequest, caseId: number, clinicId: number) {
  const p = request.principal!;
  const access = await client.query(`SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
    JOIN users u ON u.id=uc.user_id WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true AND u.active=true AND u.role=$3 FOR SHARE OF uc,c,u`, [p.userId, clinicId, p.role]);
  if (!access.rows.length) throw new DraftError(403, "forbidden", "目前帳號或院所權限已變更");
  const result = await client.query<Case>(`SELECT version,status,doctor_signature_asset_id AS "signatureId",doctor_user_id::int AS "doctorId",
    doctor_signed_version AS "signedVersion" FROM implant_cases WHERE id=$1 AND clinic_id=$2 AND migration_state='central_workflow'
    AND ($3<>'Doctor' OR doctor_user_id=$4) FOR UPDATE`, [caseId, clinicId, p.role, p.userId]);
  if (!result.rows[0]) throw new DraftError(404, "not_found", "找不到可存取的中央流程個案");
  return result.rows[0];
}
function unsigned(current: Case) {
  if (current.signatureId || !["醫師已叫貨", "已取出待手術", "待術後紀錄", "待歸回品項", "已完成"].includes(current.status)) throw new DraftError(409, "workflow_conflict", "已簽名、結案或取消的個案不可新增臨床資產");
}
async function completeRecords(client: Queryable, caseId: number) {
  const missing = await client.query(`SELECT r.id FROM implant_stock_reservations r JOIN implant_draft_plan_items p ON p.id=r.plan_item_id
    WHERE r.implant_case_id=$1 AND (r.state<>'picked' OR r.expected_return_quantity IS NULL OR r.returned_quantity<>r.expected_return_quantity
      OR (p.category='器械' AND NOT EXISTS(SELECT 1 FROM implant_clinical_assets a WHERE a.implant_case_id=r.implant_case_id
        AND a.kind='instrument_photo' AND a.plan_item_id=r.plan_item_id AND a.upload_state='uploaded'))
      OR (p.category<>'器械' AND r.used_quantity>0 AND NOT EXISTS(SELECT 1 FROM implant_clinical_assets a WHERE a.implant_case_id=r.implant_case_id
        AND a.kind='ref_lot_photo' AND a.reservation_id=r.id AND a.upload_state='uploaded'))) LIMIT 1`, [caseId]);
  const count = await client.query("SELECT 1 FROM implant_usage_events WHERE implant_case_id=$1 LIMIT 1", [caseId]);
  if (missing.rows.length || !count.rows.length) throw new DraftError(409, "records_incomplete", "術後使用、歸回或必要照片尚未完整");
}
async function owner(client: Queryable, caseId: number, kind: ClinicalAssetKind, planItemId: number | null, reservationId: string | null) {
  if (kind === "doctor_signature") return;
  const found = kind === "instrument_photo"
    ? await client.query("SELECT 1 FROM implant_draft_plan_items WHERE id=$1 AND implant_case_id=$2 AND category='器械'", [planItemId, caseId])
    : await client.query(`SELECT 1 FROM implant_stock_reservations r JOIN implant_draft_plan_items p ON p.id=r.plan_item_id
        WHERE r.id=$1 AND r.implant_case_id=$2 AND r.state='picked' AND r.used_quantity>0 AND p.category<>'器械'`, [reservationId, caseId]);
  if (!found.rows.length) throw new DraftError(400, "invalid_owner", "照片引用須為此個案的器械規格或實際使用批次");
}
export async function registerImplantClosureRoutes(app: FastifyInstance, pool: DatabasePool, store?: PrivateObjectStorage) {
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/v1/implants/:id/clinical-assets", { preHandler: requireSession, bodyLimit: 16 * 1024 * 1024 }, async (request, reply) => {
    const p = request.principal!;
    if (!["Admin", "Assistant", "Doctor"].includes(p.role)) return reply.code(403).send({ error: "forbidden" });
    const caseId = draftId(Number(request.params.id), "中央個案"); const input = clinicalAssetInput(request.body);
    if (input.kind === "doctor_signature" && p.role !== "Doctor") return reply.code(403).send({ error: "forbidden", message: "只有指定醫師可親自簽名" });
    if (!store) return reply.code(503).send({ error: "storage_unavailable" });
    const hash = clinicalRequestHash({ caseId, clinicId: input.clinicId, expectedVersion: input.expectedVersion, kind: input.kind,
      planItemId: input.planItemId, reservationId: input.reservationId, contentHash: input.decoded.contentSha256, contentType: input.decoded.contentType });
    let asset: Asset;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // One actor/request key is shared by photo and signature operations.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`implant-clinical:${p.userId}:${input.requestId}`]);
      const current = await lockedCase(client, request, caseId, input.clinicId);
      const previous = await client.query<Asset>(`SELECT id,request_hash AS hash,object_key AS key,upload_state AS state,result,expected_version AS "expectedVersion"
        FROM implant_clinical_assets WHERE actor_user_id=$1 AND request_id=$2 FOR UPDATE`, [p.userId, input.requestId]);
      if (previous.rows[0]) {
        asset = previous.rows[0];
        if (asset.hash !== hash) throw new DraftError(409, "request_conflict", "同一資產請求不可更換個案、版本或內容");
        if (asset.state === "uploaded") { await client.query("COMMIT"); return { ...asset.result, unchanged: true }; }
      } else {
        if (current.version !== input.expectedVersion) throw new DraftError(409, "version_conflict", "個案版本已更新，請重新核對");
        unsigned(current); await owner(client, caseId, input.kind, input.planItemId, input.reservationId);
        if (input.kind === "doctor_signature") {
          if (current.status !== "已完成" || current.doctorId !== p.userId) throw new DraftError(409, "workflow_conflict", "指定醫師須在術後紀錄及歸回完成後簽名");
          await completeRecords(client, caseId);
        }
        const id = randomUUID(); asset = { id, key: `dentflow/clinics/${input.clinicId}/implants/${caseId}/clinical/${id}`, hash, state: "pending", result: null, expectedVersion: input.expectedVersion };
        await client.query(`INSERT INTO implant_clinical_assets(id,implant_case_id,clinic_id,kind,plan_item_id,reservation_id,actor_user_id,request_id,request_hash,
          expected_version,content_sha256,content_type,byte_size,object_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [id, caseId, input.clinicId, input.kind, input.planItemId, input.reservationId, p.userId, input.requestId, hash, input.expectedVersion,
          input.decoded.contentSha256, input.decoded.contentType, input.decoded.bytes.length, asset.key]);
        await audit(client, request, "clinical_asset_pending", "implant_asset", id, { caseId, clinicId: input.clinicId, kind: input.kind });
      }
      // A pending retry must still have permission and an editable clinical case before transfer.
      unsigned(current); await owner(client, caseId, input.kind, input.planItemId, input.reservationId);
      if (input.kind === "doctor_signature" && (current.status !== "已完成" || current.version !== asset.expectedVersion)) throw new DraftError(409, "version_conflict", "簽名所確認版本已變更，請重新核對並建立新請求");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message }); throw error; }
    finally { client.release(); }
    try { await store.put(asset.key, input.decoded.bytes, input.decoded.contentType, input.decoded.contentSha256); verifyStoredAsset(await store.get(asset.key), input.decoded.contentSha256, input.decoded.bytes.length); }
    catch { return reply.code(503).send({ error: "storage_unavailable", message: "資產保留待確認，請沿用原請求重試" }); }
    const completed = await pool.connect();
    try {
      await completed.query("BEGIN"); const current = await lockedCase(completed, request, caseId, input.clinicId);
      const existing = await completed.query<Asset>("SELECT upload_state AS state,result FROM implant_clinical_assets WHERE id=$1 FOR UPDATE", [asset.id]);
      if (existing.rows[0]!.state === "uploaded") { await completed.query("COMMIT"); return { ...existing.rows[0]!.result, unchanged: true }; }
      unsigned(current); await owner(completed, caseId, input.kind, input.planItemId, input.reservationId);
      const signature = input.kind === "doctor_signature";
      if (signature) {
        if (current.status !== "已完成" || current.doctorId !== p.userId || current.version !== asset.expectedVersion) throw new DraftError(409, "version_conflict", "簽名所確認版本已變更，請重新核對並建立新請求");
        await completeRecords(completed, caseId);
      }
      const result = { id: caseId, assetId: asset.id, kind: input.kind, uploadState: "uploaded", version: current.version + 1 };
      await completed.query("UPDATE implant_clinical_assets SET upload_state='uploaded',uploaded_at=now(),result=$2::jsonb WHERE id=$1", [asset.id, JSON.stringify(result)]);
      if (signature) await completed.query(`UPDATE implant_cases SET doctor_signature_asset_id=$2,doctor_signed_at=now(),doctor_signed_by_user_id=$3,doctor_signed_version=version WHERE id=$1`, [caseId, asset.id, p.userId]);
      else await completed.query("UPDATE implant_cases SET updated_at=now() WHERE id=$1", [caseId]);
      await audit(completed, request, signature ? "implant_usage_signed" : "clinical_asset_uploaded", "implant_case", caseId,
        { clinicId: input.clinicId, assetId: asset.id, kind: input.kind, version: result.version, contentSha256: input.decoded.contentSha256 });
      await completed.query("COMMIT"); return { ...result, unchanged: false };
    } catch (error) { await completed.query("ROLLBACK"); if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message }); throw error; }
    finally { completed.release(); }
  });
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>("/v1/implants/:id/close", { preHandler: requireSession, bodyLimit: 4096 }, async (request, reply) => {
    const p = request.principal!;
    if (!["Admin", "Assistant", "Doctor"].includes(p.role)) return reply.code(403).send({ error: "forbidden" });
    const caseId = draftId(Number(request.params.id), "中央個案"); const input = closureInput(request.body);
    const hash = clinicalRequestHash({ caseId, clinicId: input.clinicId, expectedVersion: input.expectedVersion, operation: "close" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`implant-close:${p.userId}:${input.requestId}`]);
      const current = await lockedCase(client, request, caseId, input.clinicId);
      const previous = await client.query<{ hash: string; result: Record<string, unknown> }>("SELECT request_hash AS hash,result FROM implant_closures WHERE actor_user_id=$1 AND request_id=$2", [p.userId, input.requestId]);
      if (previous.rows[0]) {
        if (previous.rows[0].hash !== hash) throw new DraftError(409, "request_conflict", "同一結案請求不可更換內容");
        await client.query("COMMIT"); return { ...previous.rows[0].result, unchanged: true };
      }
      if (current.version !== input.expectedVersion) throw new DraftError(409, "version_conflict", "個案版本已更新");
      if (current.status !== "已完成" || !current.signatureId || current.signedVersion !== current.version - 1) throw new DraftError(409, "workflow_conflict", "須由指定醫師完成目前版本簽名後才能結案");
      await completeRecords(client, caseId);
      const signature = await client.query("SELECT 1 FROM implant_clinical_assets WHERE id=$1 AND kind='doctor_signature' AND upload_state='uploaded' AND actor_user_id=$2", [current.signatureId, current.doctorId]);
      if (!signature.rows.length) throw new DraftError(409, "records_incomplete", "醫師簽名尚未核對完成");
      const clinical = await client.query(`SELECT id::int,clinic_id::int AS "clinicId",patient_id::int AS "patientId",doctor_user_id::int AS "doctorUserId",implant_date,note,
        version,doctor_signature_asset_id,doctor_signed_at,doctor_signed_version,surgery_completed_at,usage_recorded_at FROM implant_cases WHERE id=$1`, [caseId]);
      const plans = await client.query(`SELECT p.id::int,t.tooth_position,p.name,p.category,p.brand,p.model,p.specification,p.planned_quantity
        FROM implant_draft_plan_items p JOIN implant_draft_teeth t ON t.id=p.tooth_id WHERE p.implant_case_id=$1 ORDER BY p.id`, [caseId]);
      const reservations = await client.query(`SELECT r.id,r.plan_item_id::int,r.inventory_batch_id::int,r.picked_quantity,r.used_quantity,r.expected_return_quantity,r.returned_quantity,
        b.ref_number,b.lot_number,r.picked_at,r.usage_recorded_at,r.last_returned_at FROM implant_stock_reservations r JOIN inventory_batches b ON b.id=r.inventory_batch_id
        WHERE r.implant_case_id=$1 ORDER BY r.id`, [caseId]);
      const assets = await client.query(`SELECT id,kind,plan_item_id::int,reservation_id,content_sha256,content_type,byte_size,actor_user_id::int,uploaded_at
        FROM implant_clinical_assets WHERE implant_case_id=$1 AND upload_state='uploaded' ORDER BY id`, [caseId]);
      const closureId = randomUUID(); const result = { id: caseId, closureId, status: "已結案", version: current.version + 1 };
      await client.query("UPDATE implant_cases SET status='已結案',closed_at=now(),closed_by_user_id=$2 WHERE id=$1", [caseId, p.userId]);
      await client.query(`INSERT INTO implant_closures(id,implant_case_id,clinic_id,actor_user_id,request_id,request_hash,snapshot,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
        [closureId, caseId, input.clinicId, p.userId, input.requestId, hash, JSON.stringify({ case: clinical.rows[0], plans: plans.rows, reservations: reservations.rows, assets: assets.rows }), JSON.stringify(result)]);
      await audit(client, request, "implant_case_closed", "implant_case", caseId, { clinicId: input.clinicId, closureId, version: result.version });
      await client.query("COMMIT"); return { ...result, unchanged: false };
    } catch (error) { await client.query("ROLLBACK"); if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message }); throw error; }
    finally { client.release(); }
  });
  app.get<{ Params: { id: string } }>("/v1/clinical-assets/:id", { preHandler: requireSession }, async (request, reply) => {
    const p = request.principal!;
    if (!["Admin", "Assistant", "Doctor"].includes(p.role)) return reply.code(403).send({ error: "forbidden" });
    const id = draftRequestId(request.params.id);
    const found = await pool.query<{ key: string; hash: string; size: number; type: string }>(`SELECT a.object_key AS key,a.content_sha256 AS hash,a.byte_size AS size,a.content_type AS type
      FROM implant_clinical_assets a JOIN implant_cases i ON i.id=a.implant_case_id AND i.clinic_id=a.clinic_id
      JOIN clinics c ON c.id=a.clinic_id AND c.active=true JOIN user_clinics uc ON uc.clinic_id=a.clinic_id AND uc.user_id=$2
      WHERE a.id=$1 AND a.upload_state='uploaded' AND ($3<>'Doctor' OR i.doctor_user_id=$2)`, [id, p.userId, p.role]);
    if (!found.rows[0]) return reply.code(404).send({ error: "not_found" });
    if (!store) return reply.code(503).send({ error: "storage_unavailable" });
    const asset = found.rows[0]; let bytes: Uint8Array;
    try { bytes = await store.get(asset.key); verifyStoredAsset(bytes, asset.hash, asset.size); }
    catch { return reply.code(503).send({ error: "storage_unavailable" }); }
    await audit(pool, request, "clinical_asset_read", "implant_asset", id);
    return reply.header("cache-control", "private, no-store").header("x-content-type-options", "nosniff")
      .header("content-security-policy", "default-src 'none'; sandbox").type(asset.type).send(Buffer.from(bytes));
  });
}
