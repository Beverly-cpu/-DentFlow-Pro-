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
  interface Window {
    dentflow: {
      version: string;

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
    };
  }
}