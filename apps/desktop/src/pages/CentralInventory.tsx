import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { DentflowMainLayoutContext } from "../layouts/MainLayout";
import type { CentralBatch, CentralStock, InventoryOpening, InventorySource, OpeningIntent } from "../../shared/centralInventory";
import { finishOpeningIntent, saveOpeningIntent, mayReconcileFailure, openingIntentKey, prepareOpening, validateOpeningIntent } from "../../shared/openingIntent";
import "../styles/CentralInventory.css";
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
export default function CentralInventory({ serverUrl }: { serverUrl: string }) {
  const { session, clinicScope } = useOutletContext<DentflowMainLayoutContext>();
  if (clinicScope.mode !== "clinic") return <section className="central-stock"><h1>中央庫存</h1><p>請先切換至單一院所，查看庫存或進行盤點啟用。</p></section>;
  return <ClinicInventory key={`${serverUrl}:${session.userId}:${clinicScope.clinicId}`} serverUrl={serverUrl} session={session} clinicId={clinicScope.clinicId} />;
}
function ClinicInventory({ serverUrl, session, clinicId }: { serverUrl: string; session: DentflowAuthSession; clinicId: number }) {
  const admin = session.role === "Admin";
  const finance = ["Admin", "Accountant", "Procurement"].includes(session.role);
  const storageKey = openingIntentKey(serverUrl, session.userId, clinicId);
  const alive = useRef(true);
  const [stocks, setStocks] = useState<CentralStock[]>([]);
  const [staged, setStaged] = useState<CentralBatch[]>([]);
  const [stockNext, setStockNext] = useState<number | null>(null);
  const [stageNext, setStageNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CentralBatch | null>(null);
  const [sources, setSources] = useState<InventorySource[]>([]);
  const [opening, setOpening] = useState<InventoryOpening | null>(null);
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [prepared, setPrepared] = useState<OpeningIntent | null>(null);
  const [pending, setPending] = useState<OpeningIntent | null>(null);
  const [canReconcile, setCanReconcile] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [stock, waiting] = await Promise.all([window.dentflow.centralInventory.list(clinicId), admin ? window.dentflow.centralInventory.staged(clinicId) : Promise.resolve({ items: [], nextAfterId: null })]);
      if (!alive.current) return;
      setStocks(stock.items); setStockNext(stock.nextAfterId); setStaged(waiting.items); setStageNext(waiting.nextAfterId);
    } catch (e) { if (alive.current) setError(message(e)); }
    finally { if (alive.current) setBusy(false); }
  }, [admin, clinicId]);
  useEffect(() => {
    alive.current = true;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const request = validateOpeningIntent(JSON.parse(saved));
          if (request.clinicId !== clinicId) throw Error("保存的盤點請求院所不符，請聯絡管理者核對。");
          setPending(request);
        }
      } catch (e) { setStorageBlocked(true); setError(`盤點請求無法恢復：${message(e)}`); }
      void load();
    });
    return () => { active = false; alive.current = false; };
  }, [clinicId, load, storageKey]);
  async function more(waiting: boolean) {
    const cursor = waiting ? stageNext : stockNext; if (cursor === null || busy) return;
    setBusy(true); setError("");
    try {
      const page = waiting ? await window.dentflow.centralInventory.staged(clinicId, cursor) : await window.dentflow.centralInventory.list(clinicId, cursor);
      if (!alive.current) return;
      if (page.nextAfterId !== null && page.nextAfterId <= cursor) throw Error("庫存分頁異常，請重新整理。");
      if (waiting) { setStaged(rows => [...rows, ...page.items.filter(p => !rows.some(r => r.id === p.id))]); setStageNext(page.nextAfterId); }
      else { setStocks(rows => [...rows, ...(page.items as CentralStock[]).filter(p => !rows.some(r => r.id === p.id))]); setStockNext(page.nextAfterId); }
    } catch (e) { if (alive.current) setError(message(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function select(batch: CentralBatch, viewOpening = false) {
    setBusy(true); setError(""); setSelected(null); setOpening(null); setSources([]); setPrepared(null); setQuantity(""); setCost(""); setNote(""); setConfirmed(false);
    try {
      if (viewOpening) {
        const result = await window.dentflow.centralInventory.opening(batch.id, clinicId);
        if (alive.current) { setSelected(batch); setOpening(result); }
      } else {
        const result = await window.dentflow.centralInventory.sources(batch.id, clinicId);
        if (alive.current) { setSelected(batch); setSources(result.items); }
      }
    } catch (e) { if (alive.current) setError(message(e)); }
    finally { if (alive.current) setBusy(false); }
  }
  function review() {
    if (!selected || pending || !confirmed) return;
    try { setError(""); setPrepared(prepareOpening(clinicId, selected.id, selected.version, quantity, cost, note, crypto.randomUUID())); }
    catch (e) { setError(message(e)); }
  }
  async function submit(intent: OpeningIntent) {
    if (busy || !admin || storageBlocked) return;
    setBusy(true); setError(""); setSuccess(""); setCanReconcile(false);
    try {
      // Persist the exact request before IPC/network transfer; failed persistence stops the write.
      saveOpeningIntent(localStorage, storageKey, intent); setPending(intent); setPrepared(null);
      const { batchId, clinicId: targetClinic, ...input } = intent;
      const result = await window.dentflow.centralInventory.activate(batchId, targetClinic, input);
      if (!result.ok) {
        if (alive.current) { setError(result.error.message); setCanReconcile(mayReconcileFailure(result.error.status, result.error.code)); }
        return;
      }
      finishOpeningIntent(localStorage, storageKey, intent);
      if (!alive.current) return;
      setPending(null); setSelected(null); setSources([]); setSuccess(result.stock.unchanged ? "已確認原盤點請求完成，沒有重複入帳。" : "盤點啟用完成，期初紀錄已保存。");
      await load();
    } catch (e) { if (alive.current) setError(`請求尚未確認完成，請沿用原請求重試：${message(e)}`); }
    finally { if (alive.current) setBusy(false); }
  }
  function reconcile() {
    try { if (!pending) return; finishOpeningIntent(localStorage, storageKey, pending); setPending(null); setSelected(null); setCanReconcile(false); setPrepared(null); void load(); }
    catch (e) { setError(message(e)); }
  }
  const match = (row: CentralBatch) => [row.name, row.category, row.brand, row.model, row.specification, row.refNumber, row.lotNumber].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase().trim());
  const metadata = (row: CentralBatch) => <><td>{row.name}<small>{[row.brand, row.model, row.specification].filter(Boolean).join(" ／ ")}</small></td><td>{row.category}</td><td>{row.refNumber || "—"}<small>LOT：{row.lotNumber || "—"}</small></td><td>{row.expiryDate || "—"}</td></>;
  return <section className="central-stock">
    <header><div><h1>中央庫存</h1><p>在手數量包含已預留量；可用量為在手減預留。</p></div><button disabled={busy} onClick={() => void load()}>重新整理</button></header>
    {error && <p role="alert" className="stock-error">{error}</p>}{success && <p role="status" className="stock-success">{success}</p>}
    {storageBlocked && <p role="alert">保存的請求未能核對，已暫停盤點啟用。請保留此電腦的資料供管理者核對。</p>}
    {pending && admin && <article className="stock-panel"><h2>尚待確認的盤點請求</h2><p>批次 #{pending.batchId}｜盤點量 {pending.countedQuantity}｜單價 {pending.unitCost.toFixed(2)}</p><p>{pending.reconciliationNote}</p><p>已保存原內容。請沿用此請求確認結果，不另建盤點請求。</p><button disabled={busy || storageBlocked} onClick={() => void submit(pending)}>沿用原請求重試</button>{canReconcile && <button disabled={busy} onClick={reconcile}>已收到拒絕結果，重新載入核對</button>}</article>}
    <label className="stock-search">搜尋名稱、規格或 REF／LOT<input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋已載入的批次" /></label>
    <h2>已啟用庫存</h2><div className="stock-scroll"><table><thead><tr><th>品項／規格</th><th>類別</th><th>REF／LOT</th><th>效期</th><th>在手</th><th>預留</th><th>可用</th>{finance && <th>單價</th>}<th>紀錄</th></tr></thead><tbody>{stocks.filter(match).map(row => <tr key={row.id}>{metadata(row)}<td>{row.onHand}</td><td>{row.reserved}</td><td>{row.available}</td>{finance && <td>{row.unitCost ?? "—"}</td>}<td>{finance && <button disabled={busy} onClick={() => void select(row, true)}>期初紀錄</button>}</td></tr>)}</tbody></table></div>{!stocks.length && !busy && <p>目前沒有已啟用庫存。</p>}{stockNext !== null && <button disabled={busy} onClick={() => void more(false)}>載入更多已啟用批次</button>}
    {admin && <><h2>待核對來源</h2><p>來源數量與成本僅供核對。完成來源比對及實際盤點後，才選擇一個代表實體庫存的批次啟用。</p><div className="stock-scroll"><table><thead><tr><th>品項／規格</th><th>類別</th><th>REF／LOT</th><th>效期</th><th>核對</th></tr></thead><tbody>{staged.filter(match).map(row => <tr key={row.id}>{metadata(row)}<td><button disabled={busy || Boolean(pending) || storageBlocked} onClick={() => void select(row)}>查看來源並盤點</button></td></tr>)}</tbody></table></div>{!staged.length && !busy && <p>目前沒有待核對批次。</p>}{stageNext !== null && <button disabled={busy} onClick={() => void more(true)}>載入更多待核對批次</button>}</>}
    {selected && opening && <article className="stock-panel"><h2>{selected.name}｜期初紀錄</h2><dl><dt>盤點量</dt><dd>{opening.countedQuantity}</dd><dt>期初單價</dt><dd>{opening.unitCost}</dd><dt>來源核對說明</dt><dd>{opening.reconciliationNote}</dd><dt>操作者</dt><dd>#{opening.actorUserId}</dd><dt>時間</dt><dd>{new Date(opening.createdAt).toLocaleString("zh-TW")}</dd></dl><button onClick={() => { setSelected(null); setOpening(null); }}>關閉</button></article>}
    {selected && !opening && !pending && admin && <article className="stock-panel"><h2>{selected.name}｜來源與實際盤點</h2><p>REF：{selected.refNumber || "—"} ／ LOT：{selected.lotNumber || "—"}</p>{sources.map((source, i) => <div key={`${source.sourceId}:${source.legacyInventoryId}:${i}`} className="stock-source"><strong>來源電腦：{source.sourceId} ／ 舊批次 #{source.legacyInventoryId}</strong><p>來源數量：{String(source.snapshot.quantity ?? "未提供")} ／ 來源成本：{String(source.snapshot.unitCost ?? "未提供")}</p><details><summary>完整來源紀錄</summary><pre>{JSON.stringify(source.snapshot, null, 2)}</pre></details></div>)}{!sources.length && <p>沒有已匯入來源快照，請先核對此批次來源。</p>}
      {!prepared ? <form onSubmit={e => { e.preventDefault(); review(); }}><div className="stock-fields"><label>實際盤點量<input required inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>明確確認的期初單價<input required inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} /></label></div><label>盤點及來源核對說明<textarea required value={note} onChange={e => setNote(e.target.value)} /></label><label className="stock-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />已完成實際盤點、比對其他來源，確認此批次沒有重複代表同一份庫存。</label><button disabled={busy || !confirmed || storageBlocked}>檢查啟用內容</button><button type="button" onClick={() => setSelected(null)}>取消</button></form>
        : <div><h3>確認盤點啟用</h3><p>批次 #{prepared.batchId}｜實際盤點量 {prepared.countedQuantity}｜期初單價 {prepared.unitCost.toFixed(2)}</p><p>{prepared.reconciliationNote}</p><p>啟用後不得重新設定期初數量。</p><button disabled={busy} onClick={() => void submit(prepared)}>確認並啟用</button><button disabled={busy} onClick={() => setPrepared(null)}>返回修改</button></div>}
    </article>}
    {busy && <p role="status">處理中…</p>}
  </section>;
}
