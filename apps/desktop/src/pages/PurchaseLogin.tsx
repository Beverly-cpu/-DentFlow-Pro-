import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  onLogin: (session: DentflowAuthSession) => void;
};

export default function PurchaseLogin({ onLogin }: Props) {
  const navigate = useNavigate();
  const [clinics, setClinics] = useState<DentflowClinicRecord[]>([]);
  const [clinicId, setClinicId] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const records = await window.dentflow.auth.activeClinics();
        setClinics(records);
        setClinicId(records[0] ? String(records[0].id) : "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "無法載入院所資料。");
      }
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account.trim() || !password || !clinicId) {
      setError("請完整輸入院所、帳號與密碼。");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const session = await window.dentflow.auth.login({
        account: account.trim().toLowerCase(),
        password,
        clinicId: Number(clinicId),
      });
      if (session.role !== "Accountant" && session.role !== "Admin") {
        throw new Error("此入口僅供採購／會計與管理者登入。");
      }
      onLogin(session);
      navigate("/purchase", { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "採購登入失敗。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.mark}>採</div>
          <div>
            <div style={styles.eyebrow}>C&amp;C DENTAL PROCUREMENT</div>
            <h1 style={styles.title}>採購叫貨系統</h1>
            <p style={styles.copy}>管理一般耗材、低庫存品項、叫貨與入庫紀錄</p>
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={submit} style={styles.form}>
          <label style={styles.field}>院所
            <select value={clinicId} onChange={(event) => setClinicId(event.target.value)} style={styles.input}>
              <option value="">請選擇院所</option>
              {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
            </select>
          </label>
          <label style={styles.field}>採購帳號
            <input value={account} onChange={(event) => setAccount(event.target.value)} autoComplete="username" style={styles.input} />
          </label>
          <label style={styles.field}>密碼
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" style={styles.input} />
          </label>
          <button type="submit" disabled={submitting} style={styles.primary}>
            {submitting ? "登入中…" : "登入採購系統"}
          </button>
          <button type="button" onClick={() => navigate("/login")} style={styles.secondary}>返回診所系統登入</button>
        </form>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "linear-gradient(145deg, #dfeadf, #f8fbf8)" },
  card: { width: "min(520px, 96vw)", padding: 32, borderRadius: 28, background: "rgba(255,255,255,.96)", border: "1px solid #d7e5d7", boxShadow: "0 20px 60px rgba(60,80,60,.16)" },
  brand: { display: "flex", gap: 16, alignItems: "center", marginBottom: 26 },
  mark: { width: 58, height: 58, borderRadius: 18, display: "grid", placeItems: "center", background: "#6f946f", color: "white", fontSize: 26, fontWeight: 900 },
  eyebrow: { color: "#6f946f", fontSize: 12, fontWeight: 800, letterSpacing: 1.2 },
  title: { margin: "5px 0", color: "#3c5f42", fontSize: 30 },
  copy: { margin: 0, color: "#667466", lineHeight: 1.6 },
  form: { display: "grid", gap: 16 },
  field: { display: "grid", gap: 7, color: "#526952", fontWeight: 800, fontSize: 14 },
  input: { width: "100%", border: "1px solid #c8d8c8", borderRadius: 12, padding: "12px 13px", background: "white", fontSize: 15 },
  primary: { border: 0, borderRadius: 12, padding: 13, background: "#5f875f", color: "white", fontSize: 15, fontWeight: 800, cursor: "pointer" },
  secondary: { border: "1px solid #cadaca", borderRadius: 12, padding: 12, background: "white", color: "#3c5f42", fontWeight: 800, cursor: "pointer" },
  error: { marginBottom: 18, padding: 12, borderRadius: 12, background: "#fff0f0", border: "1px solid #efcaca", color: "#984d4d" },
};
