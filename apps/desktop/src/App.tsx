import {
  HashRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { useEffect, useState } from "react";

import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Doctors from "./pages/Doctors";
import Implants from "./pages/Implants";
import Inventory from "./pages/Inventory";
import Purchase from "./pages/Purchase";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import { canAccessModule } from "./utils/permissions";

const SESSION_STORAGE_KEY = "dentflow-auth-session";

function App() {
  const [session, setSession] = useState<DentflowAuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    void window.dentflow.auth
      .current()
      .then((currentSession) => {
        if (currentSession) {
          authenticate(currentSession);
        }
      })
      .finally(() => setCheckingSession(false));
  }, []);

  function authenticate(nextSession: DentflowAuthSession) {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }

  async function logout() {
    await window.dentflow.auth.logout();
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
  }

  if (checkingSession) {
    return <div className="auth-page">正在載入診所系統...</div>;
  }

  if (!session) {
    return <Login onAuthenticated={authenticate} />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<MainLayout session={session} onLogout={logout} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          {canAccessModule(session.role, "patients") && <Route path="/patients" element={<Patients />} />}
          {canAccessModule(session.role, "doctors") && <Route path="/doctors" element={<Doctors />} />}
          {canAccessModule(session.role, "implants") && <Route path="/implants" element={<Implants />} />}
          {canAccessModule(session.role, "inventory") && <Route path="/inventory" element={<Inventory />} />}
          {canAccessModule(session.role, "purchase") && <Route path="/purchase" element={<Purchase />} />}
          {canAccessModule(session.role, "reports") && <Route path="/reports" element={<Reports />} />}
          {canAccessModule(session.role, "settings") && <Route path="/settings" element={<Settings />} />}
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
