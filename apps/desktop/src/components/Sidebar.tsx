import { NavLink } from "react-router-dom";
import "../styles/sidebar.css";
import {
  canAccessModule,
  type DentflowModule,
} from "../utils/permissions";

const menuItems: Array<{
  path: string;
  icon: string;
  label: string;
  module: DentflowModule;
}> = [
  {
    path: "/dashboard",
    icon: "⌂",
    label: "儀表板",
    module: "dashboard",
  },
  {
    path: "/patients",
    icon: "♙",
    label: "病患管理",
    module: "patients",
  },
   {
    path: "/doctors",
    icon: "👨‍⚕️",
    label: "醫生管理",
    module: "doctors",
  },
  {
    path: "/implants",
    icon: "◉",
    label: "植體追蹤",
    module: "implants",
  },
  {
    path: "/inventory",
    icon: "□",
    label: "庫存管理",
    module: "inventory",
  },
  {
    path: "/purchase",
    icon: "▣",
    label: "採購管理",
    module: "purchase",
  },
  {
    path: "/reports",
    icon: "▥",
    label: "報表",
    module: "reports",
  },
  {
    path: "/settings",
    icon: "⚙",
    label: "系統設定",
    module: "settings",
  },
];

type SidebarProps = {
  session: DentflowAuthSession;
  onLogout: () => Promise<void>;
};

export default function Sidebar({ session, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h2>DentFlow Pro</h2>
        <p>診所醫材管理系統</p>
      </div>

      <nav className="sidebar-nav">
        {menuItems
          .filter((item) => canAccessModule(session.role, item.module))
          .map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link${isActive ? " active" : ""}`
            }
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
          ))}
      </nav>

      <button className="sidebar-logout" type="button" onClick={() => void onLogout()}>
        登出
      </button>
    </aside>
  );
}
