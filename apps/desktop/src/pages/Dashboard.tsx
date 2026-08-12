import "../styles/dashboard.css";

const summaryCards = [
  {
    title: "待醫師叫貨",
    value: 5,
    unit: "個案",
    icon: "🦷",
  },
  {
    title: "醫師已叫貨",
    value: 3,
    unit: "個案",
    icon: "📋",
  },
  {
    title: "已取出待手術",
    value: 2,
    unit: "個案",
    icon: "📦",
  },
  {
    title: "待術後紀錄",
    value: 2,
    unit: "個案",
    icon: "🖊",
  },
  {
    title: "待歸回品項",
    value: 1,
    unit: "個案",
    icon: "↩",
  },
  {
    title: "低庫存提醒",
    value: 12,
    unit: "項",
    icon: "⚠",
  },
];

const recentCases = [
  {
    id: "IMP-2025-000125",
    patient: "王○明",
    tooth: "#36",
    date: "2025/05/26",
    status: "醫師已叫貨",
    className: "status-green",
  },
  {
    id: "IMP-2025-000124",
    patient: "李○華",
    tooth: "#46",
    date: "2025/05/27",
    status: "待醫師叫貨",
    className: "status-yellow",
  },
  {
    id: "IMP-2025-000123",
    patient: "張○婷",
    tooth: "#14",
    date: "2025/05/28",
    status: "已取出待手術",
    className: "status-blue",
  },
  {
    id: "IMP-2025-000122",
    patient: "陳○豪",
    tooth: "#26",
    date: "2025/05/21",
    status: "待術後紀錄",
    className: "status-purple",
  },
  {
    id: "IMP-2025-000121",
    patient: "林○文",
    tooth: "#11",
    date: "2025/05/20",
    status: "待歸回品項",
    className: "status-pink",
  },
];

const quickActions = [
  { icon: "＋", label: "新增植體個案" },
  { icon: "🦷", label: "待醫師叫貨單" },
  { icon: "☑", label: "確認取出" },
  { icon: "✎", label: "術後使用紀錄" },
  { icon: "↻", label: "歸回品項" },
  { icon: "◷", label: "歷史查詢" },
];

export default function Dashboard() {
  return (
    <section className="dashboard-page">
      <div className="dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">DENTFLOW PRO</p>
          <h1>早安，林助理 👋</h1>
          <p className="dashboard-date">今天是 2025/05/23 星期五</p>
        </div>

        <div className="dashboard-illustration">
          <div className="dashboard-illustration-circle">🦷</div>
        </div>
      </div>

      <div className="dashboard-summary-grid">
        {summaryCards.map((card) => (
          <article className="summary-card" key={card.title}>
            <p className="summary-title">{card.title}</p>

            <div className="summary-value-row">
              <span className="summary-icon">{card.icon}</span>

              <strong>{card.value}</strong>

              <span>{card.unit}</span>
            </div>

            <button type="button" className="summary-link">
              查看清單 →
            </button>
          </article>
        ))}
      </div>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel recent-panel">
          <div className="panel-heading">
            <h2>最近個案動態</h2>
            <button type="button">查看全部 →</button>
          </div>

          <div className="recent-table-wrapper">
            <table className="recent-table">
              <thead>
                <tr>
                  <th>個案編號</th>
                  <th>病人姓名</th>
                  <th>牙位</th>
                  <th>約診日期</th>
                  <th>狀態</th>
                </tr>
              </thead>

              <tbody>
                {recentCases.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.patient}</td>
                    <td>{item.tooth}</td>
                    <td>{item.date}</td>
                    <td>
                      <span className={`case-status ${item.className}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading">
            <h2>快速功能</h2>
          </div>

          <div className="quick-grid">
            {quickActions.map((action) => (
              <button className="quick-card" type="button" key={action.label}>
                <span className="quick-icon">{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="dashboard-panel">
          <div className="panel-heading">
            <h2>庫存狀態概覽</h2>
            <button type="button">查看全部 →</button>
          </div>

          <div className="inventory-overview">
            <div>
              <span>植體總項數</span>
              <strong>128</strong>
            </div>

            <div>
              <span>套件總項數</span>
              <strong>256</strong>
            </div>

            <div>
              <span>針線耗材</span>
              <strong>86</strong>
            </div>

            <div className="inventory-safe">
              <span>安全庫存內</span>
              <strong>92%</strong>

              <div className="inventory-progress">
                <div />
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading">
            <h2>系統公告</h2>
            <button type="button">查看全部 →</button>
          </div>

          <div className="announcement-list">
            <div>
              <span className="announcement-dot active" />
              <small>2025/05/20</small>
              <p>系統維護公告：5/25（日）01:00–03:00 系統將進行維護作業</p>
            </div>

            <div>
              <span className="announcement-dot" />
              <small>2025/05/15</small>
              <p>新功能上線：支援植體序號掃描與效期提醒</p>
            </div>

            <div>
              <span className="announcement-dot light" />
              <small>2025/05/10</small>
              <p>提醒：部分植體批號即將到期，請盡速使用</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}