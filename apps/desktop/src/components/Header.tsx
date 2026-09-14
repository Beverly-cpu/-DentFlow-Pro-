import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import "../styles/header.css";

<<<<<<< Updated upstream
export default function Header({ session }: { session: DentflowAuthSession }) {
=======
/* =========================================================
   Types
========================================================= */

export type DentflowClinicScope =
  | {
      mode: "clinic";
      clinicId: number;
    }
  | {
      mode: "all-clinics";
    };

type HeaderProps = {
  session:
    DentflowAuthSession | null;

  onLogout?:
    () => void;

  onSwitchClinic?:
    (
      clinic:
        DentflowClinicRecord,
    ) =>
      void |
      Promise<void>;

  onScopeChange?:
    (
      scope:
        DentflowClinicScope,
    ) =>
      void;
};

type HeaderClinicOption = {
  id: number;

  code: string;

  name: string;

  isActive: number;

  isPrimary: number;
};

/* =========================================================
   Constants
========================================================= */

const SESSION_STORAGE_KEY =
  "dentflow-auth-session";

const CLINIC_SCOPE_STORAGE_KEY =
  "dentflow-clinic-scope";

/* =========================================================
   Helpers
========================================================= */

function getErrorMessage(
  error: unknown,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

function getRoleLabel(
  session:
    DentflowAuthSession,
) {
  if (
    session.roleLabel
  ) {
    return session.roleLabel;
  }

  switch (
    session.role
  ) {
    case "Doctor":
      return "醫師";

    case "Assistant":
      return "助理";

    case "Admin":
      return "管理者";

    case "Accountant":
      return "會計";

    default:
      return session.role;
  }
}

function getAvatarLetter(
  name: string,
) {
  const trimmed =
    name.trim();

  if (!trimmed) {
    return "C";
  }

  return trimmed
    .charAt(0)
    .toUpperCase();
}

function getStoredScope():
  DentflowClinicScope | null {
  try {
    const raw =
      sessionStorage.getItem(
        CLINIC_SCOPE_STORAGE_KEY,
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw) as
        DentflowClinicScope;

    if (
      parsed.mode ===
      "all-clinics"
    ) {
      return parsed;
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
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

function saveScope(
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

function updateStoredSessionClinic(
  clinic:
    DentflowClinicRecord,
) {
  try {
    const raw =
      sessionStorage.getItem(
        SESSION_STORAGE_KEY,
      );

    if (!raw) {
      return;
    }

    const current =
      JSON.parse(
        raw,
      ) as
        DentflowAuthSession;

    const updated:
      DentflowAuthSession = {
      ...current,

      clinicId:
        clinic.id,

      clinicCode:
        clinic.code,

      clinicName:
        clinic.name,
    };

    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(
        updated,
      ),
    );
  } catch {
    // 不讓 sessionStorage 錯誤影響 Header。
  }
}

/* =========================================================
   Component
========================================================= */

export default function Header({
  session,
  onLogout,
  onSwitchClinic,
  onScopeChange,
}: HeaderProps) {
  const [
    clinics,
    setClinics,
  ] =
    useState<
      HeaderClinicOption[]
    >([]);

  const [
    scope,
    setScope,
  ] =
    useState<
      DentflowClinicScope | null
    >(null);

  const [
    clinicMenuOpen,
    setClinicMenuOpen,
  ] =
    useState(false);

  const [
    userMenuOpen,
    setUserMenuOpen,
  ] =
    useState(false);

  const [
    loadingClinics,
    setLoadingClinics,
  ] =
    useState(false);

  const [
    switching,
    setSwitching,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const clinicMenuRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const userMenuRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  /* =======================================================
     Initial Scope
  ======================================================= */

  useEffect(() => {
    if (!session) {
      setScope(
        null,
      );

      return;
    }

    const stored =
      getStoredScope();

    /*
     * 只有 Doctor 才允許 all-clinics。
     */
    if (
      session.role ===
        "Doctor" &&
      stored?.mode ===
        "all-clinics"
    ) {
      setScope(
        stored,
      );

      return;
    }

    const clinicScope:
      DentflowClinicScope = {
      mode:
        "clinic",

      clinicId:
        session.clinicId,
    };

    setScope(
      clinicScope,
    );

    saveScope(
      clinicScope,
    );
  }, [
    session,
  ]);

  /* =======================================================
     Load Authorized Clinics
  ======================================================= */

  useEffect(() => {
    if (!session) {
      setClinics(
        [],
      );

      return;
    }

    void loadClinics(
      session,
    );
  }, [
    session,
  ]);

  async function loadClinics(
    activeSession:
      DentflowAuthSession,
  ) {
    try {
      setLoadingClinics(
        true,
      );

      setError(
        "",
      );

      const map =
        new Map<
          number,
          HeaderClinicOption
        >();

      /*
       * 先由 users / userClinics 取得此登入者
       * 真正被授權的院所。
       */
      const user =
        await window.dentflow.auth.user(
          activeSession.userId,
        );

      if (
        user?.clinics &&
        Array.isArray(
          user.clinics,
        )
      ) {
        for (
          const membership
          of user.clinics
        ) {
          if (
            membership.clinicIsActive !==
            1
          ) {
            continue;
          }

          map.set(
            membership.clinicId,
            {
              id:
                membership.clinicId,

              code:
                membership.clinicCode,

              name:
                membership.clinicName,

              isActive:
                membership.clinicIsActive,

              isPrimary:
                membership.isPrimary,
            },
          );
        }
      }

      /*
       * Doctor 再由 doctorClinics 補一次。
       *
       * 這樣即使 legacy userClinics 尚未完全同步，
       * Header 仍能看到醫師實際執業院所。
       */
      if (
        activeSession.role ===
        "Doctor"
      ) {
        const doctor =
          await window.dentflow.doctors.byUserId(
            activeSession.userId,
            activeSession.clinicId,
          );

        if (doctor) {
          const doctorClinics =
            await window.dentflow.doctors.clinics(
              doctor.id,
            );

          for (
            const membership
            of doctorClinics
          ) {
            if (
              membership.clinicIsActive !==
              1
            ) {
              continue;
            }

            map.set(
              membership.clinicId,
              {
                id:
                  membership.clinicId,

                code:
                  membership.clinicCode,

                name:
                  membership.clinicName,

                isActive:
                  membership.clinicIsActive,

                isPrimary:
                  membership.isPrimary,
              },
            );
          }
        }
      }

      /*
       * 保底：
       * 現在登入中的院所一定要能顯示。
       */
      if (
        !map.has(
          activeSession.clinicId,
        )
      ) {
        map.set(
          activeSession.clinicId,
          {
            id:
              activeSession.clinicId,

            code:
              activeSession.clinicCode,

            name:
              activeSession.clinicName,

            isActive:
              1,

            isPrimary:
              1,
          },
        );
      }

      const result =
        Array.from(
          map.values(),
        ).sort(
          (
            a,
            b,
          ) => {
            if (
              a.isPrimary !==
              b.isPrimary
            ) {
              return (
                b.isPrimary -
                a.isPrimary
              );
            }

            return a.name.localeCompare(
              b.name,
              "zh-TW",
            );
          },
        );

      setClinics(
        result,
      );
    } catch (
      loadError
    ) {
      setClinics([
        {
          id:
            activeSession.clinicId,

          code:
            activeSession.clinicCode,

          name:
            activeSession.clinicName,

          isActive:
            1,

          isPrimary:
            1,
        },
      ]);

      setError(
        getErrorMessage(
          loadError,
        ),
      );
    } finally {
      setLoadingClinics(
        false,
      );
    }
  }

  /* =======================================================
     Outside Click
  ======================================================= */

  useEffect(() => {
    function handleMouseDown(
      event:
        MouseEvent,
    ) {
      const target =
        event.target as Node;

      if (
        clinicMenuRef.current &&
        !clinicMenuRef.current.contains(
          target,
        )
      ) {
        setClinicMenuOpen(
          false,
        );
      }

      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(
          target,
        )
      ) {
        setUserMenuOpen(
          false,
        );
      }
    }

    document.addEventListener(
      "mousedown",
      handleMouseDown,
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleMouseDown,
      );
    };
  }, []);

  /* =======================================================
     Derived
  ======================================================= */

  const selectedClinic =
    useMemo(
      () => {
        if (
          !session ||
          scope?.mode ===
            "all-clinics"
        ) {
          return null;
        }

        return (
          clinics.find(
            (clinic) =>
              clinic.id ===
              scope?.clinicId,
          ) ??
          clinics.find(
            (clinic) =>
              clinic.id ===
              session.clinicId,
          ) ??
          null
        );
      },
      [
        session,
        scope,
        clinics,
      ],
    );

  const scopeLabel =
    scope?.mode ===
    "all-clinics"
      ? "我的全部院所"
      : selectedClinic?.name ??
        session?.clinicName ??
        "目前院所";

  const canUseAllClinics =
    session?.role ===
      "Doctor" &&
    clinics.length >
      1;

  /* =======================================================
     Select Clinic
  ======================================================= */

  async function selectClinic(
    clinic:
      HeaderClinicOption,
  ) {
    if (
      !session ||
      switching
    ) {
      return;
    }

    if (
      clinic.id ===
        session.clinicId &&
      scope?.mode ===
        "clinic"
    ) {
      setClinicMenuOpen(
        false,
      );

      return;
    }

    try {
      setSwitching(
        true,
      );

      setError(
        "",
      );

      const validatedClinic =
        await window.dentflow.auth.validateClinicAccess(
          session.userId,
          clinic.id,
        );

      const nextScope:
        DentflowClinicScope = {
        mode:
          "clinic",

        clinicId:
          validatedClinic.id,
      };

      saveScope(
        nextScope,
      );

      setScope(
        nextScope,
      );

      setClinicMenuOpen(
        false,
      );

      updateStoredSessionClinic(
        validatedClinic,
      );

      onScopeChange?.(
        nextScope,
      );

      if (
        onSwitchClinic
      ) {
        await onSwitchClinic(
          validatedClinic,
        );
      } else {
        /*
         * 向下相容：
         * 如果目前 MainLayout 尚未傳 callback，
         * 仍能完成院所切換。
         */
        window.location.reload();
      }
    } catch (
      switchError
    ) {
      setError(
        getErrorMessage(
          switchError,
        ),
      );
    } finally {
      setSwitching(
        false,
      );
    }
  }

  /* =======================================================
     All Clinics Scope
  ======================================================= */

  function selectAllClinics() {
    if (
      !session ||
      session.role !==
        "Doctor" ||
      !canUseAllClinics
    ) {
      return;
    }

    const nextScope:
      DentflowClinicScope = {
      mode:
        "all-clinics",
    };

    saveScope(
      nextScope,
    );

    setScope(
      nextScope,
    );

    setClinicMenuOpen(
      false,
    );

    onScopeChange?.(
      nextScope,
    );

    /*
     * 通知後續頁面。
     *
     * 下一步 MainLayout / App 會正式接管。
     */
    window.dispatchEvent(
      new CustomEvent(
        "dentflow-clinic-scope-change",
        {
          detail:
            nextScope,
        },
      ),
    );
  }

  /* =======================================================
     Logout
  ======================================================= */

  function handleLogout() {
    sessionStorage.removeItem(
      CLINIC_SCOPE_STORAGE_KEY,
    );

    setUserMenuOpen(
      false,
    );

    onLogout?.();
  }

  /* =======================================================
     Empty
  ======================================================= */

  if (!session) {
    return (
      <header className="app-header">
        <div className="header-clinic">
          <span className="header-clinic-label">
            C&amp;C DENTAL
          </span>

          <strong className="header-clinic-name">
            捷晞美學牙醫
          </strong>
        </div>
      </header>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

>>>>>>> Stashed changes
  return (
    <header className="app-header">
      {/* ===================================================
          Clinic Scope
      =================================================== */}

      <div
        className="header-clinic-area"
        ref={
          clinicMenuRef
        }
      >
        <button
          type="button"
          className={
            scope?.mode ===
            "all-clinics"
              ? "header-clinic-button all-clinics"
              : "header-clinic-button"
          }
          disabled={
            switching ||
            loadingClinics
          }
          onClick={() => {
            setClinicMenuOpen(
              (current) =>
                !current,
            );

            setUserMenuOpen(
              false,
            );
          }}
        >
          <div className="header-clinic">
            <span className="header-clinic-label">
              {scope?.mode ===
              "all-clinics"
                ? "目前範圍"
                : "目前院所"}
            </span>

            <strong className="header-clinic-name">
              {scopeLabel}
            </strong>
          </div>

          <span className="header-clinic-chevron">
            {clinicMenuOpen
              ? "⌃"
              : "⌄"}
          </span>
        </button>

        {clinicMenuOpen && (
          <div className="header-clinic-menu">
            <div className="header-menu-title">
              選擇瀏覽院所
            </div>

            {loadingClinics ? (
              <div className="header-menu-empty">
                院所讀取中...
              </div>
            ) : (
              <>
                {clinics.map(
                  (clinic) => {
                    const active =
                      scope?.mode ===
                        "clinic" &&
                      scope.clinicId ===
                        clinic.id;

                    return (
                      <button
                        key={
                          clinic.id
                        }
                        type="button"
                        className={
                          active
                            ? "header-clinic-option active"
                            : "header-clinic-option"
                        }
                        disabled={
                          switching
                        }
                        onClick={() =>
                          void selectClinic(
                            clinic,
                          )
                        }
                      >
                        <div className="header-clinic-option-main">
                          <strong>
                            {
                              clinic.name
                            }
                          </strong>

                          <span>
                            {
                              clinic.code
                            }
                          </span>
                        </div>

                        <div className="header-clinic-option-side">
                          {clinic.isPrimary ===
                            1 && (
                            <span className="header-primary-badge">
                              主要
                            </span>
                          )}

                          {active && (
                            <span className="header-check">
                              ✓
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  },
                )}

                {canUseAllClinics && (
                  <>
                    <div className="header-menu-divider" />

                    <button
                      type="button"
                      className={
                        scope?.mode ===
                        "all-clinics"
                          ? "header-clinic-option header-all-clinics active"
                          : "header-clinic-option header-all-clinics"
                      }
                      onClick={
                        selectAllClinics
                      }
                    >
                      <div className="header-clinic-option-main">
                        <strong>
                          我的全部院所
                        </strong>

                        <span>
                          整合瀏覽您執業的所有院所
                        </span>
                      </div>

                      {scope?.mode ===
                        "all-clinics" && (
                        <span className="header-check">
                          ✓
                        </span>
                      )}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

<<<<<<< Updated upstream
      <div className="header-user">
        <div className="header-avatar">{session.userName.slice(0, 1).toUpperCase()}</div>

        <div>
          <strong>{session.userName}</strong>
          <span>{session.role}</span>
=======
      {/* ===================================================
          Right
      =================================================== */}

      <div className="header-right">
        {error && (
          <div
            className="header-error"
            title={
              error
            }
          >
            !
          </div>
        )}

        {/* =================================================
            User
        ================================================= */}

        <div
          className="header-user-area"
          ref={
            userMenuRef
          }
        >
          <button
            type="button"
            className="header-user-button"
            onClick={() => {
              setUserMenuOpen(
                (current) =>
                  !current,
              );

              setClinicMenuOpen(
                false,
              );
            }}
          >
            <div className="header-avatar">
              {getAvatarLetter(
                session.name,
              )}
            </div>

            <div className="header-user-info">
              <strong className="header-user-name">
                {session.name}
              </strong>

              <span className="header-user-role">
                {getRoleLabel(
                  session,
                )}
              </span>
            </div>

            <span className="header-user-chevron">
              {userMenuOpen
                ? "⌃"
                : "⌄"}
            </span>
          </button>

          {userMenuOpen && (
            <div className="header-user-menu">
              <div className="header-user-menu-profile">
                <div className="header-avatar large">
                  {getAvatarLetter(
                    session.name,
                  )}
                </div>

                <div>
                  <strong>
                    {
                      session.name
                    }
                  </strong>

                  <div>
                    {getRoleLabel(
                      session,
                    )}
                  </div>
                </div>
              </div>

              <div className="header-menu-divider" />

              <div className="header-user-menu-row">
                <span>
                  目前範圍
                </span>

                <strong>
                  {scopeLabel}
                </strong>
              </div>

              <div className="header-user-menu-row">
                <span>
                  帳號
                </span>

                <strong>
                  {
                    session.account
                  }
                </strong>
              </div>

              {onLogout && (
                <>
                  <div className="header-menu-divider" />

                  <button
                    type="button"
                    className="header-logout-button"
                    onClick={
                      handleLogout
                    }
                  >
                    登出
                  </button>
                </>
              )}
            </div>
          )}
>>>>>>> Stashed changes
        </div>
      </div>
    </header>
  );
}
