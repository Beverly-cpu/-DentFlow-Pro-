import "../styles/header.css";

export default function Header() {
  return (
    <header className="top-header">
      <div>
        <p className="header-eyebrow">DENTFLOW PRO</p>
        <h1>診所醫材管理系統</h1>
      </div>

      <div className="header-user">
        <div className="header-avatar">A</div>

        <div>
          <strong>Administrator</strong>
          <span>系統管理員</span>
        </div>
      </div>
    </header>
  );
}