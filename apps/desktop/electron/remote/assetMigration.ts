import { getLegacyImplantAsset } from "../database/implantMigrationRepository";
import { centralApi } from "./centralApiClient";

type Manifest = { table: string; legacyId: number; field: string; dataUrlSha256: string; dataUrlBytes: number; uploaded: boolean };
type Page = { cases: { legacyImplantId: number; assets: Manifest[] }[]; nextAfterId: number | null };

export async function migrateLegacyAssets() {
  const status = await centralApi.get<{ ready: boolean }>("/v1/migrations/assets/status");
  if (!status.ready) return;
  const sourceId = centralApi.getDeviceId();
  let afterId: number | null = null;
  let pending = 0;
  do {
    const page: Page = await centralApi.get(`/v1/migrations/assets?sourceId=${encodeURIComponent(sourceId)}${afterId === null ? "" : `&afterId=${afterId}`}`);
    for (const record of page.cases) for (const asset of record.assets) {
      if (asset.uploaded) continue;
      try {
        // Load only one original at a time and retain it unchanged in SQLite.
        const dataUrl = getLegacyImplantAsset(record.legacyImplantId, asset);
        if (!dataUrl || asset.dataUrlBytes > 15 * 1024 * 1024) { pending++; continue; }
        await centralApi.post("/v1/migrations/assets/upload", {
          sourceId, legacyImplantId: record.legacyImplantId, table: asset.table,
          legacyId: asset.legacyId, field: asset.field, dataUrl,
        });
      } catch { pending++; }
    }
    afterId = page.nextAfterId;
  } while (afterId !== null);
  if (pending) console.warn("照片／簽名尚待搬移，保留本機原件，數量：", pending);
}
