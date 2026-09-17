import {
  NavLink,
} from "react-router-dom";

import {
  canAccessModule,
} from "../utils/permissions";

import type {
  DentflowModule,
} from "../utils/permissions";

import "../styles/sidebar.css";

/* =========================================================
   Types
========================================================= */

type SidebarProps = {
  session:
    DentflowAuthSession | null;
};

type SidebarItem = {
  label: string;
  path: string;
  icon: string;
  module: DentflowModule;
};

/* =========================================================
   Navigation
========================================================= */

const sidebarItems:
  SidebarItem[] = [
    {
      label:
        "儀表板",

      path:
        "/",

      icon:
        "▦",

      module:
        "dashboard",
    },

    {
      label:
        "病患管理",

      path:
        "/patients",

      icon:
        "●",

      module:
        "patients",
    },

    {
      label:
        "醫師管理",

      path:
        "/doctors",

      icon:
        "✚",

      module:
        "doctors",
    },

    {
      label:
        "植體追溯",

      path:
        "/implants",

      icon:
        "🦷",

      module:
        "implants",
    },

    {
      label:
        "植體與套件庫存",

      path:
        "/implant-inventory",

      icon:
        "▣",

      module:
        "inventory",
    },

    {
      label:
        "癒合醫療使用紀錄",

      path:
        "/consumables",

      icon:
        "✦",

      module:
        "consumables",
    },

    {
      label:
        "癒合醫療庫存管理",

      path:
        "/medical-inventory",

      icon:
        "✦",

      module:
        "inventory",
    },

    {
      label:
        "一般耗材使用紀錄",

      path:
        "/general-consumable-usage",

      icon:
        "⇅",

      module:
        "purchase",
    },

    {
      label:
        "一般耗材庫存管理",

      path:
        "/inventory",

      icon:
        "▣",

      module:
        "inventory",
    },

    {
      label:
        "報表",

      path:
        "/reports",

      icon:
        "▤",

      module:
        "reports",
    },

    {
      label:
        "系統設定",

      path:
        "/settings",

      icon:
        "⚙",

      module:
        "settings",
    },
  ];

/* =========================================================
   Helpers
========================================================= */

function getRoleLabel(
  session:
    DentflowAuthSession,
) {
  if (
    session.roleLabel
  ) {
    return session.roleLabel;
  }

  switch (
    session.role
  ) {
    case "Doctor":
      return "醫師";

    case "Assistant":
      return "助理";

    case "Admin":
      return "管理者";

    case "Accountant":
      return "會計";

    case "Procurement":
      return "採購";

    default:
      return session.role;
  }
}

function getAvatarLetter(
  name: string,
) {
  const trimmed =
    name.trim();

  if (!trimmed) {
    return "C";
  }

  return trimmed
    .charAt(0)
    .toUpperCase();
}

/* =========================================================
   Brand
========================================================= */

function SidebarBrand() {
  return (
    <div className="sidebar-header">
      <div className="sidebar-logo">
        C
      </div>

      <div className="sidebar-brand">
        <div className="sidebar-brand-title">
          捷晞美學牙醫
        </div>

        <div className="sidebar-brand-subtitle">
          C&amp;C DENTAL
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Component
========================================================= */

export default function Sidebar({
  session,
}: SidebarProps) {
  if (!session) {
    return (
      <aside className="sidebar">
        <SidebarBrand />
      </aside>
    );
  }

  const visibleItems =
    sidebarItems.filter(
      (item) =>
        canAccessModule(
          session.role,
          item.module,
        ),
    );

  return (
    <aside className="sidebar">
      {/* ===================================================
          Brand
      =================================================== */}

      <SidebarBrand />

      {/* ===================================================
          Current Clinic
      =================================================== */}

      <div className="sidebar-clinic">
        <div className="sidebar-clinic-label">
          目前院所
        </div>

        <div className="sidebar-clinic-name">
          {session.clinicName}
        </div>

        <div className="sidebar-clinic-code">
          {session.clinicCode ||
            "MAIN"}
        </div>
      </div>

      {/* ===================================================
          Navigation
      =================================================== */}

      <nav className="sidebar-nav">
        {visibleItems.map(
          (item) => (
            <NavLink
              key={
                item.path
              }
              to={
                item.path
              }
              end={
                item.path ===
                "/"
              }
              className={({
                isActive,
              }) =>
                [
                  "sidebar-nav-item",

                  isActive
                    ? "active"
                    : "",
                ]
                  .filter(
                    Boolean,
                  )
                  .join(" ")
              }
            >
              <span
                className="sidebar-nav-icon"
                aria-hidden="true"
              >
                {
                  item.icon
                }
              </span>

              <span className="sidebar-nav-label">
                {
                  item.label
                }
              </span>
            </NavLink>
          ),
        )}
      </nav>

      {/* ===================================================
          Footer User
      =================================================== */}

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">
            {getAvatarLetter(
              session.name,
            )}
          </div>

          <div className="sidebar-user-info">
            <div className="sidebar-user-name">
              {session.name}
            </div>

            <div className="sidebar-user-role">
              {getRoleLabel(
                session,
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
