/* eslint-disable react-hooks/immutability */
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import { useNavigate } from "react-router-dom";

import "../styles/Login.css";

import birdMascot from "../assets/jiexi-bird.png";

/* =========================================================
   Constants
========================================================= */

const SESSION_STORAGE_KEY =
  "dentflow-auth-session";

const PASSWORD_MIN_LENGTH =
  8;

/* =========================================================
   Props
========================================================= */

type LoginProps = {
  onLogin?: (
    session:
      DentflowAuthSession,
  ) => void;
};

/* =========================================================
   View
========================================================= */

type LoginView =
  | "login"
  | "initial-admin"
  | "recovery-account"
  | "recovery-password"
  | "recovery-complete";

/* =========================================================
   Helpers
========================================================= */

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  if (
    typeof error ===
    "string"
  ) {
    return error;
  }

  return fallback;
}

function normalizeAccount(
  value: string,
) {
  return value
    .trim()
    .toLowerCase();
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

/* =========================================================
   Component
========================================================= */

export default function Login({
  onLogin,
}: LoginProps) {
  const navigate = useNavigate();
  const [
    view,
    setView,
  ] =
    useState<LoginView>(
      "login",
    );

  const [
    isChecking,
    setIsChecking,
  ] =
    useState(true);

  const [
    isSubmitting,
    setIsSubmitting,
  ] =
    useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  /* =======================================================
     Login
  ======================================================= */

  const [
    account,
    setAccount,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    clinics,
    setClinics,
  ] =
    useState<
      DentflowClinicRecord[]
    >([]);

  const [
    selectedClinicId,
    setSelectedClinicId,
  ] =
    useState("");

  const [
    isLoadingClinics,
    setIsLoadingClinics,
  ] =
    useState(false);

  /* =======================================================
     Initial Admin
  ======================================================= */

  const [
    initialClinics,
    setInitialClinics,
  ] =
    useState<
      DentflowClinicRecord[]
    >([]);

  const [
    initialName,
    setInitialName,
  ] =
    useState("");

  const [
    initialAccount,
    setInitialAccount,
  ] =
    useState("");

  const [
    initialPassword,
    setInitialPassword,
  ] =
    useState("");

  const [
    initialPasswordConfirm,
    setInitialPasswordConfirm,
  ] =
    useState("");

  const [
    initialPhone,
    setInitialPhone,
  ] =
    useState("");

  const [
    initialEmail,
    setInitialEmail,
  ] =
    useState("");

  const [
    initialClinicId,
    setInitialClinicId,
  ] =
    useState("");

  /* =======================================================
     Local Admin Recovery
  ======================================================= */

  const [
    localAdminAccounts,
    setLocalAdminAccounts,
  ] =
    useState<
      DentflowLocalAdminAccountRecord[]
    >([]);

  const [
    recoveryAccount,
    setRecoveryAccount,
  ] =
    useState("");

  const [
    recoveryToken,
    setRecoveryToken,
  ] =
    useState("");

  const [
    recoveryExpiresAt,
    setRecoveryExpiresAt,
  ] =
    useState("");

  const [
    recoveryPassword,
    setRecoveryPassword,
  ] =
    useState("");

  const [
    recoveryPasswordConfirm,
    setRecoveryPasswordConfirm,
  ] =
    useState("");

  const [
    recoveryCompletedName,
    setRecoveryCompletedName,
  ] =
    useState("");

  const [
    recoveryCompletedAccount,
    setRecoveryCompletedAccount,
  ] =
    useState("");

  /* =======================================================
     Bootstrap
  ======================================================= */

  useEffect(
    () => {
      queueMicrotask(() => void initializeLogin());
    },
    [],
  );

  async function initializeLogin() {
    try {
      setIsChecking(
        true,
      );

      setErrorMessage(
        "",
      );

      const [
        usersExist,
        activeClinics,
      ] =
        await Promise.all([
          window.dentflow.auth.hasUsers(),

          window.dentflow.auth.activeClinics(),
        ]);

      setInitialClinics(
        activeClinics,
      );

      if (
        activeClinics.length >
        0
      ) {
        setInitialClinicId(
          String(
            activeClinics[0].id,
          ),
        );
      }

      if (!usersExist) {
        setView(
          "initial-admin",
        );

        return;
      }

      setView(
        "login",
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "登入系統初始化失敗。",
        ),
      );
    } finally {
      setIsChecking(
        false,
      );
    }
  }

  /* =======================================================
     Account → Clinics
  ======================================================= */

  useEffect(
    () => {
      const normalized =
        normalizeAccount(
          account,
        );

      if (!normalized) {
        queueMicrotask(() => {
          setClinics([]);
          setSelectedClinicId("");
        });

        return;
      }

      const timer =
        window.setTimeout(
          () => {
            queueMicrotask(
              () => void loadClinicsForAccount(normalized),
            );
          },
          250,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
      };
    },
    [
      account,
    ],
  );

  async function loadClinicsForAccount(
    normalizedAccount: string,
  ) {
    try {
      setIsLoadingClinics(
        true,
      );

      const records =
        await window.dentflow.auth.clinicsForAccount(
          normalizedAccount,
        );

      setClinics(
        records,
      );

      setSelectedClinicId(
        (
          previous,
        ) => {
          if (
            records.some(
              (
                clinic,
              ) =>
                String(
                  clinic.id,
                ) ===
                previous,
            )
          ) {
            return previous;
          }

          if (
            records.length ===
            0
          ) {
            return "";
          }

          return String(
            records[0].id,
          );
        },
      );
    } catch {
      setClinics(
        [],
      );

      setSelectedClinicId(
        "",
      );
    } finally {
      setIsLoadingClinics(
        false,
      );
    }
  }

  /* =======================================================
     Login Submit
  ======================================================= */

  async function handleLogin(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedAccount =
      normalizeAccount(
        account,
      );

    if (!normalizedAccount) {
      setErrorMessage(
        "請輸入登入帳號。",
      );

      return;
    }

    if (!password) {
      setErrorMessage(
        "請輸入登入密碼。",
      );

      return;
    }

    if (
      !selectedClinicId
    ) {
      setErrorMessage(
        "請選擇登入院所。",
      );

      return;
    }

    try {
      setIsSubmitting(
        true,
      );

      setErrorMessage(
        "",
      );

      setSuccessMessage(
        "",
      );

      const session =
        await window.dentflow.auth.login({
          account:
            normalizedAccount,

          password,

          clinicId:
            Number(
              selectedClinicId,
            ),
        });

      saveSession(
        session,
      );

      onLogin?.(
        session,
      );

      if (!onLogin) {
        window.location.reload();
      }
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "登入失敗，請確認帳號、密碼與院所。",
        ),
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  /* =======================================================
     Initial Admin
  ======================================================= */

  async function handleCreateInitialAdmin(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !initialName.trim()
    ) {
      setErrorMessage(
        "請輸入管理者姓名。",
      );

      return;
    }

    if (
      !initialAccount.trim()
    ) {
      setErrorMessage(
        "請輸入管理者帳號。",
      );

      return;
    }

    if (
      initialPassword.length <
      PASSWORD_MIN_LENGTH
    ) {
      setErrorMessage(
        `密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元。`,
      );

      return;
    }

    if (
      initialPassword !==
      initialPasswordConfirm
    ) {
      setErrorMessage(
        "兩次輸入的密碼不一致。",
      );

      return;
    }

    if (
      !initialClinicId
    ) {
      setErrorMessage(
        "請選擇主要院所。",
      );

      return;
    }

    try {
      setIsSubmitting(
        true,
      );

      setErrorMessage(
        "",
      );

      await window.dentflow.auth.createInitialAdmin({
        name:
          initialName.trim(),

        account:
          normalizeAccount(
            initialAccount,
          ),

        password:
          initialPassword,

        clinicId:
          Number(
            initialClinicId,
          ),
      });

      setAccount(
        normalizeAccount(
          initialAccount,
        ),
      );

      setPassword(
        "",
      );

      setSuccessMessage(
        "管理者帳號建立完成，請登入。",
      );

      setView(
        "login",
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "建立初始管理者失敗。",
        ),
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  /* =======================================================
     Open Recovery
  ======================================================= */

  async function openRecovery() {
    try {
      setIsSubmitting(
        true,
      );

      setErrorMessage(
        "",
      );

      setSuccessMessage(
        "",
      );

      const admins =
        await window.dentflow.auth.localAdminAccounts();

      setLocalAdminAccounts(
        admins,
      );

      if (
        admins.length ===
        0
      ) {
        setErrorMessage(
          "目前沒有可進行本機密碼復原的管理者帳號。",
        );

        return;
      }

      setRecoveryAccount(
        admins[0].account,
      );

      setRecoveryToken(
        "",
      );

      setRecoveryExpiresAt(
        "",
      );

      setRecoveryPassword(
        "",
      );

      setRecoveryPasswordConfirm(
        "",
      );

      setView(
        "recovery-account",
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "無法讀取本機管理者帳號。",
        ),
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  /* =======================================================
     Selected Recovery Admin
  ======================================================= */

  const selectedRecoveryAdmin =
    useMemo(
      () =>
        localAdminAccounts.find(
          (
            admin,
          ) =>
            admin.account ===
            recoveryAccount,
        ) ??
        null,
      [
        localAdminAccounts,
        recoveryAccount,
      ],
    );

  /* =======================================================
     Begin Recovery
  ======================================================= */

  async function handleBeginRecovery(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const selectedAdmin =
      selectedRecoveryAdmin;

    if (!selectedAdmin) {
      setErrorMessage(
        "請選擇管理者帳號。",
      );

      return;
    }

    try {
      setIsSubmitting(
        true,
      );

      setErrorMessage(
        "",
      );

      const recovery =
        await window.dentflow.auth.beginLocalAdminRecovery();

      setRecoveryToken(
        recovery.token ?? "",
      );

      setRecoveryExpiresAt(
        recovery.expiresAt ?? "",
      );

      setRecoveryPassword(
        "",
      );

      setRecoveryPasswordConfirm(
        "",
      );

      setView(
        "recovery-password",
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "無法開始管理者密碼復原。",
        ),
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  /* =======================================================
     Complete Recovery
  ======================================================= */

  async function handleCompleteRecovery(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !recoveryToken
    ) {
      setErrorMessage(
        "密碼復原驗證已失效，請重新開始。",
      );

      setView(
        "recovery-account",
      );

      return;
    }

    if (
      recoveryPassword.length <
      PASSWORD_MIN_LENGTH
    ) {
      setErrorMessage(
        `新密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元。`,
      );

      return;
    }

    if (
      recoveryPassword !==
      recoveryPasswordConfirm
    ) {
      setErrorMessage(
        "兩次輸入的新密碼不一致。",
      );

      return;
    }

    const selectedAdmin =
      selectedRecoveryAdmin;

    if (!selectedAdmin) {
      setErrorMessage(
        "找不到管理者帳號資料。",
      );

      return;
    }

    try {
      setIsSubmitting(
        true,
      );

      setErrorMessage(
        "",
      );

      const result =
        await window.dentflow.auth.completeLocalAdminRecovery({
          token:
            recoveryToken,

          account:
            recoveryAccount,

          newPassword:
            recoveryPassword,
        });

      if (
        !result.success ||
        !result.recoveryCompleted
      ) {
        throw new Error(
          "密碼復原未完成。",
        );
      }

      setRecoveryCompletedName(
        selectedAdmin.name,
      );

      setRecoveryCompletedAccount(
        selectedAdmin.account,
      );

      setAccount(
        selectedAdmin.account,
      );

      setPassword(
        "",
      );

      setRecoveryToken(
        "",
      );

      setRecoveryExpiresAt(
        "",
      );

      setRecoveryPassword(
        "",
      );

      setRecoveryPasswordConfirm(
        "",
      );

      setView(
        "recovery-complete",
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "管理者密碼復原失敗。",
        ),
      );
    } finally {
      setIsSubmitting(
        false,
      );
    }
  }

  /* =======================================================
     Cancel Recovery
  ======================================================= */

  async function cancelRecovery() {
    try {
      if (
        recoveryToken
      ) {
        await window.dentflow.auth.cancelLocalAdminRecovery();
      }
    } catch {
      // 返回登入即可
    }

    setRecoveryToken(
      "",
    );

    setRecoveryExpiresAt(
      "",
    );

    setRecoveryPassword(
      "",
    );

    setRecoveryPasswordConfirm(
      "",
    );

    setErrorMessage(
      "",
    );

    setView(
      "login",
    );
  }

  /* =======================================================
     Recovery Expiry
  ======================================================= */

  const recoveryExpiryText =
    useMemo(
      () => {
        if (
          !recoveryExpiresAt
        ) {
          return "";
        }

        const date =
          new Date(
            recoveryExpiresAt,
          );

        if (
          Number.isNaN(
            date.getTime(),
          )
        ) {
          return recoveryExpiresAt;
        }

        return new Intl.DateTimeFormat(
          "zh-TW",
          {
            hour:
              "2-digit",

            minute:
              "2-digit",

            second:
              "2-digit",
          },
        ).format(
          date,
        );
      },
      [
        recoveryExpiresAt,
      ],
    );

  /* =======================================================
     Loading
  ======================================================= */

  if (
    isChecking
  ) {
    return (
      <main className="login-page">
        <div className="login-loading-card">
          <div className="login-loading-mark">
            <img
              src={birdMascot}
              alt=""
            />
          </div>

          <h1>
            捷晞美學牙醫
          </h1>

          <p>
            JIE XI DENTAL
          </p>
        </div>
      </main>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="login-page">
      <section className="login-shell">
        {/* =================================================
            Brand Panel
        ================================================= */}

        <aside className="login-brand-panel">
          <div className="login-brand-top">
            <div className="login-brand-logo">
              <span className="login-brand-logo-mark">
                C&C
              </span>

              <span>
                C&C DENTAL
              </span>
            </div>
          </div>

          <div className="login-brand-copy">
            <span className="login-eyebrow">
              微笑，讓專業更美好
            </span>

            <h1>
              捷晞美學牙醫
              <br />
              C&C DENTAL
            </h1>

            <p>
              專業守護，從齒開始
            </p>
          </div>

          <div className="login-mascot-wrap">
            <div className="login-mascot-halo" />

            <img
              className="login-mascot"
              src={birdMascot}
              alt="捷晞美學牙醫綠鳥"
            />
          </div>

          <div className="login-brand-footer">
            <span>
              Better Smiles
            </span>

            <strong>
              Brighter Tomorrow
            </strong>
          </div>
        </aside>

        {/* =================================================
            Form Panel
        ================================================= */}

        <section className="login-form-panel">
          <div className="login-form-card">
            {/* =============================================
                Messages
            ============================================= */}

            {errorMessage && (
              <div className="login-message login-message-error">
                {
                  errorMessage
                }
              </div>
            )}

            {successMessage && (
              <div className="login-message login-message-success">
                {
                  successMessage
                }
              </div>
            )}

            {/* =============================================
                Login
            ============================================= */}

            {view ===
              "login" && (
              <>
                <div className="login-form-heading">
                  <div>
                    <span className="login-eyebrow login-eyebrow-dark">
                      C&C DENTAL
                    </span>

                    <h2>
                      歡迎回來
                    </h2>
                  </div>
                </div>

                <form
                  className="login-form"
                  onSubmit={
                    handleLogin
                  }
                >
                  <label className="login-field">
                    <span>
                      帳號
                    </span>

                    <input
                      value={
                        account
                      }
                      onChange={(
                        event,
                      ) => {
                        setAccount(
                          event.target.value,
                        );

                        setErrorMessage(
                          "",
                        );
                      }}
                      placeholder="請輸入帳號"
                      autoComplete="username"
                      autoFocus
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      密碼
                    </span>

                    <input
                      type="password"
                      value={
                        password
                      }
                      onChange={(
                        event,
                      ) => {
                        setPassword(
                          event.target.value,
                        );

                        setErrorMessage(
                          "",
                        );
                      }}
                      placeholder="請輸入密碼"
                      autoComplete="current-password"
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      院所
                    </span>

                    <select
                      value={
                        selectedClinicId
                      }
                      onChange={(
                        event,
                      ) =>
                        setSelectedClinicId(
                          event.target.value,
                        )
                      }
                      disabled={
                        isLoadingClinics ||
                        clinics.length ===
                          0
                      }
                    >
                      {isLoadingClinics ? (
                        <option value="">
                          讀取院所中…
                        </option>
                      ) : clinics.length ===
                        0 ? (
                        <option value="">
                          請先輸入有效帳號
                        </option>
                      ) : (
                        clinics.map(
                          (
                            clinic,
                          ) => (
                            <option
                              key={
                                clinic.id
                              }
                              value={
                                clinic.id
                              }
                            >
                              {
                                clinic.name
                              }

                              {clinic.code
                                ? `｜${clinic.code}`
                                : ""}


                            </option>
                          ),
                        )
                      )}
                    </select>
                  </label>

                  <button
                    type="submit"
                    className="login-primary-button"
                    disabled={
                      isSubmitting
                    }
                  >
                    {isSubmitting
                      ? "登入中…"
                      : "登入"}
                  </button>

                  <button
                    type="button"
                    className="login-link-button"
                    disabled={
                      isSubmitting
                    }
                    onClick={() =>
                      void openRecovery()
                    }
                  >
                    忘記管理者密碼？
                  </button>

                  <button
                    type="button"
                    className="login-link-button"
                    disabled={isSubmitting}
                    onClick={() => navigate("/purchase-login")}
                  >
                    採購／叫貨人員登入
                  </button>
                </form>


              </>
            )}

            {/* =============================================
                Initial Admin
            ============================================= */}

            {view ===
              "initial-admin" && (
              <>
                <div className="login-form-heading">
                  <div className="login-form-icon">
                    ⚙
                  </div>

                  <div>
                    <span className="login-eyebrow login-eyebrow-dark">
                      FIRST SETUP
                    </span>

                    <h2>
                      建立初始管理者
                    </h2>

                    <p>
                      系統尚未建立使用者，請先建立第一個 Admin 帳號。
                    </p>
                  </div>
                </div>

                <form
                  className="login-form"
                  onSubmit={
                    handleCreateInitialAdmin
                  }
                >
                  <label className="login-field">
                    <span>
                      管理者姓名
                    </span>

                    <input
                      value={
                        initialName
                      }
                      onChange={(
                        event,
                      ) =>
                        setInitialName(
                          event.target.value,
                        )
                      }
                      placeholder="請輸入姓名"
                      autoComplete="off"
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      登入帳號
                    </span>

                    <input
                      value={
                        initialAccount
                      }
                      onChange={(
                        event,
                      ) =>
                        setInitialAccount(
                          event.target.value,
                        )
                      }
                      placeholder="例如：admin"
                      autoComplete="off"
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      登入密碼
                    </span>

                    <input
                      type="password"
                      value={
                        initialPassword
                      }
                      onChange={(
                        event,
                      ) =>
                        setInitialPassword(
                          event.target.value,
                        )
                      }
                      placeholder="至少 8 個字元"
                      autoComplete="new-password"
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      再次輸入密碼
                    </span>

                    <input
                      type="password"
                      value={
                        initialPasswordConfirm
                      }
                      onChange={(
                        event,
                      ) =>
                        setInitialPasswordConfirm(
                          event.target.value,
                        )
                      }
                      placeholder="請再次輸入密碼"
                      autoComplete="new-password"
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      電話
                    </span>

                    <input
                      value={
                        initialPhone
                      }
                      onChange={(
                        event,
                      ) =>
                        setInitialPhone(
                          event.target.value,
                        )
                      }
                      placeholder="選填"
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      Email
                    </span>

                    <input
                      type="email"
                      value={
                        initialEmail
                      }
                      onChange={(
                        event,
                      ) =>
                        setInitialEmail(
                          event.target.value,
                        )
                      }
                      placeholder="選填"
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      主要院所
                    </span>

                    <select
                      value={
                        initialClinicId
                      }
                      onChange={(
                        event,
                      ) =>
                        setInitialClinicId(
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        請選擇
                      </option>

                      {initialClinics.map(
                        (
                          clinic,
                        ) => (
                          <option
                            key={
                              clinic.id
                            }
                            value={
                              clinic.id
                            }
                          >
                            {
                              clinic.name
                            }

                            {clinic.code
                              ? `｜${clinic.code}`
                              : ""}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <button
                    type="submit"
                    className="login-primary-button"
                    disabled={
                      isSubmitting
                    }
                  >
                    {isSubmitting
                      ? "建立中…"
                      : "建立管理者"}
                  </button>
                </form>
              </>
            )}

            {/* =============================================
                Recovery Account
            ============================================= */}

            {view ===
              "recovery-account" && (
              <>
                <div className="login-form-heading">
                  <div className="login-form-icon">
                    🔐
                  </div>

                  <div>
                    <span className="login-eyebrow login-eyebrow-dark">
                      LOCAL RECOVERY
                    </span>

                    <h2>
                      管理者密碼復原
                    </h2>

                    <p>
                      請選擇要重設密碼的本機管理者帳號。
                    </p>
                  </div>
                </div>

                <form
                  className="login-form"
                  onSubmit={
                    handleBeginRecovery
                  }
                >
                  <label className="login-field">
                    <span>
                      管理者帳號
                    </span>

                    <select
                      value={
                        recoveryAccount
                      }
                      onChange={(
                        event,
                      ) =>
                        setRecoveryAccount(
                          event.target.value,
                        )
                      }
                    >
                      {localAdminAccounts.map(
                        (
                          admin,
                        ) => (
                          <option
                            key={
                              admin.id
                            }
                            value={
                              admin.account
                            }
                          >
                            {
                              admin.name
                            }
                            ｜
                            {
                              admin.account
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  {selectedRecoveryAdmin && (
                    <div className="login-recovery-account-card">
                      <div>
                        <span>
                          管理者
                        </span>

                        <strong>
                          {
                            selectedRecoveryAdmin.name
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          帳號
                        </span>

                        <strong>
                          {
                            selectedRecoveryAdmin.account
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          ID
                        </span>

                        <strong>
                          #
                          {
                            selectedRecoveryAdmin.id
                          }
                        </strong>
                      </div>
                    </div>
                  )}

                  <div className="login-help">
                    <strong>
                      本機復原
                    </strong>

                    <span>
                      驗證 Token 只存在 Electron Main Process 記憶體中，逾時後自動失效。
                    </span>
                  </div>

                  <button
                    type="submit"
                    className="login-primary-button"
                    disabled={
                      isSubmitting
                    }
                  >
                    {isSubmitting
                      ? "處理中…"
                      : "開始密碼復原"}
                  </button>

                  <button
                    type="button"
                    className="login-secondary-button"
                    onClick={() =>
                      void cancelRecovery()
                    }
                  >
                    返回登入
                  </button>
                </form>
              </>
            )}

            {/* =============================================
                Recovery Password
            ============================================= */}

            {view ===
              "recovery-password" && (
              <>
                <div className="login-form-heading">
                  <div className="login-form-icon">
                    🔑
                  </div>

                  <div>
                    <span className="login-eyebrow login-eyebrow-dark">
                      RESET PASSWORD
                    </span>

                    <h2>
                      設定新密碼
                    </h2>

                    <p>
                      為本機管理者設定新的登入密碼。
                    </p>
                  </div>
                </div>

                {selectedRecoveryAdmin && (
                  <div className="login-recovery-authorized">
                    <strong>
                      已選擇：
                      {
                        selectedRecoveryAdmin.name
                      }
                    </strong>

                    <span>
                      帳號：
                      {
                        selectedRecoveryAdmin.account
                      }
                      {recoveryExpiryText
                        ? `｜驗證有效至 ${recoveryExpiryText}`
                        : ""}
                    </span>
                  </div>
                )}

                <form
                  className="login-form"
                  onSubmit={
                    handleCompleteRecovery
                  }
                  style={{
                    marginTop: 18,
                  }}
                >
                  <label className="login-field">
                    <span>
                      新密碼
                    </span>

                    <input
                      type="password"
                      value={
                        recoveryPassword
                      }
                      onChange={(
                        event,
                      ) =>
                        setRecoveryPassword(
                          event.target.value,
                        )
                      }
                      placeholder="至少 8 個字元"
                      autoComplete="new-password"
                      autoFocus
                    />
                  </label>

                  <label className="login-field">
                    <span>
                      再次輸入新密碼
                    </span>

                    <input
                      type="password"
                      value={
                        recoveryPasswordConfirm
                      }
                      onChange={(
                        event,
                      ) =>
                        setRecoveryPasswordConfirm(
                          event.target.value,
                        )
                      }
                      placeholder="再次輸入新密碼"
                      autoComplete="new-password"
                    />
                  </label>

                  <button
                    type="submit"
                    className="login-primary-button"
                    disabled={
                      isSubmitting
                    }
                  >
                    {isSubmitting
                      ? "重設中…"
                      : "完成密碼重設"}
                  </button>

                  <button
                    type="button"
                    className="login-secondary-button"
                    onClick={() =>
                      void cancelRecovery()
                    }
                  >
                    取消
                  </button>
                </form>
              </>
            )}

            {/* =============================================
                Recovery Complete
            ============================================= */}

            {view ===
              "recovery-complete" && (
              <>
                <div className="login-form-heading">
                  <div className="login-form-icon">
                    ✓
                  </div>

                  <div>
                    <span className="login-eyebrow login-eyebrow-dark">
                      COMPLETE
                    </span>

                    <h2>
                      密碼重設完成
                    </h2>

                    <p>
                      現在可以使用新密碼登入。
                    </p>
                  </div>
                </div>

                <div className="login-recovery-authorized">
                  <strong>
                    {
                      recoveryCompletedName
                    }
                  </strong>

                  <span>
                    帳號：
                    {
                      recoveryCompletedAccount
                    }
                  </span>
                </div>

                <button
                  type="button"
                  className="login-primary-button"
                  style={{
                    width: "100%",
                    marginTop: 20,
                  }}
                  onClick={() => {
                    setSuccessMessage(
                      "密碼已完成重設，請使用新密碼登入。",
                    );

                    setErrorMessage(
                      "",
                    );

                    setView(
                      "login",
                    );
                  }}
                >
                  返回登入
                </button>
              </>
            )}
          </div>

          <div className="login-form-footer">
            捷晞美學牙醫 · C&C DENTAL
          </div>
        </section>
      </section>
    </main>
  );
}
