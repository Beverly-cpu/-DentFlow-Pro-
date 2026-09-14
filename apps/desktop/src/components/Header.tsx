import "../styles/header.css";

export default function Header({ session }: { session: DentflowAuthSession }) {
  return (
    <header className="top-header">
      <div>
        <p className="header-eyebrow">DENTFLOW PRO</p>
        <h1>診所醫材管理系統</h1>
      </div>

      <div className="header-user">
        <div className="header-avatar">{session.userName.slice(0, 1).toUpperCase()}</div>

        <div>
          <strong>{session.userName}</strong>
          <span>{session.role}</span>
        </div>
      </div>
    </header>
  );
}
