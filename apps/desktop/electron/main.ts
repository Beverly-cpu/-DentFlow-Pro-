import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initializeDatabase } from "./database/db";

import {
  createPatient,
  deletePatient,
  getPatients,
  updatePatient,
  type PatientInput,
} from "./database/patientRepository";

import {
  createDoctor,
  deleteDoctor,
  getDoctors,
  updateDoctor,
  type DoctorInput,
} from "./database/doctorRepository";

import {
  createImplant,
  deleteImplant,
  getImplants,
  updateImplant,
  type ImplantInput,
} from "./database/implantRepository";

import {
  createInventoryItem,
  deleteInventoryItem,
  getInventory,
  getInventoryTransactions,
  receiveInventory,
  updateInventoryItem,
  type InventoryInput,
} from "./database/inventoryRepository";
import {
  authenticate,
  createInitialAdmin,
  needsInitialSetup,
  type AuthSession,
} from "./database/authRepository";
import {
  canAccessModule,
  canCreate,
  canUpdate,
  type DentflowModule,
} from "../src/utils/permissions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessions = new Map<number, AuthSession>();

function requireSession(event: IpcMainInvokeEvent) {
  const session = sessions.get(event.sender.id);

  if (!session) {
    throw new Error("登入狀態已失效，請重新登入。");
  }

  return session;
}

function requirePermission(
  event: IpcMainInvokeEvent,
  module: DentflowModule,
  action: "access" | "create" | "update" = "access",
) {
  const session = requireSession(event);
  const allowed =
    action === "access"
      ? canAccessModule(session.role, module)
      : action === "create"
        ? canCreate(session.role, module)
        : canUpdate(session.role, module);

  if (!allowed) {
    throw new Error("此帳號沒有執行這項操作的權限。");
  }

  return session;
}

function registerAuthHandlers() {
  ipcMain.handle("auth:status", () => ({
    needsSetup: needsInitialSetup(),
  }));

  ipcMain.handle(
    "auth:setup",
    (event, name: string, account: string, password: string) => {
      const session = createInitialAdmin(name, account, password);
      sessions.set(event.sender.id, session);
      return session;
    },
  );

  ipcMain.handle(
    "auth:login",
    (event, account: string, password: string) => {
      const session = authenticate(account, password);
      sessions.set(event.sender.id, session);
      return session;
    },
  );

  ipcMain.handle("auth:current", (event) => {
    return sessions.get(event.sender.id) ?? null;
  });

  ipcMain.handle("auth:logout", (event) => {
    sessions.delete(event.sender.id);
    return true;
  });
}

/* =========================
   病患管理 IPC
========================= */

function registerPatientHandlers() {
  ipcMain.handle("patients:list", (event) => {
    requirePermission(event, "patients");
    return getPatients();
  });

  ipcMain.handle(
    "patients:create",
    (event, patient: PatientInput) => {
      requirePermission(event, "patients", "create");
      return createPatient(patient);
    },
  );

  ipcMain.handle(
    "patients:update",
    (event, id: number, patient: PatientInput) => {
      requirePermission(event, "patients", "update");
      return updatePatient(id, patient);
    },
  );

  ipcMain.handle("patients:delete", (event, id: number) => {
    requirePermission(event, "patients", "update");
    deletePatient(id);
    return true;
  });
}

/* =========================
   醫師管理 IPC
========================= */

function registerDoctorHandlers() {
  ipcMain.handle("doctors:list", (event) => {
    requirePermission(event, "doctors");
    return getDoctors();
  });

  ipcMain.handle(
    "doctors:create",
    (event, doctor: DoctorInput) => {
      requirePermission(event, "doctors", "create");
      return createDoctor(doctor);
    },
  );

  ipcMain.handle(
    "doctors:update",
    (event, id: number, doctor: DoctorInput) => {
      requirePermission(event, "doctors", "update");
      return updateDoctor(id, doctor);
    },
  );

  ipcMain.handle("doctors:delete", (event, id: number) => {
    requirePermission(event, "doctors", "update");
    return deleteDoctor(id);
  });
}

/* =========================
   植體追蹤 IPC
========================= */

function registerImplantHandlers() {
  ipcMain.handle("implants:list", (event) => {
    requirePermission(event, "implants");
    return getImplants();
  });

  ipcMain.handle(
    "implants:create",
    (event, implant: ImplantInput) => {
      requirePermission(event, "implants", "create");
      return createImplant(implant);
    },
  );

  ipcMain.handle(
    "implants:update",
    (event, id: number, implant: ImplantInput) => {
      requirePermission(event, "implants", "update");
      return updateImplant(id, implant);
    },
  );

  ipcMain.handle("implants:delete", (event, id: number) => {
    requirePermission(event, "implants", "update");
    return deleteImplant(id);
  });
}

function registerInventoryHandlers() {
  ipcMain.handle("inventory:list", (event) => {
    const session = requirePermission(event, "inventory");
    return getInventory(session.clinicId);
  });

  ipcMain.handle("inventory:create", (event, input: InventoryInput) => {
    const session = requirePermission(event, "inventory", "create");
    return createInventoryItem(session.clinicId, input);
  });

  ipcMain.handle(
    "inventory:update",
    (event, id: number, input: InventoryInput) => {
      const session = requirePermission(event, "inventory", "update");
      return updateInventoryItem(id, session.clinicId, input);
    },
  );

  ipcMain.handle("inventory:delete", (event, id: number) => {
    const session = requirePermission(event, "inventory", "update");
    return deleteInventoryItem(id, session.clinicId);
  });

  ipcMain.handle(
    "inventory:receive",
    (
      event,
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      unitCost: number,
      note: string,
    ) => {
      const session = requirePermission(event, "purchase", "create");

      if (clinicId !== session.clinicId) {
        throw new Error("無法操作其他診所的庫存。");
      }

      return receiveInventory(inventoryItemId, clinicId, quantity, unitCost, note);
    },
  );

  ipcMain.handle(
    "inventoryTransactions:list",
    (event) => {
      const session = requirePermission(event, "purchase");
      return getInventoryTransactions(session.clinicId);
    },
  );
}

/* =========================
   建立 Electron 視窗
========================= */

function createWindow() {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "DentFlow Pro",

    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(__dirname, "../dist/index.html"),
    );
  }
}

/* =========================
   Electron 啟動
========================= */

app.whenReady().then(() => {
  initializeDatabase();

  registerAuthHandlers();
  registerPatientHandlers();
  registerDoctorHandlers();
  registerImplantHandlers();
  registerInventoryHandlers();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/* =========================
   Electron 關閉
========================= */

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
