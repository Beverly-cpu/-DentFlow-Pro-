import {
  contextBridge,
  ipcRenderer,
} from "electron";

/* =========================================================
   DentFlow API
========================================================= */

const dentflowApi = {
  machines: {
    list: () => ipcRenderer.invoke("machines:list"),
    reservations: () => ipcRenderer.invoke("machines:reservations"),
    create: (input: unknown, actorUserId: number) => ipcRenderer.invoke("machines:create", input, actorUserId),
    setActive: (id: number, active: boolean, actorUserId: number) => ipcRenderer.invoke("machines:set-active", id, active, actorUserId),
    reserve: (input: unknown, actorUserId: number) => ipcRenderer.invoke("machines:reserve", input, actorUserId),
    scan: (token: string, reservationId: number, clinicId: number, action: "搬出"|"到院", actorUserId: number) => ipcRenderer.invoke("machines:scan", token, reservationId, clinicId, action, actorUserId),
  },
  system: {
    backupDatabase() {
      return ipcRenderer.invoke("system:backup-database");
    },
  },

  /* =======================================================
     Auth
  ======================================================= */

  auth: {
    activeClinics() {
      return ipcRenderer.invoke(
        "auth:active-clinics",
      );
    },

    clinicsForAccount(
      account: string,
    ) {
      return ipcRenderer.invoke(
        "auth:clinics-for-account",
        account,
      );
    },

    hasUsers() {
      return ipcRenderer.invoke(
        "auth:has-users",
      );
    },

    login(
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "auth:login",
        input,
      );
    },

    createInitialAdmin(
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "auth:create-initial-admin",
        input,
      );
    },

    users() {
      return ipcRenderer.invoke(
        "auth:users",
      );
    },

    user(
      userId: number,
    ) {
      return ipcRenderer.invoke(
        "auth:user",
        userId,
      );
    },

    createUser(
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "auth:create-user",
        input,
      );
    },

    updateUser(
      userId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "auth:update-user",
        userId,
        input,
      );
    },

    changePassword(
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "auth:change-password",
        input,
      );
    },

    resetPassword(
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "auth:reset-password",
        input,
      );
    },

    setUserClinics(
      userId: number,
      clinicIds: number[],
      primaryClinicId:
        number | null,
    ) {
      return ipcRenderer.invoke(
        "auth:set-user-clinics",
        userId,
        clinicIds,
        primaryClinicId,
      );
    },

    validateClinicAccess(
      userId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "auth:validate-clinic-access",
        userId,
        clinicId,
      );
    },

    deleteUser(
      userId: number,
    ) {
      return ipcRenderer.invoke(
        "auth:delete-user",
        userId,
      );
    },

    /* =====================================================
       Local Admin Recovery
    ===================================================== */

    localAdminAccounts() {
      return ipcRenderer.invoke(
        "auth:local-admin-accounts",
      );
    },

    beginLocalAdminRecovery() {
      return ipcRenderer.invoke(
        "auth:begin-local-admin-recovery",
      );
    },

    completeLocalAdminRecovery(
      input: {
        token: string;
        account: string;
        newPassword: string;
      },
    ) {
      return ipcRenderer.invoke(
        "auth:complete-local-admin-recovery",
        input,
      );
    },

    cancelLocalAdminRecovery() {
      return ipcRenderer.invoke(
        "auth:cancel-local-admin-recovery",
      );
    },
  },


  /* =======================================================
     Clinics
  ======================================================= */

  clinics: {
    list() {
      return ipcRenderer.invoke(
        "clinics:list",
      );
    },

    active() {
      return ipcRenderer.invoke(
        "clinics:active",
      );
    },

    byId(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "clinics:by-id",
        clinicId,
      );
    },

    withStats() {
      return ipcRenderer.invoke(
        "clinics:with-stats",
      );
    },

    byIdWithStats(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "clinics:by-id-with-stats",
        clinicId,
      );
    },

    byUser(
      userId: number,
    ) {
      return ipcRenderer.invoke(
        "clinics:by-user",
        userId,
      );
    },

    create(
      adminUserId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "clinics:create",
        adminUserId,
        input,
      );
    },

    update(
      clinicId: number,
      adminUserId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "clinics:update",
        clinicId,
        adminUserId,
        input,
      );
    },

    setActive(
      clinicId: number,
      adminUserId: number,
      isActive: boolean,
    ) {
      return ipcRenderer.invoke(
        "clinics:set-active",
        clinicId,
        adminUserId,
        isActive,
      );
    },

    addUser(
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) {
      return ipcRenderer.invoke(
        "clinics:add-user",
        userId,
        clinicId,
        adminUserId,
      );
    },

    removeUser(
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) {
      return ipcRenderer.invoke(
        "clinics:remove-user",
        userId,
        clinicId,
        adminUserId,
      );
    },

    setUserPrimary(
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) {
      return ipcRenderer.invoke(
        "clinics:set-user-primary",
        userId,
        clinicId,
        adminUserId,
      );
    },
  },

  /* =======================================================
     Patients
  ======================================================= */

  patients: {
    list(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "patients:list",
        clinicId,
      );
    },

    byId(
      patientId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "patients:by-id",
        patientId,
        clinicId,
      );
    },

    byDoctor(
      doctorId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "patients:by-doctor",
        doctorId,
        clinicId,
      );
    },

    byDoctorAllClinics(
      doctorId: number,
    ) {
      return ipcRenderer.invoke(
        "patients:by-doctor-all-clinics",
        doctorId,
      );
    },

    byDoctorUserAllClinics(
      userId: number,
    ) {
      return ipcRenderer.invoke(
        "patients:by-doctor-user-all-clinics",
        userId,
      );
    },

    create(
      clinicId: number,
      input: unknown,
      actorUserId: number,
    ) {
      return ipcRenderer.invoke(
        "patients:create",
        clinicId,
        input,
        actorUserId,
      );
    },

    update(
      patientId: number,
      clinicId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "patients:update",
        patientId,
        clinicId,
        input,
      );
    },

    delete(
      patientId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "patients:delete",
        patientId,
        clinicId,
      );
    },
  },

  /* =======================================================
     Doctors
  ======================================================= */

  doctors: {
    list(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:list",
        clinicId,
      );
    },

    active(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:active",
        clinicId,
      );
    },

    byId(
      doctorId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:by-id",
        doctorId,
        clinicId,
      );
    },

    byUserId(
      userId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:by-user-id",
        userId,
        clinicId,
      );
    },

    activeByUserId(
      userId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:active-by-user-id",
        userId,
        clinicId,
      );
    },

    byAccount(
      account: string,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:by-account",
        account,
        clinicId,
      );
    },

    create(
      clinicId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "doctors:create",
        clinicId,
        input,
      );
    },

    update(
      doctorId: number,
      clinicId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "doctors:update",
        doctorId,
        clinicId,
        input,
      );
    },

    delete(
      doctorId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:delete",
        doctorId,
        clinicId,
      );
    },

    /* =====================================================
       Doctor Clinics
    ===================================================== */

    clinics(
      doctorId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:clinics",
        doctorId,
      );
    },

    setClinics(
      doctorId: number,
      clinicIds: number[],
      primaryClinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:set-clinics",
        doctorId,
        clinicIds,
        primaryClinicId,
      );
    },

    addClinic(
      doctorId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:add-clinic",
        doctorId,
        clinicId,
      );
    },

    removeClinic(
      doctorId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:remove-clinic",
        doctorId,
        clinicId,
      );
    },

    setPrimaryClinic(
      doctorId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "doctors:set-primary-clinic",
        doctorId,
        clinicId,
      );
    },
  },

  /* =======================================================
     Implants
  ======================================================= */

  implants: {
    list(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "implants:list",
        clinicId,
      );
    },

    byPatient(
      patientId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "implants:by-patient",
        patientId,
        clinicId,
      );
    },

    byDoctor(
      doctorId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "implants:by-doctor",
        doctorId,
        clinicId,
      );
    },

    create(
      clinicId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "implants:create",
        clinicId,
        input,
      );
    },

    update(
      implantId: number,
      clinicId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "implants:update",
        implantId,
        clinicId,
        input,
      );
    },

    updateStatus(
      implantId: number,
      clinicId: number,
      status: string,
      actorUserId: number,
    ) {
      return ipcRenderer.invoke(
        "implants:update-status",
        implantId,
        clinicId,
        status,
        actorUserId,
      );
    },

    recordUsage(
      implantId: number,
      clinicId: number,
      usageInputs: unknown,
      actorUserId: number,
    ) {
      return ipcRenderer.invoke(
        "implants:record-usage",
        implantId,
        clinicId,
        usageInputs,
        actorUserId,
      );
    },

    cancel(implantId: number, clinicId: number, reason: string, actorUserId: number) {
      return ipcRenderer.invoke("implants:cancel", implantId, clinicId, reason, actorUserId);
    },

    close(implantId: number, clinicId: number, actorUserId: number) {
      return ipcRenderer.invoke("implants:close", implantId, clinicId, actorUserId);
    },

    signUsage(implantId: number, clinicId: number, doctorId: number, signature: string, actorUserId: number) {
      return ipcRenderer.invoke("implants:sign-usage", implantId, clinicId, doctorId, signature, actorUserId);
    },

    delete(
      implantId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "implants:delete",
        implantId,
        clinicId,
      );
    },
  },

  /* =======================================================
     Inventory
  ======================================================= */

  inventory: {
    instrumentsAll() {
      return ipcRenderer.invoke("inventory:instruments-all");
    },
    categories(clinicId: number) {
      return ipcRenderer.invoke("inventory:categories", clinicId);
    },

    createCategory(clinicId: number, name: string, actorUserId: number, requiresDoctorSignature?: boolean) {
      return ipcRenderer.invoke("inventory:create-category", clinicId, name, actorUserId, requiresDoctorSignature);
    },

    deleteCategory(clinicId: number, name: string, actorUserId: number) {
      return ipcRenderer.invoke("inventory:delete-category", clinicId, name, actorUserId);
    },

    list(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory:list",
        clinicId,
      );
    },

    byId(
      inventoryItemId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory:by-id",
        inventoryItemId,
        clinicId,
      );
    },

    create(
      clinicId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "inventory:create",
        clinicId,
        input,
      );
    },

    update(
      inventoryItemId: number,
      clinicId: number,
      input: unknown,
      actorUserId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory:update",
        inventoryItemId,
        clinicId,
        input,
        actorUserId,
      );
    },

    /*
     * Legacy compatibility.
     *
     * 新版 UI 不應使用此 API
     * 做正式庫存異動。
     */
    updateQuantity(
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
    ) {
      return ipcRenderer.invoke(
        "inventory:update-quantity",
        inventoryItemId,
        clinicId,
        quantity,
      );
    },

    /*
     * 正式入庫。
     *
     * quantity = 本次收到數量。
     * unitCost = 本批次單位成本。
     */
    receive(
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      unitCost: number,
      note: string,
      actorUserId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory:receive",
        inventoryItemId,
        clinicId,
        quantity,
        unitCost,
        note,
        actorUserId,
      );
    },

    /*
     * 手動庫存校正。
     *
     * quantity = 校正後庫存總量。
     */
    adjustQuantity(
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      note: string,
      actorUserId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory:adjust",
        inventoryItemId,
        clinicId,
        quantity,
        note,
        actorUserId,
      );
    },

    lowStock(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory:low-stock",
        clinicId,
      );
    },

    delete(
      inventoryItemId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory:delete",
        inventoryItemId,
        clinicId,
      );
    },
  },

  purchaseRequests: {
    list(clinicId: number) {
      return ipcRenderer.invoke("purchase-requests:list", clinicId);
    },
    create(clinicId: number, inventoryItemId: number, quantity: number, note: string, actorUserId: number) {
      return ipcRenderer.invoke("purchase-requests:create", clinicId, inventoryItemId, quantity, note, actorUserId);
    },
    complete(id: number, clinicId: number, actorUserId: number) {
      return ipcRenderer.invoke("purchase-requests:complete", id, clinicId, actorUserId);
    },
  },

  /* =======================================================
     Inventory Transactions
  ======================================================= */

  inventoryTransactions: {
    list(
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory-transactions:list",
        clinicId,
      );
    },

    byItem(
      inventoryItemId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory-transactions:by-item",
        inventoryItemId,
        clinicId,
      );
    },

    byImplant(
      implantId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory-transactions:by-implant",
        implantId,
        clinicId,
      );
    },

    byImplantTooth(
      implantToothId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory-transactions:by-implant-tooth",
        implantToothId,
        clinicId,
      );
    },

    /*
     * Legacy implantItems.
     */
    byImplantItem(
      implantItemId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory-transactions:by-implant-item",
        implantItemId,
        clinicId,
      );
    },

    byImplantPlanItem(
      implantPlanItemId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory-transactions:by-implant-plan-item",
        implantPlanItemId,
        clinicId,
      );
    },

    byImplantUsageItem(
      implantUsageItemId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "inventory-transactions:by-implant-usage-item",
        implantUsageItemId,
        clinicId,
      );
    },
  },

  /* =======================================================
     Consumables
  ======================================================= */

  consumables: {
    list(
      clinicId: number,
      usageType?: string,
    ) {
      return ipcRenderer.invoke(
        "consumables:list",
        clinicId,
        usageType,
      );
    },

    byId(
      usageRecordId: number,
      clinicId: number,
    ) {
      return ipcRenderer.invoke(
        "consumables:by-id",
        usageRecordId,
        clinicId,
      );
    },

    /*
     * 建立耗材使用。
     *
     * Repository 會立即扣庫存。
     */
    create(
      clinicId: number,
      input: unknown,
    ) {
      return ipcRenderer.invoke(
        "consumables:create",
        clinicId,
        input,
      );
    },

    /*
     * 指定醫師簽名。
     */
    sign(
      usageRecordId: number,
      clinicId: number,
      doctorId: number,
      signatureDataUrl: string,
    ) {
      return ipcRenderer.invoke(
        "consumables:sign",
        usageRecordId,
        clinicId,
        doctorId,
        signatureDataUrl,
      );
    },

    /*
     * 取消未簽名紀錄。
     *
     * 後端會：
     *
     * - 驗證 status === 待醫師簽名
     * - 必須有取消原因
     * - 將原本扣除庫存全部歸回
     * - 建立「耗材取消歸回」transaction
     * - 保留原始紀錄
     */
    cancel(
      usageRecordId: number,
      clinicId: number,
      reason: string,
    ) {
      return ipcRenderer.invoke(
        "consumables:cancel",
        usageRecordId,
        clinicId,
        reason,
      );
    },

    byDoctor(
      doctorId: number,
      clinicId: number,
      usageType?: string,
    ) {
      return ipcRenderer.invoke(
        "consumables:by-doctor",
        doctorId,
        clinicId,
        usageType,
      );
    },

    byPatient(
      patientId: number,
      clinicId: number,
      usageType?: string,
    ) {
      return ipcRenderer.invoke(
        "consumables:by-patient",
        patientId,
        clinicId,
        usageType,
      );
    },
  },
};

/* =========================================================
   Expose API
========================================================= */


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

type InventoryInput = {
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

type AuthSession = {
  userId: number;
  userName: string;
  clinicId: number;
  clinicName: string;
  role: "Doctor" | "Assistant" | "Admin" | "Accountant" | "Procurement";
};

/* =========================
   Electron API
========================= */

declare global {
  interface Window {
    dentflow: {
      version: string;

      auth: {
        status: () => Promise<{ needsSetup: boolean }>;
        setup: (
          name: string,
          account: string,
          password: string,
        ) => Promise<AuthSession>;
        login: (account: string, password: string) => Promise<AuthSession>;
        current: () => Promise<AuthSession | null>;
        logout: () => Promise<boolean>;
      };

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
        create: (input: InventoryInput) => Promise<InventoryRecord>;
        update: (id: number, input: InventoryInput) => Promise<InventoryRecord>;
        delete: (id: number) => Promise<boolean>;
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

contextBridge.exposeInMainWorld(
  "dentflow",
  dentflowApi,
);
