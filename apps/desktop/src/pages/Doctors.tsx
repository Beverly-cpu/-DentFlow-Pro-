import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  canCreate,
  canDelete,
  canManage,
  canUpdate,
} from "../utils/permissions";

import "../styles/doctors.css";

/* =========================================================
   Session
========================================================= */

const SESSION_STORAGE_KEY =
  "dentflow-auth-session";

function readSession():
  DentflowAuthSession | null {
  try {
    const raw =
      sessionStorage.getItem(
        SESSION_STORAGE_KEY,
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(
      raw,
    ) as DentflowAuthSession;
  } catch {
    return null;
  }
}

/* =========================================================
   Types
========================================================= */

type Doctor =
  DentflowDoctorRecord;

type DoctorClinic =
  DentflowDoctorClinicRecord;

type DoctorFormState = {
  name: string;

  account: string;

  password: string;

  specialty: string;

  phone: string;

  role: string;

  isActive: boolean;
};

type ClinicEditorState = {
  doctorId: number;

  doctorName: string;

  selectedClinicIds:
    number[];

  primaryClinicId:
    number | null;
};

/* =========================================================
   Helpers
========================================================= */

function emptyDoctorForm():
  DoctorFormState {
  return {
    name:
      "",

    account:
      "",

    password:
      "",

    specialty:
      "",

    phone:
      "",

    role:
      "Doctor",

    isActive:
      true,
  };
}

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

function normalizeText(
  value:
    string | null | undefined,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase();
}

/* =========================================================
   Component
========================================================= */

export default function Doctors() {
  const [
    session,
    setSession,
  ] =
    useState<
      DentflowAuthSession | null
    >(
      () =>
        readSession(),
    );

  const [
    doctors,
    setDoctors,
  ] =
    useState<
      Doctor[]
    >([]);

  const [
    doctorClinics,
    setDoctorClinics,
  ] =
    useState<
      Record<
        number,
        DoctorClinic[]
      >
    >({});

  const [
    allClinics,
    setAllClinics,
  ] =
    useState<
      DentflowClinicRecord[]
    >([]);

  const [
    form,
    setForm,
  ] =
    useState<
      DoctorFormState
    >(
      emptyDoctorForm(),
    );

  const [
    editingDoctorId,
    setEditingDoctorId,
  ] =
    useState<
      number | null
    >(null);

  const [
    clinicEditor,
    setClinicEditor,
  ] =
    useState<
      ClinicEditorState | null
    >(null);

  const [
    searchText,
    setSearchText,
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<
      "全部" |
      "啟用" |
      "停用"
    >(
      "全部",
    );

  const [
    isFormOpen,
    setIsFormOpen,
  ] =
    useState(false);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    isSaving,
    setIsSaving,
  ] =
    useState(false);

  const [
    busyDoctorId,
    setBusyDoctorId,
  ] =
    useState<
      number | null
    >(null);

  const [
    errorMessage,
    setErrorMessage,
  ] =
    useState("");

  /* =======================================================
     Permissions
  ======================================================= */

  const role =
    session?.role ??
    null;

  const canCreateDoctor =
    role !== null &&
    canCreate(
      role,
      "doctors",
    );

  const canUpdateDoctor =
    role !== null &&
    canUpdate(
      role,
      "doctors",
    );

  const canDeleteDoctor =
    role !== null &&
    canDelete(
      role,
      "doctors",
    );

  const canManageClinics =
    role !== null &&
    canManage(
      role,
      "doctors",
    );

  /* =======================================================
     Session Sync
  ======================================================= */

  useEffect(
    () => {
      const syncSession =
        () => {
          setSession(
            readSession(),
          );
        };

      window.addEventListener(
        "storage",
        syncSession,
      );

      return () => {
        window.removeEventListener(
          "storage",
          syncSession,
        );
      };
    },
    [],
  );

  /* =======================================================
     Load
  ======================================================= */

  const loadDoctors = useCallback(async () => {
    const activeSession =
      session;

    if (!activeSession) {
      setDoctors(
        [],
      );

      setDoctorClinics(
        {},
      );

      setAllClinics(
        [],
      );

      setIsLoading(
        false,
      );

      return;
    }

    try {
      setIsLoading(
        true,
      );

      setErrorMessage(
        "",
      );

      const [
        doctorRecords,
        clinicRecords,
      ] =
        await Promise.all([
          window.dentflow.doctors.list(
            activeSession.clinicId,
          ),

          window.dentflow.auth.activeClinics(),
        ]);

      setDoctors(
        doctorRecords,
      );

      setAllClinics(
        clinicRecords,
      );

      const clinicEntries =
        await Promise.all(
          doctorRecords.map(
            async (
              doctor,
            ) => {
              try {
                const memberships =
                  await window.dentflow.doctors.clinics(
                    doctor.id,
                  );

                return [
                  doctor.id,
                  memberships,
                ] as const;
              } catch {
                return [
                  doctor.id,
                  [] as DentflowDoctorClinicRecord[],
                ] as const;
              }
            },
          ),
        );

      setDoctorClinics(
        Object.fromEntries(
          clinicEntries,
        ),
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "讀取醫師資料失敗。",
        ),
      );
    } finally {
      setIsLoading(
        false,
      );
    }
  }, [session]);

  useEffect(() => {
    queueMicrotask(() => void loadDoctors());
  }, [loadDoctors]);

  /* =======================================================
     Summary
  ======================================================= */

  const summary =
    useMemo(
      () => {
        const active =
          doctors.filter(
            (
              doctor,
            ) =>
              doctor.isActive ===
              1,
          ).length;

        const inactive =
          doctors.length -
          active;

        const multiClinic =
          doctors.filter(
            (
              doctor,
            ) =>
              (
                doctorClinics[
                  doctor.id
                ]?.length ??
                0
              ) >
              1,
          ).length;

        return {
          total:
            doctors.length,

          active,

          inactive,

          multiClinic,
        };
      },
      [
        doctors,
        doctorClinics,
      ],
    );

  /* =======================================================
     Filter
  ======================================================= */

  const filteredDoctors =
    useMemo(
      () => {
        const keyword =
          normalizeText(
            searchText,
          );

        return doctors.filter(
          (
            doctor,
          ) => {
            if (
              statusFilter ===
                "啟用" &&
              doctor.isActive !==
                1
            ) {
              return false;
            }

            if (
              statusFilter ===
                "停用" &&
              doctor.isActive !==
                0
            ) {
              return false;
            }

            if (!keyword) {
              return true;
            }

            const memberships =
              doctorClinics[
                doctor.id
              ] ?? [];

            const values = [
              doctor.name,

              doctor.account,

              doctor.specialty,

              ...memberships.flatMap(
                (
                  membership,
                ) => [
                  membership.clinicName,

                  membership.clinicCode,
                ],
              ),
            ];

            return values.some(
              (
                value,
              ) =>
                normalizeText(
                  value,
                ).includes(
                  keyword,
                ),
            );
          },
        );
      },
      [
        doctors,
        doctorClinics,
        searchText,
        statusFilter,
      ],
    );

  /* =======================================================
     Form
  ======================================================= */

  function openCreateForm() {
    if (!canCreateDoctor) {
      return;
    }

    setEditingDoctorId(
      null,
    );

    setForm(
      emptyDoctorForm(),
    );

    setIsFormOpen(
      true,
    );

    setErrorMessage(
      "",
    );
  }

  function openEditForm(
    doctor: Doctor,
  ) {
    if (!canUpdateDoctor) {
      return;
    }

    setEditingDoctorId(
      doctor.id,
    );

    setForm({
      name:
        doctor.name,

      account:
        doctor.account,

      /*
       * 修改時留空 = 保留密碼。
       */
      password:
        "",

      specialty:
        doctor.specialty,

      phone:
        doctor.phone,

      role:
        "Doctor",

      isActive:
        doctor.isActive ===
        1,
    });

    setIsFormOpen(
      true,
    );

    setErrorMessage(
      "",
    );

    window.scrollTo({
      top: 0,

      behavior:
        "smooth",
    });
  }

  function closeForm() {
    setEditingDoctorId(
      null,
    );

    setForm(
      emptyDoctorForm(),
    );

    setIsFormOpen(
      false,
    );
  }

  function updateForm<
    K extends keyof DoctorFormState
  >(
    key: K,
    value:
      DoctorFormState[K],
  ) {
    setForm(
      (
        previous,
      ) => ({
        ...previous,

        [key]:
          value,
      }),
    );
  }

  /* =======================================================
     Submit Doctor
  ======================================================= */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const activeSession =
      session;

    if (
      !activeSession ||
      (editingDoctorId === null
        ? !canCreateDoctor
        : !canUpdateDoctor)
    ) {
      return;
    }

    if (
      !form.name.trim()
    ) {
      window.alert(
        "請輸入醫師姓名。",
      );

      return;
    }

    if (
      !form.account.trim()
    ) {
      window.alert(
        "請輸入登入帳號。",
      );

      return;
    }

    if (
      editingDoctorId ===
        null &&
      !form.password
    ) {
      window.alert(
        "新增醫師時請設定登入密碼。",
      );

      return;
    }

    if (
      form.password &&
      form.password.length <
        8
    ) {
      window.alert(
        "登入密碼至少需要 8 個字元。",
      );

      return;
    }

    const input:
      DentflowDoctorInput = {
      name:
        form.name.trim(),

      account:
        form.account.trim(),

      specialty:
        form.specialty.trim(),

      phone:
        form.phone.trim(),

      isActive:
        form.isActive
          ? 1
          : 0,
    };

    if (
      form.password
    ) {
      input.password =
        form.password;
    }

    try {
      setIsSaving(
        true,
      );

      setErrorMessage(
        "",
      );

      if (
        editingDoctorId ===
        null
      ) {
        await window.dentflow.doctors.create(
          activeSession.clinicId,
          input,
        );
      } else {
        await window.dentflow.doctors.update(
          editingDoctorId,
          activeSession.clinicId,
          input,
        );
      }

      closeForm();

      await loadDoctors();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "醫師資料儲存失敗。",
        ),
      );
    } finally {
      setIsSaving(
        false,
      );
    }
  }

  /* =======================================================
     Toggle Active
  ======================================================= */

  async function toggleDoctorActive(
    doctor: Doctor,
  ) {
    const activeSession =
      session;

    if (
      !activeSession ||
      !canUpdateDoctor
    ) {
      return;
    }

    const nextActive =
      doctor.isActive ===
      1
        ? 0
        : 1;

    const action =
      nextActive ===
      1
        ? "啟用"
        : "停用";

    if (
      !window.confirm(
        `確定${action}醫師「${doctor.name}」嗎？`,
      )
    ) {
      return;
    }

    try {
      setBusyDoctorId(
        doctor.id,
      );

      setErrorMessage(
        "",
      );

      await window.dentflow.doctors.update(
        doctor.id,
        activeSession.clinicId,
        {
          name:
            doctor.name,

          account:
            doctor.account,

          specialty:
            doctor.specialty,

          phone:
            doctor.phone,

          isActive:
            nextActive,
        },
      );

      await loadDoctors();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          `${action}醫師失敗。`,
        ),
      );
    } finally {
      setBusyDoctorId(
        null,
      );
    }
  }

  /* =======================================================
     Delete
  ======================================================= */

  async function handleDelete(
    doctor: Doctor,
  ) {
    const activeSession =
      session;

    if (
      !activeSession ||
      !canDeleteDoctor
    ) {
      return;
    }

    if (
      !window.confirm(
        `確定移除醫師「${doctor.name}」嗎？\n\n若醫師在其他院所仍有執業設定，只會移除目前院所；若已有醫療紀錄則系統會阻止真正刪除。`,
      )
    ) {
      return;
    }

    try {
      setBusyDoctorId(
        doctor.id,
      );

      setErrorMessage(
        "",
      );

      await window.dentflow.doctors.delete(
        doctor.id,
        activeSession.clinicId,
      );

      await loadDoctors();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "移除醫師失敗。",
        ),
      );
    } finally {
      setBusyDoctorId(
        null,
      );
    }
  }

  /* =======================================================
     Clinic Editor
  ======================================================= */

  function openClinicEditor(
    doctor: Doctor,
  ) {
    if (
      !canManageClinics
    ) {
      return;
    }

    const memberships =
      doctorClinics[
        doctor.id
      ] ?? [];

    const selectedClinicIds =
      memberships.map(
        (
          membership,
        ) =>
          membership.clinicId,
      );

    const primary =
      memberships.find(
        (
          membership,
        ) =>
          membership.isPrimary ===
          1,
      );

    setClinicEditor({
      doctorId:
        doctor.id,

      doctorName:
        doctor.name,

      selectedClinicIds,

      primaryClinicId:
        primary?.clinicId ??
        selectedClinicIds[
          0
        ] ??
        null,
    });
  }

  function toggleClinicSelection(
    clinicId: number,
  ) {
    setClinicEditor(
      (
        previous,
      ) => {
        if (!previous) {
          return previous;
        }

        const exists =
          previous.selectedClinicIds.includes(
            clinicId,
          );

        if (exists) {
          const next =
            previous.selectedClinicIds.filter(
              (
                id,
              ) =>
                id !==
                clinicId,
            );

          let nextPrimary =
            previous.primaryClinicId;

          if (
            nextPrimary ===
            clinicId
          ) {
            nextPrimary =
              next[0] ??
              null;
          }

          return {
            ...previous,

            selectedClinicIds:
              next,

            primaryClinicId:
              nextPrimary,
          };
        }

        const next = [
          ...previous.selectedClinicIds,

          clinicId,
        ];

        return {
          ...previous,

          selectedClinicIds:
            next,

          primaryClinicId:
            previous.primaryClinicId ??
            clinicId,
        };
      },
    );
  }

  async function saveClinicEditor() {
    if (
      !clinicEditor ||
      !canManageClinics
    ) {
      return;
    }

    if (
      clinicEditor.selectedClinicIds.length ===
      0
    ) {
      window.alert(
        "醫師至少需要一間執業院所。",
      );

      return;
    }

    if (
      clinicEditor.primaryClinicId ===
      null
    ) {
      window.alert(
        "請選擇主要院所。",
      );

      return;
    }

    if (
      !clinicEditor.selectedClinicIds.includes(
        clinicEditor.primaryClinicId,
      )
    ) {
      window.alert(
        "主要院所必須包含在執業院所中。",
      );

      return;
    }

    try {
      setBusyDoctorId(
        clinicEditor.doctorId,
      );

      setErrorMessage(
        "",
      );

      await window.dentflow.doctors.setClinics(
        clinicEditor.doctorId,
        clinicEditor.selectedClinicIds,
        clinicEditor.primaryClinicId,
      );

      setClinicEditor(
        null,
      );

      await loadDoctors();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "儲存醫師執業院所失敗。",
        ),
      );
    } finally {
      setBusyDoctorId(
        null,
      );
    }
  }

  /* =======================================================
     Render
  ======================================================= */

  return (
    <section className="doctors-page">
      {/* ===================================================
          Header
      =================================================== */}

      <header className="doctors-header">
        <div>
          <p className="doctors-eyebrow">
            C&C DENTAL
          </p>

          <h1>
            醫師管理
          </h1>

        </div>

        {canCreateDoctor && (
          <button
            type="button"
            className="doctors-primary-button"
            onClick={
              openCreateForm
            }
          >
            ＋ 新增醫師
          </button>
        )}
      </header>

      {/* ===================================================
          Current Clinic
      =================================================== */}

      {session && (
        <div className="doctors-current-clinic">
          <span>
            目前院所
          </span>

          <strong>
            {
              session.clinicName
            }
          </strong>

          {session.clinicCode && (
            <small>
              {
                session.clinicCode
              }
            </small>
          )}
        </div>
      )}

      {/* ===================================================
          Error
      =================================================== */}

      {errorMessage && (
        <div className="doctors-error">
          {
            errorMessage
          }
        </div>
      )}

      {/* ===================================================
          Form
      =================================================== */}

      {isFormOpen &&
        (editingDoctorId === null
          ? canCreateDoctor
          : canUpdateDoctor) && (
          <form
            className="doctors-form-card"
            onSubmit={
              handleSubmit
            }
          >
            <div className="doctors-form-header">
              <div>
                <h2>
                  {editingDoctorId ===
                  null
                    ? "新增醫師"
                    : "編輯醫師"}
                </h2>

                <p>
                  建立或修改後，登入帳號會同步到 Doctor 使用者帳號。
                </p>
              </div>

              <button
                type="button"
                className="doctors-secondary-button"
                onClick={
                  closeForm
                }
              >
                關閉
              </button>
            </div>

            <div className="doctors-form-grid">
              <label>
                醫師姓名

                <input
                  value={
                    form.name
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="例如：王大明"
                  autoComplete="off"
                />
              </label>

              <label>
                登入帳號

                <input
                  value={
                    form.account
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      "account",
                      event.target.value,
                    )
                  }
                  placeholder="例如：doctor.wang"
                  autoComplete="off"
                />
              </label>

              <label>
                {editingDoctorId ===
                null
                  ? "登入密碼"
                  : "新密碼（留空即不修改）"}

                <input
                  type="password"
                  value={
                    form.password
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      "password",
                      event.target.value,
                    )
                  }
                  placeholder={
                    editingDoctorId ===
                    null
                      ? "至少 8 個字元"
                      : "不修改請留空"
                  }
                  autoComplete="new-password"
                />
              </label>

              <label>
                專長

                <input
                  value={
                    form.specialty
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      "specialty",
                      event.target.value,
                    )
                  }
                  placeholder="例如：植牙、牙周、口外"
                />
              </label>

              <label>
                登入角色

                <input
                  value="Doctor"
                  readOnly
                  disabled
                />
              </label>
            </div>

            <label className="doctors-active-checkbox">
              <input
                type="checkbox"
                checked={
                  form.isActive
                }
                onChange={(
                  event,
                ) =>
                  updateForm(
                    "isActive",
                    event.target.checked,
                  )
                }
              />

              <span>
                啟用此醫師與登入帳號
              </span>
            </label>

            <div className="doctors-form-actions">
              <button
                type="button"
                className="doctors-secondary-button"
                onClick={
                  closeForm
                }
                disabled={
                  isSaving
                }
              >
                取消
              </button>

              <button
                type="submit"
                className="doctors-primary-button"
                disabled={
                  isSaving
                }
              >
                {isSaving
                  ? "儲存中…"
                  : editingDoctorId ===
                      null
                    ? "建立醫師帳號"
                    : "儲存修改"}
              </button>
            </div>
          </form>
        )}

      {/* ===================================================
          Summary
      =================================================== */}

      <div className="doctors-summary-grid">
        <div className="doctors-summary-card">
          <span>
            目前院所醫師
          </span>

          <strong>
            {
              summary.total
            }
          </strong>
        </div>

        <div className="doctors-summary-card">
          <span>
            啟用
          </span>

          <strong>
            {
              summary.active
            }
          </strong>
        </div>

        <div className="doctors-summary-card">
          <span>
            停用
          </span>

          <strong>
            {
              summary.inactive
            }
          </strong>
        </div>

        <div className="doctors-summary-card">
          <span>
            多院所醫師
          </span>

          <strong>
            {
              summary.multiClinic
            }
          </strong>
        </div>
      </div>

      {/* ===================================================
          Search / Filter
      =================================================== */}

      <div className="doctors-toolbar">
        <input
          className="doctors-search"
          value={
            searchText
          }
          onChange={(
            event,
          ) =>
            setSearchText(
              event.target.value,
            )
          }
          placeholder="搜尋姓名、帳號、專長、院所..."
        />

        <select
          value={
            statusFilter
          }
          onChange={(
            event,
          ) =>
            setStatusFilter(
              event.target.value as
                | "全部"
                | "啟用"
                | "停用",
            )
          }
        >
          <option value="全部">
            全部狀態
          </option>

          <option value="啟用">
            啟用
          </option>

          <option value="停用">
            停用
          </option>
        </select>

        <span className="doctors-result-count">
          共{" "}
          {
            filteredDoctors.length
          }{" "}
          位
        </span>
      </div>

      {/* ===================================================
          List
      =================================================== */}

      {isLoading ? (
        <div className="doctors-empty">
          醫師資料讀取中…
        </div>
      ) : filteredDoctors.length ===
        0 ? (
        <div className="doctors-empty">
          尚無符合條件的醫師資料
        </div>
      ) : (
        <div className="doctors-list">
          {filteredDoctors.map(
            (
              doctor,
            ) => {
              const memberships =
                doctorClinics[
                  doctor.id
                ] ?? [];

              const primaryClinic =
                memberships.find(
                  (
                    membership,
                  ) =>
                    membership.isPrimary ===
                    1,
                );

              const busy =
                busyDoctorId ===
                doctor.id;

              return (
                <article
                  key={
                    doctor.id
                  }
                  className="doctor-card"
                >
                  {/* =======================================
                      Header
                  ======================================= */}

                  <div className="doctor-card-header">
                    <div>
                      <div className="doctor-name-row">
                        <h2>
                          {
                            doctor.name
                          }
                        </h2>

                        <span
                          className={
                            doctor.isActive ===
                            1
                              ? "doctor-status doctor-status-active"
                              : "doctor-status doctor-status-inactive"
                          }
                        >
                          {doctor.isActive ===
                          1
                            ? "啟用"
                            : "停用"}
                        </span>
                      </div>

                      <div className="doctor-account">
                        登入帳號：
                        <strong>
                          {
                            doctor.account
                          }
                        </strong>
                      </div>
                    </div>

                    <div className="doctor-actions">
                      {canUpdateDoctor && (
                        <button
                          type="button"
                          className="doctors-secondary-button"
                          onClick={() =>
                            openEditForm(
                              doctor,
                            )
                          }
                          disabled={
                            busy
                          }
                        >
                          編輯
                        </button>
                      )}

                      {canManageClinics && (
                        <button
                          type="button"
                          className="doctors-secondary-button"
                          onClick={() =>
                            openClinicEditor(
                              doctor,
                            )
                          }
                          disabled={
                            busy
                          }
                        >
                          執業院所
                        </button>
                      )}

                      {canUpdateDoctor && (
                        <button
                          type="button"
                          className="doctors-secondary-button"
                          onClick={() =>
                            void toggleDoctorActive(
                              doctor,
                            )
                          }
                          disabled={
                            busy
                          }
                        >
                          {doctor.isActive ===
                          1
                            ? "停用"
                            : "啟用"}
                        </button>
                      )}

                      {canDeleteDoctor && (
                        <button
                          type="button"
                          className="doctors-danger-button"
                          onClick={() =>
                            void handleDelete(
                              doctor,
                            )
                          }
                          disabled={
                            busy
                          }
                        >
                          移除
                        </button>
                      )}
                    </div>
                  </div>

                  {/* =======================================
                      Details
                  ======================================= */}

                  <div className="doctor-detail-grid">
                    <div>
                      <span>
                        專長
                      </span>

                      <strong>
                        {doctor.specialty ||
                          "—"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        土城院所
                      </span>

                      <strong>
                        {primaryClinic?.clinicName ??
                          "尚未設定"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        執業院所數
                      </span>

                      <strong>
                        {
                          memberships.length
                        }
                      </strong>
                    </div>
                  </div>

                  {/* =======================================
                      Clinics
                  ======================================= */}

                  <div className="doctor-clinics-section">
                    <div className="doctor-clinics-title">
                      執業院所
                    </div>

                    {memberships.length ===
                    0 ? (
                      <div className="doctor-no-clinic">
                        尚未設定執業院所
                      </div>
                    ) : (
                      <div className="doctor-clinic-badges">
                        {memberships.map(
                          (
                            membership,
                          ) => (
                            <span
                              key={
                                membership.clinicId
                              }
                              className={
                                membership.isPrimary ===
                                1
                                  ? "doctor-clinic-badge doctor-clinic-primary"
                                  : "doctor-clinic-badge"
                              }
                            >
                              {
                                membership.clinicName
                              }

                              {membership.clinicCode
                                ? ` · ${membership.clinicCode}`
                                : ""}

                              {membership.isPrimary ===
                              1
                                ? " · 主要"
                                : ""}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </div>

                  <div className="doctor-card-footer">
                    <span>
                      建立：
                      {
                        doctor.createdAt
                      }
                    </span>

                    <span>
                      更新：
                      {
                        doctor.updatedAt
                      }
                    </span>
                  </div>
                </article>
              );
            },
          )}
        </div>
      )}

      {/* ===================================================
          Clinic Editor
      =================================================== */}

      {clinicEditor &&
        canManageClinics && (
          <div className="doctor-clinic-modal-backdrop">
            <div className="doctor-clinic-modal">
              <div className="doctor-clinic-modal-header">
                <div>
                  <h2>
                    執業院所設定
                  </h2>

                  <p>
                    {
                      clinicEditor.doctorName
                    }
                  </p>
                </div>

                <button
                  type="button"
                  className="doctors-secondary-button"
                  onClick={() =>
                    setClinicEditor(
                      null,
                    )
                  }
                >
                  關閉
                </button>
              </div>

              <div className="doctor-clinic-options">
                {allClinics.map(
                  (
                    clinic,
                  ) => {
                    const selected =
                      clinicEditor.selectedClinicIds.includes(
                        clinic.id,
                      );

                    const primary =
                      clinicEditor.primaryClinicId ===
                      clinic.id;

                    return (
                      <div
                        key={
                          clinic.id
                        }
                        className={
                          selected
                            ? "doctor-clinic-option doctor-clinic-option-selected"
                            : "doctor-clinic-option"
                        }
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              selected
                            }
                            onChange={() =>
                              toggleClinicSelection(
                                clinic.id,
                              )
                            }
                          />

                          <div>
                            <strong>
                              {
                                clinic.name
                              }
                            </strong>

                            <small>
                              {
                                clinic.code
                              }
                            </small>
                          </div>
                        </label>

                        <label className="doctor-primary-radio">
                          <input
                            type="radio"
                            name="doctor-primary-clinic"
                            disabled={
                              !selected
                            }
                            checked={
                              primary
                            }
                            onChange={() =>
                              setClinicEditor(
                                (
                                  previous,
                                ) =>
                                  previous
                                    ? {
                                        ...previous,

                                        primaryClinicId:
                                          clinic.id,
                                      }
                                    : previous,
                              )
                            }
                          />

                          土城院所
                        </label>
                      </div>
                    );
                  },
                )}
              </div>

              <div className="doctor-clinic-modal-actions">
                <button
                  type="button"
                  className="doctors-secondary-button"
                  onClick={() =>
                    setClinicEditor(
                      null,
                    )
                  }
                >
                  取消
                </button>

                <button
                  type="button"
                  className="doctors-primary-button"
                  disabled={
                    busyDoctorId ===
                    clinicEditor.doctorId
                  }
                  onClick={() =>
                    void saveClinicEditor()
                  }
                >
                  {busyDoctorId ===
                  clinicEditor.doctorId
                    ? "儲存中…"
                    : "儲存執業院所"}
                </button>
              </div>
            </div>
          </div>
        )}
    </section>
  );
}
