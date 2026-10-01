export function prepareResourceMigrationBatches<T extends { legacyId: number }>(
  rows: T[], sourceId: string, collection: "inventory" | "users", maxRecords: number,
) {
  const batches: T[][] = []; const oversizedIds: number[] = [];
  const envelope = Buffer.byteLength(JSON.stringify({ sourceId, [collection]: [] }), "utf8");
  let batch: T[] = []; let bytes = envelope;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row), "utf8");
    if (size > 16_000) { oversizedIds.push(row.legacyId); continue; }
    if (batch.length === maxRecords || bytes + size + 1 > 1_800_000) {
      batches.push(batch); batch = []; bytes = envelope;
    }
    batch.push(row); bytes += size + 1;
  }
  if (batch.length) batches.push(batch);
  return { batches, oversizedIds };
}
