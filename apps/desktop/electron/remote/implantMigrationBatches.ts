import type { LegacyImplantMigrationRecord } from "../database/implantMigrationRepository";

export function prepareImplantMigrationBatches(records: LegacyImplantMigrationRecord[], sourceId: string) {
  const batches: LegacyImplantMigrationRecord[][] = [];
  const oversizedIds: number[] = [];
  let batch: LegacyImplantMigrationRecord[] = [];
  let bytes = Buffer.byteLength(JSON.stringify({ sourceId, implants: [] }), "utf8");
  const envelopeBytes = bytes;
  for (const record of records) {
    const size = Buffer.byteLength(JSON.stringify(record), "utf8");
    if (size > 1_000_000) { oversizedIds.push(Number(record.snapshot.case.id)); continue; }
    if (batch.length === 50 || bytes + size + 1 > 1_800_000) {
      batches.push(batch); batch = []; bytes = envelopeBytes;
    }
    batch.push(record); bytes += size + 1;
  }
  if (batch.length) batches.push(batch);
  return { batches, oversizedIds };
}
