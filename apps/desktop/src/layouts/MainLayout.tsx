import {
  Outlet,
} from "react-router-dom";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Header from "../components/Header";
import Sidebar from "../components/Sidebar";

import type {
  DentflowClinicScope,
} from "../components/Header";

/* =========================================================
   Constants
========================================================= */

const CLINIC_SCOPE_STORAGE_KEY =
  "dentflow-clinic-scope";

/* =========================================================
   Props
========================================================= */

type MainLayoutProps = {
  session:
    DentflowAuthSession;

  onLogout:
    () => void;

  /*
   * 保留目前 App.tsx 介面。
   *
   * Header 傳入的是 DentflowClinicRecord，
   * MainLayout 會轉成 clinic.id 再送給 App。
   */
  onSwitchClinic:
    (
      clinicId: number,
    ) =>
      void |
      Promise<void>;
};

/* =========================================================
   Outlet Context
========================================================= */

export type DentflowMainLayoutContext = {
  session:
    DentflowAuthSession;

  clinicScope:
    DentflowClinicScope;

  isAllClinics:
    boolean;

  currentClinicId:
    number | null;

  setClinicScope:
    (
      scope:
        DentflowClinicScope,
    ) =>
      void;
};

/* =========================================================
   Helpers
========================================================= */

function getStoredClinicScope(
  session:
    DentflowAuthSession,
):
  DentflowClinicScope {
  try {
    const raw =
      sessionStorage.getItem(
        CLINIC_SCOPE_STORAGE_KEY,
      );

    if (!raw) {
      return {
        mode:
          "clinic",

        clinicId:
          session.clinicId,
      };
    }

    const parsed =
      JSON.parse(
        raw,
      ) as
        DentflowClinicScope;

    /*
     * 只有 Doctor 可以使用「我的全部院所」。
     */
    if (
      parsed.mode ===
        "all-clinics" &&
      session.role ===
        "Doctor"
    ) {
      return {
        mode:
          "all-clinics",
      };
    }

    if (
      parsed.mode ===
        "clinic" &&
      Number.isInteger(
        parsed.clinicId,
      ) &&
      parsed.clinicId >
        0
    ) {
      return {
        mode:
          "clinic",

        clinicId:
          parsed.clinicId,
      };
    }
  } catch {
    // fallback below
  }

  return {
    mode:
      "clinic",

    clinicId:
      session.clinicId,
  };
}

function saveClinicScope(
  scope:
    DentflowClinicScope,
) {
  sessionStorage.setItem(
    CLINIC_SCOPE_STORAGE_KEY,
    JSON.stringify(
      scope,
    ),
  );
}

/* =========================================================
   Main Layout
========================================================= */

export default function MainLayout({
  session,
  onLogout,
  onSwitchClinic,
}: MainLayoutProps) {
  const [
    clinicScope,
    setClinicScopeState,
  ] =
    useState<DentflowClinicScope>(
      () =>
        getStoredClinicScope(
          session,
        ),
    );

  /* =======================================================
     Sync When Session Changes
  ======================================================= */

  useEffect(
    () => {
      /*
       * 如果登入者不是 Doctor，
       * 不允許殘留 all-clinics scope。
       */
      if (
        session.role !==
          "Doctor"
      ) {
        const nextScope:
          DentflowClinicScope = {
          mode:
            "clinic",

          clinicId:
            session.clinicId,
        };

        setClinicScopeState(
          nextScope,
        );

        saveClinicScope(
          nextScope,
        );

        return;
      }

      /*
       * Doctor 若目前就是單院所模式，
       * session clinic 改變時同步 scope。
       */
      setClinicScopeState(
        (current) => {
          if (
            current.mode ===
            "all-clinics"
          ) {
            return current;
          }

          const nextScope:
            DentflowClinicScope = {
            mode:
              "clinic",

            clinicId:
              session.clinicId,
          };

          saveClinicScope(
            nextScope,
          );

          return nextScope;
        },
      );
    },
    [
      session.userId,
      session.role,
      session.clinicId,
    ],
  );

  /* =======================================================
     Browser / Custom Scope Event
  ======================================================= */

  useEffect(
    () => {
      function handleScopeChange(
        event:
          Event,
      ) {
        const customEvent =
          event as
            CustomEvent<DentflowClinicScope>;

        const nextScope =
          customEvent.detail;

        if (
          !nextScope
        ) {
          return;
        }

        if (
          nextScope.mode ===
            "all-clinics" &&
          session.role !==
            "Doctor"
        ) {
          return;
        }

        if (
          nextScope.mode ===
            "clinic" &&
          (
            !Number.isInteger(
              nextScope.clinicId,
            ) ||
            nextScope.clinicId <=
              0
          )
        ) {
          return;
        }

        setClinicScopeState(
          nextScope,
        );

        saveClinicScope(
          nextScope,
        );
      }

      window.addEventListener(
        "dentflow-clinic-scope-change",
        handleScopeChange,
      );

      return () => {
        window.removeEventListener(
          "dentflow-clinic-scope-change",
          handleScopeChange,
        );
      };
    },
    [
      session.role,
    ],
  );

  /* =======================================================
     Scope Change
  ======================================================= */

  function handleScopeChange(
    scope:
      DentflowClinicScope,
  ) {
    /*
     * 非 Doctor 不允許切到全部院所。
     */
    if (
      scope.mode ===
        "all-clinics" &&
      session.role !==
        "Doctor"
    ) {
      return;
    }

    setClinicScopeState(
      scope,
    );

    saveClinicScope(
      scope,
    );
  }

  /* =======================================================
     Clinic Switch
  ======================================================= */

  async function handleSwitchClinic(
    clinic:
      DentflowClinicRecord,
  ) {
    const nextScope:
      DentflowClinicScope = {
      mode:
        "clinic",

      clinicId:
        clinic.id,
    };

    /*
     * 先更新 MainLayout scope。
     */
    setClinicScopeState(
      nextScope,
    );

    saveClinicScope(
      nextScope,
    );

    /*
     * 再交給目前 App.tsx 更新真正 session。
     *
     * App 現在仍然只需要 clinicId，
     * 所以這裡做轉接。
     */
    await onSwitchClinic(
      clinic.id,
    );
  }

  /* =======================================================
     Logout
  ======================================================= */

  function handleLogout() {
    sessionStorage.removeItem(
      CLINIC_SCOPE_STORAGE_KEY,
    );

    onLogout();
  }

  /* =======================================================
     Outlet Context
  ======================================================= */

  const outletContext =
    useMemo<
      DentflowMainLayoutContext
    >(
      () => ({
        session,

        clinicScope,

        isAllClinics:
          clinicScope.mode ===
          "all-clinics",

        currentClinicId:
          clinicScope.mode ===
          "clinic"
            ? clinicScope.clinicId
            : null,

        setClinicScope:
          handleScopeChange,
      }),
      [
        session,
        clinicScope,
      ],
    );

  /* =======================================================
     UI
  ======================================================= */

<<<<<<< Updated upstream
type MainLayoutProps = {
  session: DentflowAuthSession;
  onLogout: () => Promise<void>;
};

export default function MainLayout({ session, onLogout }: MainLayoutProps) {
  return (
    <div className="layout">
      <Sidebar session={session} onLogout={onLogout} />

      <main className="content">
        <Header session={session} />
        <Outlet />
=======
  return (
    <div className="layout">
      <Sidebar
        session={
          session
        }
      />

      <main className="content">
        <Header
          session={
            session
          }

          onLogout={
            handleLogout
          }

          onSwitchClinic={
            handleSwitchClinic
          }

          onScopeChange={
            handleScopeChange
          }
        />

        <Outlet
          context={
            outletContext
          }
        />
>>>>>>> Stashed changes
      </main>
    </div>
  );
}
