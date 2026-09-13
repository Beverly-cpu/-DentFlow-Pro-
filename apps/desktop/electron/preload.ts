import { contextBridge, ipcRenderer } from "electron";

export {};

/* =========================
   病患
========================= */

type PatientInput = {
  chartNumber: string;
  name: string;
  birthDate: string;
  phone: string;
  doctor: string;
  note: string;
};

type PatientRecord = PatientInput & {
  id: number;
  createdAt: string;
  updatedAt: string;
};

/* =========================
   醫師
========================= */

type DoctorInput = {
  name: string;
  account: string;
  password?: string;
  specialty: string;
  phone: string;
  role: string;
  isActive?: boolean;
};

type DoctorRecord = {
  id: number;
  name: string;
  account: string;
  specialty: string;
  phone: string;
  role: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

/* =========================
   植體
========================= */

type ImplantInput = {
  patientId: number;
  doctorId: number | null;

  toothPosition: string;

  brand: string;
  model: string;
  diameter: string;
  length: string;

  lotNumber: string;
  expiryDate: string;
  implantDate: string;

  note: string;
};

type ImplantRecord = ImplantInput & {
  id: number;

  patientName: string;
  patientChartNumber: string;

  doctorName: string | null;

  createdAt: string;
  updatedAt: string;
};

type InventoryRecord = {
  id: number;
  clinicId: number;
  name: string;
  category: string;
  brand: string;
  model: string;
  specification: string;
  refNumber: string;
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  safetyStock: number;
  unitCost: number;
  createdAt: string;
  updatedAt: string;
};

type InventoryTransactionRecord = {
  id: number;
  clinicId: number;
  inventoryItemId: number;
  type: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number;
  totalCost: number;
  note: string;
  inventoryName: string;
  inventoryCategory: string;
  inventoryBrand: string;
  inventoryModel: string;
  inventorySpecification: string;
  inventoryRefNumber: string;
  inventoryLotNumber: string;
  inventoryExpiryDate: string;
  createdAt: string;
};

/* =========================
   Electron API
========================= */

declare global {
  interface Window {
    dentflow: {
      version: string;

      /* 病患 */

      patients: {
        list: () => Promise<PatientRecord[]>;

        create: (
          patient: PatientInput,
        ) => Promise<PatientRecord>;

        update: (
          id: number,
          patient: PatientInput,
        ) => Promise<PatientRecord>;

        delete: (
          id: number,
        ) => Promise<boolean>;
      };

      /* 醫師 */

      doctors: {
        list: () => Promise<DoctorRecord[]>;

        create: (
          doctor: DoctorInput,
        ) => Promise<DoctorRecord>;

        update: (
          id: number,
          doctor: DoctorInput,
        ) => Promise<DoctorRecord>;

        delete: (
          id: number,
        ) => Promise<boolean>;
      };

      /* 植體 */

      implants: {
        list: () => Promise<ImplantRecord[]>;

        create: (
          implant: ImplantInput,
        ) => Promise<ImplantRecord>;

        update: (
          id: number,
          implant: ImplantInput,
        ) => Promise<ImplantRecord>;

        delete: (
          id: number,
        ) => Promise<boolean>;
      };

      inventory: {
        list: (clinicId: number) => Promise<InventoryRecord[]>;
        receive: (
          inventoryItemId: number,
          clinicId: number,
          quantity: number,
          unitCost: number,
          note: string,
        ) => Promise<InventoryRecord>;
      };

      inventoryTransactions: {
        list: (clinicId: number) => Promise<InventoryTransactionRecord[]>;
      };
    };
  }
}

contextBridge.exposeInMainWorld("dentflow", {
  version: process.versions.electron,
  patients: {
    list: () => ipcRenderer.invoke("patients:list"),
    create: (patient: PatientInput) =>
      ipcRenderer.invoke("patients:create", patient),
    update: (id: number, patient: PatientInput) =>
      ipcRenderer.invoke("patients:update", id, patient),
    delete: (id: number) => ipcRenderer.invoke("patients:delete", id),
  },
  doctors: {
    list: () => ipcRenderer.invoke("doctors:list"),
    create: (doctor: DoctorInput) =>
      ipcRenderer.invoke("doctors:create", doctor),
    update: (id: number, doctor: DoctorInput) =>
      ipcRenderer.invoke("doctors:update", id, doctor),
    delete: (id: number) => ipcRenderer.invoke("doctors:delete", id),
  },
  implants: {
    list: () => ipcRenderer.invoke("implants:list"),
    create: (implant: ImplantInput) =>
      ipcRenderer.invoke("implants:create", implant),
    update: (id: number, implant: ImplantInput) =>
      ipcRenderer.invoke("implants:update", id, implant),
    delete: (id: number) => ipcRenderer.invoke("implants:delete", id),
  },
  inventory: {
    list: (clinicId: number) => ipcRenderer.invoke("inventory:list", clinicId),
    receive: (
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      unitCost: number,
      note: string,
    ) =>
      ipcRenderer.invoke(
        "inventory:receive",
        inventoryItemId,
        clinicId,
        quantity,
        unitCost,
        note,
      ),
  },
  inventoryTransactions: {
    list: (clinicId: number) =>
      ipcRenderer.invoke("inventoryTransactions:list", clinicId),
  },
});
