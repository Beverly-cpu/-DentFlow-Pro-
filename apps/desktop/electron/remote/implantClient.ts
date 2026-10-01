import { CentralApiError } from "./centralApiError";
import type { PatientTransport } from "./patientClient";
import type { DraftJournal, DraftContext } from "./draftJournal";
import { centralDraft, draftCreate } from "../../shared/centralImplants";
import type { DraftCreationResult, ImplantDetail, ImplantSummary } from "../../shared/centralImplants";
function positive(value: number) { if (!Number.isSafeInteger(value) || value <= 0) throw Error("中央個案、院所或版本格式錯誤"); return value; }
export function createRemoteImplantClient(api: PatientTransport, journal: DraftJournal, serverUrl: () => string) {
  const writeAccess = async (clinicId: number): Promise<DraftContext> => {
    const permission = await api.get<{ canWrite: boolean; actorUserId: number }>(`/v1/implants/draft-access?clinicId=${positive(clinicId)}`);
    if (!permission.canWrite) throw new CentralApiError(403, "forbidden", "只有管理者／助理可新增中央術前草稿");
    return { serverUrl: serverUrl(), clinicId, actorUserId: positive(permission.actorUserId) };
  };
  return {
    list: (clinicId: number, afterId?: number) => api.get<{ items: ImplantSummary[]; nextAfterId: number | null }>(`/v1/implants?clinicId=${positive(clinicId)}${afterId === undefined ? "" : `&afterId=${positive(afterId)}`}`),
    detail: (id: number, clinicId: number) => api.get<ImplantDetail>(`/v1/implants/${positive(id)}?clinicId=${positive(clinicId)}`),
    async pending(clinicId: number) { return journal.read(await writeAccess(clinicId)); },
    async create(clinicId: number, value: unknown): Promise<DraftCreationResult> {
      let context: DraftContext | undefined; let request: ReturnType<typeof draftCreate> | undefined; let saved = false; let sent = false;
      try {
        request = draftCreate(value); if (request.clinicId !== positive(clinicId)) throw Error("新增院所不符");
        context = await writeAccess(clinicId); journal.save(context, request); saved = true;
        sent = true; const record = await api.post<ImplantDetail & { unchanged: boolean }>("/v1/implants", request);
        journal.clear(context, request); return { ok: true, record };
      } catch (error) {
        if (sent && saved && context && request && error instanceof CentralApiError &&
          ((error.status === 400 && ["invalid_input", "invalid_patient", "invalid_doctor"].includes(error.code)) || (error.status === 403 && error.code === "forbidden"))) {
          try { journal.clear(context, request); saved = false; } catch { /* Keep unresolved intent if cleanup fails. */ }
        }
        return { ok: false, pending: saved, error: { status: error instanceof CentralApiError ? error.status : null, code: error instanceof CentralApiError ? error.code : "request_failed", message: error instanceof Error ? error.message : String(error) } };
      }
    },
    update(id: number, clinicId: number, expectedVersion: number, value: unknown) { return api.put<ImplantDetail>(`/v1/implants/${positive(id)}`, { ...centralDraft(positive(clinicId), value), expectedVersion: positive(expectedVersion) }); },
    cancel(id: number, clinicId: number, expectedVersion: number, reason: string) {
      if (typeof reason !== "string" || !reason.trim() || new TextEncoder().encode(reason.trim()).length > 2000) throw Error("請填寫不超過 2000 bytes 的取消原因");
      return api.post<ImplantDetail>(`/v1/implants/${positive(id)}/cancel`, { clinicId: positive(clinicId), expectedVersion: positive(expectedVersion), reason: reason.trim() });
    },
  };
}
