import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

export default function MainLayout() {
  return (
    <div className="layout">
      <Sidebar />

      <main className="content">
        <Header />
        <Outlet />
      </main>
    </div>
  );
}