export {};

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

declare global {
  type DentflowRole =
    | "Doctor"
    | "Assistant"
    | "Admin"
    | "Accountant";

  type DentflowAuthSession = {
    userId: number;
    userName: string;
    clinicId: number;
    clinicName: string;
    role: DentflowRole;
  };

  type DentflowInventoryRecord = {
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

  type DentflowInventoryInput = {
    name: string;
    category: string;
    brand: string;
    model: string;
    specification: string;
    refNumber: string;
    lotNumber: string;
    expiryDate: string;
    safetyStock: number;
  };

  type DentflowInventoryTransactionRecord = {
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

  interface Window {
    dentflow: {
      version: string;

      auth: {
        status: () => Promise<{ needsSetup: boolean }>;
        setup: (
          name: string,
          account: string,
          password: string,
        ) => Promise<DentflowAuthSession>;
        login: (
          account: string,
          password: string,
        ) => Promise<DentflowAuthSession>;
        current: () => Promise<DentflowAuthSession | null>;
        logout: () => Promise<boolean>;
      };

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
        list: (clinicId: number) => Promise<DentflowInventoryRecord[]>;
        create: (
          input: DentflowInventoryInput,
        ) => Promise<DentflowInventoryRecord>;
        update: (
          id: number,
          input: DentflowInventoryInput,
        ) => Promise<DentflowInventoryRecord>;
        delete: (id: number) => Promise<boolean>;
        receive: (
          inventoryItemId: number,
          clinicId: number,
          quantity: number,
          unitCost: number,
          note: string,
        ) => Promise<DentflowInventoryRecord>;
      };

      inventoryTransactions: {
        list: (
          clinicId: number,
        ) => Promise<DentflowInventoryTransactionRecord[]>;
      };
    };
  }
}
