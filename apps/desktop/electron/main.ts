import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
} from "electron";

import {
  randomBytes,
} from "node:crypto";

import path from "node:path";

import {
  fileURLToPath,
} from "node:url";

import {
  initializeDatabase,
} from "./database/db";

/* =========================================================
   Patients
========================================================= */

import {
  createPatient,
  deletePatient,
  getPatientById,
  getPatients,
  getPatientsByDoctor,
  getPatientsByDoctorAllClinics,
  getPatientsByDoctorUserAllClinics,
  updatePatient,
} from "./database/patientRepository";

/* =========================================================
   Doctors
========================================================= */

import {
  addDoctorClinic,
  createDoctor,
  deleteDoctor,
  getActiveDoctorByUserId,
  getActiveDoctors,
  getDoctorByAccount,
  getDoctorById,
  getDoctorByUserId,
  getDoctorClinics,
  getDoctors,
  removeDoctorClinic,
  setDoctorClinics,
  setDoctorPrimaryClinic,
  updateDoctor,
} from "./database/doctorRepository";

/* =========================================================
   Implants
========================================================= */

import {
  createImplant,
  deleteImplant,
  getImplants,
  getImplantsByDoctor,
  getImplantsByPatient,
  recordImplantUsage,
  updateImplant,
  updateImplantStatus,
} from "./database/implantRepository";

/* =========================================================
   Inventory
========================================================= */

import {
  adjustInventoryQuantity,
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItemById,
  getInventoryItems,
  getLowStockItems,
  receiveInventory,
  updateInventoryItem,
  updateInventoryQuantity,
} from "./database/inventoryRepository";

/* =========================================================
   Inventory Transactions
========================================================= */

import {
  getInventoryTransactions,
  getInventoryTransactionsByImplant,
  getInventoryTransactionsByImplantItem,
  getInventoryTransactionsByImplantPlanItem,
  getInventoryTransactionsByImplantTooth,
  getInventoryTransactionsByImplantUsageItem,
  getInventoryTransactionsByItem,
} from "./database/inventoryTransactionRepository";

/* =========================================================
   Consumables
========================================================= */

import {
  cancelConsumableUsage,
  createConsumableUsage,
  ensureConsumableUsageSchema,
  getConsumableUsageByDoctor,
  getConsumableUsageById,
  getConsumableUsageByPatient,
  getConsumableUsageRecords,
  signConsumableUsage,
} from "./database/consumableUsageRepository";

import type {
  ConsumableUsageInput,
  ConsumableUsageType,
} from "./database/consumableUsageRepository";


/* =========================================================
   Clinics
========================================================= */

import {
  addUserToClinic,
  createClinic,
  getActiveClinics as getManagedActiveClinics,
  getClinicById,
  getClinics,
  getClinicsByUser,
  getClinicsWithStats,
  getClinicWithStats,
  removeUserFromClinic,
  setClinicActive,
  setUserPrimaryClinic,
  updateClinic,
} from "./database/clinicRepository";

import type {
  ClinicInput,
  ClinicUpdateInput,
} from "./database/clinicRepository";

/* =========================================================
   Auth
========================================================= */

import {
  changePassword,
  createInitialAdmin,
  createUser,
  deleteUser,
  getActiveClinics,
  getClinicsForAccount,
  getLocalAdminAccounts,
  getUser,
  getUsers,
  hasUsers,
  login,
  resetLocalAdminPassword,
  resetPassword,
  setUserClinics,
  updateUser,
  validateClinicAccess,
} from "./database/authRepository";

import type {
  ChangePasswordInput,
  CreateInitialAdminInput,
  CreateUserInput,
  LoginInput,
  LocalAdminPasswordResetInput,
  ResetPasswordInput,
  UpdateUserInput,
} from "./database/authRepository";

/* =========================================================
   ESM __dirname
========================================================= */

const __filename =
  fileURLToPath(
    import.meta.url,
  );

const __dirname =
  path.dirname(
    __filename,
  );

/* =========================================================
   Window
========================================================= */

let mainWindow:
  BrowserWindow | null =
  null;

/* =========================================================
   Admin Recovery
========================================================= */

/*
 * 管理者復原 Token：
 *
 * - 只存在 Electron Main Process 記憶體
 * - 不寫入 SQLite
 * - 不寫入 localStorage
 * - 不寫入 sessionStorage
 * - 不寫入檔案
 * - 5 分鐘後失效
 * - 成功使用後立即銷毀
 */

const ADMIN_RECOVERY_TOKEN_TTL =
  5 * 60 * 1000;

type AdminRecoveryGrant = {
  token: string;
  expiresAt: number;
};

let adminRecoveryGrant:
  AdminRecoveryGrant | null =
  null;

/* =========================================================
   Recovery Helpers
========================================================= */

function clearAdminRecoveryGrant() {
  adminRecoveryGrant =
    null;
}

function createAdminRecoveryGrant() {
  const token =
    randomBytes(
      32,
    ).toString(
      "hex",
    );

  const expiresAt =
    Date.now() +
    ADMIN_RECOVERY_TOKEN_TTL;

  adminRecoveryGrant = {
    token,
    expiresAt,
  };

  return {
    token,
    expiresAt,
  };
}

function validateAdminRecoveryToken(
  token: string,
) {
  if (
    !adminRecoveryGrant
  ) {
    throw new Error(
      "管理者復原授權不存在，請重新開始復原流程",
    );
  }

  if (
    Date.now() >
    adminRecoveryGrant.expiresAt
  ) {
    clearAdminRecoveryGrant();

    throw new Error(
      "管理者復原授權已逾時，請重新開始復原流程",
    );
  }

  if (
    token !==
    adminRecoveryGrant.token
  ) {
    throw new Error(
      "管理者復原授權無效",
    );
  }
}

/* =========================================================
   Auth IPC
========================================================= */

function registerAuthHandlers() {
  ipcMain.handle(
    "auth:active-clinics",
    () => {
      return getActiveClinics();
    },
  );

  ipcMain.handle(
    "auth:clinics-for-account",
    (
      _event,
      account: string,
    ) => {
      return getClinicsForAccount(
        account,
      );
    },
  );

  ipcMain.handle(
    "auth:has-users",
    () => {
      return hasUsers();
    },
  );

  ipcMain.handle(
    "auth:login",
    (
      _event,
      input: LoginInput,
    ) => {
      return login(
        input,
      );
    },
  );

  ipcMain.handle(
    "auth:create-initial-admin",
    (
      _event,
      input:
        CreateInitialAdminInput,
    ) => {
      return createInitialAdmin(
        input,
      );
    },
  );

  ipcMain.handle(
    "auth:users",
    () => {
      return getUsers();
    },
  );

  ipcMain.handle(
    "auth:user",
    (
      _event,
      userId: number,
    ) => {
      return getUser(
        userId,
      );
    },
  );

  ipcMain.handle(
    "auth:create-user",
    (
      _event,
      input:
        CreateUserInput,
    ) => {
      return createUser(
        input,
      );
    },
  );

  ipcMain.handle(
    "auth:update-user",
    (
      _event,
      userId: number,
      input:
        UpdateUserInput,
    ) => {
      return updateUser(
        userId,
        input,
      );
    },
  );

  ipcMain.handle(
    "auth:change-password",
    (
      _event,
      input:
        ChangePasswordInput,
    ) => {
      return changePassword(
        input,
      );
    },
  );

  ipcMain.handle(
    "auth:reset-password",
    (
      _event,
      input:
        ResetPasswordInput,
    ) => {
      return resetPassword(
        input,
      );
    },
  );

  ipcMain.handle(
    "auth:set-user-clinics",
    (
      _event,
      userId: number,
      clinicIds: number[],
      primaryClinicId:
        number | null,
    ) => {
      return setUserClinics(
        userId,
        clinicIds,
        primaryClinicId,
      );
    },
  );

  ipcMain.handle(
    "auth:validate-clinic-access",
    (
      _event,
      userId: number,
      clinicId: number,
    ) => {
      return validateClinicAccess(
        userId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "auth:delete-user",
    (
      _event,
      userId: number,
    ) => {
      return deleteUser(
        userId,
      );
    },
  );

  /* =======================================================
     Local Admin Recovery
  ======================================================= */

  ipcMain.handle(
    "auth:local-admin-accounts",
    () => {
      return getLocalAdminAccounts();
    },
  );

  ipcMain.handle(
    "auth:begin-local-admin-recovery",
    async (
      event,
    ) => {
      clearAdminRecoveryGrant();

      const senderWindow =
        BrowserWindow.fromWebContents(
          event.sender,
        );

      const options = {
        type:
          "warning" as const,

        buttons: [
          "取消",
          "開始管理者復原",
        ],

        defaultId: 0,
        cancelId: 0,

        noLink: true,

        title:
          "捷晞美學牙醫 管理者復原",

        message:
          "確定要啟動本機管理者密碼復原嗎？",

        detail:
          "此功能只應在管理者忘記密碼、無法登入捷晞美學牙醫系統時使用。\n\n復原授權只有 5 分鐘有效，而且只能使用一次。",
      };

      const result =
        senderWindow
          ? await dialog.showMessageBox(
              senderWindow,
              options,
            )
          : await dialog.showMessageBox(
              options,
            );

      if (
        result.response !== 1
      ) {
        return {
          authorized: false,
          token: null,
          expiresAt: null,
        };
      }

      const grant =
        createAdminRecoveryGrant();

      return {
        authorized: true,

        token:
          grant.token,

        expiresAt:
          new Date(
            grant.expiresAt,
          ).toISOString(),
      };
    },
  );

  ipcMain.handle(
    "auth:complete-local-admin-recovery",
    async (
      _event,
      input: {
        token: string;
        account: string;
        newPassword: string;
      },
    ) => {
      if (
        !input ||
        typeof input.token !==
          "string" ||
        typeof input.account !==
          "string" ||
        typeof input.newPassword !==
          "string"
      ) {
        throw new Error(
          "管理者復原資料格式不正確",
        );
      }

      validateAdminRecoveryToken(
        input.token,
      );

      /*
       * Token 在執行前即銷毀。
       *
       * 不論 repository 最後成功或失敗，
       * 同一個 token 都不能再次使用。
       */
      clearAdminRecoveryGrant();

      const resetInput:
        LocalAdminPasswordResetInput = {
          account:
            input.account,

          newPassword:
            input.newPassword,
        };

      const result =
        await resetLocalAdminPassword(
          resetInput,
        );

      return {
        ...result,

        recoveryCompleted:
          true,
      };
    },
  );

  ipcMain.handle(
    "auth:cancel-local-admin-recovery",
    () => {
      clearAdminRecoveryGrant();

      return {
        success: true,
      };
    },
  );
}

/* =========================================================
   Patient IPC
========================================================= */

function registerPatientHandlers() {
  ipcMain.handle(
    "patients:list",
    (
      _event,
      clinicId: number,
    ) => {
      return getPatients(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "patients:by-id",
    (
      _event,
      patientId: number,
      clinicId: number,
    ) => {
      return getPatientById(
        patientId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "patients:by-doctor",
    (
      _event,
      doctorId: number,
      clinicId: number,
    ) => {
      return getPatientsByDoctor(
        doctorId,
        clinicId,
      );
    },
  );

  /*
   * 醫師跨院所瀏覽：
   * clinic scope 由 doctorClinics 在 repository 端決定。
   */
  ipcMain.handle(
    "patients:by-doctor-all-clinics",
    (
      _event,
      doctorId: number,
    ) => {
      return getPatientsByDoctorAllClinics(
        doctorId,
      );
    },
  );

  ipcMain.handle(
    "patients:by-doctor-user-all-clinics",
    (
      _event,
      userId: number,
    ) => {
      return getPatientsByDoctorUserAllClinics(
        userId,
      );
    },
  );

  ipcMain.handle(
    "patients:create",
    (
      _event,
      clinicId: number,
      input,
    ) => {
      return createPatient(
        clinicId,
        input,
      );
    },
  );

  ipcMain.handle(
    "patients:update",
    (
      _event,
      patientId: number,
      clinicId: number,
      input,
    ) => {
      return updatePatient(
        patientId,
        clinicId,
        input,
      );
    },
  );

  ipcMain.handle(
    "patients:delete",
    (
      _event,
      patientId: number,
      clinicId: number,
    ) => {
      return deletePatient(
        patientId,
        clinicId,
      );
    },
  );
}

/* =========================================================
   Doctor IPC
========================================================= */

function registerDoctorHandlers() {
  ipcMain.handle(
    "doctors:list",
    (
      _event,
      clinicId: number,
    ) => {
      return getDoctors(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "doctors:active",
    (
      _event,
      clinicId: number,
    ) => {
      return getActiveDoctors(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "doctors:by-id",
    (
      _event,
      doctorId: number,
      clinicId: number,
    ) => {
      return getDoctorById(
        doctorId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "doctors:by-user-id",
    (
      _event,
      userId: number,
      clinicId: number,
    ) => {
      return getDoctorByUserId(
        userId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "doctors:active-by-user-id",
    (
      _event,
      userId: number,
      clinicId: number,
    ) => {
      return getActiveDoctorByUserId(
        userId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "doctors:by-account",
    (
      _event,
      account: string,
      clinicId: number,
    ) => {
      return getDoctorByAccount(
        account,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "doctors:create",
    (
      _event,
      clinicId: number,
      input,
    ) => {
      return createDoctor(
        clinicId,
        input,
      );
    },
  );

  ipcMain.handle(
    "doctors:update",

    (
      _event,
      doctorId: number,
      clinicId: number,
      input,
    ) => updateDoctor(doctorId, clinicId, input),
  );

  ipcMain.handle(
    "doctors:delete",
    (_event, doctorId: number, clinicId: number) =>
      deleteDoctor(doctorId, clinicId),
  );

  ipcMain.handle(
    "doctors:clinics",
    (_event, doctorId: number) => getDoctorClinics(doctorId),
  );

  ipcMain.handle(
    "doctors:set-clinics",
    (_event, doctorId: number, clinicIds: number[], primaryClinicId: number) =>
      setDoctorClinics(doctorId, clinicIds, primaryClinicId),
  );

  ipcMain.handle(
    "doctors:add-clinic",
    (_event, doctorId: number, clinicId: number) =>
      addDoctorClinic(doctorId, clinicId),
  );

  ipcMain.handle(
    "doctors:remove-clinic",
    (_event, doctorId: number, clinicId: number) =>
      removeDoctorClinic(doctorId, clinicId),
  );

  ipcMain.handle(
    "doctors:set-primary-clinic",
    (_event, doctorId: number, clinicId: number) =>
      setDoctorPrimaryClinic(doctorId, clinicId),
  );
}

function registerImplantHandlers() {
  ipcMain.handle(
    "implants:list",
    (
      _event,
      clinicId: number,
    ) => {
      return getImplants(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "implants:by-patient",
    (
      _event,
      patientId: number,
      clinicId: number,
    ) => {
      return getImplantsByPatient(
        patientId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "implants:by-doctor",
    (
      _event,
      doctorId: number,
      clinicId: number,
    ) => {
      return getImplantsByDoctor(
        doctorId,
        clinicId,
      );
    },
  );

  /*
   * 術前規劃：
   *
   * 只記錄：
   * - 品項
   * - 品牌
   * - 型號
   * - 規格
   * - 數量
   *
   * 不在這裡指定 REF / LOT。
   */
  ipcMain.handle(
    "implants:create",
    (
      _event,
      clinicId: number,
      input,
    ) => {
      return createImplant(
        clinicId,
        input,
      );
    },
  );

  ipcMain.handle(
    "implants:update",

    (_event, implantId: number, clinicId: number, input) =>
      updateImplant(implantId, clinicId, input),
  );

  ipcMain.handle(
    "implants:update-status",
    (_event, implantId: number, clinicId: number, status) =>
      updateImplantStatus(implantId, clinicId, status),
  );

  ipcMain.handle(
    "implants:record-usage",
    (_event, implantId: number, clinicId: number, usageInputs) =>
      recordImplantUsage(implantId, clinicId, usageInputs),
  );

  ipcMain.handle(
    "implants:delete",
    (_event, implantId: number, clinicId: number) =>
      deleteImplant(implantId, clinicId),
  );
}

function registerInventoryHandlers() {
  ipcMain.handle(
    "inventory:list",
    (
      _event,
      clinicId: number,
    ) => {
      return getInventoryItems(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "inventory:by-id",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
    ) => {
      return getInventoryItemById(
        inventoryItemId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "inventory:create",
    (
      _event,
      clinicId: number,
      input,
    ) => {
      return createInventoryItem(
        clinicId,
        input,
      );
    },
  );

  /*
   * 主檔修改。
   *
   * Repository 不會由這個 API
   * 直接修改 quantity。
   */
  ipcMain.handle(
    "inventory:update",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
      input,
    ) => {
      return updateInventoryItem(
        inventoryItemId,
        clinicId,
        input,
      );
    },
  );

  /*
   * Legacy compatibility。
   *
   * 新 UI 不應使用此 API。
   * 正式庫存增減請使用 receive / adjust。
   */
  ipcMain.handle(
    "inventory:update-quantity",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
    ) => {
      return updateInventoryQuantity(
        inventoryItemId,
        clinicId,
        quantity,
      );
    },
  );

  /*
   * 正式入庫。
   *
   * quantity = 本次收到多少。
   * unitCost = 本批次單位成本。
   */
  ipcMain.handle(
    "inventory:receive",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      unitCost: number,
      note: string,
    ) => {
      return receiveInventory(
        inventoryItemId,
        clinicId,
        quantity,
        unitCost,
        note,
      );
    },
  );

  /*
   * 手動庫存校正。
   *
   * quantity = 校正後的絕對庫存總量。
   */
  ipcMain.handle(
    "inventory:adjust",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      note: string,
    ) => {
      return adjustInventoryQuantity(
        inventoryItemId,
        clinicId,
        quantity,
        note,
      );
    },
  );

  ipcMain.handle(
    "inventory:low-stock",
    (
      _event,
      clinicId: number,
    ) => {
      return getLowStockItems(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "inventory:delete",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
    ) => {
      return deleteInventoryItem(
        inventoryItemId,
        clinicId,
      );
    },
  );
}

/* =========================================================
   Inventory Transaction IPC
========================================================= */

function registerInventoryTransactionHandlers() {
  ipcMain.handle(
    "inventory-transactions:list",
    (
      _event,
      clinicId: number,
    ) => {
      return getInventoryTransactions(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "inventory-transactions:by-item",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
    ) => {
      return getInventoryTransactionsByItem(
        inventoryItemId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "inventory-transactions:by-implant",
    (
      _event,
      implantId: number,
      clinicId: number,
    ) => {
      return getInventoryTransactionsByImplant(
        implantId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "inventory-transactions:by-implant-tooth",
    (
      _event,
      implantToothId: number,
      clinicId: number,
    ) => {
      return getInventoryTransactionsByImplantTooth(
        implantToothId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "inventory-transactions:by-implant-plan-item",
    (
      _event,
      implantPlanItemId: number,
      clinicId: number,
    ) => {
      return getInventoryTransactionsByImplantPlanItem(
        implantPlanItemId,
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "inventory-transactions:by-implant-usage-item",
    (
      _event,
      implantUsageItemId: number,
      clinicId: number,
    ) => {
      return getInventoryTransactionsByImplantUsageItem(
        implantUsageItemId,
        clinicId,
      );
    },
  );

  /*
   * Legacy implantItem query。
   */
  ipcMain.handle(
    "inventory-transactions:by-implant-item",
    (
      _event,
      implantItemId: number,
      clinicId: number,
    ) => {
      return getInventoryTransactionsByImplantItem(
        implantItemId,
        clinicId,
      );
    },
  );
}

/* =========================================================
   Consumable IPC
========================================================= */

function registerConsumableHandlers() {
  /*
   * 目前院所一般耗材使用紀錄。
   */
  ipcMain.handle(
    "consumables:list",
    (
      _event,
      clinicId: number,
      usageType?:
        ConsumableUsageType,
    ) => {
      return getConsumableUsageRecords(
        clinicId,
        usageType,
      );
    },
  );

  /*
   * 單筆紀錄。
   */
  ipcMain.handle(
    "consumables:by-id",
    (
      _event,
      usageRecordId: number,
      clinicId: number,
    ) => {
      return getConsumableUsageById(
        usageRecordId,
        clinicId,
      );
    },
  );

  /*
   * 建立一般耗材使用紀錄。
   *
   * Repository 會：
   *
   * 1. 驗證病患
   * 2. 驗證醫師
   * 3. 驗證院所
   * 4. 驗證庫存
   * 5. 排除植體 / 套件
   * 6. 扣除庫存
   * 7. 建立「耗材使用」庫存異動
   * 8. 狀態變成「待醫師簽名」
   */
  ipcMain.handle(
    "consumables:create",
    (
      _event,
      clinicId: number,
      input:
        ConsumableUsageInput,
    ) => {
      return createConsumableUsage(
        clinicId,
        input,
      );
    },
  );

  /*
   * 醫師電子簽名。
   *
   * Repository 會再次確認：
   *
   * - clinicId
   * - doctorId
   * - 指定醫師
   * - status === 待醫師簽名
   * - 不可重複簽名
   */
  ipcMain.handle(
    "consumables:sign",
    (
      _event,
      usageRecordId: number,
      clinicId: number,
      doctorId: number,
      signatureDataUrl: string,
    ) => {
      return signConsumableUsage(
        usageRecordId,
        clinicId,
        doctorId,
        signatureDataUrl,
      );
    },
  );

  /*
   * 取消尚未簽名的耗材使用紀錄。
   *
   * Repository 會：
   *
   * - 僅允許「待醫師簽名」
   * - 已簽名不可取消
   * - 必填取消原因
   * - 原始紀錄不刪除
   * - 全部已扣庫存自動歸回
   * - 建立「耗材取消歸回」庫存異動
   * - 狀態改為「已取消」
   */
  ipcMain.handle(
    "consumables:cancel",
    (
      _event,
      usageRecordId: number,
      clinicId: number,
      reason: string,
    ) => {
      return cancelConsumableUsage(
        usageRecordId,
        clinicId,
        reason,
      );
    },
  );

  /*
   * 指定醫師目前院所紀錄。
   */
  ipcMain.handle(
    "consumables:by-doctor",
    (
      _event,
      doctorId: number,
      clinicId: number,
      usageType?:
        ConsumableUsageType,
    ) => {
      return getConsumableUsageByDoctor(
        doctorId,
        clinicId,
        usageType,
      );
    },
  );

  /*
   * 指定病患目前院所紀錄。
   */
  ipcMain.handle(
    "consumables:by-patient",
    (
      _event,
      patientId: number,
      clinicId: number,
      usageType?:
        ConsumableUsageType,
    ) => {
      return getConsumableUsageByPatient(
        patientId,
        clinicId,
        usageType,
      );
    },
  );
}


/* =========================================================
   Clinic IPC
========================================================= */

function registerClinicHandlers() {
  ipcMain.handle(
    "clinics:list",
    () => {
      return getClinics();
    },
  );

  ipcMain.handle(
    "clinics:active",
    () => {
      return getManagedActiveClinics();
    },
  );

  ipcMain.handle(
    "clinics:by-id",
    (
      _event,
      clinicId: number,
    ) => {
      return getClinicById(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "clinics:with-stats",
    () => {
      return getClinicsWithStats();
    },
  );

  ipcMain.handle(
    "clinics:by-id-with-stats",
    (
      _event,
      clinicId: number,
    ) => {
      return getClinicWithStats(
        clinicId,
      );
    },
  );

  ipcMain.handle(
    "clinics:by-user",
    (
      _event,
      userId: number,
    ) => {
      return getClinicsByUser(
        userId,
      );
    },
  );

  /*
   * 建立院所時 repository 會：
   * 1. 驗證操作帳號為有效 Admin
   * 2. 建立 clinics
   * 3. 自動把建立者加入 userClinics
   */
  ipcMain.handle(
    "clinics:create",
    (
      _event,
      adminUserId: number,
      input: ClinicInput,
    ) => {
      return createClinic(
        adminUserId,
        input,
      );
    },
  );

  ipcMain.handle(
    "clinics:update",
    (
      _event,
      clinicId: number,
      adminUserId: number,
      input: ClinicUpdateInput,
    ) => {
      return updateClinic(
        clinicId,
        adminUserId,
        input,
      );
    },
  );

  /*
   * 院所不直接 DELETE。
   * 以啟用 / 停用保留既有醫療與庫存歷史。
   */
  ipcMain.handle(
    "clinics:set-active",
    (
      _event,
      clinicId: number,
      adminUserId: number,
      isActive: boolean,
    ) => {
      return setClinicActive(
        clinicId,
        adminUserId,
        isActive,
      );
    },
  );

  ipcMain.handle(
    "clinics:add-user",
    (
      _event,
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) => {
      return addUserToClinic(
        userId,
        clinicId,
        adminUserId,
      );
    },
  );

  ipcMain.handle(
    "clinics:remove-user",
    (
      _event,
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) => {
      return removeUserFromClinic(
        userId,
        clinicId,
        adminUserId,
      );
    },
  );

  ipcMain.handle(
    "clinics:set-user-primary",
    (
      _event,
      userId: number,
      clinicId: number,
      adminUserId: number,
    ) => {
      return setUserPrimaryClinic(
        userId,
        clinicId,
        adminUserId,
      );
    },
  );
}

/* =========================================================
   Register All IPC
========================================================= */

function registerIpcHandlers() {
  registerAuthHandlers();

  registerClinicHandlers();
  registerPatientHandlers();

  registerDoctorHandlers();

  registerImplantHandlers();
  registerInventoryHandlers();

  registerInventoryTransactionHandlers();

  registerConsumableHandlers();
}

/* =========================================================
   Create Window
========================================================= */

function createWindow() {
  mainWindow =
    new BrowserWindow({
      width: 1400,

      height: 900,

      minWidth: 1100,

      minHeight: 700,

      show: false,

      title:
        "捷晞美學牙醫｜C&C DENTAL",

      backgroundColor:
        "#f4f7f5",

      webPreferences: {
        /*
         * IMPORTANT
         *
         * 一定維持 preload.cjs。
         *
         * 不要改回 preload.mjs。
         */

        preload:
          path.join(
            __dirname,
            "preload.cjs",
          ),

        contextIsolation:
          true,

        nodeIntegration:
          false,

        sandbox:
          false,
      },
    });

  mainWindow.once(
    "ready-to-show",
    () => {
      mainWindow?.show();
    },
  );

  /* =======================================================
     Development
  ======================================================= */

  if (
    process.env
      .VITE_DEV_SERVER_URL
  ) {
    void mainWindow.loadURL(
      process.env
        .VITE_DEV_SERVER_URL,
    );
  } else {
    /* =====================================================
       Production
    ===================================================== */

    void mainWindow.loadFile(
      path.join(
        __dirname,
        "../dist/index.html",
      ),
    );
  }

  mainWindow.on(
    "closed",
    () => {
      clearAdminRecoveryGrant();

      mainWindow =
        null;
    },
  );
}

/* =========================================================
   App Ready
========================================================= */

app.whenReady().then(
  () => {
    /*
     * 1. 先初始化主資料庫與 migrations。
     */
    initializeDatabase();

    /*
     * 2. 確保耗材使用 schema 存在。
     *
     * 不刪除 DB。
     * 不重建既有資料。
     * 缺少的新欄位由 repository 安全補上。
     */
    ensureConsumableUsageSchema();

    /*
     * 3. 註冊 IPC。
     */
    registerIpcHandlers();

    /*
     * 4. 建立主視窗。
     */
    createWindow();

    app.on(
      "activate",
      () => {
        if (
          BrowserWindow
            .getAllWindows()
            .length === 0
        ) {
          createWindow();
        }
      },
    );
  },
);

/* =========================================================
   Window All Closed
========================================================= */

app.on(
  "window-all-closed",
  () => {
    clearAdminRecoveryGrant();

    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  },
);
