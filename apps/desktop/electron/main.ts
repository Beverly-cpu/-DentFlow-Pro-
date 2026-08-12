import { app, BrowserWindow, ipcMain } from "electron";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
   病患管理 IPC
========================= */

function registerPatientHandlers() {
  ipcMain.handle("patients:list", () => {
    return getPatients();
  });

  ipcMain.handle(
    "patients:create",
    (_event, patient: PatientInput) => {
      return createPatient(patient);
    },
  );

  ipcMain.handle(
    "patients:update",
    (_event, id: number, patient: PatientInput) => {
      return updatePatient(id, patient);
    },
  );

  ipcMain.handle("patients:delete", (_event, id: number) => {
    deletePatient(id);
    return true;
  });
}

/* =========================
   醫師管理 IPC
========================= */

function registerDoctorHandlers() {
  ipcMain.handle("doctors:list", () => {
    return getDoctors();
  });

  ipcMain.handle(
    "doctors:create",
    (_event, doctor: DoctorInput) => {
      return createDoctor(doctor);
    },
  );

  ipcMain.handle(
    "doctors:update",
    (_event, id: number, doctor: DoctorInput) => {
      return updateDoctor(id, doctor);
    },
  );

  ipcMain.handle("doctors:delete", (_event, id: number) => {
    return deleteDoctor(id);
  });
}

/* =========================
   植體追蹤 IPC
========================= */

function registerImplantHandlers() {
  ipcMain.handle("implants:list", () => {
    return getImplants();
  });

  ipcMain.handle(
    "implants:create",
    (_event, implant: ImplantInput) => {
      return createImplant(implant);
    },
  );

  ipcMain.handle(
    "implants:update",
    (_event, id: number, implant: ImplantInput) => {
      return updateImplant(id, implant);
    },
  );

  ipcMain.handle("implants:delete", (_event, id: number) => {
    return deleteImplant(id);
  });
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

  registerPatientHandlers();
  registerDoctorHandlers();
  registerImplantHandlers();

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