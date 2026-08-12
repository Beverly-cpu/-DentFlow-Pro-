import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

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

type Implant = {
  id: number;
  patientId: number;
  doctorId: number | null;
  toothPosition: string;
  brand: string;
  model: string;
  diameter: string;
  length: string;
  lotNumber: string;
  expiryDate: string;
  implantDate: string;
  note: string;
  patientName: string;
  patientChartNumber: string;
  doctorName: string | null;
  createdAt: string;
  updatedAt: string;
};

type ImplantForm = {
  patientId: string;
  doctorId: string;
  toothPosition: string;
  brand: string;
  model: string;
  diameter: string;
  length: string;
  lotNumber: string;
  expiryDate: string;
  implantDate: string;
  note: string;
};

const emptyForm: ImplantForm = {
  patientId: "",
  doctorId: "",
  toothPosition: "",
  brand: "",
  model: "",
  diameter: "",
  length: "",
  lotNumber: "",
  expiryDate: "",
  implantDate: "",
  note: "",
};

export default function Implants() {
  const [implants, setImplants] = useState<Implant[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);

  const [form, setForm] = useState<ImplantForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [keyword, setKeyword] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [implantRecords, patientRecords, doctorRecords] =
        await Promise.all([
          window.dentflow.implants.list(),
          window.dentflow.patients.list(),
          window.dentflow.doctors.list(),
        ]);

      setImplants(implantRecords);
      setPatients(patientRecords);

      setDoctors(
        doctorRecords.filter(
          (doctor) =>
            doctor.isActive === 1 &&
            doctor.role === "Doctor",
        ),
      );
    } catch (error) {
      console.error("讀取植體資料失敗：", error);
      setErrorMessage("無法讀取植體資料。");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredImplants = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    if (!query) {
      return implants;
    }

    return implants.filter((implant) =>
      [
        implant.patientName,
        implant.patientChartNumber,
        implant.doctorName ?? "",
        implant.toothPosition,
        implant.brand,
        implant.model,
        implant.diameter,
        implant.length,
        implant.lotNumber,
      ].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [implants, keyword]);

  function updateForm(
    field: keyof ImplantForm,
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
    setEditingId(null);
    setForm(emptyForm);
    setErrorMessage("");
    setIsFormOpen(true);
  }

  function handleEdit(implant: Implant) {
    setEditingId(implant.id);

    setForm({
      patientId: String(implant.patientId),
      doctorId:
        implant.doctorId === null
          ? ""
          : String(implant.doctorId),

      toothPosition: implant.toothPosition,

      brand: implant.brand,
      model: implant.model,
      diameter: implant.diameter,
      length: implant.length,

      lotNumber: implant.lotNumber,
      expiryDate: implant.expiryDate,
      implantDate: implant.implantDate,

      note: implant.note,
    });

    setErrorMessage("");
    setIsFormOpen(true);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form.patientId) {
      window.alert("請選擇病患。");
      return;
    }

    if (!form.toothPosition.trim()) {
      window.alert("請輸入牙位。");
      return;
    }

    const payload = {
      patientId: Number(form.patientId),

      doctorId:
        form.doctorId === ""
          ? null
          : Number(form.doctorId),

      toothPosition: form.toothPosition.trim(),

      brand: form.brand.trim(),
      model: form.model.trim(),
      diameter: form.diameter.trim(),
      length: form.length.trim(),

      lotNumber: form.lotNumber.trim(),
      expiryDate: form.expiryDate,
      implantDate: form.implantDate,

      note: form.note.trim(),
    };

    try {
      setIsSaving(true);
      setErrorMessage("");

      if (editingId !== null) {
        const updated =
          await window.dentflow.implants.update(
            editingId,
            payload,
          );

        setImplants((previous) =>
          previous.map((implant) =>
            implant.id === editingId
              ? updated
              : implant,
          ),
        );
      } else {
        const created =
          await window.dentflow.implants.create(
            payload,
          );

        setImplants((previous) => [
          created,
          ...previous,
        ]);
      }

      resetForm();
    } catch (error) {
      console.error("儲存植體資料失敗：", error);

      setErrorMessage(
        "植體資料儲存失敗，請稍後再試。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(implant: Implant) {
    const confirmed = window.confirm(
      `確定要刪除「${implant.patientName}｜牙位 ${implant.toothPosition}」這筆植體紀錄嗎？`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");

      await window.dentflow.implants.delete(
        implant.id,
      );

      setImplants((previous) =>
        previous.filter(
          (item) => item.id !== implant.id,
        ),
      );

      if (editingId === implant.id) {
        resetForm();
      }
    } catch (error) {
      console.error("刪除植體紀錄失敗：", error);

      setErrorMessage(
        "刪除植體紀錄失敗，請稍後再試。",
      );
    }
  }

  return (
    <section style={{ padding: 32 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
          marginBottom: 24,
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#78917e",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.14em",
            }}
          >
            IMPLANT TRACKING
          </p>

          <h1
            style={{
              margin: "4px 0 8px",
              color: "#294b34",
            }}
          >
            植體追蹤
          </h1>

          <p
            style={{
              margin: 0,
              color: "#748078",
            }}
          >
            管理病患植體使用紀錄與批號追蹤。
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openCreateForm}
        >
          ＋ 新增植體紀錄
        </button>
      </header>

      {errorMessage && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            background: "#fff1f1",
            color: "#9a3f3f",
          }}
        >
          {errorMessage}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <input
          type="search"
          value={keyword}
          onChange={(event) =>
            setKeyword(event.target.value)
          }
          placeholder="搜尋病患、病歷號、醫師、品牌、LOT、牙位"
          style={{
            width: "min(600px, 100%)",
            minHeight: 44,
            padding: "0 14px",
            border: "1px solid #d7dfd8",
            borderRadius: 10,
          }}
        />

        <span
          style={{
            color: "#758078",
            fontSize: 14,
          }}
        >
          共 {filteredImplants.length} 筆
        </span>
      </div>

      {isFormOpen && (
        <form
          onSubmit={handleSubmit}
          style={{
            marginBottom: 24,
            padding: 24,
            border: "1px solid #e2e8e2",
            borderRadius: 16,
            background: "#fff",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              color: "#294b34",
            }}
          >
            {editingId !== null
              ? "編輯植體紀錄"
              : "新增植體紀錄"}
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: 18,
            }}
          >
            <label>
              病患 *

              <select
                required
                value={form.patientId}
                onChange={(event) =>
                  updateForm(
                    "patientId",
                    event.target.value,
                  )
                }
                style={fieldStyle}
              >
                <option value="">
                  請選擇病患
                </option>

                {patients.map((patient) => (
                  <option
                    key={patient.id}
                    value={patient.id}
                  >
                    {patient.chartNumber}｜{patient.name}
                  </option>
                ))}
              </select>
            </label>
               <label>
              使用醫師

              <select
                value={form.doctorId}
                onChange={(event) =>
                  updateForm(
                    "doctorId",
                    event.target.value,
                  )
                }
                style={fieldStyle}
              >
                <option value="">
                  請選擇醫師
                </option>

                {doctors.map((doctor) => (
                  <option
                    key={doctor.id}
                    value={doctor.id}
                  >
                    {doctor.name}
                    {doctor.specialty
                      ? `｜${doctor.specialty}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              牙位 *

              <input
                required
                value={form.toothPosition}
                onChange={(event) =>
                  updateForm(
                    "toothPosition",
                    event.target.value,
                  )
                }
                placeholder="例如：36"
                style={fieldStyle}
              />
            </label>

            <label>
              植入日期

              <input
                type="date"
                value={form.implantDate}
                onChange={(event) =>
                  updateForm(
                    "implantDate",
                    event.target.value,
                  )
                }
                style={fieldStyle}
              />
            </label>

            <label>
              品牌

              <input
                value={form.brand}
                onChange={(event) =>
                  updateForm(
                    "brand",
                    event.target.value,
                  )
                }
                placeholder="例如：Straumann"
                style={fieldStyle}
              />
            </label>

            <label>
              型號

              <input
                value={form.model}
                onChange={(event) =>
                  updateForm(
                    "model",
                    event.target.value,
                  )
                }
                placeholder="例如：BLX"
                style={fieldStyle}
              />
            </label>

            <label>
              直徑

              <input
                value={form.diameter}
                onChange={(event) =>
                  updateForm(
                    "diameter",
                    event.target.value,
                  )
                }
                placeholder="例如：4.1 mm"
                style={fieldStyle}
              />
            </label>

            <label>
              長度

              <input
                value={form.length}
                onChange={(event) =>
                  updateForm(
                    "length",
                    event.target.value,
                  )
                }
                placeholder="例如：10 mm"
                style={fieldStyle}
              />
            </label>

            <label>
              LOT 批號

              <input
                value={form.lotNumber}
                onChange={(event) =>
                  updateForm(
                    "lotNumber",
                    event.target.value,
                  )
                }
                placeholder="Lot Number"
                style={fieldStyle}
              />
            </label>

            <label>
              有效日期

              <input
                type="date"
                value={form.expiryDate}
                onChange={(event) =>
                  updateForm(
                    "expiryDate",
                    event.target.value,
                  )
                }
                style={fieldStyle}
              />
            </label>

            <label
              style={{
                gridColumn: "1 / -1",
              }}
            >
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
                style={{
                  ...fieldStyle,
                  paddingTop: 10,
                }}
              />
            </label>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              marginTop: 22,
            }}
          >
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
                  : "建立紀錄"}
            </button>
          </div>
        </form>
      )}

      <div
        style={{
          overflowX: "auto",
          border: "1px solid #e2e8e2",
          borderRadius: 16,
          background: "#fff",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 1100,
            borderCollapse: "collapse",
          }}
        >
          <thead>
            <tr>
              {[
                "病歷號",
                "病患",
                "牙位",
                "品牌",
                "型號",
                "規格",
                "LOT",
                "植入日期",
                "醫師",
                "操作",
              ].map((title) => (
                <th
                  key={title}
                  style={thStyle}
                >
                  {title}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td
                  colSpan={10}
                  style={emptyStyle}
                >
                  讀取植體資料中…
                </td>
              </tr>
            ) : filteredImplants.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  style={emptyStyle}
                >
                  尚無植體使用紀錄
                </td>
              </tr>
            ) : (
              filteredImplants.map((implant) => (
                <tr key={implant.id}>
                  <td style={tdStyle}>
                    {implant.patientChartNumber}
                  </td>

                  <td style={tdStyle}>
                    <strong>
                      {implant.patientName}
                    </strong>
                  </td>

                  <td style={tdStyle}>
                    {implant.toothPosition}
                  </td>

                  <td style={tdStyle}>
                    {implant.brand || "—"}
                  </td>

                  <td style={tdStyle}>
                    {implant.model || "—"}
                  </td>

                  <td style={tdStyle}>
                    {[
                      implant.diameter,
                      implant.length,
                    ]
                      .filter(Boolean)
                      .join(" × ") || "—"}
                  </td>

                  <td style={tdStyle}>
                    {implant.lotNumber || "—"}
                  </td>

                  <td style={tdStyle}>
                    {implant.implantDate || "—"}
                  </td>

                  <td style={tdStyle}>
                    {implant.doctorName || "—"}
                  </td>

                  <td style={tdStyle}>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleEdit(implant)
                        }
                      >
                        編輯
                      </button>

                      <button
                        type="button"
                        className="danger-action"
                        onClick={() => {
                          void handleDelete(
                            implant,
                          );
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

const fieldStyle = {
  width: "100%",
  minHeight: 42,
  marginTop: 7,
  padding: "0 12px",
  border: "1px solid #d8e0d9",
  borderRadius: 9,
  background: "#fbfcfb",
};

const thStyle = {
  padding: "14px 16px",
  borderBottom: "1px solid #e9eeea",
  background: "#f7f9f7",
  color: "#5e6c62",
  textAlign: "left" as const,
  fontSize: 13,
};
const tdStyle = {
  padding: "14px 16px",
  borderBottom: "1px solid #edf0ed",
  color: "#465148",
  fontSize: 14,
};

const emptyStyle = {
  padding: 48,
  textAlign: "center" as const,
  color: "#889089",
};