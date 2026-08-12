import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "../styles/doctors.css";

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

type DoctorForm = {
  name: string;
  account: string;
  password: string;
  specialty: string;
  phone: string;
  role: string;
  isActive: boolean;
};

const emptyForm: DoctorForm = {
  name: "",
  account: "",
  password: "",
  specialty: "",
  phone: "",
  role: "Doctor",
  isActive: true,
};

export default function Doctors() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [form, setForm] = useState<DoctorForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadDoctors();
  }, []);

  async function loadDoctors() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const records = await window.dentflow.doctors.list();

      setDoctors(records);
    } catch (error) {
      console.error("讀取醫師失敗：", error);
      setErrorMessage("無法讀取醫師資料，請重新啟動程式後再試。");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredDoctors = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    if (!query) {
      return doctors;
    }

    return doctors.filter((doctor) =>
      [
        doctor.name,
        doctor.account,
        doctor.specialty,
        doctor.phone,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [doctors, keyword]);

  function updateForm<K extends keyof DoctorForm>(
    field: K,
    value: DoctorForm[K],
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
    setEditingId(null);
    setForm(emptyForm);
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function handleEdit(doctor: Doctor) {
    setEditingId(doctor.id);

    setForm({
      name: doctor.name,
      account: doctor.account,

      // 編輯時絕對不要把舊密碼讀回前端
      password: "",

      specialty: doctor.specialty,
      phone: doctor.phone,
      role: doctor.role,
      isActive: doctor.isActive === 1,
    });

    setErrorMessage("");
    setIsFormOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = form.name.trim();
    const normalizedAccount = form.account.trim();

    if (!normalizedName || !normalizedAccount) {
      window.alert("醫師姓名與登入帳號為必填欄位。");
      return;
    }

    // 新增醫師時必須設定密碼
    if (editingId === null && !form.password.trim()) {
      window.alert("新增醫師時必須設定登入密碼。");
      return;
    }

    const duplicatedAccount = doctors.some(
      (doctor) =>
        doctor.account.trim().toLowerCase() ===
          normalizedAccount.toLowerCase() &&
        doctor.id !== editingId,
    );

    if (duplicatedAccount) {
      window.alert("此登入帳號已經存在。");
      return;
    }

    const doctorInput = {
      name: normalizedName,
      account: normalizedAccount,
      password: form.password.trim() || undefined,
      specialty: form.specialty.trim(),
      phone: form.phone.trim(),
      role: form.role,
      isActive: form.isActive,
    };

    try {
      setIsSaving(true);
      setErrorMessage("");

      if (editingId !== null) {
        const updatedDoctor =
          await window.dentflow.doctors.update(
            editingId,
            doctorInput,
          );

        setDoctors((previous) =>
          previous.map((doctor) =>
            doctor.id === editingId ? updatedDoctor : doctor,
          ),
        );
      } else {
        const newDoctor =
          await window.dentflow.doctors.create(doctorInput);

        setDoctors((previous) => [newDoctor, ...previous]);
      }

      resetForm();
    } catch (error) {
      console.error("儲存醫師失敗：", error);

      const message =
        error instanceof Error ? error.message : String(error);

      if (
        message.includes("UNIQUE") ||
        message.includes("account")
      ) {
        setErrorMessage("此登入帳號已存在，請使用其他帳號。");
      } else {
        setErrorMessage("醫師資料儲存失敗，請稍後再試。");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(doctor: Doctor) {
    const confirmed = window.confirm(
      `確定要刪除醫師「${doctor.name}」嗎？`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");

      await window.dentflow.doctors.delete(doctor.id);

      setDoctors((previous) =>
        previous.filter((item) => item.id !== doctor.id),
      );

      if (editingId === doctor.id) {
        resetForm();
      }
    } catch (error) {
      console.error("刪除醫師失敗：", error);
      setErrorMessage("刪除醫師失敗，請稍後再試。");
    }
  }

  return (
    <section className="doctors-page">
      <header className="doctors-header">
        <div>
          <p className="doctors-eyebrow">
            DOCTOR MANAGEMENT
          </p>

          <h1>醫師管理</h1>

          <p>
            建立多位醫師帳號，並管理登入狀態。
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openCreateForm}
        >
          ＋ 新增醫師
        </button>
      </header>

      {errorMessage && (
        <div className="doctors-error" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="doctors-toolbar">
        <input
          type="search"
          value={keyword}
          onChange={(event) =>
            setKeyword(event.target.value)
          }
          placeholder="搜尋醫師姓名、帳號或專科"
        />

        <span>
          共 {filteredDoctors.length} 位醫師
        </span>
      </div>

      {isFormOpen && (
        <form
          className="doctor-form"
          onSubmit={handleSubmit}
        >
          <div className="doctor-form-grid">
            <label>
              醫師姓名 *
              <input
                required
                value={form.name}
                onChange={(event) =>
                  updateForm(
                    "name",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              登入帳號 *
              <input
                required
                value={form.account}
                onChange={(event) =>
                  updateForm(
                    "account",
                    event.target.value,
                  )
                }
              />
            </label>

            <label>
              {editingId !== null
                ? "新密碼"
                : "登入密碼 *"}

              <input
                required={editingId === null}
                type="password"
                value={form.password}
                onChange={(event) =>
                  updateForm(
                    "password",
                    event.target.value,
                  )
                }
                placeholder={
                  editingId !== null
                    ? "留空表示不修改密碼"
                    : "請設定登入密碼"
                }
              />
            </label>

            <label>
              專科／職稱
              <input
                value={form.specialty}
                onChange={(event) =>
                  updateForm(
                    "specialty",
                    event.target.value,
                  )
                }
                placeholder="例如：植牙醫師"
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
              />
            </label>

            <label>
              帳號角色

              <select
                value={form.role}
                onChange={(event) =>
                  updateForm(
                    "role",
                    event.target.value,
                  )
                }
              >
                <option value="Doctor">
                  醫師
                </option>

                <option value="Administrator">
                  管理員
                </option>

                <option value="Assistant">
                  助理
                </option>

                <option value="Warehouse">
                  庫存管理
                </option>
              </select>
            </label>

            <label className="doctor-status">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  updateForm(
                    "isActive",
                    event.target.checked,
                  )
                }
              />

              允許此帳號登入
            </label>
          </div>

          <div className="doctor-form-actions">
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
                  : "建立醫師"}
            </button>
          </div>
        </form>
      )}

      <div className="doctors-table-card">
        <table className="doctors-table">
          <thead>
            <tr>
              <th>醫師姓名</th>
              <th>帳號</th>
              <th>專科／職稱</th>
              <th>電話</th>
              <th>角色</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td
                  className="empty-state"
                  colSpan={7}
                >
                  讀取醫師資料中…
                </td>
              </tr>
            ) : filteredDoctors.length === 0 ? (
              <tr>
                <td
                  className="empty-state"
                  colSpan={7}
                >
                  尚無醫師資料
                </td>
              </tr>
            ) : (
              filteredDoctors.map((doctor) => (
                <tr key={doctor.id}>
                  <td className="doctor-name">
                    {doctor.name}
                  </td>
                      <td>{doctor.account}</td>

                  <td>
                    {doctor.specialty || "—"}
                  </td>

                  <td>
                    {doctor.phone || "—"}
                  </td>

                  <td>
                    {doctor.role}
                  </td>

                  <td>
                    <span
                      className={
                        doctor.isActive === 1
                          ? "status-active"
                          : "status-disabled"
                      }
                    >
                      {doctor.isActive === 1
                        ? "啟用"
                        : "停用"}
                    </span>
                  </td>

                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        onClick={() =>
                          handleEdit(doctor)
                        }
                      >
                        編輯
                      </button>

                      <button
                        className="danger-action"
                        type="button"
                        onClick={() => {
                          void handleDelete(doctor);
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}