import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

import { canCreate, canUpdate } from "../utils/permissions";

const SESSION_STORAGE_KEY = "dentflow-auth-session";
const categories = ["植體", "癒合帽", "印模之台", "仿支體", "臨時之台", "正式之台", "一般耗材"];

const emptyForm: DentflowInventoryInput = {
  name: "", category: "植體", brand: "", model: "", specification: "",
  refNumber: "", lotNumber: "", expiryDate: "", safetyStock: 0,
};

function getSession() {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as DentflowAuthSession) : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function Inventory() {
  const [session] = useState(getSession);
  const [items, setItems] = useState<DentflowInventoryRecord[]>([]);
  const [form, setForm] = useState<DentflowInventoryInput>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const mayCreate = Boolean(session && canCreate(session.role, "inventory"));
  const mayUpdate = Boolean(session && canUpdate(session.role, "inventory"));

  async function load() {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      setItems(await window.dentflow.inventory.list(session.clinicId));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    void window.dentflow.inventory
      .list(session.clinicId)
      .then(setItems)
      .catch((loadError: unknown) => setError(errorMessage(loadError)))
      .finally(() => setLoading(false));
  }, [session]);

  const filteredItems = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      [item.name, item.category, item.brand, item.model, item.specification, item.refNumber, item.lotNumber]
        .join(" ").toLowerCase().includes(query),
    );
  }, [items, keyword]);

  function updateField<K extends keyof DentflowInventoryInput>(field: K, value: DentflowInventoryInput[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function edit(item: DentflowInventoryRecord) {
    setEditingId(item.id);
    setForm({
      name: item.name, category: item.category, brand: item.brand, model: item.model,
      specification: item.specification, refNumber: item.refNumber, lotNumber: item.lotNumber,
      expiryDate: item.expiryDate, safetyStock: item.safetyStock,
    });
  }

  function resetForm() { setEditingId(null); setForm(emptyForm); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (editingId === null) await window.dentflow.inventory.create(form);
      else await window.dentflow.inventory.update(editingId, form);
      resetForm();
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: DentflowInventoryRecord) {
    if (!window.confirm(`確定要刪除「${item.name}」嗎？`)) return;
    setError("");
    try {
      await window.dentflow.inventory.delete(item.id);
      await load();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}><div><p style={styles.eyebrow}>INVENTORY MASTER</p><h1 style={styles.title}>庫存品項管理</h1><p style={styles.subtitle}>建立植體、五類套件與耗材批次，供進貨入庫使用。</p></div></div>
      {error && <div style={styles.error} role="alert">{error}</div>}

      {(mayCreate || (editingId !== null && mayUpdate)) && (
        <form style={styles.formCard} onSubmit={submit}>
          <h2 style={styles.sectionTitle}>{editingId === null ? "新增庫存品項" : "修改庫存品項"}</h2>
          <div style={styles.formGrid}>
            <Field label="品項名稱 *"><input required value={form.name} onChange={(e) => updateField("name", e.target.value)} /></Field>
            <Field label="分類 *"><select value={form.category} onChange={(e) => updateField("category", e.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
            <Field label="品牌"><input value={form.brand} onChange={(e) => updateField("brand", e.target.value)} /></Field>
            <Field label="系列／型號"><input value={form.model} onChange={(e) => updateField("model", e.target.value)} /></Field>
            <Field label="平台／尺寸／規格"><input value={form.specification} onChange={(e) => updateField("specification", e.target.value)} /></Field>
            <Field label="REF 貨號"><input value={form.refNumber} onChange={(e) => updateField("refNumber", e.target.value)} /></Field>
            <Field label="LOT 批號"><input value={form.lotNumber} onChange={(e) => updateField("lotNumber", e.target.value)} /></Field>
            <Field label="有效期限"><input type="date" value={form.expiryDate} onChange={(e) => updateField("expiryDate", e.target.value)} /></Field>
            <Field label="安全庫存"><input type="number" min="0" step="1" value={form.safetyStock} onChange={(e) => updateField("safetyStock", Number(e.target.value))} /></Field>
          </div>
          <div style={styles.actions}>
            {editingId !== null && <button type="button" style={styles.secondaryButton} onClick={resetForm}>取消</button>}
            <button type="submit" style={styles.primaryButton} disabled={saving}>{saving ? "儲存中..." : editingId === null ? "新增品項" : "儲存修改"}</button>
          </div>
        </form>
      )}

      <div style={styles.listCard}>
        <div style={styles.listHeader}><div><h2 style={styles.sectionTitle}>品項清單</h2><span style={styles.count}>{filteredItems.length} 項</span></div><input style={styles.search} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜尋名稱、分類、品牌、REF、LOT" /></div>
        {loading ? <div style={styles.empty}>讀取中...</div> : filteredItems.length === 0 ? <div style={styles.empty}>尚無庫存品項，請先建立第一筆產品或批次。</div> : (
          <div style={styles.tableScroll}><table style={styles.table}>
            <thead><tr><th>分類</th><th>品項</th><th>品牌／型號</th><th>規格</th><th>REF／LOT</th><th>庫存</th><th>安全庫存</th><th>平均成本</th><th>操作</th></tr></thead>
            <tbody>{filteredItems.map((item) => <tr key={item.id}>
              <td>{item.category}</td><td><strong>{item.name}</strong></td><td>{[item.brand, item.model].filter(Boolean).join(" / ") || "—"}</td><td>{item.specification || "—"}</td><td>{[item.refNumber, item.lotNumber].filter(Boolean).join(" / ") || "—"}</td>
              <td style={item.quantity <= item.safetyStock ? styles.lowStock : undefined}>{item.quantity}</td><td>{item.safetyStock}</td><td>NT${item.unitCost.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}</td>
              <td>{mayUpdate && <div style={styles.rowActions}><button type="button" onClick={() => edit(item)}>修改</button><button type="button" onClick={() => void remove(item)}>刪除</button></div>}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={styles.field}><span>{label}</span>{children}</label>;
}

const styles: Record<string, CSSProperties> = {
  page: { width: "100%", maxWidth: "1600px", margin: "0 auto", padding: 28 }, header: { display: "flex", justifyContent: "space-between", marginBottom: 20 },
  eyebrow: { color: "#4d7a5f", fontSize: 11, fontWeight: 800, letterSpacing: ".13em" }, title: { margin: "5px 0", color: "#1f4531", fontSize: 30 }, subtitle: { color: "#728078" },
  error: { marginBottom: 16, padding: 12, border: "1px solid #edc9c6", borderRadius: 10, background: "#fff4f3", color: "#a3433b" }, formCard: { marginBottom: 22, padding: 20, border: "1px solid #dce7df", borderRadius: 14, background: "#fff" },
  sectionTitle: { margin: 0, color: "#294f3c", fontSize: 18 }, formGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(180px, 1fr))", gap: 14, marginTop: 16 }, field: { display: "grid", gap: 6, color: "#52675b", fontSize: 12, fontWeight: 700 },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }, primaryButton: { minHeight: 40, padding: "0 16px", border: 0, borderRadius: 9, background: "#3e6d50", color: "#fff", fontWeight: 800, cursor: "pointer" }, secondaryButton: { minHeight: 40, padding: "0 16px", border: "1px solid #cfdcd4", borderRadius: 9, background: "#fff", cursor: "pointer" },
  listCard: { border: "1px solid #dce7df", borderRadius: 14, background: "#fff", overflow: "hidden" }, listHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: 18 }, count: { display: "inline-block", marginTop: 5, color: "#819087", fontSize: 11 }, search: { width: 330, minHeight: 40, padding: "0 12px", border: "1px solid #cfddd5", borderRadius: 9 },
  tableScroll: { overflowX: "auto" }, table: { width: "100%", minWidth: 1150, borderCollapse: "collapse" }, empty: { padding: 42, color: "#839087", textAlign: "center" }, lowStock: { color: "#b04d42", fontWeight: 800 }, rowActions: { display: "flex", gap: 7 },
};
