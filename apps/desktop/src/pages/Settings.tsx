import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  useOutletContext,
} from "react-router-dom";

import type {
  DentflowMainLayoutContext,
} from "../layouts/MainLayout";

import "../styles/Settings.css";

/* =========================================================
   Types
========================================================= */

type UserFormMode =
  | "create"
  | "edit";

type UserFormState = {
  name: string;
  account: string;
  password: string;
  role: DentflowUserRole;
  isActive: boolean;
  clinicIds: number[];
  primaryClinicId: number | null;
};

type ResetPasswordState = {
  userId: number | null;
  userName: string;
  password: string;
  confirmPassword: string;
};

type ClinicFormMode =
  | "create"
  | "edit";

type ClinicFormState = {
  code: string;
  name: string;
};

/* =========================================================
   Defaults
========================================================= */

const emptyUserForm:
  UserFormState = {
    name: "",
    account: "",
    password: "",
    role: "Assistant",
    isActive: true,
    clinicIds: [],
    primaryClinicId: null,
  };

const emptyClinicForm:
  ClinicFormState = {
    code: "",
    name: "",
  };

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

  return "發生未知錯誤";
}

function getRoleLabel(
  role: DentflowUserRole,
) {
  switch (role) {
    case "Doctor":
      return "醫師";

    case "Assistant":
      return "助理";

    case "Admin":
      return "管理者";

    case "Accountant":
      return "會計";
  }
}

function getMembershipClinicId(
  clinic: DentflowUserClinicRecord,
) {
  const raw =
    clinic.clinicId ??
    (
      clinic as DentflowUserClinicRecord & {
        id?: number | string;
      }
    ).id;

  const value =
    Number(raw);

  return Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

function getMembershipClinicName(
  clinic: DentflowUserClinicRecord,
) {
  return (
    clinic.clinicName ??
    (
      clinic as DentflowUserClinicRecord & {
        name?: string;
      }
    ).name ??
    ""
  );
}

function getMembershipClinicCode(
  clinic: DentflowUserClinicRecord,
) {
  return (
    clinic.clinicCode ??
    (
      clinic as DentflowUserClinicRecord & {
        code?: string;
      }
    ).code ??
    ""
  );
}

function normalizeClinicIds(
  values: unknown[],
) {
  return [
    ...new Set(
      values
        .map(
          (value) =>
            Number(value),
        )
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value > 0,
        ),
    ),
  ];
}

function getRoleIcon(
  role: DentflowUserRole,
) {
  switch (role) {
    case "Doctor":
      return "🦷";

    case "Assistant":
      return "🩺";

    case "Admin":
      return "⚙";

    case "Accountant":
      return "▤";
  }
}

/* =========================================================
   Settings
========================================================= */

export default function Settings() {
  const {
    session,
  } =
    useOutletContext<
      DentflowMainLayoutContext
    >();

  const adminUserId =
    session.userId;

  /* =======================================================
     Data
  ======================================================= */

  const [
    users,
    setUsers,
  ] =
    useState<
      DentflowUserRecord[]
    >([]);

  const [
    clinics,
    setClinics,
  ] =
    useState<
      DentflowClinicRecord[]
    >([]);

  const [
    clinicStats,
    setClinicStats,
  ] =
    useState<
      DentflowClinicWithStatsRecord[]
    >([]);

  /* =======================================================
     Loading / Message
  ======================================================= */

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  /* =======================================================
     Account Filters
  ======================================================= */

  const [
    keyword,
    setKeyword,
  ] =
    useState("");

  const [
    roleFilter,
    setRoleFilter,
  ] =
    useState<
      "all" |
      DentflowUserRole
    >("all");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<
      "all"
      | "active"
      | "inactive"
    >("all");

  /* =======================================================
     User Form
  ======================================================= */

  const [
    formMode,
    setFormMode,
  ] =
    useState<UserFormMode>(
      "create",
    );

  const [
    editingUserId,
    setEditingUserId,
  ] =
    useState<
      number | null
    >(null);

  const [
    formOpen,
    setFormOpen,
  ] =
    useState(false);

  const [
    userForm,
    setUserForm,
  ] =
    useState<UserFormState>(
      emptyUserForm,
    );

  /* =======================================================
     Reset Password
  ======================================================= */

  const [
    resetPasswordOpen,
    setResetPasswordOpen,
  ] =
    useState(false);

  const [
    resetPasswordForm,
    setResetPasswordForm,
  ] =
    useState<ResetPasswordState>({
      userId: null,
      userName: "",
      password: "",
      confirmPassword: "",
    });

  /* =======================================================
     Clinic Form
  ======================================================= */

  const [
    clinicFormOpen,
    setClinicFormOpen,
  ] =
    useState(false);

  const [
    clinicFormMode,
    setClinicFormMode,
  ] =
    useState<ClinicFormMode>(
      "create",
    );

  const [
    editingClinicId,
    setEditingClinicId,
  ] =
    useState<
      number | null
    >(null);

  const [
    clinicForm,
    setClinicForm,
  ] =
    useState<ClinicFormState>(
      emptyClinicForm,
    );

  /* =======================================================
     Init
  ======================================================= */

  useEffect(
    () => {
      void loadData();
    },
    [],
  );

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [
        userRows,
        clinicRows,
        clinicStatRows,
      ] =
        await Promise.all([
          window.dentflow
            .auth
            .users(),

          window.dentflow
            .clinics
            .list(),

          window.dentflow
            .clinics
            .withStats(),
        ]);

      setUsers(
        userRows,
      );

      setClinics(
        clinicRows,
      );

      setClinicStats(
        clinicStatRows,
      );
    } catch (
      loadError
    ) {
      setError(
        getErrorMessage(
          loadError,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  /* =======================================================
     Filtered Users
  ======================================================= */

  const filteredUsers =
    useMemo(
      () => {
        const normalizedKeyword =
          keyword
            .trim()
            .toLowerCase();

        return users.filter(
          (
            user,
          ) => {
            if (
              roleFilter !==
                "all" &&
              user.role !==
                roleFilter
            ) {
              return false;
            }

            if (
              statusFilter ===
                "active" &&
              user.isActive !==
                1
            ) {
              return false;
            }

            if (
              statusFilter ===
                "inactive" &&
              user.isActive ===
                1
            ) {
              return false;
            }

            if (
              !normalizedKeyword
            ) {
              return true;
            }

            const clinicText =
              (
                user.clinics ??
                []
              )
                .map(
                  (
                    clinic,
                  ) =>
                    `${getMembershipClinicName(clinic)} ${getMembershipClinicCode(clinic)}`,
                )
                .join(" ");

            return [
              user.name,
              user.account,
              getRoleLabel(
                user.role,
              ),
              clinicText,
            ]
              .join(" ")
              .toLowerCase()
              .includes(
                normalizedKeyword,
              );
          },
        );
      },
      [
        users,
        keyword,
        roleFilter,
        statusFilter,
      ],
    );

  /* =======================================================
     Summary
  ======================================================= */

  const summary =
    useMemo(
      () => ({
        total:
          users.length,

        active:
          users.filter(
            (
              user,
            ) =>
              user.isActive ===
              1,
          ).length,

        doctors:
          users.filter(
            (
              user,
            ) =>
              user.role ===
              "Doctor",
          ).length,

        clinics:
          clinicStats.filter(
            (
              clinic,
            ) =>
              clinic.isActive ===
              1,
          ).length,
      }),
      [
        users,
        clinicStats,
      ],
    );

  /* =======================================================
     User Form
  ======================================================= */

  function openCreateUser() {
    const defaultClinic =
      clinics.find(
        (
          clinic,
        ) =>
          clinic.isActive ===
          1,
      ) ??
      null;

    setFormMode(
      "create",
    );

    setEditingUserId(
      null,
    );

    setUserForm({
      ...emptyUserForm,

      clinicIds:
        defaultClinic
          ? [
              defaultClinic.id,
            ]
          : [],

      primaryClinicId:
        defaultClinic?.id ??
        null,
    });

    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  function openEditUser(
    user:
      DentflowUserRecord,
  ) {
    const memberships =
      user.clinics ??
      [];

    const clinicIds =
      normalizeClinicIds(
        memberships.map(
          (
            clinic,
          ) =>
            getMembershipClinicId(
              clinic,
            ),
        ),
      );

    const primary =
      memberships.find(
        (
          clinic,
        ) =>
          clinic.isPrimary ===
          1,
      );

    setFormMode(
      "edit",
    );

    setEditingUserId(
      user.id,
    );

    setUserForm({
      name:
        user.name,

      account:
        user.account,

      password:
        "",

      role:
        user.role,

      isActive:
        user.isActive ===
        1,

      clinicIds,

      primaryClinicId:
        (primary
          ? getMembershipClinicId(
              primary,
            )
          : null) ??
        clinicIds[0] ??
        null,
    });

    setError("");
    setSuccess("");
    setFormOpen(true);
  }

  function closeUserForm() {
    if (saving) {
      return;
    }

    setFormOpen(false);
    setEditingUserId(null);
    setUserForm(
      emptyUserForm,
    );
  }

  function toggleClinic(
    clinicId: number,
  ) {
    setUserForm(
      (
        current,
      ) => {
        const exists =
          current.clinicIds.includes(
            clinicId,
          );

        if (exists) {
          const nextClinicIds =
            current.clinicIds.filter(
              (
                id,
              ) =>
                id !==
                clinicId,
            );

          return {
            ...current,

            clinicIds:
              nextClinicIds,

            primaryClinicId:
              current.primaryClinicId ===
              clinicId
                ? nextClinicIds[0] ??
                  null
                : current.primaryClinicId,
          };
        }

        const nextClinicIds = [
          ...current.clinicIds,
          clinicId,
        ];

        return {
          ...current,

          clinicIds:
            nextClinicIds,

          primaryClinicId:
            current.primaryClinicId ??
            clinicId,
        };
      },
    );
  }

  async function handleSubmitUser(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setError("");
    setSuccess("");

    if (
      !userForm.name.trim()
    ) {
      setError(
        "請輸入使用者姓名",
      );

      return;
    }

    if (
      formMode ===
        "create" &&
      !userForm.account.trim()
    ) {
      setError(
        "請輸入登入帳號",
      );

      return;
    }

    if (
      formMode ===
        "create" &&
      userForm.password.length <
        8
    ) {
      setError(
        "新帳號密碼至少需要 8 個字元",
      );

      return;
    }

    const normalizedClinicIds =
      normalizeClinicIds(
        userForm.clinicIds,
      );

    const normalizedPrimaryClinicId =
      userForm.primaryClinicId ===
        null
        ? null
        : Number(
            userForm.primaryClinicId,
          );

    if (
      normalizedClinicIds.length ===
        0
    ) {
      setError(
        "至少需要指定一間院所",
      );

      return;
    }

    if (
      userForm.primaryClinicId ===
      null ||
      !Number.isInteger(
        normalizedPrimaryClinicId,
      ) ||
      !normalizedClinicIds.includes(
        normalizedPrimaryClinicId as number,
      )
    ) {
      setError(
        "請設定有效的主要院所",
      );

      return;
    }

    setSaving(true);

    try {
      if (
        formMode ===
        "create"
      ) {
        await window.dentflow
          .auth
          .createUser({
            name:
              userForm.name.trim(),

            account:
              userForm.account.trim(),

            password:
              userForm.password,

            role:
              userForm.role,

            isActive:
              userForm.isActive,

            clinicIds:
              normalizedClinicIds,

            primaryClinicId:
              normalizedPrimaryClinicId,
          });

        setSuccess(
          "帳號建立完成",
        );
      } else {
        if (
          editingUserId ===
          null
        ) {
          throw new Error(
            "找不到要編輯的使用者",
          );
        }

        await window.dentflow
          .auth
          .updateUser(
            editingUserId,
            {
              name:
                userForm.name.trim(),

              role:
                userForm.role,

              isActive:
                userForm.isActive,

              clinicIds:
                userForm.clinicIds,

              primaryClinicId:
                userForm.primaryClinicId,
            },
          );

        setSuccess(
          "帳號資料已更新",
        );
      }

      await loadData();

      setFormOpen(false);
      setEditingUserId(null);
    } catch (
      saveError
    ) {
      setError(
        getErrorMessage(
          saveError,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleUserActive(
    user:
      DentflowUserRecord,
  ) {
    const nextActive =
      user.isActive !==
      1;

    if (
      !window.confirm(
        nextActive
          ? `確定要啟用「${user.name}」嗎？`
          : `確定要停用「${user.name}」嗎？停用後將無法登入系統。`,
      )
    ) {
      return;
    }

    const memberships =
      user.clinics ??
      [];

    const clinicIds =
      normalizeClinicIds(
        memberships.map(
          (
            clinic,
          ) =>
            getMembershipClinicId(
              clinic,
            ),
        ),
      );

    const primary =
      memberships.find(
        (
          clinic,
        ) =>
          clinic.isPrimary ===
          1,
      );

    try {
      setError("");
      setSuccess("");

      await window.dentflow
        .auth
        .updateUser(
          user.id,
          {
            name:
              user.name,

            role:
              user.role,

            isActive:
              nextActive,

            clinicIds,

            primaryClinicId:
              (primary
                ? getMembershipClinicId(
                    primary,
                  )
                : null) ??
              clinicIds[0] ??
              null,
          },
        );

      setSuccess(
        nextActive
          ? "帳號已啟用"
          : "帳號已停用",
      );

      await loadData();
    } catch (
      toggleError
    ) {
      setError(
        getErrorMessage(
          toggleError,
        ),
      );
    }
  }

  /* =======================================================
     Reset Password
  ======================================================= */

  function openResetPassword(
    user:
      DentflowUserRecord,
  ) {
    setResetPasswordForm({
      userId:
        user.id,

      userName:
        user.name,

      password:
        "",

      confirmPassword:
        "",
    });

    setError("");
    setSuccess("");
    setResetPasswordOpen(true);
  }

  async function handleResetPassword(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      saving ||
      resetPasswordForm.userId ===
        null
    ) {
      return;
    }

    if (
      resetPasswordForm.password.length <
      8
    ) {
      setError(
        "新密碼至少需要 8 個字元",
      );

      return;
    }

    if (
      resetPasswordForm.password !==
      resetPasswordForm.confirmPassword
    ) {
      setError(
        "兩次輸入的密碼不一致",
      );

      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await window.dentflow
        .auth
        .resetPassword({
          userId:
            resetPasswordForm.userId,

          newPassword:
            resetPasswordForm.password,
        });

      setSuccess(
        `「${resetPasswordForm.userName}」的密碼已重設`,
      );

      setResetPasswordOpen(false);
    } catch (
      resetError
    ) {
      setError(
        getErrorMessage(
          resetError,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteUser(
    user:
      DentflowUserRecord,
  ) {
    if (
      !window.confirm(
        `確定要刪除「${user.name}」的登入帳號嗎？\n\n若帳號已連結醫師資料，系統會阻止刪除，請改用停用帳號。`,
      )
    ) {
      return;
    }

    try {
      setError("");
      setSuccess("");

      await window.dentflow
        .auth
        .deleteUser(
          user.id,
        );

      setSuccess(
        "帳號已刪除",
      );

      await loadData();
    } catch (
      deleteError
    ) {
      setError(
        getErrorMessage(
          deleteError,
        ),
      );
    }
  }

  /* =======================================================
     Clinic Management
  ======================================================= */

  function openCreateClinic() {
    setClinicFormMode(
      "create",
    );

    setEditingClinicId(
      null,
    );

    setClinicForm(
      emptyClinicForm,
    );

    setError("");
    setSuccess("");
    setClinicFormOpen(true);
  }

  function openEditClinic(
    clinic:
      DentflowClinicRecord,
  ) {
    setClinicFormMode(
      "edit",
    );

    setEditingClinicId(
      clinic.id,
    );

    setClinicForm({
      code:
        clinic.code,

      name:
        clinic.name,
    });

    setError("");
    setSuccess("");
    setClinicFormOpen(true);
  }

  function closeClinicForm() {
    if (saving) {
      return;
    }

    setClinicFormOpen(false);
    setEditingClinicId(null);
    setClinicForm(
      emptyClinicForm,
    );
  }

  async function handleSubmitClinic(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const code =
      clinicForm.code
        .trim()
        .toUpperCase();

    const name =
      clinicForm.name.trim();

    if (!code) {
      setError(
        "請輸入院所代碼",
      );

      return;
    }

    if (!name) {
      setError(
        "請輸入院所名稱",
      );

      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (
        clinicFormMode ===
        "create"
      ) {
        await window.dentflow
          .clinics
          .create(
            adminUserId,
            {
              code,
              name,
            },
          );

        setSuccess(
          "院所建立完成",
        );
      } else {
        if (
          editingClinicId ===
          null
        ) {
          throw new Error(
            "找不到要編輯的院所",
          );
        }

        await window.dentflow
          .clinics
          .update(
            editingClinicId,
            adminUserId,
            {
              code,
              name,
            },
          );

        setSuccess(
          "院所資料已更新",
        );
      }

      await loadData();

      setClinicFormOpen(false);
      setEditingClinicId(null);
      setClinicForm(
        emptyClinicForm,
      );
    } catch (
      saveError
    ) {
      setError(
        getErrorMessage(
          saveError,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleClinicActive(
    clinic:
      DentflowClinicRecord,
  ) {
    const nextActive =
      clinic.isActive !==
      1;

    if (
      !window.confirm(
        nextActive
          ? `確定要重新啟用「${clinic.name}」嗎？`
          : `確定要停用「${clinic.name}」嗎？\n\n既有醫療、庫存與交易紀錄都會保留。`,
      )
    ) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await window.dentflow
        .clinics
        .setActive(
          clinic.id,
          adminUserId,
          nextActive,
        );

      setSuccess(
        nextActive
          ? "院所已啟用"
          : "院所已停用",
      );

      await loadData();
    } catch (
      toggleError
    ) {
      setError(
        getErrorMessage(
          toggleError,
        ),
      );
    }
  }

  /* =======================================================
     Loading
  ======================================================= */

  async function handleBackupDatabase() {
    try {
      setError("");
      setSuccess("");
      const result = await window.dentflow.system.backupDatabase();
      if (!result.cancelled) {
        setSuccess(`資料庫備份完成：${result.filePath ?? "已儲存"}`);
      }
    } catch (backupError) {
      setError(getErrorMessage(backupError));
    }
  }

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          正在載入系統設定…
        </div>
      </div>
    );
  }

  /* =======================================================
     Render
  ======================================================= */

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <div>
          <div className="settings-page-eyebrow">
            SYSTEM SETTINGS
          </div>

          <h1>
            系統設定
          </h1>

          <p>
            管理捷晞美學牙醫的院所、登入帳號與角色權限。
          </p>
        </div>

        <div className="settings-header-actions">
          <button
            className="settings-secondary-button"
            type="button"
            onClick={() => void handleBackupDatabase()}
          >
            備份資料庫
          </button>

          <button
            className="settings-secondary-button"
            type="button"
            onClick={
              openCreateClinic
            }
          >
            ＋ 新增院所
          </button>

          <button
            className="settings-primary-button"
            type="button"
            onClick={
              openCreateUser
            }
          >
            ＋ 新增帳號
          </button>
        </div>
      </div>

      {error ? (
        <div className="settings-message settings-message-error">
          <span>!</span>
          <div>{error}</div>
        </div>
      ) : null}

      {success ? (
        <div className="settings-message settings-message-success">
          <span>✓</span>
          <div>{success}</div>
        </div>
      ) : null}

      <div className="settings-summary-grid">
        <div className="settings-summary-card">
          <div className="settings-summary-icon">
            👥
          </div>

          <div>
            <span>
              全部帳號
            </span>

            <strong>
              {summary.total}
            </strong>
          </div>
        </div>

        <div className="settings-summary-card">
          <div className="settings-summary-icon">
            ✓
          </div>

          <div>
            <span>
              啟用帳號
            </span>

            <strong>
              {summary.active}
            </strong>
          </div>
        </div>

        <div className="settings-summary-card">
          <div className="settings-summary-icon">
            🦷
          </div>

          <div>
            <span>
              醫師帳號
            </span>

            <strong>
              {summary.doctors}
            </strong>
          </div>
        </div>

        <div className="settings-summary-card">
          <div className="settings-summary-icon">
            ⌂
          </div>

          <div>
            <span>
              啟用院所
            </span>

            <strong>
              {summary.clinics}
            </strong>
          </div>
        </div>
      </div>

      {/* =================================================
          Clinic Management
      ================================================= */}

      <section className="settings-section">
        <div className="settings-section-header">
          <div>
            <h2>
              院所管理
            </h2>

            <p>
              新增、修改及啟用或停用院所。停用不會刪除既有醫療紀錄。
            </p>
          </div>

          <button
            className="settings-primary-button"
            type="button"
            onClick={
              openCreateClinic
            }
          >
            ＋ 新增院所
          </button>
        </div>

        <div className="settings-clinic-management-grid">
          {clinicStats.length ===
          0 ? (
            <div className="settings-empty-card">
              尚未建立院所。
            </div>
          ) : (
            clinicStats.map(
              (
                clinic,
              ) => (
                <article
                  key={
                    clinic.id
                  }
                  className={
                    clinic.isActive ===
                    1
                      ? "settings-clinic-management-card"
                      : "settings-clinic-management-card settings-clinic-management-card-inactive"
                  }
                >
                  <div className="settings-clinic-management-top">
                    <div className="settings-clinic-management-icon">
                      ⌂
                    </div>

                    <span
                      className={
                        clinic.isActive ===
                        1
                          ? "settings-status settings-status-active"
                          : "settings-status settings-status-inactive"
                      }
                    >
                      {clinic.isActive ===
                      1
                        ? "啟用"
                        : "停用"}
                    </span>
                  </div>

                  <div className="settings-clinic-management-copy">
                    <strong>
                      {clinic.name}
                    </strong>

                    <span>
                      {clinic.code}
                    </span>
                  </div>

                  <div className="settings-clinic-management-stats">
                    <div>
                      <span>
                        使用者
                      </span>

                      <strong>
                        {clinic.userCount}
                      </strong>
                    </div>

                    <div>
                      <span>
                        醫師
                      </span>

                      <strong>
                        {clinic.doctorCount}
                      </strong>
                    </div>
                  </div>

                  <div className="settings-clinic-management-actions">
                    <button
                      type="button"
                      onClick={() =>
                        openEditClinic(
                          clinic,
                        )
                      }
                    >
                      編輯
                    </button>

                    <button
                      type="button"
                      className={
                        clinic.isActive ===
                        1
                          ? "settings-danger-action"
                          : ""
                      }
                      onClick={() =>
                        void handleToggleClinicActive(
                          clinic,
                        )
                      }
                    >
                      {clinic.isActive ===
                      1
                        ? "停用"
                        : "啟用"}
                    </button>
                  </div>
                </article>
              ),
            )
          )}
        </div>
      </section>

      {/* =================================================
          Account Management
      ================================================= */}

      <section className="settings-section">
        <div className="settings-section-header">
          <div>
            <h2>
              帳號與權限
            </h2>

            <p>
              管理醫師、助理、管理者與會計的登入權限與院所範圍。
            </p>
          </div>

          <button
            className="settings-refresh-button"
            type="button"
            onClick={() =>
              void loadData()
            }
          >
            重新整理
          </button>
        </div>

        <div className="settings-filter-bar">
          <div className="settings-search">
            <span>⌕</span>

            <input
              type="text"
              value={
                keyword
              }
              onChange={(
                event,
              ) =>
                setKeyword(
                  event.target.value,
                )
              }
              placeholder="搜尋姓名、帳號、院所…"
            />
          </div>

          <select
            value={
              roleFilter
            }
            onChange={(
              event,
            ) =>
              setRoleFilter(
                event.target.value as
                  | "all"
                  | DentflowUserRole,
              )
            }
          >
            <option value="all">
              全部角色
            </option>

            <option value="Doctor">
              醫師
            </option>

            <option value="Assistant">
              助理
            </option>

            <option value="Admin">
              管理者
            </option>

            <option value="Accountant">
              會計
            </option>
          </select>

          <select
            value={
              statusFilter
            }
            onChange={(
              event,
            ) =>
              setStatusFilter(
                event.target.value as
                  | "all"
                  | "active"
                  | "inactive",
              )
            }
          >
            <option value="all">
              全部狀態
            </option>

            <option value="active">
              啟用
            </option>

            <option value="inactive">
              停用
            </option>
          </select>
        </div>

        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>使用者</th>
                <th>角色</th>
                <th>院所</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={
                      5
                    }
                    className="settings-empty-cell"
                  >
                    沒有符合條件的帳號。
                  </td>
                </tr>
              ) : (
                filteredUsers.map(
                  (
                    user,
                  ) => (
                    <tr
                      key={
                        user.id
                      }
                    >
                      <td>
                        <div className="settings-user-cell">
                          <div className="settings-user-avatar">
                            {user.name
                              .trim()
                              .charAt(0)
                              .toUpperCase() ||
                              "U"}
                          </div>

                          <div>
                            <strong>
                              {user.name}
                            </strong>

                            <span>
                              @{user.account}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span
                          className={`settings-role-badge settings-role-${user.role.toLowerCase()}`}
                        >
                          <span>
                            {getRoleIcon(
                              user.role,
                            )}
                          </span>

                          {getRoleLabel(
                            user.role,
                          )}
                        </span>
                      </td>

                      <td>
                        <div className="settings-clinic-tags">
                          {(
                            user.clinics ??
                            []
                          ).length ===
                          0 ? (
                            <span className="settings-muted">
                              未指定
                            </span>
                          ) : (
                            (
                              user.clinics ??
                              []
                            ).map(
                              (
                                clinic,
                              ) => (
                                <span
                                  key={
                                    getMembershipClinicId(
                                      clinic,
                                    ) ??
                                    `${getMembershipClinicCode(clinic)}-${getMembershipClinicName(clinic)}`
                                  }
                                  className={
                                    clinic.isPrimary ===
                                    1
                                      ? "settings-clinic-tag settings-clinic-tag-primary"
                                      : "settings-clinic-tag"
                                  }
                                >
                                  {getMembershipClinicName(
                                    clinic,
                                  )}

                                  {clinic.isPrimary ===
                                  1
                                    ? " ★"
                                    : ""}
                                </span>
                              ),
                            )
                          )}
                        </div>
                      </td>

                      <td>
                        <span
                          className={
                            user.isActive ===
                            1
                              ? "settings-status settings-status-active"
                              : "settings-status settings-status-inactive"
                          }
                        >
                          {user.isActive ===
                          1
                            ? "啟用"
                            : "停用"}
                        </span>
                      </td>

                      <td>
                        <div className="settings-actions">
                          <button
                            type="button"
                            onClick={() =>
                              openEditUser(
                                user,
                              )
                            }
                          >
                            編輯
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openResetPassword(
                                user,
                              )
                            }
                          >
                            重設密碼
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void handleToggleUserActive(
                                user,
                              )
                            }
                          >
                            {user.isActive ===
                            1
                              ? "停用"
                              : "啟用"}
                          </button>

                          <button
                            type="button"
                            className="settings-danger-action"
                            onClick={() =>
                              void handleDeleteUser(
                                user,
                              )
                            }
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ),
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* =================================================
          User Modal
      ================================================= */}

      {formOpen ? (
        <div className="settings-modal-layer">
          <button
            className="settings-modal-backdrop"
            type="button"
            aria-label="關閉"
            onClick={
              closeUserForm
            }
          />

          <div className="settings-modal">
            <div className="settings-modal-header">
              <div>
                <span>
                  {formMode ===
                  "create"
                    ? "NEW USER"
                    : "EDIT USER"}
                </span>

                <h2>
                  {formMode ===
                  "create"
                    ? "新增登入帳號"
                    : "編輯登入帳號"}
                </h2>
              </div>

              <button
                type="button"
                className="settings-modal-close"
                onClick={
                  closeUserForm
                }
              >
                ×
              </button>
            </div>

            <form
              className="settings-user-form"
              onSubmit={
                handleSubmitUser
              }
            >
              <div className="settings-form-grid">
                <div className="settings-field">
                  <label>
                    姓名
                  </label>

                  <input
                    type="text"
                    value={
                      userForm.name
                    }
                    onChange={(
                      event,
                    ) =>
                      setUserForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          name:
                            event.target.value,
                        }),
                      )
                    }
                    disabled={
                      saving
                    }
                  />
                </div>

                <div className="settings-field">
                  <label>
                    角色
                  </label>

                  <select
                    value={
                      userForm.role
                    }
                    onChange={(
                      event,
                    ) =>
                      setUserForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          role:
                            event.target.value as DentflowUserRole,
                        }),
                      )
                    }
                    disabled={
                      saving
                    }
                  >
                    <option value="Doctor">
                      醫師
                    </option>

                    <option value="Assistant">
                      助理
                    </option>

                    <option value="Admin">
                      管理者
                    </option>

                    <option value="Accountant">
                      會計
                    </option>
                  </select>
                </div>

                <div className="settings-field">
                  <label>
                    登入帳號
                  </label>

                  <input
                    type="text"
                    value={
                      userForm.account
                    }
                    onChange={(
                      event,
                    ) =>
                      setUserForm(
                        (
                          current,
                        ) => ({
                          ...current,
                          account:
                            event.target.value,
                        }),
                      )
                    }
                    disabled={
                      saving ||
                      formMode ===
                        "edit"
                    }
                    placeholder="例如：assistant01"
                  />
                </div>

                {formMode ===
                "create" ? (
                  <div className="settings-field">
                    <label>
                      初始密碼
                    </label>

                    <input
                      type="password"
                      value={
                        userForm.password
                      }
                      onChange={(
                        event,
                      ) =>
                        setUserForm(
                          (
                            current,
                          ) => ({
                            ...current,
                            password:
                              event.target.value,
                          }),
                        )
                      }
                      disabled={
                        saving
                      }
                      placeholder="至少 8 個字元"
                    />
                  </div>
                ) : null}
              </div>

              <div className="settings-form-section">
                <div className="settings-form-section-heading">
                  <div>
                    <h3>
                      院所權限
                    </h3>

                    <p>
                      一個帳號可以被授權使用多間啟用中的院所。
                    </p>
                  </div>
                </div>

                <div className="settings-clinic-selector">
                  {clinics
                    .filter(
                      (
                        clinic,
                      ) =>
                        clinic.isActive ===
                        1 ||
                        userForm.clinicIds.includes(
                          clinic.id,
                        ),
                    )
                    .map(
                      (
                        clinic,
                      ) => {
                        const selected =
                          userForm.clinicIds.includes(
                            clinic.id,
                          );

                        const primary =
                          userForm.primaryClinicId ===
                          clinic.id;

                        return (
                          <div
                            key={
                              clinic.id
                            }
                            className={
                              selected
                                ? "settings-clinic-select-card settings-clinic-select-card-active"
                                : "settings-clinic-select-card"
                            }
                          >
                            <label>
                              <input
                                type="checkbox"
                                checked={
                                  selected
                                }
                                onChange={() =>
                                  toggleClinic(
                                    clinic.id,
                                  )
                                }
                                disabled={
                                  saving ||
                                  clinic.isActive !==
                                    1
                                }
                              />

                              <span className="settings-clinic-select-info">
                                <strong>
                                  {clinic.name}
                                </strong>

                                <small>
                                  {clinic.code}

                                  {clinic.isActive !==
                                  1
                                    ? " · 已停用"
                                    : ""}
                                </small>
                              </span>
                            </label>

                            {selected &&
                            clinic.isActive ===
                              1 ? (
                              <label className="settings-primary-clinic-radio">
                                <input
                                  type="radio"
                                  name="primaryClinic"
                                  checked={
                                    primary
                                  }
                                  onChange={() =>
                                    setUserForm(
                                      (
                                        current,
                                      ) => ({
                                        ...current,
                                        primaryClinicId:
                                          clinic.id,
                                      }),
                                    )
                                  }
                                  disabled={
                                    saving
                                  }
                                />

                                主要院所
                              </label>
                            ) : null}
                          </div>
                        );
                      },
                    )}
                </div>
              </div>

              <label className="settings-active-toggle">
                <input
                  type="checkbox"
                  checked={
                    userForm.isActive
                  }
                  onChange={(
                    event,
                  ) =>
                    setUserForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        isActive:
                          event.target.checked,
                      }),
                    )
                  }
                  disabled={
                    saving
                  }
                />

                <span>
                  <strong>
                    啟用此帳號
                  </strong>

                  <small>
                    停用後此使用者將無法登入捷晞美學牙醫系統。
                  </small>
                </span>
              </label>

              <div className="settings-modal-actions">
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={
                    closeUserForm
                  }
                  disabled={
                    saving
                  }
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="settings-primary-button"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "儲存中…"
                    : formMode ===
                        "create"
                      ? "建立帳號"
                      : "儲存變更"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* =================================================
          Clinic Modal
      ================================================= */}

      {clinicFormOpen ? (
        <div className="settings-modal-layer">
          <button
            className="settings-modal-backdrop"
            type="button"
            aria-label="關閉"
            onClick={
              closeClinicForm
            }
          />

          <div className="settings-modal settings-password-modal">
            <div className="settings-modal-header">
              <div>
                <span>
                  {clinicFormMode ===
                  "create"
                    ? "NEW CLINIC"
                    : "EDIT CLINIC"}
                </span>

                <h2>
                  {clinicFormMode ===
                  "create"
                    ? "新增院所"
                    : "編輯院所"}
                </h2>
              </div>

              <button
                type="button"
                className="settings-modal-close"
                onClick={
                  closeClinicForm
                }
                disabled={
                  saving
                }
              >
                ×
              </button>
            </div>

            <form
              className="settings-user-form"
              onSubmit={
                handleSubmitClinic
              }
            >
              <div className="settings-field">
                <label>
                  院所名稱
                </label>

                <input
                  type="text"
                  value={
                    clinicForm.name
                  }
                  onChange={(
                    event,
                  ) =>
                    setClinicForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        name:
                          event.target.value,
                      }),
                    )
                  }
                  placeholder="例如：捷晞美學牙醫 台北院"
                  disabled={
                    saving
                  }
                  autoFocus
                />
              </div>

              <div className="settings-field">
                <label>
                  院所代碼
                </label>

                <input
                  type="text"
                  value={
                    clinicForm.code
                  }
                  onChange={(
                    event,
                  ) =>
                    setClinicForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        code:
                          event.target.value
                            .toUpperCase(),
                      }),
                    )
                  }
                  placeholder="例如：JX01"
                  disabled={
                    saving
                  }
                />

                <small>
                  建議使用簡短且唯一的英文或數字代碼，例如 JX01、JX02。
                </small>
              </div>

              <div className="settings-modal-actions">
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={
                    closeClinicForm
                  }
                  disabled={
                    saving
                  }
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="settings-primary-button"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "儲存中…"
                    : clinicFormMode ===
                        "create"
                      ? "建立院所"
                      : "儲存變更"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* =================================================
          Reset Password Modal
      ================================================= */}

      {resetPasswordOpen ? (
        <div className="settings-modal-layer">
          <button
            className="settings-modal-backdrop"
            type="button"
            aria-label="關閉"
            onClick={() => {
              if (!saving) {
                setResetPasswordOpen(
                  false,
                );
              }
            }}
          />

          <div className="settings-modal settings-password-modal">
            <div className="settings-modal-header">
              <div>
                <span>
                  RESET PASSWORD
                </span>

                <h2>
                  重設密碼
                </h2>
              </div>

              <button
                type="button"
                className="settings-modal-close"
                onClick={() =>
                  setResetPasswordOpen(
                    false,
                  )
                }
                disabled={
                  saving
                }
              >
                ×
              </button>
            </div>

            <form
              className="settings-user-form"
              onSubmit={
                handleResetPassword
              }
            >
              <div className="settings-reset-user">
                將重設
                <strong>
                  {resetPasswordForm.userName}
                </strong>
                的登入密碼。
              </div>

              <div className="settings-field">
                <label>
                  新密碼
                </label>

                <input
                  type="password"
                  value={
                    resetPasswordForm.password
                  }
                  onChange={(
                    event,
                  ) =>
                    setResetPasswordForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        password:
                          event.target.value,
                      }),
                    )
                  }
                  placeholder="至少 8 個字元"
                  disabled={
                    saving
                  }
                />
              </div>

              <div className="settings-field">
                <label>
                  再次輸入新密碼
                </label>

                <input
                  type="password"
                  value={
                    resetPasswordForm.confirmPassword
                  }
                  onChange={(
                    event,
                  ) =>
                    setResetPasswordForm(
                      (
                        current,
                      ) => ({
                        ...current,
                        confirmPassword:
                          event.target.value,
                      }),
                    )
                  }
                  disabled={
                    saving
                  }
                />
              </div>

              <div className="settings-modal-actions">
                <button
                  type="button"
                  className="settings-secondary-button"
                  onClick={() =>
                    setResetPasswordOpen(
                      false,
                    )
                  }
                  disabled={
                    saving
                  }
                >
                  取消
                </button>

                <button
                  type="submit"
                  className="settings-primary-button"
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "重設中…"
                    : "確認重設密碼"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
