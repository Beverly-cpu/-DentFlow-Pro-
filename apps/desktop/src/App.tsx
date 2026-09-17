import {
  useEffect,
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import MainLayout from "./layouts/MainLayout";

import {
  canAccessModule,
} from "./utils/permissions";

import type {
  DentflowModule,
} from "./utils/permissions";

import Login from "./pages/Login";
import PurchaseLogin from "./pages/PurchaseLogin";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Doctors from "./pages/Doctors";
import Implants from "./pages/Implants";
import Consumables from "./pages/Consumables";
import Inventory from "./pages/Inventory";
import Purchase from "./pages/Purchase";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

/* =========================================================
   Constants
========================================================= */

const SESSION_STORAGE_KEY =
  "dentflow-auth-session";

const CLINIC_SCOPE_STORAGE_KEY =
  "dentflow-clinic-scope";

/* =========================================================
   Session Helpers
========================================================= */

function getStoredSession():
  | DentflowAuthSession
  | null {
  try {
    const raw =
      sessionStorage.getItem(
        SESSION_STORAGE_KEY,
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(
        raw,
      ) as DentflowAuthSession;

    if (
      typeof parsed.userId !==
        "number" ||
      parsed.userId <=
        0 ||
      typeof parsed.clinicId !==
        "number" ||
      parsed.clinicId <=
        0 ||
      !parsed.role
    ) {
      sessionStorage.removeItem(
        SESSION_STORAGE_KEY,
      );

      sessionStorage.removeItem(
        CLINIC_SCOPE_STORAGE_KEY,
      );

      return null;
    }

    return parsed;
  } catch {
    sessionStorage.removeItem(
      SESSION_STORAGE_KEY,
    );

    sessionStorage.removeItem(
      CLINIC_SCOPE_STORAGE_KEY,
    );

    return null;
  }
}

function saveSession(
  session:
    DentflowAuthSession,
) {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify(
      session,
    ),
  );
}

function clearSession() {
  sessionStorage.removeItem(
    SESSION_STORAGE_KEY,
  );

  sessionStorage.removeItem(
    CLINIC_SCOPE_STORAGE_KEY,
  );
}

/* =========================================================
   Clinic Scope Helpers
========================================================= */

function resetClinicScope(
  session:
    DentflowAuthSession,
) {
  const scope = {
    mode:
      "clinic",

    clinicId:
      session.clinicId,
  };

  sessionStorage.setItem(
    CLINIC_SCOPE_STORAGE_KEY,
    JSON.stringify(
      scope,
    ),
  );
}

/* =========================================================
   Module Access
========================================================= */

type ModuleAccessProps = {
  session:
    DentflowAuthSession;

  module:
    DentflowModule;

  children:
    ReactNode;
};

function ModuleAccess({
  session,
  module,
  children,
}: ModuleAccessProps) {
  if (
    !canAccessModule(
      session.role,
      module,
    )
  ) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return (
    <>
      {children}
    </>
  );
}

/* =========================================================
   App
========================================================= */

export default function App() {
  const [
    session,
    setSession,
  ] =
    useState<
      DentflowAuthSession | null
    >(
      () =>
        getStoredSession(),
    );

  const [
    sessionChecking,
    setSessionChecking,
  ] =
    useState(
      true,
    );

  /* =======================================================
     Validate Stored Session
  ======================================================= */

  useEffect(
    () => {
      const storedSession =
        getStoredSession();

      if (
        !storedSession
      ) {
        queueMicrotask(() => {
          setSession(null);
          setSessionChecking(false);
        });

        return;
      }

      const currentSession:
        DentflowAuthSession =
        storedSession;

      let cancelled =
        false;

      async function validateSession() {
        try {
          /*
           * 驗證目前登入者仍然有權存取
           * session 中記錄的院所。
           */
          const clinic =
            await window.dentflow.auth.validateClinicAccess(
              currentSession.userId,
              currentSession.clinicId,
            );

          if (
            cancelled
          ) {
            return;
          }

          const validatedSession:
            DentflowAuthSession = {
            ...currentSession,

            clinicId:
              clinic.id,

            clinicCode:
              clinic.code,

            clinicName:
              clinic.name,
          };

          saveSession(
            validatedSession,
          );

          /*
           * 不在這裡重設 clinic scope。
           *
           * 原因：
           * Doctor 重新整理頁面時，
           * 如果原本正在「我的全部院所」，
           * MainLayout 應該保留該 scope。
           *
           * MainLayout 會自行判斷：
           * 非 Doctor 不允許 all-clinics。
           */
          setSession(
            validatedSession,
          );
        } catch (
          error
        ) {
          console.error(
            "Session 驗證失敗：",
            error,
          );

          if (
            cancelled
          ) {
            return;
          }

          clearSession();

          setSession(
            null,
          );
        } finally {
          if (
            !cancelled
          ) {
            setSessionChecking(
              false,
            );
          }
        }
      }

      void validateSession();

      return () => {
        cancelled =
          true;
      };
    },
    [],
  );

  /* =======================================================
     Login
  ======================================================= */

  function handleLogin(
    nextSession:
      DentflowAuthSession,
  ) {
    /*
     * 新帳號登入時一定重新從
     * 該帳號目前院所開始。
     *
     * 避免上一個登入者留下：
     * "all-clinics"
     */
    clearSession();

    saveSession(
      nextSession,
    );

    resetClinicScope(
      nextSession,
    );

    setSession(
      nextSession,
    );
  }

  /* =======================================================
     Logout
  ======================================================= */

  function handleLogout() {
    clearSession();

    setSession(
      null,
    );
  }

  /* =======================================================
     Clinic Switch
  ======================================================= */

  async function handleSwitchClinic(
    clinicId: number,
  ) {
    if (
      !session
    ) {
      return;
    }

    if (
      !Number.isInteger(
        clinicId,
      ) ||
      clinicId <=
        0
    ) {
      console.error(
        "切換院所失敗：無效的 clinicId",
        clinicId,
      );

      return;
    }

    /*
     * 即使 clinicId 與目前相同，
     * MainLayout 仍可能剛從
     * all-clinics 切回單一院所。
     *
     * 因此這裡不直接 return。
     */

    try {
      /*
       * Main process 再次驗證登入者
       * 是否真的有此院所存取權。
       */
      const clinic =
        await window.dentflow.auth.validateClinicAccess(
          session.userId,
          clinicId,
        );

      const nextSession:
        DentflowAuthSession = {
        ...session,

        clinicId:
          clinic.id,

        clinicCode:
          clinic.code,

        clinicName:
          clinic.name,
      };

      saveSession(
        nextSession,
      );

      /*
       * 明確同步回單院所 scope。
       */
      resetClinicScope(
        nextSession,
      );

      setSession(
        nextSession,
      );
    } catch (
      error
    ) {
      console.error(
        "切換院所失敗：",
        error,
      );

      throw error;
    }
  }

  /* =======================================================
     Loading
  ======================================================= */

  if (
    sessionChecking
  ) {
    return (
      <div
        style={{
          minHeight:
            "100vh",

          display:
            "flex",

          alignItems:
            "center",

          justifyContent:
            "center",

          background:
            "#f3f6f0",

          color:
            "#567066",

          fontSize:
            "14px",

          fontWeight:
            700,
        }}
      >
        捷晞美學牙醫｜C&C DENTAL 載入中...
      </div>
    );
  }

  /* =======================================================
     Login Routes
  ======================================================= */

  if (
    !session
  ) {
    return (
      <Routes>
        <Route
          path="purchase-login"
          element={<PurchaseLogin onLogin={handleLogin} />}
        />
        <Route
          path="*"
          element={
            <Login
              onLogin={
                handleLogin
              }
            />
          }
        />
      </Routes>
    );
  }

  /* =======================================================
     Main Routes
  ======================================================= */

  return (
    <Routes>
      <Route
        element={
          <MainLayout
            session={
              session
            }

            onLogout={
              handleLogout
            }

            onSwitchClinic={
              handleSwitchClinic
            }
          />
        }
      >
        <Route
          index
          element={
            <ModuleAccess
              session={
                session
              }
              module="dashboard"
            >
              <Dashboard />
            </ModuleAccess>
          }
        />

        <Route
          path="patients"
          element={
            <ModuleAccess
              session={
                session
              }
              module="patients"
            >
              <Patients />
            </ModuleAccess>
          }
        />

        <Route
          path="doctors"
          element={
            <ModuleAccess
              session={
                session
              }
              module="doctors"
            >
              <Doctors />
            </ModuleAccess>
          }
        />

        <Route
          path="implants"
          element={
            <ModuleAccess
              session={
                session
              }
              module="implants"
            >
              <Implants />
            </ModuleAccess>
          }
        />

        <Route
          path="consumables"
          element={
            <ModuleAccess
              session={
                session
              }
              module="consumables"
            >
              <Consumables />
            </ModuleAccess>
          }
        />

        <Route
          path="inventory"
          element={
            <ModuleAccess
              session={
                session
              }
              module="inventory"
            >
              <Inventory scope="general" />
            </ModuleAccess>
          }
        />

        <Route
          path="medical-inventory"
          element={
            <ModuleAccess session={session} module="inventory">
              <Inventory scope="medical" />
            </ModuleAccess>
          }
        />

        <Route
          path="implant-inventory"
          element={
            <ModuleAccess session={session} module="inventory">
              <Inventory scope="implant" />
            </ModuleAccess>
          }
        />

        <Route
          path="other-consumables"
          element={
            <ModuleAccess
              session={session}
              module="inventory"
            >
              <Inventory scope="general" />
            </ModuleAccess>
          }
        />

        <Route
          path="purchase"
          element={
            <ModuleAccess
              session={
                session
              }
              module="purchase"
            >
              <Purchase />
            </ModuleAccess>
          }
        />

        <Route
          path="general-consumable-usage"
          element={
            <ModuleAccess session={session} module="purchase">
              <Purchase generalUsage />
            </ModuleAccess>
          }
        />

        <Route
          path="reports"
          element={
            <ModuleAccess
              session={
                session
              }
              module="reports"
            >
              <Reports />
            </ModuleAccess>
          }
        />

        <Route
          path="settings"
          element={
            <ModuleAccess
              session={
                session
              }
              module="settings"
            >
              <Settings />
            </ModuleAccess>
          }
        />

        <Route
          path="*"
          element={
            <Navigate
              to="/"
              replace
            />
          }
        />
      </Route>
    </Routes>
  );
}
