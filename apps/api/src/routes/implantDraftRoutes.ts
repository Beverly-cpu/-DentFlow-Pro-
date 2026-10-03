import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { audit, requireSession } from "../auth.js";
import type { DatabasePool } from "../database.js";
import { DraftError, draftId, draftRequestId, draftText, implantDraftHash, validateImplantDraft } from "../implantDraft.js";
import type { ImplantDraft } from "../implantDraft.js";

type Queryable = Pick<DatabasePool, "query">;
type Body = Record<string, unknown>;
const select = `SELECT i.id::int,i.clinic_id::int AS "clinicId",i.patient_id::int AS "patientId",
  p.name AS "patientName",p.chart_number AS "chartNumber",i.doctor_user_id::int AS "doctorUserId",
  u.display_name AS "doctorName",i.implant_date AS "implantDate",i.note,i.status,
  i.migration_state AS "migrationState",i.version,i.cancellation_reason AS "cancellationReason",
  i.created_at AS "createdAt",i.updated_at AS "updatedAt",
  i.surgery_completed_at AS "surgeryCompletedAt",i.surgery_completed_by_user_id::int AS "surgeryCompletedByUserId",
  i.usage_recorded_at AS "usageRecordedAt",i.usage_recorded_by_user_id::int AS "usageRecordedByUserId",
  i.doctor_signature_asset_id AS "doctorSignatureAssetId",i.doctor_signed_at AS "doctorSignedAt",
  i.doctor_signed_by_user_id::int AS "doctorSignedByUserId",i.doctor_signed_version AS "doctorSignedVersion",
  i.closed_at AS "closedAt",i.closed_by_user_id::int AS "closedByUserId"
  FROM implant_cases i JOIN patients p ON p.id=i.patient_id AND p.clinic_id=i.clinic_id
  LEFT JOIN users u ON u.id=i.doctor_user_id`;

async function detail(client: Queryable, id: number, clinicId: number, role: string) {
  const result = await client.query(`${select} WHERE i.id=$1 AND i.clinic_id=$2 AND i.migration_state IN ('central_draft','central_workflow')`, [id, clinicId]);
  if (!result.rows[0]) throw new DraftError(404, "not_found", "找不到中央植體草稿");
  const teeth = await client.query<{ id: number; toothPosition: string }>(
    `SELECT id::int,tooth_position AS "toothPosition" FROM implant_draft_teeth WHERE implant_case_id=$1 ORDER BY id`, [id],
  );
  const plans = await client.query<{ id: number; toothId: number }>(
    `SELECT id::int,tooth_id::int AS "toothId",name,category,brand,model,specification,planned_quantity AS quantity
     FROM implant_draft_plan_items WHERE implant_case_id=$1 ORDER BY id`, [id],
  );
  const reservations = await client.query(`SELECT r.id,r.plan_item_id::int AS "planItemId",r.inventory_batch_id::int AS "inventoryBatchId",
    r.quantity,r.state,r.picked_quantity AS "pickedQuantity",r.picked_at AS "pickedAt",r.picked_by_user_id::int AS "pickedByUserId",
    r.used_quantity AS "usedQuantity",r.expected_return_quantity AS "expectedReturnQuantity",r.returned_quantity AS "returnedQuantity",
    r.usage_recorded_at AS "usageRecordedAt",r.last_returned_at AS "lastReturnedAt",r.returned_by_user_id::int AS "returnedByUserId",\n    CASE WHEN $3='Admin' OR ($3='Doctor' AND p.category<>'器械') THEN r.picked_unit_cost::text ELSE NULL END AS "pickedUnitCost",
    b.ref_number AS "refNumber",b.lot_number AS "lotNumber",r.created_at AS "createdAt",r.released_at AS "releasedAt"
    FROM implant_stock_reservations r JOIN inventory_batches b ON b.id=r.inventory_batch_id
    JOIN implant_draft_plan_items p ON p.id=r.plan_item_id
    WHERE r.implant_case_id=$1 ORDER BY r.created_at,r.id`, [id, clinicId, role]);
  const assets = await client.query(`SELECT id,kind,plan_item_id::int AS "planItemId",reservation_id AS "reservationId",
    content_sha256 AS "contentSha256",content_type AS "contentType",byte_size AS "byteSize",actor_user_id::int AS "actorUserId",uploaded_at AS "uploadedAt"
    FROM implant_clinical_assets WHERE implant_case_id=$1 AND upload_state='uploaded' ORDER BY id`, [id]);
  const closure = await client.query("SELECT id,snapshot,created_at AS \"createdAt\" FROM implant_closures WHERE implant_case_id=$1", [id]);
  return { ...result.rows[0], assets: assets.rows, closure: closure.rows[0] ?? null, reservations: reservations.rows, teeth: teeth.rows.map((tooth) => ({ ...tooth, items: plans.rows.filter((plan) => plan.toothId === tooth.id) })) };
}
async function clinicAccess(client: Queryable, request: FastifyRequest, clinicId: number, locked = false) {
  const principal = request.principal!;
  const result = await client.query(
    `SELECT 1 FROM user_clinics uc JOIN clinics c ON c.id=uc.clinic_id
     WHERE uc.user_id=$1 AND uc.clinic_id=$2 AND c.active=true ${locked ? "FOR SHARE OF uc,c" : ""}`, [principal.userId, clinicId],
  );
  if (!result.rows.length) throw new DraftError(403, "forbidden", "無權存取此院所植體草稿");
}
async function references(client: Queryable, input: ImplantDraft) {
  const patient = await client.query("SELECT 1 FROM patients WHERE id=$1 AND clinic_id=$2 AND active=true FOR SHARE", [input.patientId, input.clinicId]);
  if (!patient.rows.length) throw new DraftError(400, "invalid_patient", "病患須為此院所的有效中央病患");
  if (input.doctorUserId === null) return;
  const doctor = await client.query(
    `SELECT 1 FROM users u JOIN user_clinics uc ON uc.user_id=u.id WHERE u.id=$1 AND uc.clinic_id=$2
     AND u.role='Doctor' AND u.active=true FOR SHARE OF u,uc`, [input.doctorUserId, input.clinicId],
  );
  if (!doctor.rows.length) throw new DraftError(400, "invalid_doctor", "醫師須為此院所的啟用中央 Doctor 帳號");
}
async function replacePlans(client: Queryable, caseId: number, input: ImplantDraft) {
  await client.query("DELETE FROM implant_draft_plan_items WHERE implant_case_id=$1", [caseId]);
  await client.query("DELETE FROM implant_draft_teeth WHERE implant_case_id=$1", [caseId]);
  for (const tooth of input.teeth) {
    const result = await client.query<{ id: string }>(
      "INSERT INTO implant_draft_teeth(implant_case_id,tooth_position) VALUES($1,$2) RETURNING id", [caseId, tooth.toothPosition],
    );
    for (const item of tooth.items) await client.query(
      `INSERT INTO implant_draft_plan_items(implant_case_id,tooth_id,name,category,brand,model,specification,planned_quantity)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [caseId, result.rows[0]!.id, item.name, item.category, item.brand, item.model, item.specification, item.quantity],
    );
  }
}
async function transaction(pool: DatabasePool, request: FastifyRequest, reply: FastifyReply, clinicId: number,
  operation: (client: Queryable) => Promise<unknown>) {
  if (!["Admin", "Assistant"].includes(request.principal!.role)) return reply.code(403).send({ error: "forbidden", message: "無權修改植體草稿" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN"); await clinicAccess(client, request, clinicId, true);
    const result = await operation(client); await client.query("COMMIT"); return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message });
    throw error;
  } finally { client.release(); }
}
async function editable(client: Queryable, caseId: number, clinicId: number, expectedVersion: number) {
  const result = await client.query<{ version: number; status: string }>(
    `SELECT version,status FROM implant_cases WHERE id=$1 AND clinic_id=$2 AND migration_state='central_draft' FOR UPDATE`, [caseId, clinicId],
  );
  const row = result.rows[0];
  if (!row) throw new DraftError(404, "not_found", "找不到中央植體草稿，舊個案須先完成遷移核對");
  if (row.version !== expectedVersion) throw new DraftError(409, "version_conflict", "個案已由其他電腦更新，請重新載入後核對");
  if (row.status !== "待醫師叫貨") throw new DraftError(409, "workflow_conflict", "只有待醫師叫貨的中央草稿可修改或取消");
}
async function read(pool: DatabasePool, request: FastifyRequest, reply: FastifyReply, clinicId: number,
  operation: (client: Queryable) => Promise<unknown>) {
  const client = await pool.connect();
  try {
    // Case, doctor visibility and children must come from the same revision.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await clinicAccess(client, request, clinicId);
    const result = await operation(client); await client.query("COMMIT"); return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message });
    throw error;
  } finally { client.release(); }
}
export async function registerImplantDraftRoutes(app: FastifyInstance, pool: DatabasePool) {
  app.get<{ Querystring: { clinicId?: string } }>("/v1/implants/draft-access", { preHandler: requireSession }, async (request, reply) => {
    if (!["Admin", "Assistant", "Doctor"].includes(request.principal!.role)) return reply.code(403).send({ error: "forbidden" });
    const clinicId = draftId(Number(request.query.clinicId), "院所");
    try { await clinicAccess(pool, request, clinicId); return { canWrite: ["Admin", "Assistant"].includes(request.principal!.role), actorUserId: request.principal!.userId }; }
    catch (error) { if (error instanceof DraftError) return reply.code(error.status).send({ error: error.code, message: error.message }); throw error; }
  });
  app.post<{ Body: Body }>("/v1/implants", { preHandler: requireSession, bodyLimit: 64 * 1024 }, async (request, reply) => {
    const input = validateImplantDraft(request.body); const requestId = draftRequestId(request.body.requestId); const hash = implantDraftHash(input);
    return transaction(pool, request, reply, input.clinicId, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`implant-create:${request.principal!.userId}:${requestId}`]);
      const existing = await client.query<{ id: string; clinicId: string; hash: string }>(
        `SELECT id,clinic_id AS "clinicId",create_request_hash AS hash FROM implant_cases WHERE created_by_user_id=$1 AND create_request_id=$2 FOR SHARE`,
        [request.principal!.userId, requestId],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (Number(row.clinicId) !== input.clinicId || row.hash !== hash) throw new DraftError(409, "request_conflict", "同一新增請求不可改為其他內容");
        return { ...(await detail(client, Number(row.id), input.clinicId, request.principal!.role)), unchanged: true };
      }
      await references(client, input);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO implant_cases(clinic_id,patient_id,doctor_user_id,implant_date,note,status,migration_state,created_by_user_id,create_request_id,create_request_hash)
         VALUES($1,$2,$3,$4,$5,'待醫師叫貨','central_draft',$6,$7,$8) RETURNING id`,
        [input.clinicId, input.patientId, input.doctorUserId, input.implantDate, input.note, request.principal!.userId, requestId, hash],
      );
      const caseId = Number(inserted.rows[0]!.id); await replacePlans(client, caseId, input);
      await audit(client, request, "implant_draft_created", "implant_case", caseId, { clinicId: input.clinicId, patientId: input.patientId, version: 1 });
      return { ...(await detail(client, caseId, input.clinicId, request.principal!.role)), unchanged: false };
    });
  });
  app.put<{ Params: { id: string }; Body: Body }>("/v1/implants/:id", { preHandler: requireSession, bodyLimit: 64 * 1024 }, async (request, reply) => {
    const input = validateImplantDraft(request.body); const caseId = draftId(Number(request.params.id), "中央個案");
    const version = draftId(request.body.expectedVersion, "個案版本");
    return transaction(pool, request, reply, input.clinicId, async (client) => {
      await editable(client, caseId, input.clinicId, version); await references(client, input);
      await client.query(
        "UPDATE implant_cases SET patient_id=$3,doctor_user_id=$4,implant_date=$5,note=$6 WHERE id=$1 AND clinic_id=$2",
        [caseId, input.clinicId, input.patientId, input.doctorUserId, input.implantDate, input.note],
      );
      await replacePlans(client, caseId, input);
      const result = await detail(client, caseId, input.clinicId, request.principal!.role);
      await audit(client, request, "implant_draft_updated", "implant_case", caseId, { clinicId: input.clinicId, previousVersion: version, version: version + 1 });
      return result;
    });
  });
  app.post<{ Params: { id: string }; Body: Body }>("/v1/implants/:id/cancel", { preHandler: requireSession }, async (request, reply) => {
    const clinicId = draftId(request.body.clinicId, "院所"); const caseId = draftId(Number(request.params.id), "中央個案");
    const version = draftId(request.body.expectedVersion, "個案版本"); const reason = draftText(request.body.reason, "取消原因", 2000, true);
    if (Object.keys(request.body).some((key) => !["clinicId", "expectedVersion", "reason"].includes(key))) throw new DraftError(400, "invalid_input", "取消包含不允許的欄位");
    return transaction(pool, request, reply, clinicId, async (client) => {
      await editable(client, caseId, clinicId, version);
      await client.query("UPDATE implant_cases SET status='已取消',cancellation_reason=$2 WHERE id=$1", [caseId, reason]);
      await audit(client, request, "implant_draft_cancelled", "implant_case", caseId, { clinicId, previousVersion: version, version: version + 1 });
      return detail(client, caseId, clinicId, request.principal!.role);
    });
  });
  app.get<{ Querystring: { clinicId?: string; afterId?: string; patientId?: string } }>("/v1/implants", { preHandler: requireSession }, async (request, reply) => {
    if (!["Admin", "Assistant", "Doctor"].includes(request.principal!.role)) return reply.code(403).send({ error: "forbidden" });
    const clinicId = draftId(Number(request.query.clinicId), "院所");
    const afterId = request.query.afterId === undefined ? 0 : draftId(Number(request.query.afterId), "分頁 ID");
    const patientId = request.query.patientId === undefined ? null : draftId(Number(request.query.patientId), "中央病患");
    return read(pool, request, reply, clinicId, async (client) => {
      const result = await client.query<{ id: number }>(
        `${select} WHERE i.clinic_id=$1 AND i.id>$2 AND i.migration_state IN ('central_draft','central_workflow')
         AND ($3::bigint IS NULL OR i.patient_id=$3) AND ($4<>'Doctor' OR i.doctor_user_id=$5) ORDER BY i.id LIMIT 100`,
        [clinicId, afterId, patientId, request.principal!.role, request.principal!.userId],
      );
      return { items: result.rows, nextAfterId: result.rows.length === 100 ? result.rows.at(-1)!.id : null };
    });
  });
  app.get<{ Params: { id: string }; Querystring: { clinicId?: string } }>("/v1/implants/:id", { preHandler: requireSession }, async (request, reply) => {
    if (!["Admin", "Assistant", "Doctor"].includes(request.principal!.role)) return reply.code(403).send({ error: "forbidden" });
    const clinicId = draftId(Number(request.query.clinicId), "院所"); const caseId = draftId(Number(request.params.id), "中央個案");
    return read(pool, request, reply, clinicId, async (client) => {
      const visible = await client.query(
        `SELECT 1 FROM implant_cases WHERE id=$1 AND clinic_id=$2 AND migration_state IN ('central_draft','central_workflow')
         AND ($3<>'Doctor' OR doctor_user_id=$4)`, [caseId, clinicId, request.principal!.role, request.principal!.userId],
      );
      if (!visible.rows.length) throw new DraftError(404, "not_found", "找不到可存取的中央植體草稿");
      const result = await detail(client, caseId, clinicId, request.principal!.role);
      await audit(client, request, "implant_draft_read", "implant_case", caseId, { clinicId }); return result;
    });
  });
}
