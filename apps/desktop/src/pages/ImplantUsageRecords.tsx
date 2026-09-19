import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useOutletContext } from "react-router-dom";
import type { DentflowMainLayoutContext } from "../layouts/MainLayout";

const money = (value: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency", currency: "TWD", maximumFractionDigits: 2,
}).format(Number.isFinite(value) ? value : 0);

function dateTime(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-TW");
}

export default function ImplantUsageRecords() {
  const { session, currentClinicId } = useOutletContext<DentflowMainLayoutContext>();
  const clinicId = currentClinicId ?? session.clinicId;
  const showCost = session.role === "Admin";
  const [records, setRecords] = useState<DentflowImplantRecord[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    window.dentflow.implants.list(clinicId)
      .then((result) => { if (active) setRecords(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [clinicId]);

  const usageRecords = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-TW");
    return records.map((record) => ({
      record,
      items: record.teeth.flatMap((tooth) => tooth.items.flatMap((plan) =>
        plan.usageItems.map((usage) => ({ tooth, plan, usage })))),
    })).filter(({ items }) => items.length > 0).filter(({ record, items }) => {
      if (!normalized) return true;
      return [record.patientName, record.patientChartNumber, record.doctorName,
        record.implantDate, ...items.flatMap(({ tooth, plan, usage }) => [
          tooth.toothPosition, plan.name, plan.category, plan.brand, plan.model,
          plan.specification, usage.inventoryRefNumber, usage.inventoryLotNumber,
        ])].some((value) => String(value ?? "").toLocaleLowerCase("zh-TW").includes(normalized));
    });
  }, [query, records]);

  return <div style={styles.page}>
    <div style={styles.heading}>
      <div><div style={styles.eyebrow}>IMPLANT &amp; KIT USAGE</div><h1 style={styles.title}>植體與套件使用紀錄</h1></div>
      <div style={styles.count}>共 {usageRecords.length} 筆個案</div>
    </div>
    <div style={styles.searchCard}>
      <label style={styles.label} htmlFor="implant-usage-search">搜尋紀錄</label>
      <input id="implant-usage-search" style={styles.input} value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="病患、醫師、牙位、品項、REF、LOT…" />
    </div>
    {error && <div style={styles.error}>{error}</div>}
    {loading ? <div style={styles.empty}>讀取中…</div> : usageRecords.length === 0
      ? <div style={styles.empty}>目前沒有符合條件的植體或套件使用紀錄。</div>
      : <div style={styles.list}>{usageRecords.map(({ record, items }) =>
        <section key={record.id} style={styles.card}>
          <div style={styles.cardHeader}>
            <div><h2 style={styles.patient}>{record.patientName}</h2><div style={styles.meta}>
              病歷號：{record.patientChartNumber} ｜ 醫師：{record.doctorName} ｜ 使用日期：{record.implantDate}
            </div></div><span style={styles.status}>{record.status}</span>
          </div>
          <div style={styles.tableWrap}><table style={styles.table}><thead><tr>
            <th style={styles.th}>牙位</th><th style={styles.th}>類別</th><th style={styles.th}>品項／規格</th>
            <th style={styles.th}>REF</th><th style={styles.th}>LOT</th><th style={styles.th}>數量</th>
            {showCost && <th style={styles.th}>單位成本</th>}{showCost && <th style={styles.th}>小計</th>}
          </tr></thead><tbody>{items.map(({ tooth, plan, usage }) => <tr key={usage.id}>
            <td style={styles.td}>{tooth.toothPosition}</td><td style={styles.td}>{plan.category}</td>
            <td style={styles.td}><strong>{plan.name}</strong><div style={styles.sub}>
              {[plan.brand, plan.model, plan.specification].filter(Boolean).join(" / ") || "—"}
            </div></td><td style={styles.td}>{usage.inventoryRefNumber || "—"}</td>
            <td style={styles.td}>{usage.inventoryLotNumber || "—"}</td><td style={styles.td}>{usage.quantity}</td>
            {showCost && <td style={styles.td}>{money(usage.unitCost)}</td>}
            {showCost && <td style={styles.td}><strong>{money(usage.totalCost)}</strong></td>}
          </tr>)}</tbody></table></div>
          <div style={styles.signature}><div><div style={styles.signatureLabel}>醫師簽名</div>
            <strong>{record.doctorSignedAt ? `${record.doctorName} 醫師` : "尚未簽名"}</strong>
            <div style={styles.sub}>簽名時間：{dateTime(record.doctorSignedAt)}</div></div>
            {record.doctorSignature?.startsWith("data:image/")
              ? <img style={styles.signatureImage} src={record.doctorSignature} alt={`${record.doctorName}醫師簽名`} />
              : <div style={styles.signatureMissing}>等待醫師簽名確認</div>}
          </div>
        </section>)}</div>}
  </div>;
}

const styles: Record<string, CSSProperties> = {
  page: { padding: 30, color: "#173f35" },
  heading: { display: "flex", alignItems: "end", justifyContent: "space-between", gap: 16, marginBottom: 22 },
  eyebrow: { color: "#3d7c63", fontSize: 12, fontWeight: 800, letterSpacing: "0.14em" },
  title: { margin: "7px 0 0", fontSize: 30 }, count: { color: "#61776f", fontSize: 14 },
  searchCard: { background: "#fff", border: "1px solid #d4e1d8", borderRadius: 15, padding: 16, marginBottom: 18 },
  label: { display: "block", fontSize: 13, marginBottom: 7 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #c9d9ce", borderRadius: 10, padding: "12px 14px", font: "inherit", color: "#173f35", background: "#fbfdfb" },
  list: { display: "grid", gap: 16 }, card: { background: "#fff", border: "1px solid #d4e1d8", borderRadius: 15, padding: 18, overflow: "hidden" },
  cardHeader: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", marginBottom: 14 },
  patient: { fontSize: 21, margin: "0 0 6px" }, meta: { color: "#61776f", fontSize: 14 },
  status: { background: "#edf6ef", color: "#2f6c53", borderRadius: 999, padding: "6px 10px", fontSize: 12, whiteSpace: "nowrap" },
  tableWrap: { overflowX: "auto", border: "1px solid #e0e9e2", borderRadius: 11 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 820 },
  th: { background: "#f3f8f4", color: "#476a5e", textAlign: "left", fontSize: 12, padding: "10px 12px", borderBottom: "1px solid #dce7df" },
  td: { padding: "11px 12px", borderBottom: "1px solid #edf2ee", fontSize: 13, verticalAlign: "top" },
  sub: { color: "#73877f", fontSize: 12, marginTop: 4 },
  signature: { marginTop: 14, padding: 14, borderRadius: 11, background: "#f3f8f4", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18 },
  signatureLabel: { color: "#61776f", fontSize: 12, marginBottom: 5 },
  signatureImage: { width: 220, height: 85, objectFit: "contain", background: "#fff", border: "1px solid #d5e1d8", borderRadius: 8 },
  signatureMissing: { color: "#8a9a93", fontSize: 13 },
  empty: { background: "#fff", border: "1px solid #d4e1d8", borderRadius: 15, padding: 42, textAlign: "center", color: "#71837c" },
  error: { background: "#fff0ef", border: "1px solid #efc2bd", color: "#a23b32", borderRadius: 10, padding: 12, marginBottom: 16 },
};
