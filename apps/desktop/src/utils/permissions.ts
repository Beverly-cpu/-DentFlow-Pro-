export type DentflowRole =
  | "Doctor"
  | "Assistant"
  | "Admin"
  | "Accountant";

export type DentflowModule =
  | "dashboard"
  | "patients"
  | "doctors"
  | "implants"
  | "inventory"
  | "purchase"
  | "reports"
  | "settings";

type Permission = "access" | "create" | "update";

const permissions: Record<
  DentflowRole,
  Record<DentflowModule, readonly Permission[]>
> = {
  Doctor: {
    dashboard: ["access"],
    patients: ["access", "create", "update"],
    doctors: ["access"],
    implants: ["access", "create", "update"],
    inventory: ["access"],
    purchase: [],
    reports: ["access"],
    settings: [],
  },
  Assistant: {
    dashboard: ["access"],
    patients: ["access", "create", "update"],
    doctors: ["access"],
    implants: ["access", "create", "update"],
    inventory: ["access", "create", "update"],
    purchase: ["access", "create", "update"],
    reports: ["access"],
    settings: [],
  },
  Admin: {
    dashboard: ["access", "create", "update"],
    patients: ["access", "create", "update"],
    doctors: ["access", "create", "update"],
    implants: ["access", "create", "update"],
    inventory: ["access", "create", "update"],
    purchase: ["access", "create", "update"],
    reports: ["access", "create", "update"],
    settings: ["access", "create", "update"],
  },
  Accountant: {
    dashboard: ["access"],
    patients: ["access"],
    doctors: ["access"],
    implants: ["access"],
    inventory: ["access"],
    purchase: ["access", "create", "update"],
    reports: ["access", "create"],
    settings: [],
  },
};

function hasPermission(
  role: DentflowRole,
  module: DentflowModule,
  permission: Permission,
) {
  return permissions[role][module].includes(permission);
}

export function canAccessModule(
  role: DentflowRole,
  module: DentflowModule,
) {
  return hasPermission(role, module, "access");
}

export function canCreate(
  role: DentflowRole,
  module: DentflowModule,
) {
  return hasPermission(role, module, "create");
}

export function canUpdate(
  role: DentflowRole,
  module: DentflowModule,
) {
  return hasPermission(role, module, "update");
}
