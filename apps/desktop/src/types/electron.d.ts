/* =========================================================
   Auth
========================================================= */

type DentflowUserRole =
  | "Doctor"
  | "Assistant"
  | "Admin"
  | "Accountant"
  | "Procurement";

type DentflowClinicRecord = {
  id: number;
  code: string;
  name: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
};

type DentflowAuthSession = {
  userId: number;
  account: string;
  name: string;

  role: DentflowUserRole;
  roleLabel: string;

  clinicId: number;
  clinicCode: string;
  clinicName: string;

  mustChangePassword?: boolean;
};

type DentflowUserClinicRecord = {
  userId: number;
  clinicId: number;

  clinicCode: string;
  clinicName: string;

  clinicIsActive: number;

  isPrimary: number;

  createdAt: string;
  updatedAt: string;
};

type DentflowUserRecord = {
  id: number;

  account: string;
  name: string;

  role: DentflowUserRole;

  isActive: number;

  mustChangePassword?: number;

  createdAt: string;
  updatedAt: string;

  clinics?: DentflowUserClinicRecord[];
};

type DentflowLoginInput = {
  account: string;
  password: string;
  clinicId?: number | null;
};

type DentflowCreateInitialAdminInput = {
  account: string;
  name: string;
  password: string;

  clinicId?: number | null;
};

type DentflowCreateUserInput = {
  account: string;
  name: string;

  password: string;

  role: DentflowUserRole;

  isActive?: boolean | number;

  clinicIds?: number[];

  primaryClinicId?: number | null;
};

type DentflowUpdateUserInput = {
  account?: string;
  name?: string;

  role?: DentflowUserRole;

  isActive?: boolean | number;

  password?: string;

  clinicIds?: number[];

  primaryClinicId?: number | null;
};

type DentflowChangePasswordInput = {
  userId: number;

  currentPassword: string;
  newPassword: string;
};

type DentflowResetPasswordInput = {
  userId: number;
  newPassword: string;
};

type DentflowLocalAdminAccountRecord = {
  id: number;

  account: string;
  name: string;

  role: DentflowUserRole;

  isActive: number;
};

type DentflowBeginLocalAdminRecoveryResult = {
  authorized: boolean;

  token: string | null;

  expiresAt: string | null;
};

type DentflowCompleteLocalAdminRecoveryInput = {
  token: string;

  account: string;

  newPassword: string;
};

type DentflowCompleteLocalAdminRecoveryResult = {
  success?: boolean;

  recoveryCompleted: boolean;

  [key: string]: unknown;
};


/* =========================================================
   Clinic Management
========================================================= */

type DentflowClinicInput = {
  code: string;
  name: string;
};

type DentflowClinicUpdateInput = {
  code: string;
  name: string;
};

type DentflowClinicWithStatsRecord =
  DentflowClinicRecord & {
    userCount: number;
    doctorCount: number;
  };

/* =========================================================
   Patients
========================================================= */

type DentflowPatientRecord = {
  id: number;

  clinicId: number;

  chartNumber: string;

  name: string;

  birthDate: string;

  phone: string;

  doctor: string;

  note: string;

  createdAt: string;
  updatedAt: string;
};

type DentflowPatientWithClinicRecord =
  DentflowPatientRecord & {
    clinicCode: string;
    clinicName: string;
  };

type DentflowPatientInput = {
  chartNumber: string;

  name: string;

  birthDate: string;

  phone: string;

  doctor: string;

  note: string;
};

/* =========================================================
   Doctors
========================================================= */

type DentflowDoctorRecord = {
  id: number;

  clinicId: number;

  userId: number | null;

  name: string;

  account: string;

  specialty: string;

  phone: string;

  role: string;

  isActive: number;

  createdAt: string;
  updatedAt: string;
};

type DentflowDoctorClinicRecord = {
  doctorId: number;

  clinicId: number;

  clinicCode: string;

  clinicName: string;

  clinicIsActive: number;

  isPrimary: number;

  createdAt: string;
  updatedAt: string;
};

type DentflowDoctorInput = {
  name: string;

  account: string;

  password?: string;

  specialty: string;

  phone: string;

  isActive?: boolean | number;

  clinicIds?: number[];

  primaryClinicId?: number;
};

/* =========================================================
   Inventory
========================================================= */

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

  note: string;

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

  quantity: number;

  safetyStock: number;

  unitCost?: number;

  note: string;
};

type DentflowPurchaseRequestRecord = {
  id: number;
  clinicId: number;
  inventoryItemId: number;
  inventoryName: string;
  quantity: number;
  note: string;
  status: "待採購" | "已處理";
  requestedByUserId: number;
  requestedByName: string;
  createdAt: string;
  processedAt: string | null;
};

/* =========================================================
   Inventory Transactions
========================================================= */

type DentflowInventoryTransactionType =
  | "入庫"
  | "手術取出"
  | "手術歸回"
  | "歸回"
  | "手動調整"
  | "耗材使用"
  | "耗材取消歸回";

type DentflowInventoryTransactionRecord = {
  id: number;

  clinicId: number;

  inventoryItemId: number;

  implantId: number | null;

  implantToothId: number | null;

  implantItemId: number | null;

  implantPlanItemId: number | null;

  implantUsageItemId: number | null;

  type: DentflowInventoryTransactionType;

  quantityChange: number;

  quantityBefore: number;

  quantityAfter: number;

  unitCost: number;

  totalCost: number;

  note: string;

  createdAt: string;

  inventoryName: string;

  inventoryCategory: string;

  inventoryBrand: string;

  inventoryModel: string;

  inventorySpecification: string;

  inventoryRefNumber: string;

  inventoryLotNumber: string;

  inventoryExpiryDate: string;

  patientName: string | null;

  patientChartNumber: string | null;

  doctorName: string | null;

  toothPosition: string | null;
};

/* =========================================================
   Implants
========================================================= */

type DentflowImplantStatus =
  | "待醫師叫貨"
  | "醫師已叫貨"
  | "已取出待手術"
  | "待術後紀錄"
  | "待歸回品項"
  | "已完成"
  | "已結案"
  | "已取消";

type DentflowImplantUsageItemRecord = {
  id: number;

  implantId: number;

  implantToothId: number;

  implantPlanItemId: number;

  inventoryItemId: number;

  quantity: number;

  inventoryName: string;

  inventoryCategory: string;

  inventoryBrand: string;

  inventoryModel: string;

  inventorySpecification: string;

  inventoryRefNumber: string;

  inventoryLotNumber: string;

  inventoryExpiryDate: string;

  /*
   * 植體實際使用當下的歷史成本快照。
   * 不使用目前 inventory.unitCost 回推。
   */
  unitCost: number;

  totalCost: number;

  createdAt: string;
};

type DentflowImplantPlanItemRecord = {
  id: number;

  implantId: number;

  implantToothId: number;

  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  plannedQuantity: number;

  createdAt: string;
  updatedAt: string;

  usageItems: DentflowImplantUsageItemRecord[];
};

type DentflowImplantToothRecord = {
  id: number;

  implantId: number;

  toothPosition: string;

  createdAt: string;
  updatedAt: string;

  items: DentflowImplantPlanItemRecord[];
};

type DentflowImplantRecord = {
  id: number;

  clinicId: number;

  patientId: number;

  patientName: string;

  patientChartNumber: string;

  doctorId: number;

  doctorName: string;

  implantDate: string;

  note: string;

  status: DentflowImplantStatus;

  orderedAt: string | null;
  pickedAt: string | null;
  surgeryCompletedAt: string | null;
  returnedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  orderedByUserId: number | null;
  pickedByUserId: number | null;
  surgeryCompletedByUserId: number | null;
  returnedByUserId: number | null;
  closedByUserId: number | null;
  cancelledByUserId: number | null;
  reservations: Array<{
    id: number;
    implantPlanItemId: number;
    reservedQuantity: number;
    pickedQuantity: number;
    usedQuantity: number;
    returnedQuantity: number;
    reservedAt: string | null;
    pickedAt: string | null;
    returnedAt: string | null;
  }>;

  inventoryDeducted: number;

  inventoryReturned: number;

  createdAt: string;
  updatedAt: string;

  teeth: DentflowImplantToothRecord[];
};

type DentflowImplantPlanItemInput = {
  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  plannedQuantity: number;
};

type DentflowImplantToothInput = {
  toothPosition: string;

  items: DentflowImplantPlanItemInput[];
};

type DentflowImplantInput = {
  patientId: number;

  doctorId: number;

  implantDate: string;

  note: string;

  status?: DentflowImplantStatus;

  teeth: DentflowImplantToothInput[];
};

type DentflowImplantUsageInput = {
  implantPlanItemId: number;

  inventoryItemId: number;

  quantity: number;
};

/* =========================================================
   Consumable Usage
========================================================= */

type DentflowConsumableUsageType =
  | "連針帶線"
  | "牙周藥膏"
  | "冷光藥劑"
  | "膠原蛋白"
  | "骨粉"
  | "再生膜"
  | "其他耗材"
  | (string & {});

type DentflowConsumableUsageStatus =
  | "待醫師簽名"
  | "已簽名"
  | "已取消";

type DentflowConsumableUsageItemInput = {
  inventoryItemId: number;

  quantity: number;
};

type DentflowConsumableUsageInput = {
  patientId: number;

  doctorId: number;

  usageType: DentflowConsumableUsageType;

  usageDate: string;

  toothPosition?: string;

  note?: string;

  items: DentflowConsumableUsageItemInput[];
};

type DentflowConsumableUsageItemRecord = {
  id: number;

  usageRecordId: number;

  inventoryItemId: number;

  quantity: number;

  inventoryName: string;

  inventoryCategory: string;

  inventoryBrand: string;

  inventoryModel: string;

  inventorySpecification: string;

  expiryDate: string;

  /*
   * 耗材實際使用當下的歷史成本快照。
   * 取消歸回亦沿用原使用成本，不使用目前庫存成本回推。
   */
  unitCost: number;

  totalCost: number;

  createdAt: string;
};

type DentflowConsumableUsageRecord = {
  id: number;

  clinicId: number;

  patientId: number;

  patientName: string;

  patientChartNumber: string;

  doctorId: number;

  doctorName: string;

  usageType: DentflowConsumableUsageType;

  usageDate: string;

  toothPosition: string;

  note: string;

  status: DentflowConsumableUsageStatus;

  doctorSignatureDataUrl: string | null;

  signedAt: string | null;

  cancelledAt: string | null;

  cancelReason: string;

  items: DentflowConsumableUsageItemRecord[];

  createdAt: string;
  updatedAt: string;
};

/* =========================================================
   DentFlow API
========================================================= */

type DentflowApi = {
  system: {
    backupDatabase: () => Promise<{
      cancelled: boolean;
      filePath?: string;
    }>;
  };

  /* =======================================================
     Auth
  ======================================================= */

  auth: {
    activeClinics: () =>
      Promise<DentflowClinicRecord[]>;

    clinicsForAccount: (
      account: string,
    ) =>
      Promise<DentflowClinicRecord[]>;

    hasUsers: () =>
      Promise<boolean>;

    login: (
      input: DentflowLoginInput,
    ) =>
      Promise<DentflowAuthSession>;

    createInitialAdmin: (
      input: DentflowCreateInitialAdminInput,
    ) =>
      Promise<DentflowAuthSession>;

    users: () =>
      Promise<DentflowUserRecord[]>;

    user: (
      userId: number,
    ) =>
      Promise<DentflowUserRecord | null>;

    createUser: (
      input: DentflowCreateUserInput,
    ) =>
      Promise<DentflowUserRecord>;

    updateUser: (
      userId: number,
      input: DentflowUpdateUserInput,
    ) =>
      Promise<DentflowUserRecord>;

    changePassword: (
      input: DentflowChangePasswordInput,
    ) =>
      Promise<unknown>;

    resetPassword: (
      input: DentflowResetPasswordInput,
    ) =>
      Promise<unknown>;

    setUserClinics: (
      userId: number,
      clinicIds: number[],
      primaryClinicId: number | null,
    ) =>
      Promise<unknown>;

    validateClinicAccess: (
      userId: number,
      clinicId: number,
    ) =>
      Promise<DentflowClinicRecord>;

    deleteUser: (
      userId: number,
    ) =>
      Promise<boolean>;

    localAdminAccounts: () =>
      Promise<
        DentflowLocalAdminAccountRecord[]
      >;

    beginLocalAdminRecovery: () =>
      Promise<
        DentflowBeginLocalAdminRecoveryResult
      >;

    completeLocalAdminRecovery: (
      input:
        DentflowCompleteLocalAdminRecoveryInput,
    ) =>
      Promise<
        DentflowCompleteLocalAdminRecoveryResult
      >;

    cancelLocalAdminRecovery: () =>
      Promise<{
        success: boolean;
      }>;
  };


  /* =======================================================
     Clinics
  ======================================================= */

  clinics: {
    list: () =>
      Promise<DentflowClinicRecord[]>;

    active: () =>
      Promise<DentflowClinicRecord[]>;

    byId: (
      clinicId: number,
    ) =>
      Promise<DentflowClinicRecord | null>;

    withStats: () =>
      Promise<
        DentflowClinicWithStatsRecord[]
      >;

    byIdWithStats: (
      clinicId: number,
    ) =>
      Promise<
        DentflowClinicWithStatsRecord | null
      >;

    byUser: (
      userId: number,
    ) =>
      Promise<DentflowClinicRecord[]>;

    create: (
      adminUserId: number,
      input: DentflowClinicInput,
    ) =>
      Promise<DentflowClinicRecord>;

    update: (
      clinicId: number,
      adminUserId: number,
      input: DentflowClinicUpdateInput,
    ) =>
      Promise<DentflowClinicRecord>;

    setActive: (
      clinicId: number,
      adminUserId: number,
      isActive: boolean,
    ) =>
      Promise<DentflowClinicRecord>;

    addUser: (
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) =>
      Promise<void>;

    removeUser: (
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) =>
      Promise<boolean>;

    setUserPrimary: (
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) =>
      Promise<void>;
  };

  /* =======================================================
     Patients
  ======================================================= */

  patients: {
    list: (
      clinicId: number,
    ) =>
      Promise<DentflowPatientRecord[]>;

    byId: (
      patientId: number,
      clinicId: number,
    ) =>
      Promise<DentflowPatientRecord | null>;

    byDoctor: (
      doctorId: number,
      clinicId: number,
    ) =>
      Promise<DentflowPatientRecord[]>;

    byDoctorAllClinics: (
      doctorId: number,
    ) =>
      Promise<
        DentflowPatientWithClinicRecord[]
      >;

    byDoctorUserAllClinics: (
      userId: number,
    ) =>
      Promise<
        DentflowPatientWithClinicRecord[]
      >;

    create: (
      clinicId: number,
      input: DentflowPatientInput,
    ) =>
      Promise<DentflowPatientRecord>;

    update: (
      patientId: number,
      clinicId: number,
      input: DentflowPatientInput,
    ) =>
      Promise<DentflowPatientRecord>;

    delete: (
      patientId: number,
      clinicId: number,
    ) =>
      Promise<boolean>;
  };

  /* =======================================================
     Doctors
  ======================================================= */

  doctors: {
    list: (
      clinicId: number,
    ) =>
      Promise<DentflowDoctorRecord[]>;

    active: (
      clinicId: number,
    ) =>
      Promise<DentflowDoctorRecord[]>;

    byId: (
      doctorId: number,
      clinicId: number,
    ) =>
      Promise<DentflowDoctorRecord | null>;

    byUserId: (
      userId: number,
      clinicId: number,
    ) =>
      Promise<DentflowDoctorRecord | null>;

    activeByUserId: (
      userId: number,
      clinicId: number,
    ) =>
      Promise<DentflowDoctorRecord | null>;

    byAccount: (
      account: string,
      clinicId: number,
    ) =>
      Promise<DentflowDoctorRecord | null>;

    create: (
      clinicId: number,
      input: DentflowDoctorInput,
    ) =>
      Promise<DentflowDoctorRecord>;

    update: (
      doctorId: number,
      clinicId: number,
      input: DentflowDoctorInput,
    ) =>
      Promise<DentflowDoctorRecord>;

    delete: (
      doctorId: number,
      clinicId: number,
    ) =>
      Promise<boolean>;

    clinics: (
      doctorId: number,
    ) =>
      Promise<DentflowDoctorClinicRecord[]>;

    setClinics: (
      doctorId: number,
      clinicIds: number[],
      primaryClinicId: number,
    ) =>
      Promise<unknown>;

    addClinic: (
      doctorId: number,
      clinicId: number,
    ) =>
      Promise<unknown>;

    removeClinic: (
      doctorId: number,
      clinicId: number,
    ) =>
      Promise<unknown>;

    setPrimaryClinic: (
      doctorId: number,
      clinicId: number,
    ) =>
      Promise<unknown>;
  };

  /* =======================================================
     Implants
  ======================================================= */

  implants: {
    list: (
      clinicId: number,
    ) =>
      Promise<DentflowImplantRecord[]>;

    byPatient: (
      patientId: number,
      clinicId: number,
    ) =>
      Promise<DentflowImplantRecord[]>;

    byDoctor: (
      doctorId: number,
      clinicId: number,
    ) =>
      Promise<DentflowImplantRecord[]>;

    create: (
      clinicId: number,
      input: DentflowImplantInput,
    ) =>
      Promise<DentflowImplantRecord>;

    update: (
      implantId: number,
      clinicId: number,
      input: DentflowImplantInput,
    ) =>
      Promise<DentflowImplantRecord>;

    updateStatus: (
      implantId: number,
      clinicId: number,
      status: DentflowImplantStatus,
      actorUserId: number,
    ) =>
      Promise<DentflowImplantRecord>;

    recordUsage: (
      implantId: number,
      clinicId: number,
      usageInputs: DentflowImplantUsageInput[],
      actorUserId: number,
    ) =>
      Promise<DentflowImplantRecord>;

    cancel: (
      implantId: number,
      clinicId: number,
      reason: string,
      actorUserId: number,
    ) => Promise<DentflowImplantRecord>;

    close: (
      implantId: number,
      clinicId: number,
      actorUserId: number,
    ) => Promise<DentflowImplantRecord>;

    delete: (
      implantId: number,
      clinicId: number,
    ) =>
      Promise<boolean>;
  };

  /* =======================================================
     Inventory
  ======================================================= */

  inventory: {
    categories: (
      clinicId: number,
    ) => Promise<Array<{
      id: number;
      clinicId: number;
      name: string;
      requiresDoctorSignature: number;
      createdAt: string;
    }>>;

    createCategory: (
      clinicId: number,
      name: string,
      actorUserId: number,
      requiresDoctorSignature?: boolean,
    ) => Promise<{
      id: number;
      clinicId: number;
      name: string;
      requiresDoctorSignature: number;
      createdAt: string;
    }>;

    deleteCategory: (
      clinicId: number,
      name: string,
      actorUserId: number,
    ) => Promise<boolean>;

    list: (
      clinicId: number,
    ) =>
      Promise<DentflowInventoryRecord[]>;

    byId: (
      inventoryItemId: number,
      clinicId: number,
    ) =>
      Promise<DentflowInventoryRecord>;

    create: (
      clinicId: number,
      input: DentflowInventoryInput,
    ) =>
      Promise<DentflowInventoryRecord>;

    update: (
      inventoryItemId: number,
      clinicId: number,
      input: DentflowInventoryInput,
      actorUserId: number,
    ) =>
      Promise<DentflowInventoryRecord>;

    updateQuantity: (
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
    ) =>
      Promise<DentflowInventoryRecord>;

    receive: (
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      unitCost: number,
      note: string,
      actorUserId: number,
    ) =>
      Promise<DentflowInventoryRecord>;

    adjustQuantity: (
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      note: string,
      actorUserId: number,
    ) =>
      Promise<DentflowInventoryRecord>;

    lowStock: (
      clinicId: number,
    ) =>
      Promise<DentflowInventoryRecord[]>;

    delete: (
      inventoryItemId: number,
      clinicId: number,
    ) =>
      Promise<boolean>;
  };

  purchaseRequests: {
    list: (clinicId: number) => Promise<DentflowPurchaseRequestRecord[]>;
    create: (clinicId: number, inventoryItemId: number, quantity: number, note: string, actorUserId: number) => Promise<DentflowPurchaseRequestRecord>;
    complete: (id: number, clinicId: number, actorUserId: number) => Promise<DentflowPurchaseRequestRecord>;
  };

  /* =======================================================
     Inventory Transactions
  ======================================================= */

  inventoryTransactions: {
    list: (
      clinicId: number,
    ) =>
      Promise<
        DentflowInventoryTransactionRecord[]
      >;

    byItem: (
      inventoryItemId: number,
      clinicId: number,
    ) =>
      Promise<
        DentflowInventoryTransactionRecord[]
      >;

    byImplant: (
      implantId: number,
      clinicId: number,
    ) =>
      Promise<
        DentflowInventoryTransactionRecord[]
      >;

    byImplantTooth: (
      implantToothId: number,
      clinicId: number,
    ) =>
      Promise<
        DentflowInventoryTransactionRecord[]
      >;

    byImplantItem: (
      implantItemId: number,
      clinicId: number,
    ) =>
      Promise<
        DentflowInventoryTransactionRecord[]
      >;

    byImplantPlanItem: (
      implantPlanItemId: number,
      clinicId: number,
    ) =>
      Promise<
        DentflowInventoryTransactionRecord[]
      >;

    byImplantUsageItem: (
      implantUsageItemId: number,
      clinicId: number,
    ) =>
      Promise<
        DentflowInventoryTransactionRecord[]
      >;
  };

  /* =======================================================
     Consumables
  ======================================================= */

  consumables: {
    list: (
      clinicId: number,
      usageType?: DentflowConsumableUsageType,
    ) =>
      Promise<
        DentflowConsumableUsageRecord[]
      >;

    byId: (
      usageRecordId: number,
      clinicId: number,
    ) =>
      Promise<
        DentflowConsumableUsageRecord | null
      >;

    create: (
      clinicId: number,
      input: DentflowConsumableUsageInput,
    ) =>
      Promise<
        DentflowConsumableUsageRecord
      >;

    sign: (
      usageRecordId: number,
      clinicId: number,
      doctorId: number,
      signatureDataUrl: string,
    ) =>
      Promise<
        DentflowConsumableUsageRecord
      >;

    cancel: (
      usageRecordId: number,
      clinicId: number,
      reason: string,
    ) =>
      Promise<
        DentflowConsumableUsageRecord
      >;

    byDoctor: (
      doctorId: number,
      clinicId: number,
      usageType?: DentflowConsumableUsageType,
    ) =>
      Promise<
        DentflowConsumableUsageRecord[]
      >;

    byPatient: (
      patientId: number,
      clinicId: number,
      usageType?: DentflowConsumableUsageType,
    ) =>
      Promise<
        DentflowConsumableUsageRecord[]
      >;
  };
};

/* =========================================================
   Window
========================================================= */

interface Window {
  dentflow: DentflowApi;
}
