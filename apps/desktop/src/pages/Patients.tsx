import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "../styles/Patients.css";

type Patient = {
  id: number;
  chartNumber: string;
  name: string;
  birthDate: string;
  phone: string;
  doctor: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

type Doctor = {
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

type PatientForm = {
  chartNumber: string;
  name: string;
  birthDate: string;
  phone: string;
  doctor: string;
  note: string;
};

const emptyForm: PatientForm = {
  chartNumber: "",
  name: "",
  birthDate: "",
  phone: "",
  doctor: "",
  note: "",
};

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [form, setForm] = useState<PatientForm>(emptyForm);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [keyword, setKeyword] = useState("");

  const [isFormOpen, setIsFormOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadPatients();
    void loadDoctors();
  }, []);

  async function loadPatients() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const records = await window.dentflow.patients.list();

      setPatients(records);
    } catch (error) {
      console.error("讀取病患資料失敗：", error);

      setErrorMessage(
        "無法讀取病患資料，請重新啟動程式後再試。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDoctors() {
    try {
      const records = await window.dentflow.doctors.list();

      const activeDoctors = records.filter(
        (doctor) =>
          doctor.isActive === 1 &&
          doctor.role === "Doctor",
      );

      setDoctors(activeDoctors);
    } catch (error) {
      console.error("讀取醫師清單失敗：", error);
    }
  }

  const filteredPatients = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    if (!query) {
      return patients;
    }

    return patients.filter((patient) =>
      [
        patient.chartNumber,
        patient.name,
        patient.phone,
        patient.doctor,
      ].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [keyword, patients]);

  function updateForm(
    field: keyof PatientForm,
    value: string,
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);

    setEditingId(null);

    setIsFormOpen(false);

    setErrorMessage("");
  }

  function openCreateForm() {
    setForm(emptyForm);

    setEditingId(null);

    setErrorMessage("");

    setIsFormOpen(true);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedForm: PatientForm = {
      chartNumber: form.chartNumber.trim(),
      name: form.name.trim(),
      birthDate: form.birthDate,
      phone: form.phone.trim(),
      doctor: form.doctor.trim(),
      note: form.note.trim(),
    };

    if (
      !normalizedForm.chartNumber ||
      !normalizedForm.name
    ) {
      window.alert(
        "病歷號與病患姓名為必填欄位。",
      );

      return;
    }

    const duplicateChartNumber = patients.some(
      (patient) =>
        patient.chartNumber
          .trim()
          .toLowerCase() ===
          normalizedForm.chartNumber.toLowerCase() &&
        patient.id !== editingId,
    );

    if (duplicateChartNumber) {
      window.alert(
        "此病歷號已經存在。",
      );

      return;
    }

    try {
      setIsSaving(true);

      setErrorMessage("");

      if (editingId !== null) {
        const updatedPatient =
          await window.dentflow.patients.update(
            editingId,
            normalizedForm,
          );

        setPatients((previous) =>
          previous.map((patient) =>
            patient.id === editingId
              ? updatedPatient
              : patient,
          ),
        );
      } else {
        const newPatient =
          await window.dentflow.patients.create(
            normalizedForm,
          );

        setPatients((previous) => [
          newPatient,
          ...previous,
        ]);
      }

      resetForm();
    } catch (error) {
      console.error(
        "儲存病患資料失敗：",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      if (
        message.includes("UNIQUE") ||
        message.includes("chartNumber")
      ) {
        setErrorMessage(
          "此病歷號已存在，請使用其他病歷號。",
        );
      } else {
        setErrorMessage(
          "病患資料儲存失敗，請稍後再試。",
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleEdit(patient: Patient) {
    setEditingId(patient.id);

    setForm({
      chartNumber: patient.chartNumber,
      name: patient.name,
      birthDate: patient.birthDate,
      phone: patient.phone,
      doctor: patient.doctor,
      note: patient.note,
    });

    setErrorMessage("");

    setIsFormOpen(true);
  }

  async function handleDelete(patient: Patient) {
    const confirmed = window.confirm(
      `確定要刪除病患「${patient.name}」嗎？`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");

      await window.dentflow.patients.delete(
        patient.id,
      );

      setPatients((previous) =>
        previous.filter(
          (item) => item.id !== patient.id,
        ),
      );

      if (editingId === patient.id) {
        resetForm();
      }
    } catch (error) {
      console.error(
        "刪除病患失敗：",
        error,
      );

      setErrorMessage(
        "刪除病患失敗，請稍後再試。",
      );
    }
  }

  return (
    <section className="patients-page">
      <header className="patients-header">
        <div>
          <p className="patients-eyebrow">
            PATIENT MANAGEMENT
          </p>

          <h1>病患管理</h1>

          <p>
            管理病患基本資料與後續植體使用紀錄。
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openCreateForm}
        >
          ＋ 新增病患
        </button>
      </header>

      {errorMessage && (
        <div
          className="patients-error"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <div className="patients-toolbar">
        <input
          type="search"
          value={keyword}
          onChange={(event) =>
            setKeyword(event.target.value)
          }
          placeholder="搜尋姓名、病歷號、電話或醫師"
          aria-label="搜尋病患"
        />

        <span>
          共 {filteredPatients.length} 位病患
        </span>
      </div>

      {isFormOpen && (
        <form
          className="patient-form"
          onSubmit={handleSubmit}
        >
          <div className="form-heading">
            <div>
              <h2>
                {editingId !== null
                  ? "編輯病患"
                  : "新增病患"}
              </h2>

              <p>
                病歷號與姓名為必填欄位。
              </p>
            </div>

            <button
              className="text-button"
              type="button"
              onClick={resetForm}
              disabled={isSaving}
            >
              關閉
            </button>
          </div>

          <div className="form-grid">
            <label>
              病歷號 *

              <input
                required
                value={form.chartNumber}
                onChange={(event) =>
                  updateForm(
                    "chartNumber",
                    event.target.value,
                  )
                }
                placeholder="例如：P20260001"
              />
            </label>

            <label>
              姓名 *

              <input
                required
                value={form.name}
                onChange={(event) =>
                  updateForm(
                    "name",
                    event.target.value,
                  )
                }
                placeholder="病患姓名"
              />
            </label>

            <label>
              出生日期

              <input
                type="date"
                value={form.birthDate}
                onChange={(event) =>
                  updateForm(
                    "birthDate",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              聯絡電話

              <input
                value={form.phone}
                onChange={(event) =>
                  updateForm(
                    "phone",
                    event.target.value,
                  )
                }
                placeholder="09xx-xxx-xxx"
              />
            </label>

            <label>
              主治醫師

              <select
                value={form.doctor}
                onChange={(event) =>
                  updateForm(
                    "doctor",
                    event.target.value,
                  )
                }
              >
                <option value="">
                  請選擇主治醫師
                </option>

                {doctors.map((doctor) => (
                  <option
                    key={doctor.id}
                    value={doctor.name}
                  >
                    {doctor.name}
                    {doctor.specialty
                      ? `｜${doctor.specialty}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="full-width">
              備註

                  <textarea
                rows={3}
                value={form.note}
                onChange={(event) =>
                  updateForm(
                    "note",
                    event.target.value,
                  )
                }
                placeholder="過敏史、注意事項或其他備註"
              />
            </label>
          </div>

          <div className="form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={resetForm}
              disabled={isSaving}
            >
              取消
            </button>

            <button
              className="primary-button"
              type="submit"
              disabled={isSaving}
            >
              {isSaving
                ? "儲存中…"
                : editingId !== null
                  ? "儲存修改"
                  : "建立病患"}
            </button>
          </div>
        </form>
      )}

      <div className="patients-table-card">
        <table className="patients-table">
          <thead>
            <tr>
              <th>病歷號</th>
              <th>姓名</th>
              <th>出生日期</th>
              <th>電話</th>
              <th>主治醫師</th>
              <th>操作</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td
                  className="empty-state"
                  colSpan={6}
                >
                  讀取病患資料中…
                </td>
              </tr>
            ) : filteredPatients.length === 0 ? (
              <tr>
                <td
                  className="empty-state"
                  colSpan={6}
                >
                  尚無病患資料
                </td>
              </tr>
            ) : (
              filteredPatients.map(
                (patient) => (
                  <tr key={patient.id}>
                    <td>
                      {patient.chartNumber}
                    </td>

                    <td className="patient-name">
                      {patient.name}
                    </td>

                    <td>
                      {patient.birthDate || "—"}
                    </td>

                    <td>
                      {patient.phone || "—"}
                    </td>

                    <td>
                      {patient.doctor || "—"}
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          onClick={() =>
                            handleEdit(patient)
                          }
                        >
                          編輯
                        </button>

                        <button
                          className="danger-action"
                          type="button"
                          onClick={() => {
                            void handleDelete(
                              patient,
                            );
                          }}
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
  );
}