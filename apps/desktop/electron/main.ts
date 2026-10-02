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
  getDatabase,
  initializeDatabase,
} from "./database/db";

import {
  checkServerConnection,
  getDeploymentConfig,
} from "./remote/serverConnection";

import {
  centralApi,
} from "./remote/centralApiClient";
import { getLegacyImplantsForMigration } from "./database/implantMigrationRepository";
import { prepareImplantMigrationBatches } from "./remote/implantMigrationBatches";
import { getLegacyInventoryForMigration, getLegacyUsersForMigration } from "./database/resourceMigrationRepository";
import { prepareResourceMigrationBatches } from "./remote/resourceMigrationBatches";
import { createRemotePatientClient } from "./remote/patientClient";
import { createRemoteImplantClient } from "./remote/implantClient";
import { createRemoteImplantOrderClient } from "./remote/implantOrderClient";
import { createRemoteWithdrawalClient } from "./remote/implantWithdrawalClient";
import { createRemoteDispositionClient } from "./remote/implantDispositionClient";
import { createRemoteClinicalClient } from "./remote/implantClinicalClient";
import { encryptedDraftJournal } from "./remote/encryptedDraftJournal";
import { createRemoteInventoryClient } from "./remote/inventoryClient";
import type { OpeningInput } from "../shared/centralInventory";
import { localOperation } from "./remote/localOperation";
import { migrateLegacyAssets } from "./remote/assetMigration";

/* =========================================================
   Patients
========================================================= */

import {
  getLegacyPatientsForMigration,
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
  getLegacyDoctorsForMigration,
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
  cancelImplantCase,
  closeImplantCase,
  createImplant,
  deleteImplant,
  getImplants,
  getImplantsByDoctor,
  getImplantsByPatient,
  recordImplantUsage,
  signImplantUsage,
  updateImplant,
  updateImplantStatus,
} from "./database/implantRepository";

/* =========================================================
   Inventory
========================================================= */

import {
  adjustInventoryQuantity,
  createInventoryCategory,
  deleteInventoryCategory,
  createInventoryItem,
  deleteInventoryItem,
  getInventoryItemById,
  getInventoryItems,
  getInstrumentsAllClinics,
  getInventoryCategories,
  getLowStockItems,
  receiveInventory,
  updateInventoryItem,
  updateInventoryQuantity,
} from "./database/inventoryRepository";

import {
  completePurchaseRequest,
  createPurchaseRequest,
  getPurchaseRequests,
} from "./database/purchaseRequestRepository";

import {
  cancelMachineUsage, createMachine, createMachineReservation, createMachineUsage, ensureMachineSchema,
  getMachineUsageCredits, listMachineReservations, listMachineUsageRecords, listMachines,
  listMachineMovers, listMachineReservationReminders, listMachineScans, listMachineUsageCreditPurchases, updateMachineReservation, cancelMachineReservation,
  purchaseMachineUsageCredits, scanMachine, setMachineActive, signMachineUsage,
  updateMachine, updateMachineUsageCost,
} from "./database/machineRepository";

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
  if (getDeploymentConfig().mode === "remote") {
    registerRemoteAuthHandlers();
    return;
  }
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
          "此功能只應在管理者忘記密碼、無法登入捷晞美學牙醫系統時使用。\\n\\n復原授權只有 5 分鐘有效，而且只能使用一次。",
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

function registerRemoteAuthHandlers() {
  ipcMain.handle("auth:active-clinics", () => centralApi.get("/v1/auth/active-clinics"));
  ipcMain.handle("auth:clinics-for-account", (_event, account: string) =>
    centralApi.get(`/v1/auth/clinics-for-account?account=${encodeURIComponent(account)}`));
  ipcMain.handle("auth:has-users", async () => {
    const result = await centralApi.get<{ hasUsers: boolean }>("/v1/setup/status");
    return result.hasUsers;
  });
  ipcMain.handle("auth:login", async (_event, input: LoginInput) => {
    const session = await centralApi.login(input) as { role?: string };
    if (session.role === "Admin" || session.role === "Assistant") {
      try {
        if (session.role === "Admin") {
          const sourceId = centralApi.getDeviceId();
          const users = prepareResourceMigrationBatches(getLegacyUsersForMigration(), sourceId, "users", 500);
          if (users.oversizedIds.length) console.warn("操作者對照資料超過上限，保留本機來源，筆數：", users.oversizedIds.length);
          for (const batch of users.batches) {
            const result = await centralApi.post<{ conflicts: unknown[] }>("/v1/migrations/users/import", { sourceId, users: batch });
            if (result.conflicts.length) console.warn("操作者中央對照尚待處理，筆數：", result.conflicts.length);
          }
          const inventory = prepareResourceMigrationBatches(getLegacyInventoryForMigration(), sourceId, "inventory", 100);
          if (inventory.oversizedIds.length) console.warn("庫存資料超過上限，保留本機來源，筆數：", inventory.oversizedIds.length);
          for (const batch of inventory.batches) {
            const result = await centralApi.post<{ conflicts: unknown[] }>("/v1/migrations/inventory/import", { sourceId, inventory: batch });
            if (result.conflicts.length) console.warn("庫存中央對照尚待處理，筆數：", result.conflicts.length);
          }
        }
        const doctors = getLegacyDoctorsForMigration();
        for (let offset = 0; offset < doctors.length; offset += 500) {
          const result = await centralApi.post<{ conflicts: unknown[] }>("/v1/migrations/doctors/import", {
            sourceId: centralApi.getDeviceId(),
            doctors: doctors.slice(offset, offset + 500),
          });
          if (result.conflicts.length) console.warn("中央醫師對照有待處理衝突", result.conflicts);
        }
        const patients = getLegacyPatientsForMigration();
        for (let offset = 0; offset < patients.length; offset += 500) {
          const result = await centralApi.post<{ conflicts: unknown[] }>("/v1/migrations/patients/import", {
            sourceId: centralApi.getDeviceId(),
            patients: patients.slice(offset, offset + 500),
          });
          if (result.conflicts.length) console.warn("中央病患匯入有待處理衝突，筆數：", result.conflicts.length);
        }
        const sourceId = centralApi.getDeviceId();
        const { batches, oversizedIds } = prepareImplantMigrationBatches(getLegacyImplantsForMigration(), sourceId);
        if (oversizedIds.length) console.warn("植體個案超過遷移大小上限，保留本機資料，筆數：", oversizedIds.length);
        for (const implants of batches) {
          const result = await centralApi.post<{ conflicts: unknown[]; pendingAssets: number }>(
            "/v1/migrations/implants/import", { sourceId, implants },
          );
          if (result.conflicts.length) console.warn("中央植體個案匯入有待處理衝突，筆數：", result.conflicts.length);
          if (result.pendingAssets) console.warn("植體照片／簽名尚待搬移，數量：", result.pendingAssets);
        }
        if (session.role === "Admin") {
          let afterId: number | null = null;
          do {
            const result: { nextAfterId: number | null; missingInventory: number; missingUsers: number; conflicts: unknown[] } =
              await centralApi.post("/v1/migrations/implants/resolve-references", {
                sourceId, ...(afterId === null ? {} : { afterId }),
              });
            if (result.missingInventory || result.missingUsers || result.conflicts.length) {
              console.warn("植體歷史關聯尚未全部對照：", {
                inventory: result.missingInventory, users: result.missingUsers, conflicts: result.conflicts.length,
              });
            }
            afterId = result.nextAfterId;
          } while (afterId !== null);
          await migrateLegacyAssets();
        }
      } catch (error) {
        console.warn("中央資料匯入未完成，暫時保留本機資料來源", error);
      }
    }
    return session;
  });
  ipcMain.handle("auth:create-initial-admin", (_event, input: CreateInitialAdminInput) =>
    centralApi.post("/v1/setup/initial-admin", input));
  ipcMain.handle("auth:users", () => centralApi.get("/v1/auth/users"));
  ipcMain.handle("auth:user", (_event, userId: number) => centralApi.get(`/v1/auth/users/${userId}`));
  ipcMain.handle("auth:create-user", (_event, input: CreateUserInput) => centralApi.post("/v1/auth/users", input));
  ipcMain.handle("auth:update-user", (_event, userId: number, input: UpdateUserInput) =>
    centralApi.put(`/v1/auth/users/${userId}`, input));
  ipcMain.handle("auth:change-password", (_event, input: ChangePasswordInput) =>
    centralApi.post("/v1/auth/change-password", input));
  ipcMain.handle("auth:reset-password", (_event, input: ResetPasswordInput) =>
    centralApi.post("/v1/auth/reset-password", input));
  ipcMain.handle("auth:set-user-clinics", (_event, userId: number, clinicIds: number[], primaryClinicId: number | null) =>
    centralApi.put(`/v1/auth/users/${userId}/clinics`, { clinicIds, primaryClinicId }));
  ipcMain.handle("auth:validate-clinic-access", (_event, _userId: number, clinicId: number) =>
    centralApi.get(`/v1/auth/clinic-access/${clinicId}`));
  ipcMain.handle("auth:delete-user", (_event, userId: number) => centralApi.delete(`/v1/auth/users/${userId}`));
  ipcMain.handle("auth:local-admin-accounts", () => {
    throw new Error("中央伺服器模式不提供本機管理者復原，請由其他管理者重設密碼");
  });
  ipcMain.handle("auth:begin-local-admin-recovery", () => {
    throw new Error("中央伺服器模式不提供本機管理者復原");
  });
  ipcMain.handle("auth:complete-local-admin-recovery", () => {
    throw new Error("中央伺服器模式不提供本機管理者復原");
  });
  ipcMain.handle("auth:cancel-local-admin-recovery", () => ({ success: true }));
}

/* =========================================================
   Patient IPC
========================================================= */

function registerLocalHandler(channel: string, listener: Parameters<typeof ipcMain.handle>[1]) {
  ipcMain.handle(channel, localOperation(getDeploymentConfig().mode, listener));
}
function registerRemotePatientHandlers() {
  const patients = createRemotePatientClient(centralApi);
  ipcMain.handle("patients:list", (_e, clinicId: number) => patients.list(clinicId));
  ipcMain.handle("patients:by-id", (_e, id: number, clinicId: number) => patients.byId(id, clinicId));
  ipcMain.handle("patients:by-doctor", (_e, id: number, clinicId: number) => patients.byDoctor(id, clinicId));
  ipcMain.handle("patients:by-doctor-all-clinics", (_e, id: number) => patients.byDoctorAllClinics(id));
  ipcMain.handle("patients:by-doctor-user-all-clinics", (_e, id: number) => patients.byDoctorAllClinics(id));
  ipcMain.handle("patients:create", (_e, clinicId: number, input: unknown) => patients.create(clinicId, input));
  ipcMain.handle("patients:update", (_e, id: number, clinicId: number, input: unknown) => patients.update(id, clinicId, input));
  ipcMain.handle("patients:delete", (_e, id: number, clinicId: number, version: number) => patients.archive(id, clinicId, version));
}
function registerRemoteDoctorHandlers() {
  const patients = createRemotePatientClient(centralApi);
  for (const channel of ["doctors:list", "doctors:active"]) ipcMain.handle(channel, (_e, clinicId: number) => patients.doctors(clinicId));
  for (const channel of ["doctors:by-id", "doctors:by-user-id", "doctors:active-by-user-id"]) ipcMain.handle(channel, async (_e, id: number, clinicId: number) => (await patients.doctors(clinicId)).find(d => d.userId === id) ?? null);
  ipcMain.handle("doctors:by-account", () => { throw Error("請使用中央醫師帳號 ID 選擇醫師"); });
  for (const channel of ["doctors:create", "doctors:update", "doctors:delete", "doctors:clinics", "doctors:set-clinics", "doctors:add-clinic", "doctors:remove-clinic", "doctors:set-primary-clinic"]) registerLocalHandler(channel, () => undefined);
}

function registerPatientHandlers() {
  if (getDeploymentConfig().mode === "remote") { registerRemotePatientHandlers(); return; }
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
  if (getDeploymentConfig().mode === "remote") { registerRemoteDoctorHandlers(); return; }
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

function actorCanViewCost(actorUserId: number) {
  const row = getDatabase().prepare(`SELECT role FROM users WHERE id = ? AND isActive = 1`).get(actorUserId) as { role: string } | undefined;
  return row?.role === "Admin" || row?.role === "Accountant" || row?.role === "Doctor";
}

function removeCostFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeCostFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "unitCost" && key !== "totalCost")
    .map(([key, child]) => [key, removeCostFields(child)]));
}

function redactCostFields<T>(value: T, actorUserId: number): T {
  return (actorCanViewCost(actorUserId) ? value : removeCostFields(value)) as T;
}

const restrictedCostCategories = new Set([
  "植體", "植體套件", "連針帶線", "牙周藥膏", "冷光藥劑", "膠原蛋白", "骨粉", "再生膜", "居家美白藥劑",
]);

function redactInventoryCosts<T extends Array<Record<string, unknown>>>(items: T, actorUserId: number): T {
  const actor = getDatabase().prepare(`SELECT role FROM users WHERE id = ? AND isActive = 1`).get(actorUserId) as { role: string } | undefined;
  if (actor?.role === "Admin" || actor?.role === "Accountant") return items;
  return items.map((item) => {
    if (actor?.role === "Procurement" && !restrictedCostCategories.has(String(item.category ?? ""))) return item;
    const safe = { ...item };
    delete safe.unitCost;
    delete safe.totalCost;
    return safe;
  }) as T;
}

function registerCentralImplantHandlers() {
  const implants = createRemoteImplantClient(centralApi, encryptedDraftJournal, () => getDeploymentConfig().serverUrl!);\n  const orders = createRemoteImplantOrderClient(centralApi, () => getDeploymentConfig().serverUrl!);\n  const withdrawals = createRemoteWithdrawalClient(centralApi, () => getDeploymentConfig().serverUrl!);\n  const dispositions = createRemoteDispositionClient(centralApi, () => getDeploymentConfig().serverUrl!);\n  const clinical = createRemoteClinicalClient(centralApi, () => getDeploymentConfig().serverUrl!);
  const remote = (callback: Parameters<typeof ipcMain.handle>[1]) => (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    if (getDeploymentConfig().mode !== "remote") throw Error("請先連線中央伺服器再操作中央個案");
    return callback(event, ...args);
  };
  ipcMain.handle("central-implants:list", remote((_e, clinicId: number, afterId?: number) => implants.list(clinicId, afterId)));
  ipcMain.handle("central-implants:detail", remote((_e, id: number, clinicId: number) => implants.detail(id, clinicId)));
  ipcMain.handle("central-implants:pending", remote((_e, clinicId: number) => implants.pending(clinicId)));
  ipcMain.handle("central-implants:create", remote((_e, clinicId: number, input: unknown) => implants.create(clinicId, input)));
  ipcMain.handle("central-implants:update", remote((_e, id: number, clinicId: number, version: number, input: unknown) => implants.update(id, clinicId, version, input)));
  ipcMain.handle("central-implants:cancel", remote((_e, id: number, clinicId: number, version: number, reason: string) => implants.cancel(id, clinicId, version, reason)));
  ipcMain.handle("central-implants:pending-order", remote((_e, clinicId: number) => orders.pending(clinicId)));
  ipcMain.handle("central-implants:order", remote((_e, clinicId: number, input: unknown) => orders.order(clinicId, input)));
  ipcMain.handle("central-implants:cancel-order", remote((_e, clinicId: number, input: unknown) => orders.cancel(clinicId, input)));
  ipcMain.handle("central-implants:pending-withdrawal", remote((_e, clinicId: number) => withdrawals.pending(clinicId)));
  ipcMain.handle("central-implants:withdraw", remote((_e, clinicId: number, input: unknown) => withdrawals.withdraw(clinicId, input)));
  ipcMain.handle("central-implants:pending-disposition", remote((_e, clinicId: number) => dispositions.pending(clinicId)));
  ipcMain.handle("central-implants:disposition", remote((_e, input: unknown) => dispositions.submit(input)));
  ipcMain.handle("central-implants:pending-clinical", remote((_e, clinicId: number) => clinical.pending(clinicId)));
  ipcMain.handle("central-implants:retry-clinical", remote((_e, input: unknown) => clinical.retry(input)));
  ipcMain.handle("central-implants:clinical-asset-data", remote((_e, id: string) => clinical.assetDataUrl(id)));
  ipcMain.handle("central-implants:clinical-asset", remote((_e, input: unknown) => clinical.asset(input)));
  ipcMain.handle("central-implants:close-case", remote((_e, input: unknown) => clinical.close(input)));
}

function registerImplantHandlers() {
  registerLocalHandler(
    "implants:list",
    (
      _event,
      clinicId: number,
      actorUserId: number,
    ) => {
      return redactCostFields(getImplants(clinicId), actorUserId);
    },
  );

  registerLocalHandler(
    "implants:by-patient",
    (
      _event,
      patientId: number,
      clinicId: number,
      actorUserId: number,
    ) => {
      return redactCostFields(getImplantsByPatient(
        patientId,
        clinicId,
      ), actorUserId);
    },
  );

  registerLocalHandler(
    "implants:by-doctor",
    (
      _event,
      doctorId: number,
      clinicId: number,
      actorUserId: number,
    ) => {
      return redactCostFields(getImplantsByDoctor(
        doctorId,
        clinicId,
      ), actorUserId);
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
  registerLocalHandler(
    "implants:create",
    (
      _event,
      clinicId: number,
      input,
      actorUserId: number,
    ) => {
      return createImplant(
        clinicId,
        input,
        actorUserId,
      );
    },
  );

  registerLocalHandler(
    "implants:update",

    (_event, implantId: number, clinicId: number, input) =>
      updateImplant(implantId, clinicId, input),
  );

  registerLocalHandler(
    "implants:update-status",
    (_event, implantId: number, clinicId: number, status, actorUserId: number) =>
      updateImplantStatus(implantId, clinicId, status, actorUserId),
  );

  registerLocalHandler(
    "implants:record-usage",
    (_event, implantId: number, clinicId: number, usageInputs, actorUserId: number) =>
      recordImplantUsage(implantId, clinicId, usageInputs, actorUserId),
  );

  registerLocalHandler(
    "implants:cancel",
    (_event, implantId: number, clinicId: number, reason: string, actorUserId: number, confirmedReturns) =>
      cancelImplantCase(implantId, clinicId, reason, actorUserId, confirmedReturns),
  );

  registerLocalHandler(
    "implants:close",
    (_event, implantId: number, clinicId: number, actorUserId: number) =>
      closeImplantCase(implantId, clinicId, actorUserId),
  );

  registerLocalHandler(
    "implants:sign-usage",
    (_event, implantId: number, clinicId: number, doctorId: number, signature: string, actorUserId: number) =>
      signImplantUsage(implantId, clinicId, doctorId, signature, actorUserId),
  );

  registerLocalHandler(
    "implants:delete",
    (_event, implantId: number, clinicId: number) =>
      deleteImplant(implantId, clinicId),
  );
}

function registerCentralInventoryHandlers() {
  const inventory = createRemoteInventoryClient(centralApi);
  const remote = (callback: Parameters<typeof ipcMain.handle>[1]) => (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
    if (getDeploymentConfig().mode !== "remote") throw Error("請先連線中央伺服器再操作中央庫存");
    return callback(event, ...args);
  };
  ipcMain.handle("central-inventory:list", remote((_e, clinicId: number, afterId?: number) => inventory.list(clinicId, afterId)));
  ipcMain.handle("central-inventory:staged", remote((_e, clinicId: number, afterId?: number) => inventory.staged(clinicId, afterId)));
  ipcMain.handle("central-inventory:sources", remote((_e, id: number, clinicId: number) => inventory.sources(id, clinicId)));
  ipcMain.handle("central-inventory:opening", remote((_e, id: number, clinicId: number) => inventory.opening(id, clinicId)));
  ipcMain.handle("central-inventory:activate", remote((_e, id: number, clinicId: number, input: OpeningInput) => inventory.activate(id, clinicId, input)));
}

function registerInventoryHandlers() {
  registerLocalHandler("inventory:instruments-all", () => getInstrumentsAllClinics());
  registerLocalHandler("purchase-requests:list", (_event, clinicId: number) =>
    getPurchaseRequests(clinicId));
  registerLocalHandler("purchase-requests:create", (_event, clinicId: number, inventoryItemId: number, quantity: number, note: string, actorUserId: number) =>
    createPurchaseRequest(clinicId, inventoryItemId, quantity, note, actorUserId));
  registerLocalHandler("purchase-requests:complete", (_event, id: number, clinicId: number, actorUserId: number) =>
    completePurchaseRequest(id, clinicId, actorUserId));

  registerLocalHandler(
    "inventory:categories",
    (_event, clinicId: number) => getInventoryCategories(clinicId),
  );

  registerLocalHandler(
    "inventory:create-category",
    (_event, clinicId: number, name: string, actorUserId: number, requiresDoctorSignature?: boolean) =>
      createInventoryCategory(clinicId, name, actorUserId, requiresDoctorSignature),
  );
  registerLocalHandler("inventory:delete-category", (_event, clinicId: number, name: string, actorUserId: number) =>
    deleteInventoryCategory(clinicId, name, actorUserId));

  registerLocalHandler(
    "inventory:list",
    (
      _event,
      clinicId: number,
      actorUserId: number,
    ) => {
      return redactInventoryCosts(getInventoryItems(clinicId), actorUserId);
    },
  );

  registerLocalHandler(
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

  registerLocalHandler(
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
  registerLocalHandler(
    "inventory:update",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
      input,
      actorUserId: number,
    ) => {
      return updateInventoryItem(
        inventoryItemId,
        clinicId,
        input,
        actorUserId,
      );
    },
  );

  /*
   * Legacy compatibility。
   *
   * 新 UI 不應使用此 API。
   * 正式庫存增減請使用 receive / adjust。
   */
  registerLocalHandler(
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
  registerLocalHandler(
    "inventory:receive",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      unitCost: number,
      note: string,
      actorUserId: number,
    ) => {
      return receiveInventory(
        inventoryItemId,
        clinicId,
        quantity,
        unitCost,
        note,
        actorUserId,
      );
    },
  );

  /*
   * 手動庫存校正。
   *
   * quantity = 校正後的絕對庫存總量。
   */
  registerLocalHandler(
    "inventory:adjust",
    (
      _event,
      inventoryItemId: number,
      clinicId: number,
      quantity: number,
      note: string,
      actorUserId: number,
    ) => {
      return adjustInventoryQuantity(
        inventoryItemId,
        clinicId,
        quantity,
        note,
        actorUserId,
      );
    },
  );

  registerLocalHandler(
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

  registerLocalHandler(
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
  registerLocalHandler(
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

  registerLocalHandler(
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

  registerLocalHandler(
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

  registerLocalHandler(
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

  registerLocalHandler(
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

  registerLocalHandler(
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
  registerLocalHandler(
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
  registerLocalHandler(
    "consumables:list",
    (
      _event,
      clinicId: number,
      usageType?:
        ConsumableUsageType,
      actorUserId?: number,
    ) => {
      return redactCostFields(getConsumableUsageRecords(
        clinicId,
        usageType,
      ), actorUserId ?? 0);
    },
  );

  /*
   * 單筆紀錄。
   */
  registerLocalHandler(
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
  registerLocalHandler(
    "consumables:create",
    (
      _event,
      clinicId: number,
      input:
        ConsumableUsageInput,
      actorUserId: number,
    ) => {
      return createConsumableUsage(
        clinicId,
        input,
        actorUserId,
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
  registerLocalHandler(
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
  registerLocalHandler(
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
  registerLocalHandler(
    "consumables:by-doctor",
    (
      _event,
      doctorId: number,
      clinicId: number,
      usageType?:
        ConsumableUsageType,
      actorUserId?: number,
    ) => {
      return redactCostFields(getConsumableUsageByDoctor(
        doctorId,
        clinicId,
        usageType,
      ), actorUserId ?? 0);
    },
  );

  /*
   * 指定病患目前院所紀錄。
   */
  registerLocalHandler(
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
  if (getDeploymentConfig().mode === "remote") {
    registerRemoteClinicHandlers();
    return;
  }
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

function registerRemoteClinicHandlers() {
  ipcMain.handle("clinics:list", () => centralApi.get("/v1/clinics"));
  ipcMain.handle("clinics:active", () => centralApi.get("/v1/clinics/active"));
  ipcMain.handle("clinics:by-id", (_event, clinicId: number) => centralApi.get(`/v1/clinics/${clinicId}`));
  ipcMain.handle("clinics:with-stats", () => centralApi.get("/v1/clinics-with-stats"));
  ipcMain.handle("clinics:by-id-with-stats", (_event, clinicId: number) => centralApi.get(`/v1/clinics/${clinicId}/with-stats`));
  ipcMain.handle("clinics:by-user", (_event, userId: number) => centralApi.get(`/v1/users/${userId}/clinics`));
  ipcMain.handle("clinics:create", (_event, _adminUserId: number, input: ClinicInput) => centralApi.post("/v1/clinics", input));
  ipcMain.handle("clinics:update", (_event, clinicId: number, _adminUserId: number, input: ClinicUpdateInput) =>
    centralApi.put(`/v1/clinics/${clinicId}`, input));
  ipcMain.handle("clinics:set-active", (_event, clinicId: number, _adminUserId: number, isActive: boolean) =>
    centralApi.put(`/v1/clinics/${clinicId}/active`, { isActive }));
  ipcMain.handle("clinics:add-user", (_event, userId: number, clinicId: number) =>
    centralApi.post(`/v1/clinics/${clinicId}/users`, { userId }));
  ipcMain.handle("clinics:remove-user", (_event, userId: number, clinicId: number) =>
    centralApi.delete(`/v1/clinics/${clinicId}/users/${userId}`));
  ipcMain.handle("clinics:set-user-primary", (_event, userId: number, clinicId: number) =>
    centralApi.put(`/v1/clinics/${clinicId}/users/${userId}/primary`));
}

/* =========================================================
   Register All IPC
========================================================= */

function registerIpcHandlers() {
  ipcMain.handle(
    "system:deployment-config",
    () => getDeploymentConfig(),
  );

  ipcMain.handle(
    "system:server-health",
    () => checkServerConnection(),
  );

  registerLocalHandler("machines:list", () => listMachines());
  registerLocalHandler("machines:reservations", () => listMachineReservations());
  registerLocalHandler("machines:reservation-reminders", (_event,actorUserId:number) => listMachineReservationReminders(actorUserId));
  registerLocalHandler("machines:movers", (_event,actorUserId:number) => listMachineMovers(actorUserId));
  registerLocalHandler("machines:scans", (_event,actorUserId:number) => listMachineScans(actorUserId));
  registerLocalHandler("machines:create", (_event, input, actorUserId:number) => createMachine(input, actorUserId));
  registerLocalHandler("machines:set-active", (_event, id:number, active:boolean, actorUserId:number) => setMachineActive(id,active,actorUserId));
  registerLocalHandler("machines:update", (_event, id:number, input, actorUserId:number) => updateMachine(id,input,actorUserId));
  registerLocalHandler("machines:reserve", (_event, input, actorUserId:number) => createMachineReservation(input,actorUserId));
  registerLocalHandler("machines:update-reservation", (_event,id:number,input,actorUserId:number) => updateMachineReservation(id,input,actorUserId));
  registerLocalHandler("machines:cancel-reservation", (_event,id:number,reason:string,actorUserId:number) => cancelMachineReservation(id,reason,actorUserId));
  registerLocalHandler("machines:scan", (_event, token:string,reservationId:number,clinicId:number,action:"搬出"|"到院",actorUserId:number) => scanMachine(token,reservationId,clinicId,action,actorUserId));
  registerLocalHandler("machines:usage-credits", (_event,machineId:number,actorUserId:number) => getMachineUsageCredits(machineId,actorUserId));
  registerLocalHandler("machines:purchase-credits", (_event,machineId:number,quantity:number,actorUserId:number) => purchaseMachineUsageCredits(machineId,quantity,actorUserId));
  registerLocalHandler("machines:credit-purchases", (_event,machineId:number,actorUserId:number) => listMachineUsageCreditPurchases(machineId,actorUserId));
  registerLocalHandler("machines:update-usage-cost", (_event,machineId:number,unitCost:number,actorUserId:number) => updateMachineUsageCost(machineId,unitCost,actorUserId));
  registerLocalHandler("machines:usage-records", (_event,actorUserId:number) => listMachineUsageRecords(actorUserId));
  registerLocalHandler("machines:create-usage", (_event,input,actorUserId:number) => createMachineUsage(input,actorUserId));
  registerLocalHandler("machines:cancel-usage", (_event,id:number,reason:string,actorUserId:number) => cancelMachineUsage(id,reason,actorUserId));
  registerLocalHandler("machines:sign-usage", (_event,id:number,signature:string,actorUserId:number) => signMachineUsage(id,signature,actorUserId));
  registerLocalHandler("system:backup-database", async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const result = await dialog.showSaveDialog({
      title: "備份 DentFlow 資料庫",
      defaultPath: path.join(app.getPath("documents"), `dentflow-backup-${timestamp}.db`),
      filters: [{ name: "SQLite database", extensions: ["db"] }],
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    await getDatabase().backup(result.filePath);
    return { cancelled: false, filePath: result.filePath };
  });

  registerAuthHandlers();

  registerClinicHandlers();
  registerPatientHandlers();

  registerDoctorHandlers();

  registerImplantHandlers();
  registerCentralImplantHandlers();
  registerInventoryHandlers();
  registerCentralInventoryHandlers();

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
    ensureMachineSchema();

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
