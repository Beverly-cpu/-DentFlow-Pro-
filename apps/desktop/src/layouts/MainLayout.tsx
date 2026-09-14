import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

type MainLayoutProps = {
  session: DentflowAuthSession;
  onLogout: () => Promise<void>;
};

export default function MainLayout({ session, onLogout }: MainLayoutProps) {
  return (
    <div className="layout">
      <Sidebar session={session} onLogout={onLogout} />

      <main className="content">
        <Header session={session} />
        <Outlet />
      </main>
    </div>
  );
}
