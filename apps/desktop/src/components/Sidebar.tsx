import { NavLink } from "react-router-dom";
import "../styles/sidebar.css";

const menuItems = [
  {
    path: "/dashboard",
    icon: "⌂",
    label: "儀表板",
  },
  {
    path: "/patients",
    icon: "♙",
    label: "病患管理",
  },
   {
    path: "/doctors",
    icon: "👨‍⚕️",
    label: "醫生管理",
  },
  {
    path: "/implants",
    icon: "◉",
    label: "植體追蹤",
  },
  {
    path: "/inventory",
    icon: "□",
    label: "庫存管理",
  },
  {
    path: "/purchase",
    icon: "▣",
    label: "採購管理",
  },
  {
    path: "/reports",
    icon: "▥",
    label: "報表",
  },
  {
    path: "/settings",
    icon: "⚙",
    label: "系統設定",
  },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h2>DentFlow Pro</h2>
        <p>診所醫材管理系統</p>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
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
    </aside>
  );
}