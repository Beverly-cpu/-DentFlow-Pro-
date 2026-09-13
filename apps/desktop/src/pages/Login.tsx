import { useEffect, useState, type FormEvent } from "react";

import "../styles/auth.css";

type LoginProps = {
  onAuthenticated: (session: DentflowAuthSession) => void;
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function Login({ onAuthenticated }: LoginProps) {
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void window.dentflow.auth
      .status()
      .then((status) => setNeedsSetup(status.needsSetup))
      .catch((statusError: unknown) => setError(messageFrom(statusError)))
      .finally(() => setChecking(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const session = needsSetup
        ? await window.dentflow.auth.setup(name, account, password)
        : await window.dentflow.auth.login(account, password);

      onAuthenticated(session);
    } catch (submitError) {
      setError(messageFrom(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-logo">DF</div>
        <p className="auth-eyebrow">DENTFLOW PRO</p>
        <h1>{needsSetup ? "建立管理者帳號" : "登入診所系統"}</h1>
        <p className="auth-description">
          {needsSetup
            ? "首次啟動需要先建立一組管理者帳號。"
            : "請使用管理者建立的帳號登入。"}
        </p>

        {error && <div className="auth-error" role="alert">{error}</div>}

        {needsSetup && (
          <label>
            管理者姓名
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
        )}

        <label>
          登入帳號
          <input
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label>
          登入密碼
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={needsSetup ? "new-password" : "current-password"}
            minLength={needsSetup ? 8 : undefined}
            required
          />
        </label>

        <button type="submit" disabled={checking || saving}>
          {checking ? "檢查系統..." : saving ? "處理中..." : needsSetup ? "完成設定" : "登入"}
        </button>

        <span className="auth-version">Electron {window.dentflow.version}</span>
      </form>
    </main>
  );
}
