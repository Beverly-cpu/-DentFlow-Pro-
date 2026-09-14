import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useOutletContext,
} from "react-router-dom";

import type {
  FormEvent,
} from "react";

import type {
  DentflowMainLayoutContext,
} from "../layouts/MainLayout";

import {
  canAccessModule,
  canCreate as canCreateModule,
  canDelete as canDeleteModule,
  canUpdate as canUpdateModule,
} from "../utils/permissions";

import "../styles/Patients.css";

/* =========================================================
   Local Types
========================================================= */

type PatientRow =
  DentflowPatientRecord & {
    clinicName?: string;
    clinicCode?: string;
  };

type PatientForm = {
  chartNumber: string;
  name: string;
  birthDate: string;
  phone: string;
  doctor: string;
  note: string;
};

/* =========================================================
   Helpers
========================================================= */

function createEmptyForm():
  PatientForm {
  return {
    chartNumber: "",
    name: "",
    birthDate: "",
    phone: "",
    doctor: "",
    note: "",
  };
}

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

/* =========================================================
   Main
========================================================= */

export default function Patients() {
  const {
    session,
    clinicScope,
    isAllClinics,
  } =
    useOutletContext<
      DentflowMainLayoutContext
    >();

  const [
    patients,
    setPatients,
  ] =
    useState<
      PatientRow[]
    >([]);

  const [
    doctors,
    setDoctors,
  ] =
    useState<
      DentflowDoctorRecord[]
    >([]);

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

  const [
    search,
    setSearch,
  ] =
    useState("");

<<<<<<< Updated upstream
  async function loadPatients() {
=======
  const [
    formOpen,
    setFormOpen,
  ] =
    useState(false);

  const [
    editingPatientId,
    setEditingPatientId,
  ] =
    useState<
      number | null
    >(null);

  const [
    form,
    setForm,
  ] =
    useState<PatientForm>(
      createEmptyForm(),
    );

  /* =======================================================
     Permissions / Scope
  ======================================================= */

  const role =
    session.role;

  const isDoctor =
    role === "Doctor";

  const canView =
    canAccessModule(
      role,
      "patients",
    );

  const activeClinicId =
    clinicScope.mode ===
    "clinic"
      ? clinicScope.clinicId
      : session.clinicId;

  /*
   * 「我的全部院所」只提供跨院所瀏覽。
   * 新增 / 編輯 / 刪除一律要求先切回單一院所。
   */
  const isReadOnlyScope =
    isDoctor &&
    isAllClinics;

  const canCreate =
    !isReadOnlyScope &&
    canCreateModule(
      role,
      "patients",
    );

  const canEdit =
    !isReadOnlyScope &&
    canUpdateModule(
      role,
      "patients",
    );

  const canDelete =
    !isReadOnlyScope &&
    canDeleteModule(
      role,
      "patients",
    );

  /* =======================================================
     Load
  ======================================================= */

  useEffect(
    () => {
      void loadData();
    },
    [
      session.userId,
      session.clinicId,
      session.role,
      clinicScope.mode,
      clinicScope.mode ===
        "clinic"
        ? clinicScope.clinicId
        : 0,
    ],
  );

  async function loadData() {
>>>>>>> Stashed changes
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      if (
        isDoctor &&
        isAllClinics
      ) {
        const records =
          await window.dentflow.patients.byDoctorUserAllClinics(
            session.userId,
          );

        setPatients(
          records,
        );

        setDoctors(
          [],
        );

        return;
      }

      const [
        patientRecords,
        doctorRecords,
      ] =
        await Promise.all([
          window.dentflow.patients.list(
            activeClinicId,
          ),

          window.dentflow.doctors.active(
            activeClinicId,
          ),
        ]);

      setPatients(
        patientRecords.map(
          (patient) => ({
            ...patient,

            clinicName:
              session.clinicName,

            clinicCode:
              session.clinicCode,
          }),
        ),
      );

      setDoctors(
        doctorRecords,
      );
    } catch (
      loadError
    ) {
      setPatients([]);
      setDoctors([]);

      setError(
        getErrorMessage(
          loadError,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    await loadData();
  }

  /* =======================================================
     Search
  ======================================================= */

  const filteredPatients =
    useMemo(
      () => {
        const keyword =
          search
            .trim()
            .toLowerCase();

        if (!keyword) {
          return patients;
        }

        return patients.filter(
          (patient) => {
            const haystack =
              [
                patient.chartNumber,
                patient.name,
                patient.birthDate,
                patient.phone,
                patient.doctor,
                patient.note,
                patient.clinicName,
                patient.clinicCode,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              keyword,
            );
          },
        );
      },
      [
        patients,
        search,
      ],
    );

  /* =======================================================
     Form
  ======================================================= */

  function openCreate() {
    if (!canCreate) {
      return;
    }

    setEditingPatientId(
      null,
    );

    setForm(
      createEmptyForm(),
    );

    setError("");
    setSuccess("");
    setFormOpen(
      true,
    );
  }

  function openEdit(
    patient:
      PatientRow,
  ) {
    if (!canEdit) {
      return;
    }

    if (
      patient.clinicId !==
      activeClinicId
    ) {
      setError(
        "請先切換到此病患所屬院所，再進行編輯。",
      );

<<<<<<< Updated upstream
      setDoctors(activeDoctors);
    } catch (error) {
      console.error("讀取醫師清單失敗：", error);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadPatients();
      void loadDoctors();
    });
  }, []);

  const filteredPatients = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    if (!query) {
      return patients;
=======
      return;
>>>>>>> Stashed changes
    }

    setEditingPatientId(
      patient.id,
    );

    setForm({
      chartNumber:
        patient.chartNumber,

      name:
        patient.name,

      birthDate:
        patient.birthDate,

      phone:
        patient.phone,

      doctor:
        patient.doctor,

      note:
        patient.note,
    });

    setError("");
    setSuccess("");
    setFormOpen(
      true,
    );
  }

  function closeForm() {
    if (saving) {
      return;
    }

    setFormOpen(
      false,
    );

    setEditingPatientId(
      null,
    );

    setForm(
      createEmptyForm(),
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      editingPatientId === null
        ? !canCreate
        : !canEdit
    ) {
      return;
    }

    const chartNumber =
      form.chartNumber.trim();

    const name =
      form.name.trim();

    if (!chartNumber) {
      setError(
        "請輸入病歷號。",
      );

      return;
    }

    if (!name) {
      setError(
        "請輸入病患姓名。",
      );

      return;
    }

    const input = {
      chartNumber,
      name,

      birthDate:
        form.birthDate,

      phone:
        form.phone.trim(),

      doctor:
        form.doctor.trim(),

      note:
        form.note.trim(),
    };

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (
        editingPatientId ===
        null
      ) {
        await window.dentflow.patients.create(
          activeClinicId,
          input,
        );

        setSuccess(
          "病患資料已新增。",
        );
      } else {
        await window.dentflow.patients.update(
          editingPatientId,
          activeClinicId,
          input,
        );

        setSuccess(
          "病患資料已更新。",
        );
      }

      setFormOpen(
        false,
      );

      setEditingPatientId(
        null,
      );

      setForm(
        createEmptyForm(),
      );

      await loadData();
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

  /* =======================================================
     Delete
  ======================================================= */

  async function handleDelete(
    patient:
      PatientRow,
  ) {
    if (!canDelete) {
      return;
    }

    if (
      patient.clinicId !==
      activeClinicId
    ) {
      setError(
        "請先切換到此病患所屬院所，再進行刪除。",
      );

      return;
    }

    const confirmed =
      window.confirm(
        `確定要刪除病患「${patient.name}」嗎？\n\n若病患已有植體或其他使用紀錄，系統可能會拒絕刪除。`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const deleted =
        await window.dentflow.patients.delete(
          patient.id,
          activeClinicId,
        );

      if (!deleted) {
        throw new Error(
          "病患刪除失敗。",
        );
      }

      setSuccess(
        "病患資料已刪除。",
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
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     Permission States
  ======================================================= */

  if (!canView) {
    return (
      <div className="patients-page">
        <div className="patients-error">
          此帳號沒有病患管理權限。
        </div>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="patients-page">
      <header className="patients-header">
        <div>
          <div className="patients-eyebrow">
            PATIENT MANAGEMENT
          </div>

          <h1>
            病患管理
          </h1>

          <p>
            {isReadOnlyScope
              ? "我的全部院所｜跨院所瀏覽模式"
              : `${session.clinicName}｜病患基本資料與主治醫師管理`}
          </p>
        </div>

        <div className="patients-header-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={
              loading
            }
            onClick={() =>
              void refresh()
            }
          >
            {loading
              ? "更新中..."
              : "重新整理"}
          </button>

          {canCreate && (
            <button
              type="button"
              className="primary-button"
              onClick={
                openCreate
              }
            >
              ＋ 新增病患
            </button>
          )}
        </div>
      </header>

      {isReadOnlyScope && (
        <div className="patients-scope-notice">
          <strong>
            我的全部院所
          </strong>

          <span>
            目前為跨院所唯讀模式。若要新增、編輯或刪除病患，請先從上方院所切換器切換到目標院所。
          </span>
        </div>
      )}

      {error && (
        <div className="patients-error">
          {error}
        </div>
      )}

      {success && (
        <div className="patients-success">
          {success}
        </div>
      )}

      <section className="patients-toolbar">
        <div className="patients-search-wrap">
          <span className="patients-search-icon">
            ⌕
          </span>

          <input
            value={search}
            onChange={
              (event) =>
                setSearch(
                  event.target.value,
                )
            }
            placeholder={
              isReadOnlyScope
                ? "搜尋病歷號、姓名、電話、醫師、院所..."
                : "搜尋病歷號、姓名、電話、醫師..."
            }
          />
        </div>

        <span>
          共{" "}
          <strong>
            {filteredPatients.length}
          </strong>{" "}
          位病患
        </span>
      </section>

      {formOpen &&
        (editingPatientId === null
          ? canCreate
          : canEdit) && (
        <section className="patient-form">
          <div className="form-heading">
            <div>
              <h2>
                {editingPatientId ===
                null
                  ? "新增病患"
                  : "編輯病患"}
              </h2>

              <p>
                病歷號、姓名與主治醫師會顯示於後續病例及追溯紀錄。
              </p>
            </div>

            <button
              type="button"
              className="text-button"
              disabled={saving}
              onClick={
                closeForm
              }
            >
              關閉
            </button>
          </div>

          <form
            onSubmit={
              handleSubmit
            }
          >
            <div className="form-grid">
              <label>
                <span>
                  病歷號 *
                </span>

                <input
                  value={
                    form.chartNumber
                  }
                  onChange={
                    (event) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          chartNumber:
                            event
                              .target
                              .value,
                        }),
                      )
                  }
                  placeholder="例如：P000001"
                  autoFocus
                />
              </label>

              <label>
                <span>
                  病患姓名 *
                </span>

                <input
                  value={
                    form.name
                  }
                  onChange={
                    (event) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          name:
                            event
                              .target
                              .value,
                        }),
                      )
                  }
                  placeholder="請輸入姓名"
                />
              </label>

              <label>
                <span>
                  出生日期
                </span>

                <input
                  type="date"
                  value={
                    form.birthDate
                  }
                  onChange={
                    (event) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          birthDate:
                            event
                              .target
                              .value,
                        }),
                      )
                  }
                />
              </label>

              <label>
                <span>
                  聯絡電話
                </span>

                <input
                  value={
                    form.phone
                  }
                  onChange={
                    (event) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          phone:
                            event
                              .target
                              .value,
                        }),
                      )
                  }
                  placeholder="選填"
                />
              </label>

              <label>
                <span>
                  主治醫師
                </span>

                <select
                  value={
                    form.doctor
                  }
                  onChange={
                    (event) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          doctor:
                            event
                              .target
                              .value,
                        }),
                      )
                  }
                >
                  <option value="">
                    未指定
                  </option>

                  {doctors.map(
                    (doctor) => (
                      <option
                        key={
                          doctor.id
                        }
                        value={
                          doctor.name
                        }
                      >
                        {doctor.name}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="full-width">
                <span>
                  備註
                </span>

                <textarea
                  rows={4}
                  value={
                    form.note
                  }
                  onChange={
                    (event) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          note:
                            event
                              .target
                              .value,
                        }),
                      )
                  }
                  placeholder="選填"
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={
                  closeForm
                }
              >
                取消
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving
                  ? "儲存中..."
                  : editingPatientId ===
                      null
                    ? "建立病患"
                    : "儲存修改"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="patients-table-card">
        {loading ? (
          <div className="patients-loading">
            病患資料讀取中...
          </div>
        ) : filteredPatients.length ===
          0 ? (
          <div className="patients-empty-state">
            尚無符合條件的病患資料。
          </div>
        ) : (
          <div className="patients-table-scroll">
            <table className="patients-table">
              <thead>
                <tr>
                  {isReadOnlyScope && (
                    <th>
                      院所
                    </th>
                  )}

                  <th>
                    病歷號
                  </th>

                  <th>
                    姓名
                  </th>

                  <th>
                    出生日期
                  </th>

                  <th>
                    電話
                  </th>

                  <th>
                    主治醫師
                  </th>

                  <th>
                    備註
                  </th>

                  {!isReadOnlyScope && (
                    <th>
                      操作
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {filteredPatients.map(
                  (patient) => (
                    <tr
                      key={`${patient.clinicId}-${patient.id}`}
                    >
                      {isReadOnlyScope && (
                        <td>
                          <div className="patient-clinic">
                            <strong>
                              {patient.clinicName ||
                                "—"}
                            </strong>

                            {patient.clinicCode && (
                              <span>
                                {patient.clinicCode}
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      <td>
                        <span className="patient-chart-number">
                          {
                            patient.chartNumber
                          }
                        </span>
                      </td>

                      <td>
                        <strong className="patient-name">
                          {patient.name}
                        </strong>
                      </td>

                      <td>
                        {patient.birthDate ||
                          "—"}
                      </td>

                      <td>
                        {patient.phone ||
                          "—"}
                      </td>

                      <td>
                        {patient.doctor ||
                          "—"}
                      </td>

                      <td className="patient-note-cell">
                        {patient.note ||
                          "—"}
                      </td>

                      {!isReadOnlyScope && (
                        <td>
                          <div className="table-actions">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  openEdit(
                                    patient,
                                  )
                                }
                              >
                                編輯
                              </button>
                            )}

                            {canDelete && (
                              <button
                                type="button"
                                className="danger-action"
                                disabled={
                                  saving
                                }
                                onClick={() =>
                                  void handleDelete(
                                    patient,
                                  )
                                }
                              >
                                刪除
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
