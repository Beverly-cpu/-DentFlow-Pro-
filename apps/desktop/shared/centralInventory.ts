export type CentralBatch = {
  id: number; clinicId: number; name: string; category: string; brand: string; model: string; specification: string;
  refNumber: string; lotNumber: string; expiryDate: string; migrationState: "legacy_staged" | "active"; version: number;
};
export type CentralStock = CentralBatch & { onHand: number; reserved: number; available: number; balanceVersion: number; unitCost?: string };
export type InventoryPage<T> = { items: T[]; nextAfterId: number | null };
export type InventorySource = { sourceId: string; legacyInventoryId: number; snapshot: Record<string, unknown>; importedAt: string };
export type InventoryOpening = { id: string; inventoryBatchId: number; countedQuantity: number; unitCost: string; reconciliationNote: string; actorUserId: number; createdAt: string };
export type OpeningInput = { expectedVersion: number; countedQuantity: number; unitCost: number; reconciliationNote: string; requestId: string };
export type OpeningIntent = OpeningInput & { clinicId: number; batchId: number };
export type ActivationResult = { ok: true; stock: CentralStock & { unchanged: boolean } } | { ok: false; error: { status: number | null; code: string; message: string } };
