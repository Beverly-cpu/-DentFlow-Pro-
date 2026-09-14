import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useOutletContext,
} from "react-router-dom";

import type {
  DentflowMainLayoutContext,
} from "../layouts/MainLayout";

import {
  canAccessModule,
  canCreate as canCreateModule,
  canUpdate as canUpdateModule,
} from "../utils/permissions";

import type {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

/* =========================================================
   Constants
========================================================= */

const USAGE_TYPES:
  DentflowConsumableUsageType[] = [
    "連針帶線",
    "牙周藥膏",
    "冷光藥劑",
    "膠原蛋白",
    "骨粉",
    "再生膜",
    "其他耗材",
  ];

type UsageFormItem = {
  key: string;
  inventoryItemId: string;
  quantity: string;
};

type ConsumableRecord =
  DentflowConsumableUsageRecord & {
    clinicName?: string;
    clinicCode?: string;
  };

type UsageForm = {
  patientId: string;
  doctorId: string;
  usageDate: string;
  toothPosition: string;
  note: string;
  items: UsageFormItem[];
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

  return String(error);
}

function getTodayString() {
  const date =
    new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, "0");

  const day =
    String(
      date.getDate(),
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createFormItem():
  UsageFormItem {
  return {
    key:
      `${Date.now()}-${Math.random()}`,

    inventoryItemId:
      "",

    quantity:
      "1",
  };
}

function createEmptyForm():
  UsageForm {
  return {
    patientId: "",
    doctorId: "",
    usageDate:
      getTodayString(),

    toothPosition:
      "",

    note:
      "",

    items: [
      createFormItem(),
    ],
  };
}

function formatDateTime(
  value:
    string |
    null |
    undefined,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleString(
    "zh-TW",
  );
}

function getInventoryDescription(
  item:
    DentflowInventoryRecord,
) {
  const parts = [
    item.brand,
    item.model,
    item.specification,
  ].filter(Boolean);

  if (
    parts.length === 0
  ) {
    return "無其他規格";
  }

  return parts.join(
    " / ",
  );
}
function getSelectableInventory(
  inventory:
    DentflowInventoryRecord[],
  usageType:
    DentflowConsumableUsageType,
) {
  return inventory
    .filter(
      (item) => {
        const category =
          item.category.trim();

        const normalized =
          category.toLowerCase();

        /*
         * 植體 / 套件永遠不屬於一般耗材頁。
         */
        if (
          normalized === "植體" ||
          normalized === "套件" ||
          normalized === "implant" ||
          normalized === "kit"
        ) {
          return false;
        }

        /*
         * 沒有庫存不可選。
         */
        if (
          item.quantity <= 0
        ) {
          return false;
        }

        /*
         * 最重要：
         *
         * 每個耗材分頁只能使用自己分類的庫存品項。
         *
         * 連針帶線 → 只能選連針帶線
         * 牙周藥膏 → 只能選牙周藥膏
         * 冷光藥劑 → 只能選冷光藥劑
         * 膠原蛋白 → 只能選膠原蛋白
         * 骨粉 → 只能選骨粉
         * 再生膜 → 只能選再生膜
         * 其他耗材 → 只能選其他耗材
         */
        return (
          category ===
          usageType
        );
      },
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "zh-TW",
        ),
    );
}

/* =========================================================
   Main
========================================================= */

export default function Consumables() {
  const {
    session,
    clinicScope,
  } =
    useOutletContext<DentflowMainLayoutContext>();

  const isAllClinics =
    clinicScope.mode ===
    "all-clinics";

  const activeClinicId =
    clinicScope.mode ===
    "clinic"
      ? clinicScope.clinicId
      : session.clinicId;

  const [
    doctorIdentity,
    setDoctorIdentity,
  ] =
    useState<DentflowDoctorRecord | null>(
      null,
    );

  const [
    patients,
    setPatients,
  ] =
    useState<DentflowPatientRecord[]>(
      [],
    );

  const [
    doctors,
    setDoctors,
  ] =
    useState<DentflowDoctorRecord[]>(
      [],
    );

  const [
    inventory,
    setInventory,
  ] =
    useState<DentflowInventoryRecord[]>(
      [],
    );

  const [
    records,
    setRecords,
  ] =
    useState<
      ConsumableRecord[]
    >([]);

  const [
    activeType,
    setActiveType,
  ] =
    useState<
      DentflowConsumableUsageType
    >("連針帶線");

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

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<
      | "全部"
      | DentflowConsumableUsageStatus
    >("全部");

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(false);

  const [
    form,
    setForm,
  ] =
    useState<UsageForm>(
      createEmptyForm(),
    );

  const [
    detailRecord,
    setDetailRecord,
  ] =
    useState<
      ConsumableRecord | null
    >(null);

  const [
    signatureRecord,
    setSignatureRecord,
  ] =
    useState<
      ConsumableRecord | null
    >(null);

  const [
    cancelRecord,
    setCancelRecord,
  ] =
    useState<
      ConsumableRecord | null
    >(null);

  const [
    cancelReason,
    setCancelReason,
  ] =
    useState("");

  /* =======================================================
     Permissions
  ======================================================= */

  const role =
    session.role;

  const canView =
    canAccessModule(
      role,
      "consumables",
    );

  const canCreate =
    !isAllClinics &&
    canCreateModule(
      role,
      "consumables",
    );

  const canCancel =
    !isAllClinics &&
    canUpdateModule(
      role,
      "consumables",
    );

  const canSign =
    !isAllClinics &&
    canUpdateModule(
      role,
      "consumables",
    );

  const isDoctor =
    role === "Doctor";

  /* =======================================================
     Load
  ======================================================= */

  useEffect(() => {
    void loadData();
  }, [
    session.userId,
    session.role,
    session.clinicId,
    clinicScope.mode,
    clinicScope.mode === "clinic"
      ? clinicScope.clinicId
      : null,
  ]);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      if (
        isAllClinics &&
        session.role === "Doctor"
      ) {
        const doctor =
          await window.dentflow.doctors.byUserId(
            session.userId,
            session.clinicId,
          );

        if (!doctor) {
          throw new Error(
            "找不到目前登入帳號所對應的醫師資料。",
          );
        }

        setDoctorIdentity(doctor);
        setPatients([]);
        setDoctors([]);
        setInventory([]);

        const memberships =
          await window.dentflow.doctors.clinics(
            doctor.id,
          );

        const activeMemberships =
          memberships.filter(
            (membership) =>
              membership.clinicIsActive === 1,
          );

        const recordGroups =
          await Promise.all(
            activeMemberships.map(
              async (membership) => {
                const usageRecords =
                  await window.dentflow.consumables.byDoctor(
                    doctor.id,
                    membership.clinicId,
                  );

                return usageRecords.map(
                  (record) => ({
                    ...record,
                    clinicName:
                      membership.clinicName,
                    clinicCode:
                      membership.clinicCode,
                  }),
                );
              },
            ),
          );

        setRecords(recordGroups.flat());
        return;
      }

      const [
        patientRecords,
        doctorRecords,
        inventoryRecords,
      ] =
        await Promise.all([
          window.dentflow.patients.list(
            activeClinicId,
          ),
          window.dentflow.doctors.active(
            activeClinicId,
          ),
          window.dentflow.inventory.list(
            activeClinicId,
          ),
        ]);

      setPatients(patientRecords);
      setDoctors(doctorRecords);
      setInventory(inventoryRecords);

      if (session.role === "Doctor") {
        const doctor =
          await window.dentflow.doctors.byUserId(
            session.userId,
            activeClinicId,
          );

        if (!doctor) {
          throw new Error(
            "找不到目前登入帳號所對應的醫師資料。",
          );
        }

        setDoctorIdentity(doctor);

        const usageRecords =
          await window.dentflow.consumables.byDoctor(
            doctor.id,
            activeClinicId,
          );

        setRecords(
          usageRecords.map((record) => ({
            ...record,
            clinicName: session.clinicName,
            clinicCode: session.clinicCode,
          })),
        );
      } else {
        setDoctorIdentity(null);

        const usageRecords =
          await window.dentflow.consumables.list(
            activeClinicId,
          );

        setRecords(
          usageRecords.map((record) => ({
            ...record,
            clinicName: session.clinicName,
            clinicCode: session.clinicCode,
          })),
        );
      }
    } catch (loadError) {
      setPatients([]);
      setDoctors([]);
      setInventory([]);
      setRecords([]);
      setDoctorIdentity(null);
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    await loadData();
  }

  /* =======================================================
     Filters
  ======================================================= */

  const filteredRecords =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return records
        .filter(
          (record) =>
            record.usageType ===
            activeType,
        )
        .filter(
          (record) => {
            if (
              statusFilter !==
                "全部" &&
              record.status !==
                statusFilter
            ) {
              return false;
            }

            if (!keyword) {
              return true;
            }

            const itemText =
              record.items
                .map(
                  (item) =>
                    [
                      item.inventoryName,
                      item.inventoryCategory,
                      item.inventoryBrand,
                      item.inventoryModel,
                      item.inventorySpecification,
                      item.expiryDate,
                    ].join(" "),
                )
                .join(" ");

            const haystack =
              [
                record.patientName,
                record.patientChartNumber,
                record.doctorName,
                record.clinicName,
                record.clinicCode,
                record.usageDate,
                record.toothPosition,
                record.note,
                record.status,
                record.cancelReason,
                itemText,
              ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              keyword,
            );
          },
        );
    }, [
      records,
      activeType,
      search,
      statusFilter,
    ]);

  const statistics =
    useMemo(() => {
      const typeRecords =
        records.filter(
          (record) =>
            record.usageType ===
            activeType,
        );

      const pending =
        typeRecords.filter(
          (record) =>
            record.status ===
            "待醫師簽名",
        ).length;

      const signed =
        typeRecords.filter(
          (record) =>
            record.status ===
            "已簽名",
        ).length;

      const cancelled =
        typeRecords.filter(
          (record) =>
            record.status ===
            "已取消",
        ).length;

      const quantity =
        typeRecords
          .filter(
            (record) =>
              record.status !==
              "已取消",
          )
          .reduce(
            (
              total,
              record,
            ) =>
              total +
              record.items.reduce(
                (
                  itemTotal,
                  item,
                ) =>
                  itemTotal +
                  item.quantity,
                0,
              ),
            0,
          );

      return {
        total:
          typeRecords.length,

        pending,
        signed,
        cancelled,
        quantity,
      };
    }, [
      records,
      activeType,
    ]);

  const selectableInventory =
    useMemo(
      () =>
        getSelectableInventory(
          inventory,
          activeType,
        ),
      [
        inventory,
        activeType,
      ],
    );

  /* =======================================================
     Create
  ======================================================= */

  function openCreate() {
    if (!canCreate) {
      return;
    }

    setError("");
    setSuccess("");

    setForm(
      createEmptyForm(),
    );

    setCreateOpen(
      true,
    );
  }

  function closeCreate() {
    if (saving) {
      return;
    }

    setCreateOpen(
      false,
    );

    setForm(
      createEmptyForm(),
    );
  }

  function updateFormItem(
    key: string,
    patch:
      Partial<UsageFormItem>,
  ) {
    setForm(
      (current) => ({
        ...current,

        items:
          current.items.map(
            (item) =>
              item.key ===
              key
                ? {
                    ...item,
                    ...patch,
                  }
                : item,
          ),
      }),
    );
  }

  function addFormItem() {
    setForm(
      (current) => ({
        ...current,

        items: [
          ...current.items,
          createFormItem(),
        ],
      }),
    );
  }

  function removeFormItem(
    key: string,
  ) {
    setForm(
      (current) => {
        if (
          current.items.length <=
          1
        ) {
          return current;
        }

        return {
          ...current,

          items:
            current.items.filter(
              (item) =>
                item.key !==
                key,
            ),
        };
      },
    );
  }

  async function handleCreate(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !session ||
      !canCreate
    ) {
      return;
    }

    const patientId =
      Number(
        form.patientId,
      );

    const doctorId =
      Number(
        form.doctorId,
      );

    if (
      !Number.isInteger(
        patientId,
      ) ||
      patientId <= 0
    ) {
      setError(
        "請選擇病患。",
      );

      return;
    }

    if (
      !Number.isInteger(
        doctorId,
      ) ||
      doctorId <= 0
    ) {
      setError(
        "請選擇醫師。",
      );

      return;
    }

    if (
      !form.usageDate
    ) {
      setError(
        "請選擇使用日期。",
      );

      return;
    }

    const aggregated =
      new Map<
        number,
        number
      >();

    for (
      const item
      of form.items
    ) {
      const inventoryItemId =
        Number(
          item.inventoryItemId,
        );

      const quantity =
        Number(
          item.quantity,
        );

      if (
        !Number.isInteger(
          inventoryItemId,
        ) ||
        inventoryItemId <= 0
      ) {
        setError(
          "請完整選擇使用的耗材。",
        );

        return;
      }

      if (
        !Number.isInteger(
          quantity,
        ) ||
        quantity <= 0
      ) {
        setError(
          "耗材使用數量必須是大於 0 的整數。",
        );

        return;
      }

      aggregated.set(
        inventoryItemId,
        (
          aggregated.get(
            inventoryItemId,
          ) ?? 0
        ) +
          quantity,
      );
    }

    const usageItems:
      DentflowConsumableUsageItemInput[] =
      Array.from(
        aggregated.entries(),
      ).map(
        ([
          inventoryItemId,
          quantity,
        ]) => ({
          inventoryItemId,
          quantity,
        }),
      );

    for (
      const usageItem
      of usageItems
    ) {
      const inventoryItem =
        inventory.find(
          (item) =>
            item.id ===
            usageItem.inventoryItemId,
        );

      if (!inventoryItem) {
        setError(
          "找不到選擇的庫存品項，請重新整理後再試。",
        );
          
        return;
      }
        if (
  inventoryItem.category.trim() !==
  activeType
) {
  setError(
    `「${inventoryItem.name}」屬於「${inventoryItem.category}」，不能登錄在「${activeType}」使用紀錄。`,
  );

  return;
}
      if (
        usageItem.quantity >
        inventoryItem.quantity
      ) {
        setError(
          `「${inventoryItem.name}」庫存不足，目前庫存 ${inventoryItem.quantity}。`,
        );

        return;
      }
    }

    const input:
      DentflowConsumableUsageInput = {
      patientId,
      doctorId,

      usageType:
        activeType,

      usageDate:
        form.usageDate,

      toothPosition:
        form.toothPosition.trim(),

      note:
        form.note.trim(),

      items:
        usageItems,
    };

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await window.dentflow.consumables.create(
        activeClinicId,
        input,
      );

      setCreateOpen(
        false,
      );

      setForm(
        createEmptyForm(),
      );

      setSuccess(
        `${activeType}使用紀錄已建立，庫存已扣除，目前等待醫師簽名。`,
      );

      await refresh();
    } catch (
      createError
    ) {
      setError(
        getErrorMessage(
          createError,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     Sign
  ======================================================= */

  function canDoctorSignRecord(
    record:
      ConsumableRecord,
  ) {
    return (
      canSign &&
      isDoctor &&
      doctorIdentity !==
        null &&
      doctorIdentity.id ===
        record.doctorId &&
      record.status ===
        "待醫師簽名"
    );
  }

  function openSignature(
    record:
      ConsumableRecord,
  ) {
    if (
      !canDoctorSignRecord(
        record,
      )
    ) {
      setError(
        "只有此筆紀錄指定的醫師可以簽名。",
      );

      return;
    }

    setError("");
    setSuccess("");

    setSignatureRecord(
      record,
    );
  }

  async function handleSignatureSave(
    signatureDataUrl:
      string,
  ) {
    if (
      !session ||
      !doctorIdentity ||
      !signatureRecord
    ) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await window.dentflow.consumables.sign(
        signatureRecord.id,
        activeClinicId,
        doctorIdentity.id,
        signatureDataUrl,
      );

      setSignatureRecord(
        null,
      );

      setSuccess(
        "醫師簽名已完成，紀錄已正式簽署。",
      );

      await refresh();
    } catch (
      signError
    ) {
      setError(
        getErrorMessage(
          signError,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     Cancel
  ======================================================= */

  function canCancelRecord(
    record:
      ConsumableRecord,
  ) {
    return (
      canCancel &&
      record.status ===
        "待醫師簽名"
    );
  }

  function openCancel(
    record:
      ConsumableRecord,
  ) {
    if (
      !canCancelRecord(
        record,
      )
    ) {
      setError(
        "只有尚未簽名的耗材使用紀錄可以取消。",
      );

      return;
    }

    setError("");
    setSuccess("");

    setCancelReason(
      "",
    );

    setCancelRecord(
      record,
    );
  }

  function closeCancel() {
    if (saving) {
      return;
    }

    setCancelRecord(
      null,
    );

    setCancelReason(
      "",
    );
  }

  async function confirmCancel() {
    if (
      !session ||
      !cancelRecord
    ) {
      return;
    }

    const reason =
      cancelReason.trim();

    if (!reason) {
      setError(
        "請輸入取消原因。",
      );

      return;
    }

    if (
      reason.length >
      1000
    ) {
      setError(
        "取消原因不可超過 1000 個字元。",
      );

      return;
    }

    const confirmed =
      window.confirm(
        `確定要取消這筆 ${cancelRecord.usageType} 使用紀錄嗎？\n\n取消後，原本扣除的庫存會自動全部歸回，原始紀錄會保留為「已取消」。`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await window.dentflow.consumables.cancel(
        cancelRecord.id,
        activeClinicId,
        reason,
      );

      setCancelRecord(
        null,
      );

      setCancelReason(
        "",
      );

      setDetailRecord(
        null,
      );

      setSuccess(
        "耗材使用紀錄已取消，原本扣除的庫存已自動歸回。",
      );

      await refresh();
    } catch (
      cancelError
    ) {
      setError(
        getErrorMessage(
          cancelError,
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     Permission States
  ======================================================= */

  if (
    !canView
  ) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCard}>
          此帳號沒有一般耗材使用紀錄的瀏覽權限。
        </div>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  if (!canView) {
    return null;
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>
            CONSUMABLE TRACEABILITY
          </div>

          <h1 style={styles.title}>
            其他耗材
          </h1>

          <div style={styles.subtitle}>
            {isAllClinics
              ? "我的全部院所｜一般耗材使用紀錄（跨院所唯讀）"
              : `${session.clinicName}｜一般耗材使用、庫存追溯與醫師電子簽名`}
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            style={styles.primaryButton}
            onClick={openCreate}
          >
            ＋ 新增使用紀錄
          </button>
        )}
      </div>

      {error && (
        <div style={styles.errorMessage}>
          {error}
        </div>
      )}

      {success && (
        <div style={styles.successMessage}>
          {success}
        </div>
      )}

      {/* ===================================================
          Tabs
      =================================================== */}

      <div style={styles.tabs}>
        {USAGE_TYPES.map(
          (type) => (
            <button
              key={type}
              type="button"
              style={
                activeType ===
                type
                  ? {
                      ...styles.tabButton,
                      ...styles.tabButtonActive,
                    }
                  : styles.tabButton
              }
              onClick={() => {
                setActiveType(
                  type,
                );

                setSearch(
                  "",
                );

                setStatusFilter(
                  "全部",
                );
              }}
            >
              {type}
            </button>
          ),
        )}
      </div>

      {/* ===================================================
          Stats
      =================================================== */}

      <div style={styles.statsGrid}>
        <StatCard
          label="使用紀錄"
          value={
            statistics.total
          }
        />

        <StatCard
          label="有效使用數量"
          value={
            statistics.quantity
          }
        />

        <StatCard
          label="待醫師簽名"
          value={
            statistics.pending
          }
        />

        <StatCard
          label="已簽名"
          value={
            statistics.signed
          }
        />

        <StatCard
          label="已取消"
          value={
            statistics.cancelled
          }
        />
      </div>

      {/* ===================================================
          Notices
      =================================================== */}

      {isDoctor && (
        <div style={styles.doctorNotice}>
          <div>
            <strong>
              醫師簽名模式
            </strong>

            <div style={styles.noticeText}>
              {doctorIdentity
                ? isAllClinics
                  ? `目前登入：${doctorIdentity.name} 醫師。正在瀏覽您的全部執業院所；跨院所模式僅供查看，請切換至紀錄所屬院所後再簽名。`
                  : `目前登入：${doctorIdentity.name} 醫師。只有指定給您的待簽紀錄可以簽名。`
                : "正在確認醫師身分..."}
            </div>
          </div>
        </div>
      )}

      {isAllClinics && (
        <div style={styles.allClinicsNotice}>
          <strong>我的全部院所｜唯讀模式</strong>
          <div style={styles.noticeText}>
            此模式會合併顯示您各執業院所的耗材使用紀錄。為避免跨院所庫存異動，簽名、建立與取消請先由上方院所選單切換至紀錄所屬院所。
          </div>
        </div>
      )}

      {canCancel && (
        <div style={styles.cancelNotice}>
          <strong>
            取消紀錄規則
          </strong>

          <div style={styles.noticeText}>
            只有「待醫師簽名」可以取消。取消後原始紀錄不會刪除，已扣庫存會自動歸回並留下庫存異動。
          </div>
        </div>
      )}

      {/* ===================================================
          Filters
      =================================================== */}

      <div style={styles.filterCard}>
        <div style={styles.filterGrid}>
          <label style={styles.field}>
            <span style={styles.label}>
              搜尋
            </span>

            <input
              style={styles.input}
              value={search}
              onChange={
                (event) =>
                  setSearch(
                    event.target.value,
                  )
              }
              placeholder="病患、醫師、品項、規格、有效期限、取消原因..."
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>
              紀錄狀態
            </span>

            <select
              style={styles.input}
              value={statusFilter}
              onChange={
                (event) =>
                  setStatusFilter(
                    event.target.value as
                      | "全部"
                      | DentflowConsumableUsageStatus,
                  )
              }
            >
              <option value="全部">
                全部
              </option>

              <option value="待醫師簽名">
                待醫師簽名
              </option>

              <option value="已簽名">
                已簽名
              </option>

              <option value="已取消">
                已取消
              </option>
            </select>
          </label>
        </div>
      </div>

      {/* ===================================================
          Records
      =================================================== */}

      {loading ? (
        <div style={styles.emptyState}>
          使用紀錄讀取中...
        </div>
      ) : filteredRecords.length ===
        0 ? (
        <div style={styles.emptyState}>
          尚無符合條件的 {activeType} 使用紀錄。
        </div>
      ) : (
        <div style={styles.recordList}>
          {filteredRecords.map(
            (record) => (
              <UsageRecordCard
                key={record.id}
                record={record}
                canSign={
                  canDoctorSignRecord(
                    record,
                  )
                }
                canCancel={
                  canCancelRecord(
                    record,
                  )
                }
                onSign={() =>
                  openSignature(
                    record,
                  )
                }
                onCancel={() =>
                  openCancel(
                    record,
                  )
                }
                onDetail={() =>
                  setDetailRecord(
                    record,
                  )
                }
              />
            ),
          )}
        </div>
      )}

      {/* ===================================================
          Create Modal
      =================================================== */}

      {createOpen &&
        canCreate && (
          <Modal
            title={`新增${activeType}使用紀錄`}
            onClose={
              closeCreate
            }
            wide
          >
            <form
              onSubmit={
                handleCreate
              }
              style={
                styles.modalForm
              }
            >
              <div style={styles.formGrid}>
                <label style={styles.field}>
                  <span style={styles.label}>
                    病患 *
                  </span>

                  <select
                    style={styles.input}
                    value={
                      form.patientId
                    }
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            patientId:
                              event
                                .target
                                .value,
                          }),
                        )
                    }
                  >
                    <option value="">
                      請選擇病患
                    </option>

                    {patients.map(
                      (patient) => (
                        <option
                          key={
                            patient.id
                          }
                          value={
                            patient.id
                          }
                        >
                          {
                            patient.chartNumber
                          }
                          ｜{patient.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    醫師 *
                  </span>

                  <select
                    style={styles.input}
                    value={
                      form.doctorId
                    }
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            doctorId:
                              event
                                .target
                                .value,
                          }),
                        )
                    }
                  >
                    <option value="">
                      請選擇醫師
                    </option>

                    {doctors.map(
                      (doctor) => (
                        <option
                          key={
                            doctor.id
                          }
                          value={
                            doctor.id
                          }
                        >
                          {doctor.name}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    使用日期 *
                  </span>

                  <input
                    type="date"
                    style={styles.input}
                    value={
                      form.usageDate
                    }
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            usageDate:
                              event
                                .target
                                .value,
                          }),
                        )
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    牙位
                  </span>

                  <input
                    style={styles.input}
                    value={
                      form.toothPosition
                    }
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            toothPosition:
                              event
                                .target
                                .value,
                          }),
                        )
                    }
                    placeholder="選填，例如：#36"
                  />
                </label>
              </div>

              <div style={styles.sectionHeader}>
                <div>
                  <strong style={styles.sectionTitle}>
                    使用耗材
                  </strong>

                  <div style={styles.sectionDescription}>
                    一般耗材不記錄 REF / LOT，只保留品項、規格、有效期限與數量。
                  </div>
                </div>

                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={
                    addFormItem
                  }
                >
                  ＋ 增加品項
                </button>
              </div>

              <div style={styles.usageItemList}>
                {form.items.map(
                  (
                    formItem,
                    index,
                  ) => {
                    const selectedItem =
                      inventory.find(
                        (item) =>
                          item.id ===
                          Number(
                            formItem.inventoryItemId,
                          ),
                      );

                    return (
                      <div
                        key={
                          formItem.key
                        }
                        style={
                          styles.usageItemCard
                        }
                      >
                        <div style={styles.itemNumber}>
                          {index + 1}
                        </div>

                        <div style={styles.usageItemFields}>
                          <label style={styles.field}>
                            <span style={styles.label}>
                              庫存品項 *
                            </span>

                            <select
                              style={styles.input}
                              value={
                                formItem.inventoryItemId
                              }
                              onChange={
                                (
                                  event,
                                ) =>
                                  updateFormItem(
                                    formItem.key,
                                    {
                                      inventoryItemId:
                                        event
                                          .target
                                          .value,
                                    },
                                  )
                              }
                            >
                              <option value="">
                                請選擇耗材
                              </option>

                              {selectableInventory.map(
                                (
                                  item,
                                ) => (
                                  <option
                                    key={
                                      item.id
                                    }
                                    value={
                                      item.id
                                    }
                                  >
                                    {
                                      item.category
                                    }
                                    ｜{
                                      item.name
                                    }
                                    ｜{
                                      item.specification ||
                                      "無規格"
                                    }
                                    ｜庫存{" "}
                                    {
                                      item.quantity
                                    }
                                  </option>
                                ),
                              )}
                            </select>
                          </label>

                          <label style={styles.field}>
                            <span style={styles.label}>
                              使用數量 *
                            </span>

                            <input
                              type="number"
                              min="1"
                              step="1"
                              style={styles.input}
                              value={
                                formItem.quantity
                              }
                              onChange={
                                (
                                  event,
                                ) =>
                                  updateFormItem(
                                    formItem.key,
                                    {
                                      quantity:
                                        event
                                          .target
                                          .value,
                                    },
                                  )
                              }
                            />
                          </label>
                        </div>

                        {selectedItem && (
                          <div style={styles.inventoryPreview}>
                            <div>
                              <span style={styles.previewLabel}>
                                品項
                              </span>

                              <strong>
                                {
                                  selectedItem.name
                                }
                              </strong>
                            </div>

                            <div>
                              <span style={styles.previewLabel}>
                                規格
                              </span>

                              <strong>
                                {getInventoryDescription(
                                  selectedItem,
                                )}
                              </strong>
                            </div>

                            <div>
                              <span style={styles.previewLabel}>
                                有效期限
                              </span>

                              <strong>
                                {
                                  selectedItem.expiryDate ||
                                  "—"
                                }
                              </strong>
                            </div>

                            <div>
                              <span style={styles.previewLabel}>
                                現有庫存
                              </span>

                              <strong>
                                {
                                  selectedItem.quantity
                                }
                              </strong>
                            </div>
                          </div>
                        )}

                        {form.items.length >
                          1 && (
                          <button
                            type="button"
                            style={styles.removeButton}
                            onClick={() =>
                              removeFormItem(
                                formItem.key,
                              )
                            }
                          >
                            移除此品項
                          </button>
                        )}
                      </div>
                    );
                  },
                )}
              </div>

              <label style={styles.field}>
                <span style={styles.label}>
                  備註
                </span>

                <textarea
                  rows={4}
                  style={styles.textarea}
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
                />
              </label>

              <div style={styles.warningNotice}>
                建立後會立即扣除實際庫存，狀態變成「待醫師簽名」。如建立錯誤，只能在尚未簽名時使用「取消紀錄」，系統會保留原始紀錄並歸回庫存。
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  disabled={saving}
                  onClick={
                    closeCreate
                  }
                >
                  取消
                </button>

                <button
                  type="submit"
                  style={styles.primaryButton}
                  disabled={saving}
                >
                  {saving
                    ? "建立中..."
                    : "建立並扣除庫存"}
                </button>
              </div>
            </form>
          </Modal>
        )}

      {/* ===================================================
          Detail Modal
      =================================================== */}

      {detailRecord && (
        <RecordDetailModal
          record={
            detailRecord
          }
          canSign={
            canDoctorSignRecord(
              detailRecord,
            )
          }
          canCancel={
            canCancelRecord(
              detailRecord,
            )
          }
          onClose={() =>
            setDetailRecord(
              null,
            )
          }
          onSign={() => {
            const target =
              detailRecord;

            setDetailRecord(
              null,
            );

            openSignature(
              target,
            );
          }}
          onCancel={() => {
            const target =
              detailRecord;

            setDetailRecord(
              null,
            );

            openCancel(
              target,
            );
          }}
        />
      )}

      {/* ===================================================
          Signature Modal
      =================================================== */}

      {signatureRecord &&
        doctorIdentity && (
          <SignatureModal
            record={
              signatureRecord
            }
            doctor={
              doctorIdentity
            }
            saving={
              saving
            }
            onClose={() => {
              if (!saving) {
                setSignatureRecord(
                  null,
                );
              }
            }}
            onSave={
              handleSignatureSave
            }
          />
        )}

      {/* ===================================================
          Cancel Modal
      =================================================== */}

      {cancelRecord &&
        canCancel && (
          <Modal
            title="取消耗材使用紀錄"
            onClose={
              closeCancel
            }
            wide
          >
            <div style={styles.cancelWarningBox}>
              <strong style={styles.cancelWarningTitle}>
                此操作不會刪除原始紀錄
              </strong>

              <div style={styles.cancelWarningText}>
                確認取消後，此筆紀錄會變成「已取消」，原本扣除的庫存會全部歸回，並建立「耗材取消歸回」庫存異動。
              </div>
            </div>

            <div style={styles.cancelSummary}>
              <DetailItem
                label="病患"
                value={`${cancelRecord.patientChartNumber}｜${cancelRecord.patientName}`}
              />

              <DetailItem
                label="醫師"
                value={
                  cancelRecord.doctorName
                }
              />

              <DetailItem
                label="使用日期"
                value={
                  cancelRecord.usageDate
                }
              />

              <DetailItem
                label="使用類型"
                value={
                  cancelRecord.usageType
                }
              />
            </div>

            <div style={styles.cancelItems}>
              {cancelRecord.items.map(
                (item) => (
                  <div
                    key={
                      item.id
                    }
                    style={
                      styles.cancelItemRow
                    }
                  >
                    <div>
                      <strong>
                        {
                          item.inventoryName
                        }
                      </strong>

                      <div style={styles.subText}>
                        {
                          item.inventorySpecification ||
                          "無規格"
                        }
                      </div>
                    </div>

                    <div>
                      有效期限：
                      <strong>
                        {
                          item.expiryDate ||
                          "—"
                        }
                      </strong>
                    </div>

                    <div>
                      歸回數量：
                      <strong>
                        {
                          item.quantity
                        }
                      </strong>
                    </div>
                  </div>
                ),
              )}
            </div>

            <label style={styles.field}>
              <span style={styles.label}>
                取消原因 *
              </span>

              <textarea
                rows={5}
                maxLength={1000}
                style={styles.textarea}
                value={
                  cancelReason
                }
                onChange={
                  (event) => {
                    setCancelReason(
                      event.target.value,
                    );

                    setError(
                      "",
                    );
                  }
                }
                placeholder="請輸入取消原因，例如：品項登錄錯誤、病患資料選錯、數量誤植..."
              />

              <span style={styles.characterCount}>
                {cancelReason.length}
                /1000
              </span>
            </label>

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                disabled={saving}
                onClick={
                  closeCancel
                }
              >
                返回
              </button>

              <button
                type="button"
                style={
                  cancelReason.trim()
                    ? styles.dangerButton
                    : styles.disabledDangerButton
                }
                disabled={
                  saving ||
                  !cancelReason.trim()
                }
                onClick={() =>
                  void confirmCancel()
                }
              >
                {saving
                  ? "取消處理中..."
                  : "確認取消並歸回庫存"}
              </button>
            </div>
          </Modal>
        )}
    </div>
  );
}

/* =========================================================
   Usage Record Card
========================================================= */

function UsageRecordCard({
  record,
  canSign,
  canCancel,
  onSign,
  onCancel,
  onDetail,
}: {
  record:
    ConsumableRecord;

  canSign:
    boolean;

  canCancel:
    boolean;

  onSign:
    () => void;

  onCancel:
    () => void;

  onDetail:
    () => void;
}) {
  const totalQuantity =
    record.items.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.quantity,
      0,
    );

  return (
    <div
      style={
        record.status ===
        "已取消"
          ? {
              ...styles.recordCard,
              ...styles.cancelledRecordCard,
            }
          : styles.recordCard
      }
    >
      <div style={styles.recordHeader}>
        <div>
          <div style={styles.recordTitleRow}>
            <strong style={styles.recordPatient}>
              {record.patientName}
            </strong>

            <span style={styles.chartNumber}>
              {
                record.patientChartNumber
              }
            </span>

            <StatusBadge
              status={
                record.status
              }
            />
          </div>

          <div style={styles.recordMeta}>
            {record.clinicName && (
              <>
                院所：{record.clinicName}
                {record.clinicCode
                  ? `（${record.clinicCode}）`
                  : ""}
                {" "}
              </>
            )}
            使用日期：
            {record.usageDate}
            {" "}
            醫師：
            {record.doctorName}

            {record.toothPosition
              ? ` 牙位：${record.toothPosition}`
              : ""}
          </div>
        </div>

        <div style={styles.recordActions}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={
              onDetail
            }
          >
            查看內容
          </button>

          {canSign && (
            <button
              type="button"
              style={styles.signatureButton}
              onClick={
                onSign
              }
            >
              ✍ 醫師簽名
            </button>
          )}

          {canCancel && (
            <button
              type="button"
              style={styles.dangerOutlineButton}
              onClick={
                onCancel
              }
            >
              取消紀錄
            </button>
          )}
        </div>
      </div>

      <div style={styles.recordItems}>
        {record.items.map(
          (item) => (
            <div
              key={item.id}
              style={styles.recordItem}
            >
              <div>
                <strong>
                  {
                    item.inventoryName
                  }
                </strong>

                <div style={styles.subText}>
                  {[
                    item.inventoryBrand,
                    item.inventoryModel,
                    item.inventorySpecification,
                  ]
                    .filter(Boolean)
                    .join(" / ") ||
                    "無其他規格"}
                </div>
              </div>

              <div style={styles.recordItemMeta}>
                <span>
                  有效期限
                  <strong>
                    {
                      item.expiryDate ||
                      "—"
                    }
                  </strong>
                </span>

                <span>
                  使用
                  <strong>
                    {
                      item.quantity
                    }
                  </strong>
                </span>
              </div>
            </div>
          ),
        )}
      </div>

      <div style={styles.recordFooter}>
        <div>
          原始使用數量：
          <strong>
            {
              totalQuantity
            }
          </strong>
        </div>

        {record.status ===
        "已簽名" ? (
          <div style={styles.signedArea}>
            {record.doctorSignatureDataUrl && (
              <img
                src={
                  record.doctorSignatureDataUrl
                }
                alt={`${record.doctorName}醫師簽名`}
                style={
                  styles.signatureThumbnail
                }
              />
            )}

            <div>
              <strong style={styles.signedText}>
                已由{" "}
                {record.doctorName}{" "}
                醫師簽名
              </strong>

              <div style={styles.signedTime}>
                {formatDateTime(
                  record.signedAt,
                )}
              </div>
            </div>
          </div>
        ) : record.status ===
          "已取消" ? (
          <div style={styles.cancelledFooter}>
            <strong>
              已取消
            </strong>

            <span>
              {formatDateTime(
                record.cancelledAt,
              )}
            </span>
          </div>
        ) : (
          <span style={styles.pendingText}>
            等待{" "}
            {record.doctorName}{" "}
            醫師簽名
          </span>
        )}
      </div>

      {record.status ===
        "已取消" && (
        <div style={styles.cancelReasonBox}>
          <strong>
            取消原因：
          </strong>

          <span>
            {record.cancelReason ||
              "—"}
          </span>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Record Detail
========================================================= */

function RecordDetailModal({
  record,
  canSign,
  canCancel,
  onClose,
  onSign,
  onCancel,
}: {
  record:
    ConsumableRecord;

  canSign:
    boolean;

  canCancel:
    boolean;

  onClose:
    () => void;

  onSign:
    () => void;

  onCancel:
    () => void;
}) {
  return (
    <Modal
      title="耗材使用紀錄"
      onClose={
        onClose
      }
      wide
    >
      <div style={styles.detailGrid}>
        {record.clinicName && (
          <DetailItem
            label="院所"
            value={`${record.clinicName}${
              record.clinicCode
                ? `（${record.clinicCode}）`
                : ""
            }`}
          />
        )}

        <DetailItem
          label="使用類型"
          value={
            record.usageType
          }
        />

        <DetailItem
          label="使用日期"
          value={
            record.usageDate
          }
        />

        <DetailItem
          label="病患"
          value={`${record.patientChartNumber}｜${record.patientName}`}
        />

        <DetailItem
          label="醫師"
          value={
            record.doctorName
          }
        />

        <DetailItem
          label="牙位"
          value={
            record.toothPosition ||
            "—"
          }
        />

        <DetailItem
          label="狀態"
          value={
            <StatusBadge
              status={
                record.status
              }
            />
          }
        />
      </div>

      <div style={styles.detailSection}>
        <h3 style={styles.detailHeading}>
          實際使用耗材
        </h3>

        <div style={styles.detailItemList}>
          {record.items.map(
            (item) => (
              <div
                key={
                  item.id
                }
                style={
                  styles.detailUsageItem
                }
              >
                <strong>
                  {
                    item.inventoryName
                  }
                </strong>

                <span>
                  分類：
                  {
                    item.inventoryCategory ||
                    "—"
                  }
                </span>

                <span>
                  品牌：
                  {
                    item.inventoryBrand ||
                    "—"
                  }
                </span>

                <span>
                  型號：
                  {
                    item.inventoryModel ||
                    "—"
                  }
                </span>

                <span>
                  規格：
                  {
                    item.inventorySpecification ||
                    "—"
                  }
                </span>

                <span>
                  有效期限：
                  {
                    item.expiryDate ||
                    "—"
                  }
                </span>

                <span>
                  使用數量：
                  {
                    item.quantity
                  }
                </span>
              </div>
            ),
          )}
        </div>
      </div>

      {record.note && (
        <div style={styles.detailSection}>
          <h3 style={styles.detailHeading}>
            備註
          </h3>

          <div style={styles.noteBox}>
            {record.note}
          </div>
        </div>
      )}

      {record.status ===
        "已取消" && (
        <div style={styles.detailSection}>
          <h3 style={styles.detailHeading}>
            取消資訊
          </h3>

          <div style={styles.cancelDetailBox}>
            <div>
              <span style={styles.previewLabel}>
                取消時間
              </span>

              <strong>
                {formatDateTime(
                  record.cancelledAt,
                )}
              </strong>
            </div>

            <div>
              <span style={styles.previewLabel}>
                取消原因
              </span>

              <strong>
                {record.cancelReason ||
                  "—"}
              </strong>
            </div>

            <div style={styles.cancelDetailNotice}>
              此筆原始使用紀錄已保留，扣除的庫存已透過取消流程歸回。
            </div>
          </div>
        </div>
      )}

      <div style={styles.detailSection}>
        <h3 style={styles.detailHeading}>
          醫師電子簽名
        </h3>

        {record.status ===
        "已簽名" ? (
          <div style={styles.detailSignature}>
            {record.doctorSignatureDataUrl && (
              <img
                src={
                  record.doctorSignatureDataUrl
                }
                alt="醫師簽名"
                style={
                  styles.detailSignatureImage
                }
              />
            )}

            <div>
              <strong>
                {
                  record.doctorName
                }{" "}
                醫師
              </strong>

              <div style={styles.signedTime}>
                簽名時間：
                {formatDateTime(
                  record.signedAt,
                )}
              </div>
            </div>
          </div>
        ) : record.status ===
          "已取消" ? (
          <div style={styles.cancelledSignatureBox}>
            此筆紀錄已取消，不可進行醫師簽名。
          </div>
        ) : (
          <div style={styles.pendingSignatureBox}>
            尚未簽名，等待{" "}
            {record.doctorName}{" "}
            醫師確認。
          </div>
        )}
      </div>

      <div style={styles.modalActions}>
        <button
          type="button"
          style={styles.secondaryButton}
          onClick={
            onClose
          }
        >
          關閉
        </button>

        {canCancel && (
          <button
            type="button"
            style={styles.dangerOutlineButton}
            onClick={
              onCancel
            }
          >
            取消紀錄
          </button>
        )}

        {canSign && (
          <button
            type="button"
            style={styles.signatureButton}
            onClick={
              onSign
            }
          >
            ✍ 開始簽名
          </button>
        )}
      </div>
    </Modal>
  );
}

/* =========================================================
   Signature Modal
========================================================= */

function SignatureModal({
  record,
  doctor,
  saving,
  onClose,
  onSave,
}: {
  record:
    ConsumableRecord;

  doctor:
    DentflowDoctorRecord;

  saving:
    boolean;

  onClose:
    () => void;

  onSave:
    (
      dataUrl: string,
    ) =>
      Promise<void>;
}) {
  const canvasRef =
    useRef<
      HTMLCanvasElement | null
    >(null);

  const drawingRef =
    useRef(false);

  const activePointerIdRef =
    useRef<
      number | null
    >(null);

  const lastPointRef =
    useRef<{
      x: number;
      y: number;
    } | null>(null);

  const hasSignatureRef =
    useRef(false);

  const [
    hasSignature,
    setHasSignature,
  ] =
    useState(false);

  const [
    localError,
    setLocalError,
  ] =
    useState("");

  const prepareCanvas =
    useCallback(() => {
      const canvas =
        canvasRef.current;

      if (!canvas) {
        return;
      }

      const rect =
        canvas.getBoundingClientRect();

      if (
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return;
      }

      const ratio =
        Math.max(
          window.devicePixelRatio ||
            1,
          1,
        );

      canvas.width =
        Math.round(
          rect.width *
            ratio,
        );

      canvas.height =
        Math.round(
          rect.height *
            ratio,
        );

      const context =
        canvas.getContext(
          "2d",
        );

      if (!context) {
        return;
      }

      context.setTransform(
        1,
        0,
        0,
        1,
        0,
        0,
      );

      context.fillStyle =
        "#ffffff";

      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      context.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0,
      );

      context.lineCap =
        "round";

      context.lineJoin =
        "round";

      context.strokeStyle =
        "#18251f";

      context.fillStyle =
        "#18251f";

      context.lineWidth =
        2.2;

      drawingRef.current =
        false;

      activePointerIdRef.current =
        null;

      lastPointRef.current =
        null;

      hasSignatureRef.current =
        false;

      setHasSignature(
        false,
      );
    }, []);

  useEffect(() => {
    const animationFrame =
      window.requestAnimationFrame(
        prepareCanvas,
      );

    return () => {
      window.cancelAnimationFrame(
        animationFrame,
      );
    };
  }, [
    prepareCanvas,
  ]);

  function getCanvasPoint(
    event:
      ReactPointerEvent<HTMLCanvasElement>,
  ) {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect =
      canvas.getBoundingClientRect();

    return {
      x:
        event.clientX -
        rect.left,

      y:
        event.clientY -
        rect.top,
    };
  }

  function handlePointerDown(
    event:
      ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (saving) {
      return;
    }

    if (
      event.pointerType ===
        "mouse" &&
      event.button !== 0
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    const point =
      getCanvasPoint(
        event,
      );

    if (
      !canvas ||
      !point
    ) {
      return;
    }

    event.preventDefault();

    try {
      canvas.setPointerCapture(
        event.pointerId,
      );
    } catch {
      // ignore
    }

    drawingRef.current =
      true;

    activePointerIdRef.current =
      event.pointerId;

    lastPointRef.current =
      point;

    const context =
      canvas.getContext(
        "2d",
      );

    if (context) {
      context.beginPath();

      context.arc(
        point.x,
        point.y,
        1.1,
        0,
        Math.PI * 2,
      );

      context.fill();
    }

    hasSignatureRef.current =
      true;

    setHasSignature(
      true,
    );

    setLocalError(
      "",
    );
  }

  function handlePointerMove(
    event:
      ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (
      !drawingRef.current ||
      activePointerIdRef.current !==
        event.pointerId
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    const point =
      getCanvasPoint(
        event,
      );

    const previousPoint =
      lastPointRef.current;

    if (
      !canvas ||
      !point ||
      !previousPoint
    ) {
      return;
    }

    event.preventDefault();

    const context =
      canvas.getContext(
        "2d",
      );

    if (!context) {
      return;
    }

    context.beginPath();

    context.moveTo(
      previousPoint.x,
      previousPoint.y,
    );

    context.lineTo(
      point.x,
      point.y,
    );

    context.stroke();

    lastPointRef.current =
      point;

    hasSignatureRef.current =
      true;

    setHasSignature(
      true,
    );
  }

  function finishDrawing(
    event:
      ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (
      activePointerIdRef.current !==
      event.pointerId
    ) {
      return;
    }

    const canvas =
      canvasRef.current;

    drawingRef.current =
      false;

    activePointerIdRef.current =
      null;

    lastPointRef.current =
      null;

    if (
      canvas &&
      canvas.hasPointerCapture(
        event.pointerId,
      )
    ) {
      try {
        canvas.releasePointerCapture(
          event.pointerId,
        );
      } catch {
        // ignore
      }
    }
  }

  function clearSignature() {
    if (saving) {
      return;
    }

    prepareCanvas();

    setLocalError(
      "",
    );
  }

  async function confirmSignature() {
    if (saving) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (
      !canvas ||
      !hasSignatureRef.current ||
      !hasSignature
    ) {
      setLocalError(
        "請先在簽名區完成醫師簽名。",
      );

      return;
    }

    if (
      record.status !==
      "待醫師簽名"
    ) {
      setLocalError(
        "目前紀錄狀態已不允許簽名。",
      );

      return;
    }

    if (
      record.doctorId !==
      doctor.id
    ) {
      setLocalError(
        "目前登入醫師不是此筆紀錄指定醫師。",
      );

      return;
    }

    const confirmed =
      window.confirm(
        `確認以「${doctor.name} 醫師」身分簽署此筆 ${record.usageType} 使用紀錄？\n\n簽名完成後將鎖定為已簽名。`,
      );

    if (!confirmed) {
      return;
    }

    const dataUrl =
      canvas.toDataURL(
        "image/png",
      );

    if (
      !dataUrl.startsWith(
        "data:image/png",
      )
    ) {
      setLocalError(
        "簽名圖片產生失敗，請重新簽名。",
      );

      return;
    }

    await onSave(
      dataUrl,
    );
  }

  return (
    <Modal
      title="醫師電子簽名"
      onClose={
        onClose
      }
      wide
    >
      <div style={styles.signatureIdentity}>
        <div>
          <span style={styles.signatureIdentityLabel}>
            簽署醫師
          </span>

          <strong style={styles.signatureDoctorName}>
            {doctor.name} 醫師
          </strong>
        </div>

        <StatusBadge
          status={
            record.status
          }
        />
      </div>

      <div style={styles.signatureRecordSummary}>
        <DetailItem
          label="病患"
          value={`${record.patientChartNumber}｜${record.patientName}`}
        />

        <DetailItem
          label="使用類型"
          value={
            record.usageType
          }
        />

        <DetailItem
          label="使用日期"
          value={
            record.usageDate
          }
        />

        <DetailItem
          label="牙位"
          value={
            record.toothPosition ||
            "—"
          }
        />
      </div>

      <div style={styles.signatureItems}>
        <div style={styles.signatureItemsTitle}>
          本次使用耗材
        </div>

        {record.items.map(
          (item) => (
            <div
              key={item.id}
              style={styles.signatureItemRow}
            >
              <div>
                <strong>
                  {
                    item.inventoryName
                  }
                </strong>

                <div style={styles.subText}>
                  {
                    item.inventorySpecification ||
                    "無規格"
                  }
                </div>
              </div>

              <div>
                有效期限：
                <strong>
                  {
                    item.expiryDate ||
                    "—"
                  }
                </strong>
              </div>

              <div>
                使用數量：
                <strong>
                  {
                    item.quantity
                  }
                </strong>
              </div>
            </div>
          ),
        )}
      </div>

      <div style={styles.signatureInstruction}>
        請確認病患與耗材使用內容正確，再使用滑鼠、觸控筆或觸控螢幕於下方簽名。
      </div>

      <div style={styles.canvasFrame}>
        <canvas
          ref={canvasRef}
          style={styles.signatureCanvas}
          onPointerDown={
            handlePointerDown
          }
          onPointerMove={
            handlePointerMove
          }
          onPointerUp={
            finishDrawing
          }
          onPointerCancel={
            finishDrawing
          }
        />

        {!hasSignature && (
          <div style={styles.canvasPlaceholder}>
            請在此簽名
          </div>
        )}

        <div style={styles.signatureLine}>
          <span>
            醫師簽名
          </span>
        </div>
      </div>

      {localError && (
        <div style={styles.errorMessage}>
          {localError}
        </div>
      )}

      <div style={styles.signatureLegalNotice}>
        按下「確認簽名」代表目前登入醫師已確認本筆耗材使用內容。完成後系統會保存簽名影像與簽名時間，且不可再取消此筆紀錄。
      </div>

      <div style={styles.modalActions}>
        <button
          type="button"
          style={styles.secondaryButton}
          disabled={saving}
          onClick={
            onClose
          }
        >
          取消
        </button>

        <button
          type="button"
          style={styles.clearSignatureButton}
          disabled={saving}
          onClick={
            clearSignature
          }
        >
          清除重簽
        </button>

        <button
          type="button"
          style={
            hasSignature
              ? styles.signatureButton
              : styles.disabledSignatureButton
          }
          disabled={
            saving ||
            !hasSignature
          }
          onClick={() =>
            void confirmSignature()
          }
        >
          {saving
            ? "簽名儲存中..."
            : "確認簽名"}
        </button>
      </div>
    </Modal>
  );
}

/* =========================================================
   Small Components
========================================================= */

function StatCard({
  label,
  value,
}: {
  label:
    string;

  value:
    number;
}) {
  return (
    <div style={styles.statCard}>
      <span style={styles.statLabel}>
        {label}
      </span>

      <strong style={styles.statValue}>
        {value}
      </strong>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status:
    DentflowConsumableUsageStatus;
}) {
  let statusStyle:
    CSSProperties =
    styles.statusPending;

  if (
    status ===
    "已簽名"
  ) {
    statusStyle =
      styles.statusSigned;
  }

  if (
    status ===
    "已取消"
  ) {
    statusStyle =
      styles.statusCancelled;
  }

  return (
    <span
      style={{
        ...styles.statusBadge,
        ...statusStyle,
      }}
    >
      {status}
    </span>
  );
}

function DetailItem({
  label,
  value,
}: {
  label:
    string;

  value:
    ReactNode;
}) {
  return (
    <div style={styles.detailItem}>
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title:
    string;

  onClose:
    () => void;

  children:
    ReactNode;

  wide?:
    boolean;
}) {
  return (
    <div style={styles.modalBackdrop}>
      <div
        style={{
          ...styles.modal,

          ...(wide
            ? styles.modalWide
            : {}),
        }}
      >
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>
            {title}
          </h2>

          <button
            type="button"
            style={styles.closeButton}
            onClick={
              onClose
            }
          >
            ×
          </button>
        </div>

        <div style={styles.modalBody}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Styles
========================================================= */

const styles:
  Record<
    string,
    CSSProperties
  > = {
  page: {
    width: "100%",
    maxWidth: "1700px",
    margin: "0 auto",
    padding: "28px",
    boxSizing: "border-box",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "22px",
  },

  eyebrow: {
    color: "#3f7a61",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.12em",
  },

  title: {
    margin: "6px 0",
    color: "#17352c",
    fontSize: "30px",
  },

  subtitle: {
    color: "#74827b",
    fontSize: "14px",
  },

  tabs: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "18px",
  },

  tabButton: {
    minHeight: "40px",
    padding: "0 15px",
    border: "1px solid #d8e3dc",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#5b6f64",
    fontWeight: 700,
    cursor: "pointer",
  },

  tabButtonActive: {
    borderColor: "#47795e",
    background: "#47795e",
    color: "#ffffff",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
    marginBottom: "18px",
  },

  statCard: {
    padding: "18px",
    border: "1px solid #e1e9e4",
    borderRadius: "14px",
    background: "#ffffff",
  },

  statLabel: {
    display: "block",
    marginBottom: "6px",
    color: "#77867e",
    fontSize: "12px",
  },

  statValue: {
    color: "#254b39",
    fontSize: "26px",
  },

  doctorNotice: {
    padding: "14px 16px",
    marginBottom: "12px",
    border: "1px solid #cce1d4",
    borderRadius: "12px",
    background: "#f2faf5",
    color: "#315d47",
  },

  allClinicsNotice: {
    padding: "14px 16px",
    marginBottom: "12px",
    border: "1px solid #c8d9cf",
    borderRadius: "12px",
    background: "#f3f7f4",
    color: "#365c49",
  },

  cancelNotice: {
    padding: "14px 16px",
    marginBottom: "18px",
    border: "1px solid #ecd7bd",
    borderRadius: "12px",
    background: "#fff9f0",
    color: "#835c2c",
  },

  noticeText: {
    marginTop: "4px",
    color: "#718178",
    fontSize: "12px",
    lineHeight: 1.6,
  },

  filterCard: {
    padding: "16px",
    marginBottom: "18px",
    border: "1px solid #e1e9e4",
    borderRadius: "14px",
    background: "#ffffff",
  },

  filterGrid: {
    display: "grid",
    gridTemplateColumns:
      "minmax(280px, 1fr) 220px",
    gap: "12px",
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: "7px",
  },

  label: {
    color: "#4b6156",
    fontSize: "13px",
    fontWeight: 700,
  },

  input: {
    width: "100%",
    minHeight: "42px",
    padding: "0 12px",
    boxSizing: "border-box",
    border: "1px solid #cfddd5",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#29483b",
    outline: "none",
  },

  textarea: {
    width: "100%",
    padding: "10px 12px",
    boxSizing: "border-box",
    border: "1px solid #cfddd5",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#29483b",
    fontFamily: "inherit",
    resize: "vertical",
  },

  characterCount: {
    alignSelf: "flex-end",
    color: "#929e98",
    fontSize: "10px",
  },

  primaryButton: {
    minHeight: "42px",
    padding: "0 16px",
    border: "1px solid #47795e",
    borderRadius: "9px",
    background: "#47795e",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },

  secondaryButton: {
    minHeight: "38px",
    padding: "0 13px",
    border: "1px solid #d2dfd7",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#51665a",
    fontWeight: 700,
    cursor: "pointer",
  },

  signatureButton: {
    minHeight: "40px",
    padding: "0 16px",
    border: "1px solid #356d51",
    borderRadius: "9px",
    background: "#356d51",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },

  disabledSignatureButton: {
    minHeight: "40px",
    padding: "0 16px",
    border: "1px solid #d8dfdb",
    borderRadius: "9px",
    background: "#edf1ef",
    color: "#9ba6a0",
    fontWeight: 800,
    cursor: "not-allowed",
  },

  clearSignatureButton: {
    minHeight: "40px",
    padding: "0 15px",
    border: "1px solid #d6c17e",
    borderRadius: "9px",
    background: "#fffaf0",
    color: "#80651d",
    fontWeight: 700,
    cursor: "pointer",
  },

  dangerButton: {
    minHeight: "40px",
    padding: "0 16px",
    border: "1px solid #a34d45",
    borderRadius: "9px",
    background: "#a34d45",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },

  disabledDangerButton: {
    minHeight: "40px",
    padding: "0 16px",
    border: "1px solid #e0d7d5",
    borderRadius: "9px",
    background: "#f1eceb",
    color: "#aaa19f",
    fontWeight: 800,
    cursor: "not-allowed",
  },

  dangerOutlineButton: {
    minHeight: "38px",
    padding: "0 13px",
    border: "1px solid #d9aaa5",
    borderRadius: "9px",
    background: "#fff8f7",
    color: "#9c453e",
    fontWeight: 700,
    cursor: "pointer",
  },

  recordList: {
    display: "grid",
    gap: "14px",
  },

  recordCard: {
    border: "1px solid #dfe8e2",
    borderRadius: "15px",
    background: "#ffffff",
    overflow: "hidden",
  },

  cancelledRecordCard: {
    borderColor: "#e5d8d5",
    background: "#fcfaf9",
  },

  recordHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    padding: "17px 18px",
    borderBottom: "1px solid #edf2ef",
  },

  recordTitleRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "9px",
  },

  recordPatient: {
    color: "#294e3c",
    fontSize: "16px",
  },

  chartNumber: {
    color: "#7b8a82",
    fontSize: "12px",
  },

  recordMeta: {
    marginTop: "7px",
    color: "#74827b",
    fontSize: "12px",
  },

  recordActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },

  recordItems: {
    display: "grid",
  },

  recordItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    padding: "13px 18px",
    borderBottom: "1px solid #f0f3f1",
    color: "#52645a",
    fontSize: "12px",
  },

  recordItemMeta: {
    display: "flex",
    alignItems: "center",
    gap: "24px",
  },

  recordFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    padding: "14px 18px",
    background: "#fafcfb",
    color: "#64766c",
    fontSize: "12px",
  },

  subText: {
    marginTop: "4px",
    color: "#87948d",
    fontSize: "10px",
  },

  signedArea: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },

  signatureThumbnail: {
    width: "100px",
    height: "42px",
    objectFit: "contain",
    border: "1px solid #e2e9e5",
    borderRadius: "6px",
    background: "#ffffff",
  },

  signedText: {
    color: "#2d7354",
  },

  signedTime: {
    marginTop: "4px",
    color: "#8a968f",
    fontSize: "11px",
  },

  pendingText: {
    color: "#946c18",
    fontWeight: 700,
  },

  cancelledFooter: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#9a4d47",
  },

  cancelReasonBox: {
    display: "flex",
    gap: "8px",
    padding: "11px 18px",
    borderTop: "1px solid #f0dddd",
    background: "#fff7f6",
    color: "#8e4a44",
    fontSize: "11px",
  },

  statusBadge: {
    display: "inline-flex",
    padding: "5px 9px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  statusPending: {
    background: "#fff4d8",
    color: "#8d640c",
  },

  statusSigned: {
    background: "#e8f5ed",
    color: "#287052",
  },

  statusCancelled: {
    background: "#f5e8e6",
    color: "#9b4a43",
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1500,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "rgba(22, 43, 34, 0.50)",
  },

  modal: {
    width: "min(650px, 100%)",
    maxHeight: "92vh",
    borderRadius: "18px",
    background: "#ffffff",
    overflow: "hidden",
    boxShadow:
      "0 25px 70px rgba(25, 50, 39, 0.28)",
  },

  modalWide: {
    width: "min(980px, 100%)",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "18px 22px",
    borderBottom: "1px solid #e7eee9",
  },

  modalTitle: {
    margin: 0,
    color: "#234735",
    fontSize: "20px",
  },

  closeButton: {
    border: "none",
    background: "transparent",
    color: "#718078",
    fontSize: "28px",
    cursor: "pointer",
  },

  modalBody: {
    maxHeight: "calc(92vh - 70px)",
    overflowY: "auto",
    padding: "22px",
  },

  modalForm: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "14px",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
  },

  sectionTitle: {
    color: "#315543",
    fontSize: "15px",
  },

  sectionDescription: {
    marginTop: "4px",
    color: "#829088",
    fontSize: "11px",
  },

  usageItemList: {
    display: "grid",
    gap: "12px",
  },

  usageItemCard: {
    position: "relative",
    padding: "15px",
    border: "1px solid #dfe8e2",
    borderRadius: "12px",
    background: "#fbfdfc",
  },

  itemNumber: {
    position: "absolute",
    top: "12px",
    right: "12px",
    display: "grid",
    placeItems: "center",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    background: "#e9f2ec",
    color: "#51705f",
    fontSize: "11px",
    fontWeight: 800,
  },

  usageItemFields: {
    display: "grid",
    gridTemplateColumns:
      "minmax(0, 1fr) 150px",
    gap: "12px",
    paddingRight: "35px",
  },

  inventoryPreview: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "12px",
    padding: "11px",
    borderRadius: "9px",
    background: "#f1f7f3",
    color: "#54695d",
    fontSize: "11px",
  },

  previewLabel: {
    display: "block",
    marginBottom: "4px",
    color: "#87948d",
    fontSize: "10px",
  },

  removeButton: {
    marginTop: "10px",
    border: "none",
    background: "transparent",
    color: "#a04d47",
    fontSize: "11px",
    fontWeight: 700,
    cursor: "pointer",
  },

  warningNotice: {
    padding: "12px 14px",
    border: "1px solid #eadba7",
    borderRadius: "10px",
    background: "#fffbed",
    color: "#79631e",
    fontSize: "12px",
    lineHeight: 1.7,
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px",
  },

  detailGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3, minmax(0, 1fr))",
    gap: "10px",
  },

  detailItem: {
    padding: "12px",
    border: "1px solid #e1e9e4",
    borderRadius: "9px",
    background: "#fafcfb",
  },

  detailSection: {
    marginTop: "20px",
  },

  detailHeading: {
    margin: "0 0 10px",
    color: "#355844",
    fontSize: "14px",
  },

  detailItemList: {
    display: "grid",
    gap: "8px",
  },

  detailUsageItem: {
    display: "grid",
    gridTemplateColumns:
      "1.2fr repeat(6, minmax(90px, 1fr))",
    gap: "10px",
    padding: "12px",
    border: "1px solid #e4ebe7",
    borderRadius: "9px",
    color: "#607168",
    fontSize: "11px",
  },

  noteBox: {
    padding: "12px",
    border: "1px solid #e2e9e5",
    borderRadius: "9px",
    background: "#fafcfb",
    color: "#5c6f65",
    whiteSpace: "pre-wrap",
  },

  detailSignature: {
    display: "flex",
    alignItems: "center",
    gap: "18px",
    padding: "15px",
    border: "1px solid #cfe2d6",
    borderRadius: "10px",
    background: "#f5faf7",
  },

  detailSignatureImage: {
    width: "180px",
    height: "70px",
    objectFit: "contain",
    border: "1px solid #dce6e0",
    borderRadius: "7px",
    background: "#ffffff",
  },

  pendingSignatureBox: {
    padding: "14px",
    border: "1px solid #eadba7",
    borderRadius: "9px",
    background: "#fffbed",
    color: "#80691e",
  },

  cancelledSignatureBox: {
    padding: "14px",
    border: "1px solid #e1c5c2",
    borderRadius: "9px",
    background: "#fff7f6",
    color: "#924b44",
  },

  cancelDetailBox: {
    display: "grid",
    gap: "12px",
    padding: "14px",
    border: "1px solid #e4cfcc",
    borderRadius: "10px",
    background: "#fff9f8",
  },

  cancelDetailNotice: {
    paddingTop: "10px",
    borderTop: "1px solid #eadbd9",
    color: "#8d5a55",
    fontSize: "11px",
  },

  signatureIdentity: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    padding: "14px 16px",
    border: "1px solid #cfe2d6",
    borderRadius: "11px",
    background: "#f4faf6",
  },

  signatureIdentityLabel: {
    display: "block",
    marginBottom: "4px",
    color: "#7a8c82",
    fontSize: "11px",
  },

  signatureDoctorName: {
    color: "#28563f",
    fontSize: "18px",
  },

  signatureRecordSummary: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "14px",
  },

  signatureItems: {
    marginTop: "16px",
    border: "1px solid #e0e8e3",
    borderRadius: "10px",
    overflow: "hidden",
  },

  signatureItemsTitle: {
    padding: "10px 13px",
    background: "#f5f8f6",
    color: "#536a5d",
    fontSize: "12px",
    fontWeight: 800,
  },

  signatureItemRow: {
    display: "grid",
    gridTemplateColumns:
      "minmax(180px, 1fr) 180px 120px",
    gap: "12px",
    alignItems: "center",
    padding: "11px 13px",
    borderTop: "1px solid #edf1ef",
    color: "#607168",
    fontSize: "11px",
  },

  signatureInstruction: {
    marginTop: "16px",
    color: "#5c7064",
    fontSize: "12px",
    lineHeight: 1.7,
  },

  canvasFrame: {
    position: "relative",
    marginTop: "10px",
    height: "260px",
    border: "2px solid #b9ccc0",
    borderRadius: "12px",
    background: "#ffffff",
    overflow: "hidden",
  },

  signatureCanvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
    cursor: "crosshair",
    touchAction: "none",
  },

  canvasPlaceholder: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    color: "#c1cbc5",
    fontSize: "22px",
    fontWeight: 700,
    pointerEvents: "none",
    userSelect: "none",
  },

  signatureLine: {
    position: "absolute",
    left: "8%",
    right: "8%",
    bottom: "42px",
    borderBottom: "1px solid #b8c3bd",
    pointerEvents: "none",
  },

  signatureLegalNotice: {
    marginTop: "12px",
    padding: "11px 13px",
    borderRadius: "9px",
    background: "#f5f7f6",
    color: "#7a8780",
    fontSize: "11px",
    lineHeight: 1.7,
  },

  cancelWarningBox: {
    padding: "14px 16px",
    marginBottom: "16px",
    border: "1px solid #e0bbb6",
    borderRadius: "11px",
    background: "#fff6f5",
  },

  cancelWarningTitle: {
    color: "#974941",
  },

  cancelWarningText: {
    marginTop: "5px",
    color: "#8e625e",
    fontSize: "12px",
    lineHeight: 1.7,
  },

  cancelSummary: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "16px",
  },

  cancelItems: {
    marginBottom: "16px",
    border: "1px solid #e4ebe7",
    borderRadius: "10px",
    overflow: "hidden",
  },

  cancelItemRow: {
    display: "grid",
    gridTemplateColumns:
      "minmax(180px, 1fr) 190px 120px",
    gap: "12px",
    alignItems: "center",
    padding: "12px 14px",
    borderBottom: "1px solid #edf1ef",
    color: "#607168",
    fontSize: "11px",
  },

  emptyState: {
    padding: "48px 20px",
    border: "1px dashed #d9e4dc",
    borderRadius: "14px",
    color: "#839087",
    textAlign: "center",
  },

  emptyCard: {
    padding: "28px",
    border: "1px solid #e0e9e4",
    borderRadius: "14px",
    background: "#ffffff",
    color: "#687971",
  },

  errorMessage: {
    marginBottom: "16px",
    padding: "12px 14px",
    border: "1px solid #edc9c6",
    borderRadius: "10px",
    background: "#fff4f3",
    color: "#a3433b",
  },

  successMessage: {
    marginBottom: "16px",
    padding: "12px 14px",
    border: "1px solid #c3dfd0",
    borderRadius: "10px",
    background: "#f0faf4",
    color: "#2b7053",
  },
};