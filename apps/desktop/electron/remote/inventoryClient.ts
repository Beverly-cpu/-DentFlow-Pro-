import { CentralApiError } from "./centralApiError";
import type { PatientTransport } from "./patientClient";
import type { ActivationResult, CentralBatch, CentralStock, InventoryOpening, InventoryPage, InventorySource, OpeningInput } from "../../shared/centralInventory";
import { validateOpeningIntent } from "../../shared/openingIntent";
function positive(value: unknown) { if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw Error("中央庫存 ID 或院所格式錯誤"); return value; }
function pageQuery(clinicId: number, afterId?: number) { return `clinicId=${positive(clinicId)}${afterId === undefined ? "" : `&afterId=${positive(afterId)}`}`; }
export function createRemoteInventoryClient(api: PatientTransport) {
  return {
    list: (clinicId: number, afterId?: number) => api.get<InventoryPage<CentralStock>>(`/v1/inventory?${pageQuery(clinicId, afterId)}`),
    staged: (clinicId: number, afterId?: number) => api.get<InventoryPage<CentralBatch>>(`/v1/inventory/staged?${pageQuery(clinicId, afterId)}`),
    sources: (id: number, clinicId: number) => api.get<{ items: InventorySource[] }>(`/v1/inventory/${positive(id)}/sources?clinicId=${positive(clinicId)}`),
    opening: (id: number, clinicId: number) => api.get<InventoryOpening>(`/v1/inventory/${positive(id)}/opening?clinicId=${positive(clinicId)}`),
    async activate(batchId: number, clinicId: number, value: OpeningInput): Promise<ActivationResult> {
      try {
        const input = validateOpeningIntent({ ...value, batchId, clinicId });
        const { batchId: id, ...body } = input;
        // Route clinic and batch IDs always come from the IPC arguments.
        const { clinicId: targetClinic, ...fields } = body;
        const stock = await api.post<CentralStock & { unchanged: boolean }>(`/v1/inventory/${id}/activate`, { ...fields, clinicId: targetClinic });
        return { ok: true, stock };
      } catch (error) {
        if (error instanceof CentralApiError) return { ok: false, error: { status: error.status, code: error.code, message: error.message } };
        return { ok: false, error: { status: null, code: "request_failed", message: error instanceof Error ? error.message : String(error) } };
      }
    },
  };
}
