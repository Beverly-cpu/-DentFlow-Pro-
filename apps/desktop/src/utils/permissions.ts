/* =========================================================
   捷晞美學牙醫 / C&C DENTAL Permissions
========================================================= */

/* =========================================================
   Modules
========================================================= */

export type DentflowModule =
  | "dashboard"
  | "patients"
  | "doctors"
  | "implants"
  | "consumables"
  | "inventory"
  | "purchase"
  | "reports"
  | "settings";

/* =========================================================
   Actions
========================================================= */

export type DentflowPermissionAction =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "manage"
  | "recordUsage"
  | "updateStatus"
  | "adjustInventory"
  | "resetPassword"
  | "manageUsers"
  | "manageClinics";

/* =========================================================
   Permission Key
========================================================= */

export type DentflowPermissionKey =
  | `${DentflowModule}:${DentflowPermissionAction}`;

/* =========================================================
   Permission Definition
========================================================= */

type RolePermissionConfig = {
  modules:
    DentflowModule[];

  permissions:
    DentflowPermissionKey[];
};

/* =========================================================
   Role Permissions
========================================================= */

const ROLE_PERMISSIONS:
  Record<
    DentflowUserRole,
    RolePermissionConfig
  > = {
  /* =======================================================
     Doctor
  ======================================================= */

  Doctor: {
    modules: [
      "dashboard",
      "patients",
      "implants",
      "consumables",
      "reports",
    ],

    permissions: [
      /* Dashboard */
      "dashboard:view",

      /* Patients */
      "patients:view",

      /*
       * Doctor 不提供「醫師管理」與「庫存管理」。
       * 因此不授予 doctors:view / inventory:view。
       */

      /* Implants */
      "implants:view",
      "implants:create",
      "implants:update",
      "implants:recordUsage",
      "implants:updateStatus",

      /* Consumables */
      "consumables:view",
      "consumables:create",
      "consumables:update",
      "consumables:recordUsage",

      /* Reports */
      "reports:view",
    ],
  },

  /* =======================================================
     Assistant
  ======================================================= */

  Assistant: {
    modules: [
      "dashboard",
      "patients",
      "doctors",
      "implants",
      "consumables",
      "inventory",
    ],

    permissions: [
      /* Dashboard */
      "dashboard:view",

      /* Patients */
      "patients:view",
      "patients:create",
      "patients:update",

      /* Doctors */
      "doctors:view",

      /* Implants */
      "implants:view",
      "implants:create",
      "implants:update",
      "implants:recordUsage",
      "implants:updateStatus",

      /* Consumables */
      "consumables:view",
      "consumables:create",
      "consumables:update",
      "consumables:recordUsage",

      /* Inventory */
      "inventory:view",
      "inventory:create",
      "inventory:update",
      "inventory:adjustInventory",

    ],
  },

  /* =======================================================
     Admin
  ======================================================= */

  Admin: {
    modules: [
      "dashboard",
      "patients",
      "doctors",
      "implants",
      "consumables",
      "inventory",
      "purchase",
      "reports",
      "settings",
    ],

    permissions: [
      /* Dashboard */
      "dashboard:view",
      "dashboard:manage",

      /* Patients */
      "patients:view",
      "patients:create",
      "patients:update",
      "patients:delete",
      "patients:manage",

      /* Doctors */
      "doctors:view",
      "doctors:create",
      "doctors:update",
      "doctors:delete",
      "doctors:manage",

      /* Implants */
      "implants:view",
      "implants:create",
      "implants:update",
      "implants:delete",
      "implants:recordUsage",
      "implants:updateStatus",
      "implants:manage",

      /* Consumables */
      "consumables:view",
      "consumables:create",
      "consumables:update",
      "consumables:delete",
      "consumables:recordUsage",
      "consumables:updateStatus",
      "consumables:manage",

      /* Inventory */
      "inventory:view",
      "inventory:create",
      "inventory:update",
      "inventory:delete",
      "inventory:adjustInventory",
      "inventory:manage",

      /* Purchase */
      "purchase:view",
      "purchase:create",
      "purchase:update",
      "purchase:delete",
      "purchase:manage",

      /* Reports */
      "reports:view",
      "reports:manage",

      /* Settings */
      "settings:view",
      "settings:update",
      "settings:manage",
      "settings:resetPassword",
      "settings:manageUsers",
      "settings:manageClinics",
    ],
  },

  /* =======================================================
     Accountant
  ======================================================= */

  Accountant: {
    modules: [
      "dashboard",
      "inventory",
      "purchase",
      "reports",
    ],

    permissions: [
      /* Dashboard */
      "dashboard:view",

      /* Other supply catalog and stock */
      "inventory:view",
      "inventory:create",
      "inventory:update",
      "inventory:adjustInventory",

      /* Purchase */
      "purchase:view",
      "purchase:create",
      "purchase:update",

      /* Reports */
      "reports:view",
    ],
  },
};

/* =========================================================
   Module Labels
========================================================= */

export const MODULE_LABELS:
  Record<
    DentflowModule,
    string
  > = {
  dashboard:
    "儀表板",

  patients:
    "病患管理",

  doctors:
    "醫師管理",

  implants:
    "植體追蹤",

  consumables:
    "耗材追蹤",

  inventory:
    "庫存管理",

  purchase:
    "採購管理",

  reports:
    "報表",

  settings:
    "系統設定",
};

/* =========================================================
   Role Labels
========================================================= */

export const ROLE_LABELS:
  Record<
    DentflowUserRole,
    string
  > = {
  Doctor:
    "醫師",

  Assistant:
    "助理",

  Admin:
    "管理者",

  Accountant:
    "會計",
};

/* =========================================================
   Role Icons
========================================================= */

export const ROLE_ICONS:
  Record<
    DentflowUserRole,
    string
  > = {
  Doctor:
    "🦷",

  Assistant:
    "🩺",

  Admin:
    "⚙",

  Accountant:
    "▤",
};

/* =========================================================
   Get Role Config
========================================================= */

export function getRolePermissionConfig(
  role:
    DentflowUserRole,
) {
  return ROLE_PERMISSIONS[
    role
  ];
}

/* =========================================================
   Module Access
========================================================= */

export function canAccessModule(
  role:
    DentflowUserRole,

  module:
    DentflowModule,
) {
  return ROLE_PERMISSIONS[
    role
  ].modules.includes(
    module,
  );
}

/* =========================================================
   Permission Access
========================================================= */

export function hasPermission(
  role:
    DentflowUserRole,

  permission:
    DentflowPermissionKey,
) {
  return ROLE_PERMISSIONS[
    role
  ].permissions.includes(
    permission,
  );
}

/* =========================================================
   Can View
========================================================= */

export function canView(
  role:
    DentflowUserRole,

  module:
    DentflowModule,
) {
  return hasPermission(
    role,
    `${module}:view`,
  );
}

/* =========================================================
   Can Create
========================================================= */

export function canCreate(
  role:
    DentflowUserRole,

  module:
    DentflowModule,
) {
  return hasPermission(
    role,
    `${module}:create`,
  );
}

/* =========================================================
   Can Update
========================================================= */

export function canUpdate(
  role:
    DentflowUserRole,

  module:
    DentflowModule,
) {
  return hasPermission(
    role,
    `${module}:update`,
  );
}

/* =========================================================
   Can Delete
========================================================= */

export function canDelete(
  role:
    DentflowUserRole,

  module:
    DentflowModule,
) {
  return hasPermission(
    role,
    `${module}:delete`,
  );
}

/* =========================================================
   Can Manage
========================================================= */

export function canManage(
  role:
    DentflowUserRole,

  module:
    DentflowModule,
) {
  return hasPermission(
    role,
    `${module}:manage`,
  );
}

/* =========================================================
   Implant Permissions
========================================================= */

export function canRecordImplantUsage(
  role:
    DentflowUserRole,
) {
  return hasPermission(
    role,
    "implants:recordUsage",
  );
}

export function canUpdateImplantStatus(
  role:
    DentflowUserRole,
) {
  return hasPermission(
    role,
    "implants:updateStatus",
  );
}

/* =========================================================
   Inventory Permissions
========================================================= */

export function canAdjustInventory(
  role:
    DentflowUserRole,
) {
  return hasPermission(
    role,
    "inventory:adjustInventory",
  );
}

/* =========================================================
   Settings Permissions
========================================================= */

export function canResetPassword(
  role:
    DentflowUserRole,
) {
  return hasPermission(
    role,
    "settings:resetPassword",
  );
}

export function canManageUsers(
  role:
    DentflowUserRole,
) {
  return hasPermission(
    role,
    "settings:manageUsers",
  );
}

export function canManageClinics(
  role:
    DentflowUserRole,
) {
  return hasPermission(
    role,
    "settings:manageClinics",
  );
}

/* =========================================================
   Get Visible Modules
========================================================= */

export function getVisibleModules(
  role:
    DentflowUserRole,
) {
  return [
    ...ROLE_PERMISSIONS[
      role
    ].modules,
  ];
}

/* =========================================================
   Get Permissions
========================================================= */

export function getPermissions(
  role:
    DentflowUserRole,
) {
  return [
    ...ROLE_PERMISSIONS[
      role
    ].permissions,
  ];
}

/* =========================================================
   Role Helpers
========================================================= */

export function isAdmin(
  role:
    DentflowUserRole,
) {
  return role ===
    "Admin";
}

export function isDoctor(
  role:
    DentflowUserRole,
) {
  return role ===
    "Doctor";
}

export function isAssistant(
  role:
    DentflowUserRole,
) {
  return role ===
    "Assistant";
}

export function isAccountant(
  role:
    DentflowUserRole,
) {
  return role ===
    "Accountant";
}

/* =========================================================
   Safe Access
========================================================= */

export function assertModuleAccess(
  role:
    DentflowUserRole,

  module:
    DentflowModule,
) {
  if (
    !canAccessModule(
      role,
      module,
    )
  ) {
    throw new Error(
      `角色「${ROLE_LABELS[role]}」沒有「${MODULE_LABELS[module]}」的存取權限`,
    );
  }
}

export function assertPermission(
  role:
    DentflowUserRole,

  permission:
    DentflowPermissionKey,
) {
  if (
    !hasPermission(
      role,
      permission,
    )
  ) {
    throw new Error(
      `角色「${ROLE_LABELS[role]}」沒有此操作權限`,
    );
  }
}
