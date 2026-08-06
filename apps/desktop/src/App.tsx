import "./styles/App.css";

function App() {
  return (
    <div className="layout">

      <aside className="sidebar">
        <h2>DentFlow Pro</h2>

        <button>🏠 儀表板</button>
        <button>👤 病患管理</button>
        <button>🦷 植體追蹤</button>
        <button>📦 庫存管理</button>
        <button>🛒 採購管理</button>
        <button>📊 報表</button>
        <button>⚙ 系統設定</button>
      </aside>

      <main className="content">

        <div className="header">
          <h1>儀表板</h1>

          <div>
            Administrator
          </div>
        </div>

        <div className="cards">

          <div className="card">
            <h3>今日手術</h3>
            <h1>0</h1>
          </div>

          <div className="card">
            <h3>低庫存</h3>
            <h1>0</h1>
          </div>

          <div className="card">
            <h3>待OCR</h3>
            <h1>0</h1>
          </div>

          <div className="card">
            <h3>待簽名</h3>
            <h1>0</h1>
          </div>

        </div>

      </main>

    </div>
  );
}

export default App;