/* eslint-disable react-hooks/set-state-in-effect */
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  CSSProperties,
  FormEvent,
  ReactNode,
} from "react";

import {
  canAccessModule,
  canAdjustInventory,
  canCreate,
  canDelete,
  canUpdate,
} from "../utils/permissions";

/* =========================================================
   Constants
========================================================= */

const SESSION_STORAGE_KEY =
  "dentflow-auth-session";

const DEFAULT_INVENTORY_CATEGORIES = [
  "植體",
  "套件",
  "連針帶線",
  "牙周藥膏",
  "冷光藥劑",
  "膠原蛋白",
  "骨粉",
  "再生膜",
  "其他耗材",
] as const;

type InventoryCategory = string;

const TRANSACTION_TYPES:
  Array<
    "全部" |
    DentflowInventoryTransactionType
  > = [
    "全部",
    "入庫",
    "手術取出",
    "手術歸回",
    "歸回",
    "手動調整",
    "耗材使用",
    "耗材取消歸回",
];

const MEDICAL_CONSUMABLE_CATEGORIES = new Set([
  "連針帶線",
  "牙周藥膏",
  "膠原蛋白",
  "再生膜",
  "冷光藥劑",
  "骨粉",
]);

function isConsumableCategory(category: string) {
  return category !== "植體" && category !== "套件";
}

/* =========================================================
   Form Types
========================================================= */

type InventoryForm = {
  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  refNumber: string;

  lotNumber: string;

  expiryDate: string;

  quantity: string;

  safetyStock: string;

  unitCost: string;

  note: string;
};

type AdjustForm = {
  quantity: string;
  note: string;
};

/* =========================================================
   Helpers
========================================================= */

function getStoredSession():
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

function createEmptyInventoryForm():
  InventoryForm {
  return {
    name: "",

    category:
      "其他耗材",

    brand: "",

    model: "",

    specification: "",

    refNumber: "",

    lotNumber: "",

    expiryDate: "",

    quantity: "0",

    safetyStock: "0",

    unitCost: "0",

    note: "",
  };
}

function createAdjustForm(
  quantity = 0,
):
  AdjustForm {
  return {
    quantity:
      String(quantity),

    note: "",
  };
}

function isRefLotCategory(
  category: string,
) {
  const normalized =
    category
      .trim()
      .toLowerCase();

  return (
    normalized ===
      "植體" ||
    normalized ===
      "套件" ||
    normalized ===
      "implant" ||
    normalized ===
      "kit"
  );
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

function getExpiryState(
  expiryDate: string,
) {
  if (!expiryDate) {
    return {
      label:
        "未設定",

      kind:
        "neutral" as const,
    };
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0,
  );

  const expiry =
    new Date(
      `${expiryDate}T00:00:00`,
    );

  if (
    Number.isNaN(
      expiry.getTime(),
    )
  ) {
    return {
      label:
        expiryDate,

      kind:
        "neutral" as const,
    };
  }

  const difference =
    expiry.getTime() -
    today.getTime();

  const days =
    Math.ceil(
      difference /
        86_400_000,
    );

  if (
    days < 0
  ) {
    return {
      label:
        "已過期",

      kind:
        "danger" as const,
    };
  }

  if (
    days <= 30
  ) {
    return {
      label:
        `${days} 天內到期`,

      kind:
        "warning" as const,
    };
  }

  if (
    days <= 90
  ) {
    return {
      label:
        `${days} 天後到期`,

      kind:
        "notice" as const,
    };
  }

  return {
    label:
      expiryDate,

    kind:
      "normal" as const,
  };
}

function getTransactionDirection(
  quantityChange: number,
) {
  if (
    quantityChange > 0
  ) {
    return `+${quantityChange}`;
  }

  return String(
    quantityChange,
  );
}

/* =========================================================
   Main
========================================================= */

export default function Inventory({
  scope = "all",
}: {
  scope?: "all" | "consumables";
}) {
  const [
    session,
    setSession,
  ] =
    useState<
      DentflowAuthSession | null
    >(null);

  const [
    inventory,
    setInventory,
  ] =
    useState<
      DentflowInventoryRecord[]
    >([]);

  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  const [
    transactions,
    setTransactions,
  ] =
    useState<
      DentflowInventoryTransactionRecord[]
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

  const [
    categoryFilter,
    setCategoryFilter,
  ] =
    useState<
      "全部" |
      InventoryCategory
    >("全部");

  const [
    stockFilter,
    setStockFilter,
  ] =
    useState<
      | "全部"
      | "低庫存"
      | "零庫存"
      | "即將到期"
      | "已過期"
    >("全部");

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(false);

  const [
    editItem,
    setEditItem,
  ] =
    useState<
      DentflowInventoryRecord | null
    >(null);

  const [
    form,
    setForm,
  ] =
    useState<InventoryForm>(
      createEmptyInventoryForm(),
    );

  const [
    adjustItem,
    setAdjustItem,
  ] =
    useState<
      DentflowInventoryRecord | null
    >(null);

  const [
    adjustForm,
    setAdjustForm,
  ] =
    useState<AdjustForm>(
      createAdjustForm(),
    );

  const [
    historyItem,
    setHistoryItem,
  ] =
    useState<
      DentflowInventoryRecord | null
    >(null);

  const [
    historySearch,
    setHistorySearch,
  ] =
    useState("");

  const [
    historyType,
    setHistoryType,
  ] =
    useState<
      "全部" |
      DentflowInventoryTransactionType
    >("全部");

  /* =======================================================
     Permissions
  ======================================================= */

  const role =
    session?.role ??
    null;

  const canView =
    role !== null &&
    canAccessModule(
      role,
      "inventory",
    );

  const canCreateInventory =
    role !== null &&
    canCreate(
      role,
      "inventory",
    );

  const canUpdateInventory =
    role !== null &&
    canUpdate(
      role,
      "inventory",
    );

  const canDeleteInventory =
    role !== null &&
    canDelete(
      role,
      "inventory",
    );

  const canAdjustInventoryQuantity =
    role === "Procurement" &&
    canAdjustInventory(role);

  const canManageCategories =
    role === "Admin" || role === "Procurement";

  const allCategories = useMemo(
    () => [...new Set([
      ...DEFAULT_INVENTORY_CATEGORIES,
      ...customCategories,
      ...inventory.map((item) => item.category).filter(Boolean),
    ])].filter((category) => scope === "all" || isConsumableCategory(category)),
    [customCategories, inventory, scope],
  );

  /*
   * 正式進貨請統一由「採購入庫」頁面處理，
   * 以確保單位成本與移動加權平均成本完整記錄。
   * Inventory 頁不再提供獨立入庫入口。
   */

  /* =======================================================
     Load
  ======================================================= */

  useEffect(() => {
    const activeSession =
      getStoredSession();

    queueMicrotask(() => setSession(activeSession));

    if (!activeSession) {
      setLoading(
        false,
      );

      setError(
        "找不到登入資訊，請重新登入。",
      );

      return;
    }

    void loadData(
      activeSession,
    );
  }, []);

  async function loadData(
    activeSession:
      DentflowAuthSession,
  ) {
    try {
      setLoading(true);
      setError("");

      const [
        inventoryRecords,
        transactionRecords,
        categoryRecords,
      ] =
        await Promise.all([
          window.dentflow.inventory.list(
            activeSession.clinicId,
          ),

          window.dentflow.inventoryTransactions.list(
            activeSession.clinicId,
          ),

          window.dentflow.inventory.categories(
            activeSession.clinicId,
          ),
        ]);

      const scopedInventory = scope === "consumables"
        ? inventoryRecords.filter((item) => isConsumableCategory(item.category))
        : inventoryRecords;

      setInventory(scopedInventory);

      const scopedIds = new Set(scopedInventory.map((item) => item.id));
      setTransactions(scope === "consumables"
        ? transactionRecords.filter((item) => scopedIds.has(item.inventoryItemId))
        : transactionRecords);

      setCustomCategories(categoryRecords
        .map((item) => item.name)
        .filter((category) => scope === "all" || isConsumableCategory(category)));
    } catch (
      loadError
    ) {
      setInventory([]);
      setTransactions([]);

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
    if (!session) {
      return;
    }

    await loadData(
      session,
    );
  }

  function openCategoryModal() {
    setCategoryName("");
    setError("");
    setCategoryModalOpen(true);
  }

  function closeCategoryModal() {
    if (categorySaving) return;
    setCategoryModalOpen(false);
    setCategoryName("");
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !canManageCategories) return;
    const name = categoryName.trim();
    if (!name) {
      setError("請輸入分類名稱。");
      return;
    }
    try {
      setCategorySaving(true);
      setError("");
      setSuccess("");
      const created = await window.dentflow.inventory.createCategory(session.clinicId, name, session.userId);
      setCustomCategories((current) => [...new Set([...current, created.name])]);
      setCategoryFilter(created.name);
      setForm((current) => ({ ...current, category: created.name }));
      setCategoryName("");
      setCategoryModalOpen(false);
      setSuccess(`已新增分類「${created.name}」，可由下方快速分類格使用。`);
    } catch (categoryError) {
      setError(getErrorMessage(categoryError));
    } finally {
      setCategorySaving(false);
    }
  }

  /* =======================================================
     Statistics
  ======================================================= */

  const statistics =
    useMemo(() => {
      const lowStock =
        inventory.filter(
          (item) =>
            item.quantity <=
            item.safetyStock,
        ).length;

      const zeroStock =
        inventory.filter(
          (item) =>
            item.quantity === 0,
        ).length;

      const expired =
        inventory.filter(
          (item) =>
            getExpiryState(
              item.expiryDate,
            ).kind ===
            "danger",
        ).length;

      const expiring =
        inventory.filter(
          (item) => {
            const state =
              getExpiryState(
                item.expiryDate,
              );

            return (
              state.kind ===
                "warning" ||
              state.kind ===
                "notice"
            );
          },
        ).length;

      const quantity =
        inventory.reduce(
          (
            total,
            item,
          ) =>
            total +
            item.quantity,
          0,
        );

      return {
        items:
          inventory.length,

        quantity,

        lowStock,

        zeroStock,

        expiring,

        expired,
      };
    }, [
      inventory,
    ]);

  /* =======================================================
     Inventory Filter
  ======================================================= */

  const filteredInventory =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return inventory
        .filter(
          (item) => {
            if (
              categoryFilter !==
                "全部" &&
              item.category !==
                categoryFilter
            ) {
              return false;
            }

            if (
              stockFilter ===
              "低庫存"
            ) {
              if (
                item.quantity >
                item.safetyStock
              ) {
                return false;
              }
            }

            if (
              stockFilter ===
              "零庫存"
            ) {
              if (
                item.quantity !==
                0
              ) {
                return false;
              }
            }

            if (
              stockFilter ===
                "即將到期"
            ) {
              const state =
                getExpiryState(
                  item.expiryDate,
                );

              if (
                state.kind !==
                  "warning" &&
                state.kind !==
                  "notice"
              ) {
                return false;
              }
            }

            if (
              stockFilter ===
              "已過期"
            ) {
              if (
                getExpiryState(
                  item.expiryDate,
                ).kind !==
                "danger"
              ) {
                return false;
              }
            }

            if (!keyword) {
              return true;
            }

            const haystack =
              [
                item.name,
                item.category,
                item.brand,
                item.model,
                item.specification,
                item.refNumber,
                item.lotNumber,
                item.expiryDate,
                item.note,
              ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              keyword,
            );
          },
        )
        .sort(
          (a, b) => {
            if (
              a.category !==
              b.category
            ) {
              return a.category.localeCompare(
                b.category,
                "zh-TW",
              );
            }

            return a.name.localeCompare(
              b.name,
              "zh-TW",
            );
          },
        );
    }, [
      inventory,
      search,
      categoryFilter,
      stockFilter,
    ]);

  /* =======================================================
     History
  ======================================================= */

  const historyTransactions =
    useMemo(() => {
      if (!historyItem) {
        return [];
      }

      const keyword =
        historySearch
          .trim()
          .toLowerCase();

      return transactions
        .filter(
          (transaction) =>
            transaction.inventoryItemId ===
            historyItem.id,
        )
        .filter(
          (transaction) =>
            historyType ===
              "全部" ||
            transaction.type ===
              historyType,
        )
        .filter(
          (transaction) => {
            if (!keyword) {
              return true;
            }

            const haystack =
              [
                transaction.type,
                transaction.note,
                transaction.patientName,
                transaction.patientChartNumber,
                transaction.doctorName,
                transaction.toothPosition,
                transaction.createdAt,
              ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              keyword,
            );
          },
        );
    }, [
      transactions,
      historyItem,
      historySearch,
      historyType,
    ]);

  /* =======================================================
     Create / Edit
  ======================================================= */

  function openCreate() {
    if (!canCreateInventory) {
      return;
    }

    setError("");
    setSuccess("");

    setEditItem(
      null,
    );

    setForm(
      createEmptyInventoryForm(),
    );

    setCreateOpen(
      true,
    );
  }

  function openEdit(
    item:
      DentflowInventoryRecord,
  ) {
    if (!canUpdateInventory) {
      return;
    }

    setError("");
    setSuccess("");

    setEditItem(
      item,
    );

    setForm({
      name:
        item.name,

      category:
        item.category,

      brand:
        item.brand,

      model:
        item.model,

      specification:
        item.specification,

      refNumber:
        item.refNumber,

      lotNumber:
        item.lotNumber,

      expiryDate:
        item.expiryDate,

      /*
       * 編輯主檔時 quantity 不會送去改庫存。
       * 保留顯示只是讓使用者知道目前庫存。
       */
      quantity:
        String(
          item.quantity,
        ),

      safetyStock:
        String(
          item.safetyStock,
        ),

      unitCost:
        String(item.unitCost ?? 0),

      note:
        item.note,
    });

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

    setEditItem(
      null,
    );

    setForm(
      createEmptyInventoryForm(),
    );
  }

  function handleCategoryChange(
    category: string,
  ) {
    setForm(
      (current) => ({
        ...current,

        category,

        /*
         * 一旦切換成一般耗材，
         * REF / LOT 立即清空，
         * 避免 legacy 值被誤送到 repository。
         */
        refNumber:
          isRefLotCategory(
            category,
          )
            ? current.refNumber
            : "",

        lotNumber:
          isRefLotCategory(
            category,
          )
            ? current.lotNumber
            : "",
      }),
    );
  }

  async function handleSave(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !session ||
      (editItem
        ? !canUpdateInventory
        : !canCreateInventory)
    ) {
      return;
    }

    const name =
      form.name.trim();

    if (!name) {
      setError(
        "請輸入庫存品項名稱。",
      );

      return;
    }

    const quantity =
      Number(
        form.quantity,
      );

    const safetyStock =
      Number(
        form.safetyStock,
      );

    const unitCost = Number(form.unitCost);

    if (
      !Number.isInteger(
        quantity,
      ) ||
      quantity < 0
    ) {
      setError(
        "庫存數量必須是 0 以上整數。",
      );

      return;
    }

    if (!Number.isFinite(unitCost) || unitCost < 0) {
      setError("品項單價必須是 0 以上的數字。");
      return;
    }

    if (
      !Number.isInteger(
        safetyStock,
      ) ||
      safetyStock < 0
    ) {
      setError(
        "安全庫存必須是 0 以上整數。",
      );

      return;
    }

    const refLotEnabled =
      isRefLotCategory(
        form.category,
      );

    const input:
      DentflowInventoryInput = {
      name,

      category:
        form.category.trim(),

      brand:
        form.brand.trim(),

      model:
        form.model.trim(),

      specification:
        form.specification.trim(),

      refNumber:
        refLotEnabled
          ? form.refNumber.trim()
          : "",

      lotNumber:
        refLotEnabled
          ? form.lotNumber.trim()
          : "",

      expiryDate:
        form.expiryDate,

      /*
       * updateInventoryItem repository
       * 會忽略 quantity。
       *
       * create 時才把 quantity 當成初始入庫。
       */
      quantity:
        editItem
          ? editItem.quantity
          : quantity,

      safetyStock,

      unitCost,

      note:
        form.note.trim(),
    };

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (
        editItem
      ) {
        await window.dentflow.inventory.update(
          editItem.id,
          session.clinicId,
          input,
        );

        setSuccess(
          "庫存主檔已更新。數量未變更。",
        );
      } else {
        await window.dentflow.inventory.create(
          session.clinicId,
          input,
        );

        setSuccess(
          quantity > 0
            ? "庫存品項已建立，初始數量已記錄為入庫異動。"
            : "庫存品項已建立。",
        );
      }

      setCreateOpen(
        false,
      );

      setEditItem(
        null,
      );

      setForm(
        createEmptyInventoryForm(),
      );

      await refresh();
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
     Adjust
  ======================================================= */

  function openAdjust(
    item:
      DentflowInventoryRecord,
  ) {
    if (!canAdjustInventoryQuantity) {
      return;
    }

    setError("");
    setSuccess("");

    setAdjustItem(
      item,
    );

    setAdjustForm(
      createAdjustForm(
        item.quantity,
      ),
    );
  }

  function closeAdjust() {
    if (saving) {
      return;
    }

    setAdjustItem(
      null,
    );

    setAdjustForm(
      createAdjustForm(),
    );
  }

  async function handleAdjust(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !session ||
      !adjustItem ||
      !canAdjustInventoryQuantity
    ) {
      return;
    }

    const quantity =
      Number(
        adjustForm.quantity,
      );

    const note =
      adjustForm.note.trim();

    if (
      !Number.isInteger(
        quantity,
      ) ||
      quantity < 0
    ) {
      setError(
        "校正後庫存必須是 0 以上整數。",
      );

      return;
    }

    if (!note) {
      setError(
        "手動調整庫存必須填寫原因。",
      );

      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await window.dentflow.inventory.adjustQuantity(
        adjustItem.id,
        session.clinicId,
        quantity,
        note,
        session.userId,
      );

      setAdjustItem(
        null,
      );

      setAdjustForm(
        createAdjustForm(),
      );

      setSuccess(
        `庫存已校正為 ${quantity}。`,
      );

      await refresh();
    } catch (
      adjustError
    ) {
      setError(
        getErrorMessage(
          adjustError,
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
    item:
      DentflowInventoryRecord,
  ) {
    if (
      !session ||
      !adjustItem ||
      !canAdjustInventoryQuantity
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `確定要刪除「${item.name}」嗎？\n\n如果此品項已有庫存異動或醫療使用紀錄，系統會拒絕刪除。`,
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await window.dentflow.inventory.delete(
        item.id,
        session.clinicId,
      );

      setSuccess(
        "庫存品項已刪除。",
      );

      await refresh();
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
     History Modal
  ======================================================= */

  function openHistory(
    item:
      DentflowInventoryRecord,
  ) {
    setHistoryItem(
      item,
    );

    setHistorySearch(
      "",
    );

    setHistoryType(
      "全部",
    );
  }

  function closeHistory() {
    setHistoryItem(
      null,
    );

    setHistorySearch(
      "",
    );

    setHistoryType(
      "全部",
    );
  }

  /* =======================================================
     Permission States
  ======================================================= */

  if (
    !session &&
    !loading
  ) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCard}>
          找不到登入資訊，請重新登入。
        </div>
      </div>
    );
  }

  if (
    session &&
    !canView
  ) {
    return (
      <div style={styles.page}>
        <div style={styles.emptyCard}>
          此帳號沒有庫存管理瀏覽權限。
        </div>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div style={styles.page}>
      {/* ===================================================
          Header
      =================================================== */}

      <div style={styles.header}>
        <div>
          <div style={styles.eyebrow}>
            {scope === "consumables" ? "OTHER CONSUMABLES" : "INVENTORY CONTROL"}
          </div>

          <h1 style={styles.title}>
            {scope === "consumables" ? "其他耗材" : "庫存管理"}
          </h1>

          <div style={styles.subtitle}>
            {session
              ? scope === "consumables"
                ? `${session.clinicName}｜一般耗材與癒合醫療耗材分類管理`
                : `${session.clinicName}｜植體、套件與一般耗材庫存追溯`
              : "庫存管理"}
          </div>
        </div>

        {canCreateInventory && (
          <button
            type="button"
            style={styles.primaryButton}
            onClick={openCreate}
          >
            ＋ {scope === "consumables" ? "新增耗材品項" : "新增庫存品項"}
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
          Stats
      =================================================== */}

      <div style={styles.statsGrid}>
        <StatCard
          label="庫存品項"
          value={
            statistics.items
          }
        />

        <StatCard
          label="總庫存數量"
          value={
            statistics.quantity
          }
        />

        <StatCard
          label="低於安全庫存"
          value={
            statistics.lowStock
          }
        />

        <StatCard
          label="零庫存"
          value={
            statistics.zeroStock
          }
        />

        <StatCard
          label="即將到期"
          value={
            statistics.expiring
          }
        />

        <StatCard
          label="已過期"
          value={
            statistics.expired
          }
        />
      </div>

      <div style={{...styles.filterCard, marginBottom: 16}}>
        <div style={{display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12}}>
          <div>
            <strong style={{color: "#315b43"}}>快速分類</strong>
            <div style={{fontSize: 11, color: "#77857d", marginTop: 4}}>
              {scope === "consumables"
                ? "自訂分類預設為一般耗材；指定六類為癒合醫療耗材。"
                : "點選分類立即篩選；新增後會自動產生快速格。"}
            </div>
          </div>
          {canManageCategories && (
            <button type="button" style={styles.secondaryButton} onClick={openCategoryModal}>
              ＋ 新增分類
            </button>
          )}
        </div>
        <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10}}>
          {allCategories.map((category) => {
            const count = inventory.filter((item) => item.category === category).length;
            const active = categoryFilter === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter(active ? "全部" : category)}
                style={{
                  padding: "13px 12px", borderRadius: 12,
                  border: active ? "1px solid #4f8061" : "1px solid #d8e5dc",
                  background: active ? "#e4f1e7" : "#fff", color: "#355d45",
                  display: "flex", justifyContent: "space-between", gap: 8,
                  cursor: "pointer", fontWeight: 800,
                }}
              >
                <span>{category}{scope === "consumables" && <small style={{display: "block", opacity: 0.7, marginTop: 3}}>{MEDICAL_CONSUMABLE_CATEGORIES.has(category) ? "癒合醫療耗材" : "一般耗材"}</small>}</span><span>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================
          Information
      =================================================== */}

      <div style={styles.infoNotice}>
        <strong>
          庫存追溯規則
        </strong>

        <div style={styles.noticeText}>
          {scope === "consumables"
            ? "癒合醫療耗材（連針帶線、牙周藥膏、膠原蛋白、再生膜、冷光藥劑、骨粉）使用後必須由指定醫師簽名確認。一般耗材免簽名，只有採購可執行入庫、出庫與盤點調整。"
            : "植體與套件使用 REF / LOT；其他一般耗材只追蹤有效期限與庫存數量。正式進貨請使用「採購入庫」頁面。"}
        </div>
      </div>

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
              placeholder="品項、品牌、型號、規格、REF、LOT..."
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>
              分類
            </span>

            <select
              style={styles.input}
              value={
                categoryFilter
              }
              onChange={
                (event) =>
                  setCategoryFilter(
                    event.target.value as
                      | "全部"
                      | InventoryCategory,
                  )
              }
            >
              <option value="全部">
                全部
              </option>

              {allCategories.map(
                (category) => (
                  <option
                    key={category}
                    value={category}
                  >
                    {category}
                  </option>
                ),
              )}
            </select>
          </label>

          <label style={styles.field}>
            <span style={styles.label}>
              庫存狀態
            </span>

            <select
              style={styles.input}
              value={
                stockFilter
              }
              onChange={
                (event) =>
                  setStockFilter(
                    event.target.value as
                      | "全部"
                      | "低庫存"
                      | "零庫存"
                      | "即將到期"
                      | "已過期",
                  )
              }
            >
              <option value="全部">
                全部
              </option>

              <option value="低庫存">
                低庫存
              </option>

              <option value="零庫存">
                零庫存
              </option>

              <option value="即將到期">
                即將到期
              </option>

              <option value="已過期">
                已過期
              </option>
            </select>
          </label>
        </div>
      </div>

      {/* ===================================================
          Table
      =================================================== */}

      {loading ? (
        <div style={styles.emptyState}>
          庫存資料讀取中...
        </div>
      ) : filteredInventory.length ===
        0 ? (
        <div style={styles.emptyState}>
          尚無符合條件的庫存品項。
        </div>
      ) : (
        <div style={styles.tableCard}>
          <div style={styles.tableScroll}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>
                    分類
                  </th>

                  <th style={styles.th}>
                    品項
                  </th>

                  <th style={styles.th}>
                    品牌 / 型號
                  </th>

                  <th style={styles.th}>
                    規格
                  </th>

                  <th style={styles.th}>
                    REF
                  </th>

                  <th style={styles.th}>
                    LOT
                  </th>

                  <th style={styles.th}>
                    有效期限
                  </th>

                  <th style={styles.th}>
                    庫存
                  </th>

                  <th style={styles.th}>
                    安全庫存
                  </th>

                  <th style={styles.th}>
                    品項單價
                  </th>

                  <th style={styles.th}>
                    狀態
                  </th>

                  <th style={styles.th}>
                    操作
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredInventory.map(
                  (item) => {
                    const expiryState =
                      getExpiryState(
                        item.expiryDate,
                      );

                    const lowStock =
                      item.quantity <=
                      item.safetyStock;

                    const refLotEnabled =
                      isRefLotCategory(
                        item.category,
                      );

                    return (
                      <tr key={item.id}>
                        <td style={styles.td}>
                          <CategoryBadge
                            category={
                              item.category
                            }
                          />
                        </td>

                        <td style={styles.td}>
                          <strong style={styles.itemName}>
                            {item.name}
                          </strong>

                          {item.note && (
                            <div style={styles.subText}>
                              {item.note}
                            </div>
                          )}
                        </td>

                        <td style={styles.td}>
                          {[
                            item.brand,
                            item.model,
                          ]
                            .filter(Boolean)
                            .join(" / ") ||
                            "—"}
                        </td>

                        <td style={styles.td}>
                          {item.specification ||
                            "—"}
                        </td>

                        <td style={styles.td}>
                          {refLotEnabled
                            ? item.refNumber ||
                              "—"
                            : "—"}
                        </td>

                        <td style={styles.td}>
                          {refLotEnabled
                            ? item.lotNumber ||
                              "—"
                            : "—"}
                        </td>

                        <td style={styles.td}>
                          <ExpiryBadge
                            expiryDate={
                              item.expiryDate
                            }
                            state={
                              expiryState
                            }
                          />
                        </td>

                        <td style={styles.td}>
                          <strong
                            style={
                              item.quantity ===
                              0
                                ? styles.zeroStockText
                                : lowStock
                                  ? styles.lowStockText
                                  : styles.quantityText
                            }
                          >
                            {item.quantity}
                          </strong>
                        </td>

                        <td style={styles.td}>
                          {item.safetyStock}
                        </td>

                        <td style={styles.td}>
                          NT$ {Number(item.unitCost ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}
                        </td>

                        <td style={styles.td}>
                          {item.quantity ===
                          0 ? (
                            <StatusPill
                              text="零庫存"
                              kind="danger"
                            />
                          ) : lowStock ? (
                            <StatusPill
                              text="低庫存"
                              kind="warning"
                            />
                          ) : (
                            <StatusPill
                              text="正常"
                              kind="normal"
                            />
                          )}
                        </td>

                        <td style={styles.actionCell}>
                          <div style={styles.actionGroup}>
                            <button
                              type="button"
                              style={styles.secondaryButton}
                              onClick={() =>
                                openHistory(
                                  item,
                                )
                              }
                            >
                              異動紀錄
                            </button>

                            {canAdjustInventoryQuantity && (
                              <button
                                type="button"
                                style={styles.adjustButton}
                                onClick={() =>
                                  openAdjust(
                                    item,
                                  )
                                }
                              >
                                調整
                              </button>
                            )}

                            {canUpdateInventory && (
                              <button
                                type="button"
                                style={styles.editButton}
                                onClick={() =>
                                  openEdit(
                                    item,
                                  )
                                }
                              >
                                編輯
                              </button>
                            )}

                            {canDeleteInventory && (
                              <button
                                type="button"
                                style={styles.deleteButton}
                                disabled={saving}
                                onClick={() =>
                                  void handleDelete(
                                    item,
                                  )
                                }
                              >
                                刪除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================
          Create / Edit Modal
      =================================================== */}

      {categoryModalOpen && (
        <Modal title="新增庫存分類" onClose={closeCategoryModal}>
          <form onSubmit={addCategory} style={styles.modalForm}>
            <label style={styles.field}>
              <span style={styles.label}>分類名稱 *</span>
              <input
                autoFocus
                style={styles.input}
                value={categoryName}
                maxLength={40}
                placeholder="例如：骨粉、縫線、手術耗材"
                onChange={(event) => setCategoryName(event.target.value)}
              />
            </label>

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={closeCategoryModal}
                disabled={categorySaving}
              >
                取消
              </button>
              <button
                type="submit"
                style={styles.primaryButton}
                disabled={categorySaving || !categoryName.trim()}
              >
                {categorySaving ? "建立中..." : "建立分類"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {createOpen &&
        (editItem
          ? canUpdateInventory
          : canCreateInventory) && (
          <Modal
            title={
              editItem
                ? "編輯庫存主檔"
                : "新增庫存品項"
            }
            onClose={closeCreate}
            wide
          >
            <form
              onSubmit={
                handleSave
              }
              style={styles.modalForm}
            >
              <div style={styles.formGrid}>
                <label style={styles.field}>
                  <span style={styles.label}>
                    品項名稱 *
                  </span>

                  <input
                    style={styles.input}
                    value={form.name}
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            name:
                              event.target.value,
                          }),
                        )
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    分類 *
                  </span>

                  <select
                    style={styles.input}
                    value={
                      form.category
                    }
                    onChange={
                      (event) =>
                        handleCategoryChange(
                          event.target.value,
                        )
                    }
                  >
                    {allCategories.map(
                      (category) => (
                        <option
                          key={category}
                          value={category}
                        >
                          {category}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    品牌
                  </span>

                  <input
                    style={styles.input}
                    value={form.brand}
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            brand:
                              event.target.value,
                          }),
                        )
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    型號
                  </span>

                  <input
                    style={styles.input}
                    value={form.model}
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            model:
                              event.target.value,
                          }),
                        )
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    規格
                  </span>

                  <input
                    style={styles.input}
                    value={
                      form.specification
                    }
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            specification:
                              event.target.value,
                          }),
                        )
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    有效期限
                  </span>

                  <input
                    type="date"
                    style={styles.input}
                    value={
                      form.expiryDate
                    }
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            expiryDate:
                              event.target.value,
                          }),
                        )
                    }
                  />
                </label>

                {isRefLotCategory(
                  form.category,
                ) && (
                  <>
                    <label style={styles.field}>
                      <span style={styles.label}>
                        REF
                      </span>

                      <input
                        style={styles.input}
                        value={
                          form.refNumber
                        }
                        onChange={
                          (event) =>
                            setForm(
                              (
                                current,
                              ) => ({
                                ...current,

                                refNumber:
                                  event.target.value,
                              }),
                            )
                        }
                      />
                    </label>

                    <label style={styles.field}>
                      <span style={styles.label}>
                        LOT
                      </span>

                      <input
                        style={styles.input}
                        value={
                          form.lotNumber
                        }
                        onChange={
                          (event) =>
                            setForm(
                              (
                                current,
                              ) => ({
                                ...current,

                                lotNumber:
                                  event.target.value,
                              }),
                            )
                        }
                      />
                    </label>
                  </>
                )}

                <label style={styles.field}>
                  <span style={styles.label}>
                    {editItem
                      ? "目前庫存"
                      : "初始庫存"}
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    style={
                      editItem
                        ? styles.readOnlyInput
                        : styles.input
                    }
                    value={
                      form.quantity
                    }
                    readOnly={
                      Boolean(editItem) || role !== "Procurement"
                    }
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            quantity:
                              event.target.value,
                          }),
                        )
                    }
                  />

                  {editItem && (
                    <span style={styles.helpText}>
                      正式進貨請使用「採購入庫」；盤點修正請使用「調整」功能。
                    </span>
                  )}

                  {!editItem && role !== "Procurement" && (
                    <span style={styles.helpText}>新增品項的初始庫存為 0；只有採購可執行入庫。</span>
                  )}
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    安全庫存
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    style={styles.input}
                    value={
                      form.safetyStock
                    }
                    onChange={
                      (event) =>
                        setForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            safetyStock:
                              event.target.value,
                          }),
                        )
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>品項單價</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style={styles.input}
                    value={form.unitCost}
                    onChange={(event) => setForm((current) => ({ ...current, unitCost: event.target.value }))}
                  />
                  <span style={styles.helpText}>正式入庫後會依進貨成本更新移動平均單價。</span>
                </label>
              </div>

              {!isRefLotCategory(
                form.category,
              ) && (
                <div style={styles.generalConsumableNotice}>
                  此分類為一般耗材，不使用 REF / LOT；系統只會保留品項資料、有效期限與庫存數量。
                </div>
              )}

              <label style={styles.field}>
                <span style={styles.label}>
                  備註
                </span>

                <textarea
                  rows={4}
                  style={styles.textarea}
                  value={form.note}
                  onChange={
                    (event) =>
                      setForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          note:
                            event.target.value,
                        }),
                      )
                  }
                />
              </label>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  disabled={saving}
                  onClick={closeCreate}
                >
                  取消
                </button>

                <button
                  type="submit"
                  style={styles.primaryButton}
                  disabled={saving}
                >
                  {saving
                    ? "儲存中..."
                    : editItem
                      ? "儲存主檔"
                      : "建立庫存品項"}
                </button>
              </div>
            </form>
          </Modal>
        )}

      {/* ===================================================
          Adjust Modal
      =================================================== */}

      {adjustItem &&
        canAdjustInventoryQuantity && (
          <Modal
            title="手動調整庫存"
            onClose={closeAdjust}
          >
            <form
              onSubmit={
                handleAdjust
              }
              style={styles.modalForm}
            >
              <ItemSummary
                item={
                  adjustItem
                }
              />

              <div style={styles.adjustWarning}>
                手動調整是庫存盤點／修正工具。請輸入「調整後的實際庫存總量」，不是增加或減少的數字。
              </div>

              <div style={styles.quantityChangePreview}>
                <span>
                  原庫存
                </span>

                <strong>
                  {adjustItem.quantity}
                </strong>

                <span>
                  →
                </span>

                <strong style={styles.quantityAfter}>
                  {Number(
                    adjustForm.quantity,
                  ) || 0}
                </strong>
              </div>

              <label style={styles.field}>
                <span style={styles.label}>
                  調整後庫存 *
                </span>

                <input
                  type="number"
                  min="0"
                  step="1"
                  style={styles.input}
                  value={
                    adjustForm.quantity
                  }
                  onChange={
                    (event) =>
                      setAdjustForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          quantity:
                            event.target.value,
                        }),
                      )
                  }
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>
                  調整原因 *
                </span>

                <textarea
                  rows={4}
                  style={styles.textarea}
                  value={
                    adjustForm.note
                  }
                  onChange={
                    (event) =>
                      setAdjustForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          note:
                            event.target.value,
                        }),
                      )
                  }
                  placeholder="例如：月末盤點差異、破損報廢、人工校正..."
                />
              </label>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  disabled={saving}
                  onClick={closeAdjust}
                >
                  取消
                </button>

                <button
                  type="submit"
                  style={styles.adjustButton}
                  disabled={saving}
                >
                  {saving
                    ? "調整中..."
                    : "確認調整"}
                </button>
              </div>
            </form>
          </Modal>
        )}

      {/* ===================================================
          History Modal
      =================================================== */}

      {historyItem && (
        <Modal
          title="庫存異動紀錄"
          onClose={closeHistory}
          extraWide
        >
          <ItemSummary
            item={
              historyItem
            }
          />

          <div style={styles.historyFilters}>
            <label style={styles.field}>
              <span style={styles.label}>
                搜尋紀錄
              </span>

              <input
                style={styles.input}
                value={
                  historySearch
                }
                onChange={
                  (event) =>
                    setHistorySearch(
                      event.target.value,
                    )
                }
                placeholder="異動類型、病患、醫師、備註..."
              />
            </label>

            <label style={styles.field}>
              <span style={styles.label}>
                異動類型
              </span>

              <select
                style={styles.input}
                value={
                  historyType
                }
                onChange={
                  (event) =>
                    setHistoryType(
                      event.target.value as
                        | "全部"
                        | DentflowInventoryTransactionType,
                    )
                }
              >
                {TRANSACTION_TYPES.map(
                  (type) => (
                    <option
                      key={type}
                      value={type}
                    >
                      {type}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {historyTransactions.length ===
          0 ? (
            <div style={styles.emptyState}>
              尚無符合條件的庫存異動紀錄。
            </div>
          ) : (
            <div style={styles.historyTableCard}>
              <div style={styles.tableScroll}>
                <table style={styles.historyTable}>
                  <thead>
                    <tr>
                      <th style={styles.th}>
                        時間
                      </th>

                      <th style={styles.th}>
                        類型
                      </th>

                      <th style={styles.th}>
                        異動
                      </th>

                      <th style={styles.th}>
                        異動前
                      </th>

                      <th style={styles.th}>
                        異動後
                      </th>

                      <th style={styles.th}>
                        病患
                      </th>

                      <th style={styles.th}>
                        醫師
                      </th>

                      <th style={styles.th}>
                        牙位
                      </th>

                      <th style={styles.th}>
                        REF
                      </th>

                      <th style={styles.th}>
                        LOT
                      </th>

                      <th style={styles.th}>
                        備註
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {historyTransactions.map(
                      (transaction) => {
                        const generalConsumable =
                          !isRefLotCategory(
                            transaction.inventoryCategory,
                          );

                        return (
                          <tr
                            key={
                              transaction.id
                            }
                          >
                            <td style={styles.td}>
                              {formatDateTime(
                                transaction.createdAt,
                              )}
                            </td>

                            <td style={styles.td}>
                              <TransactionTypeBadge
                                type={
                                  transaction.type
                                }
                              />
                            </td>

                            <td style={styles.td}>
                              <strong
                                style={
                                  transaction.quantityChange >
                                  0
                                    ? styles.positiveChange
                                    : transaction.quantityChange <
                                        0
                                      ? styles.negativeChange
                                      : styles.neutralChange
                                }
                              >
                                {getTransactionDirection(
                                  transaction.quantityChange,
                                )}
                              </strong>
                            </td>

                            <td style={styles.td}>
                              {
                                transaction.quantityBefore
                              }
                            </td>

                            <td style={styles.td}>
                              <strong>
                                {
                                  transaction.quantityAfter
                                }
                              </strong>
                            </td>

                            <td style={styles.td}>
                              {transaction.patientName
                                ? `${transaction.patientChartNumber || ""} ${transaction.patientName}`
                                : "—"}
                            </td>

                            <td style={styles.td}>
                              {transaction.doctorName ||
                                "—"}
                            </td>

                            <td style={styles.td}>
                              {transaction.toothPosition ||
                                "—"}
                            </td>

                            <td style={styles.td}>
                              {generalConsumable
                                ? "—"
                                : transaction.inventoryRefNumber ||
                                  "—"}
                            </td>

                            <td style={styles.td}>
                              {generalConsumable
                                ? "—"
                                : transaction.inventoryLotNumber ||
                                  "—"}
                            </td>

                            <td style={styles.noteCell}>
                              {transaction.note ||
                                "—"}
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={styles.historyLegend}>
            <div>
              <TransactionTypeBadge
                type="耗材使用"
              />
              <span>
                一般耗材實際使用，庫存減少
              </span>
            </div>

            <div>
              <TransactionTypeBadge
                type="耗材取消歸回"
              />
              <span>
                未簽名紀錄取消後自動歸回，庫存增加
              </span>
            </div>
          </div>

          <div style={styles.modalActions}>
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={closeHistory}
            >
              關閉
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================
   Components
========================================================= */

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
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

function ItemSummary({
  item,
}: {
  item:
    DentflowInventoryRecord;
}) {
  return (
    <div style={styles.itemSummary}>
      <div>
        <span style={styles.summaryLabel}>
          品項
        </span>

        <strong>
          {item.name}
        </strong>
      </div>

      <div>
        <span style={styles.summaryLabel}>
          分類
        </span>

        <strong>
          {item.category}
        </strong>
      </div>

      <div>
        <span style={styles.summaryLabel}>
          規格
        </span>

        <strong>
          {item.specification ||
            "—"}
        </strong>
      </div>

      <div>
        <span style={styles.summaryLabel}>
          目前庫存
        </span>

        <strong>
          {item.quantity}
        </strong>
      </div>

      <div>
        <span style={styles.summaryLabel}>
          有效期限
        </span>

        <strong>
          {item.expiryDate ||
            "—"}
        </strong>
      </div>

      {isRefLotCategory(
        item.category,
      ) && (
        <>
          <div>
            <span style={styles.summaryLabel}>
              REF
            </span>

            <strong>
              {item.refNumber ||
                "—"}
            </strong>
          </div>

          <div>
            <span style={styles.summaryLabel}>
              LOT
            </span>

            <strong>
              {item.lotNumber ||
                "—"}
            </strong>
          </div>
        </>
      )}
    </div>
  );
}

function CategoryBadge({
  category,
}: {
  category: string;
}) {
  return (
    <span style={styles.categoryBadge}>
      {category}
    </span>
  );
}

function StatusPill({
  text,
  kind,
}: {
  text: string;

  kind:
    | "normal"
    | "warning"
    | "danger";
}) {
  let style =
    styles.statusNormal;

  if (
    kind ===
    "warning"
  ) {
    style =
      styles.statusWarning;
  }

  if (
    kind ===
    "danger"
  ) {
    style =
      styles.statusDanger;
  }

  return (
    <span
      style={{
        ...styles.statusBadge,
        ...style,
      }}
    >
      {text}
    </span>
  );
}

function ExpiryBadge({
  expiryDate,
  state,
}: {
  expiryDate: string;

  state: {
    label: string;

    kind:
      | "neutral"
      | "normal"
      | "notice"
      | "warning"
      | "danger";
  };
}) {
  let style =
    styles.expiryNeutral;

  if (
    state.kind ===
    "normal"
  ) {
    style =
      styles.expiryNormal;
  }

  if (
    state.kind ===
    "notice"
  ) {
    style =
      styles.expiryNotice;
  }

  if (
    state.kind ===
    "warning"
  ) {
    style =
      styles.expiryWarning;
  }

  if (
    state.kind ===
    "danger"
  ) {
    style =
      styles.expiryDanger;
  }

  return (
    <div>
      <div>
        {expiryDate ||
          "—"}
      </div>

      <span
        style={{
          ...styles.expiryBadge,
          ...style,
        }}
      >
        {state.label}
      </span>
    </div>
  );
}

function TransactionTypeBadge({
  type,
}: {
  type:
    DentflowInventoryTransactionType;
}) {
  let badgeStyle =
    styles.transactionNeutral;

  if (
    type === "入庫" ||
    type === "手術歸回" ||
    type === "歸回" ||
    type === "耗材取消歸回"
  ) {
    badgeStyle =
      styles.transactionPositive;
  }

  if (
    type === "手術取出" ||
    type === "耗材使用"
  ) {
    badgeStyle =
      styles.transactionNegative;
  }

  if (
    type === "手動調整"
  ) {
    badgeStyle =
      styles.transactionAdjust;
  }

  return (
    <span
      style={{
        ...styles.transactionBadge,
        ...badgeStyle,
      }}
    >
      {type}
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
  extraWide = false,
}: {
  title: string;

  onClose:
    () => void;

  children:
    ReactNode;

  wide?:
    boolean;

  extraWide?:
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

          ...(extraWide
            ? styles.modalExtraWide
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
            onClick={onClose}
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
    maxWidth: "1800px",
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

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(145px, 1fr))",
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

  infoNotice: {
    padding: "14px 16px",
    marginBottom: "18px",
    border: "1px solid #cfe0d5",
    borderRadius: "12px",
    background: "#f4faf6",
    color: "#315e47",
  },

  noticeText: {
    marginTop: "4px",
    color: "#6f8177",
    fontSize: "12px",
    lineHeight: 1.65,
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
      "minmax(300px, 1fr) 190px 190px",
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

  readOnlyInput: {
    width: "100%",
    minHeight: "42px",
    padding: "0 12px",
    boxSizing: "border-box",
    border: "1px solid #dde4e0",
    borderRadius: "9px",
    background: "#f1f4f2",
    color: "#829087",
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

  helpText: {
    color: "#929f98",
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
    minHeight: "36px",
    padding: "0 12px",
    border: "1px solid #d2dfd7",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#51665a",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  receiveButton: {
    minHeight: "36px",
    padding: "0 12px",
    border: "1px solid #42805f",
    borderRadius: "8px",
    background: "#42805f",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  adjustButton: {
    minHeight: "36px",
    padding: "0 12px",
    border: "1px solid #a78936",
    borderRadius: "8px",
    background: "#fff8e5",
    color: "#80671f",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  editButton: {
    minHeight: "36px",
    padding: "0 12px",
    border: "1px solid #b8cadf",
    borderRadius: "8px",
    background: "#f5f9ff",
    color: "#486987",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  deleteButton: {
    minHeight: "36px",
    padding: "0 12px",
    border: "1px solid #dbb4b0",
    borderRadius: "8px",
    background: "#fff8f7",
    color: "#9b4942",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  tableCard: {
    minWidth: 0,
    border: "1px solid #dfe8e2",
    borderRadius: "15px",
    background: "#ffffff",
    overflow: "hidden",
  },

  tableScroll: {
    width: "100%",
    overflowX: "auto",
  },

  table: {
    width: "100%",
    minWidth: "1550px",
    borderCollapse: "collapse",
  },

  historyTable: {
    width: "100%",
    minWidth: "1650px",
    borderCollapse: "collapse",
  },

  th: {
    padding: "12px 13px",
    borderBottom: "1px solid #dfe8e2",
    background: "#f6faf8",
    color: "#60746a",
    fontSize: "11px",
    fontWeight: 800,
    textAlign: "left",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "12px 13px",
    borderBottom: "1px solid #edf2ef",
    color: "#465b50",
    fontSize: "11px",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },

  noteCell: {
    maxWidth: "340px",
    padding: "12px 13px",
    borderBottom: "1px solid #edf2ef",
    color: "#465b50",
    fontSize: "11px",
    verticalAlign: "middle",
    whiteSpace: "normal",
  },

  actionCell: {
    padding: "10px 12px",
    borderBottom: "1px solid #edf2ef",
    verticalAlign: "middle",
  },

  actionGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },

  itemName: {
    color: "#294f3c",
  },

  subText: {
    marginTop: "4px",
    color: "#88948e",
    fontSize: "9px",
  },

  quantityText: {
    color: "#315d48",
    fontSize: "14px",
  },

  lowStockText: {
    color: "#9a721b",
    fontSize: "14px",
  },

  zeroStockText: {
    color: "#aa4841",
    fontSize: "14px",
  },

  categoryBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    background: "#edf5f0",
    color: "#47705c",
    fontSize: "10px",
    fontWeight: 800,
  },

  statusBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 800,
  },

  statusNormal: {
    background: "#e8f5ed",
    color: "#287052",
  },

  statusWarning: {
    background: "#fff4d8",
    color: "#8d640c",
  },

  statusDanger: {
    background: "#f8e8e6",
    color: "#a14c45",
  },

  expiryBadge: {
    display: "inline-flex",
    marginTop: "4px",
    padding: "3px 6px",
    borderRadius: "999px",
    fontSize: "9px",
    fontWeight: 700,
  },

  expiryNeutral: {
    background: "#f0f2f1",
    color: "#7d8983",
  },

  expiryNormal: {
    background: "#edf6f0",
    color: "#377357",
  },

  expiryNotice: {
    background: "#f7f4e8",
    color: "#86752e",
  },

  expiryWarning: {
    background: "#fff2d9",
    color: "#9a6d12",
  },

  expiryDanger: {
    background: "#fae7e5",
    color: "#a5443d",
  },

  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1500,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "rgba(22, 43, 34, 0.5)",
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

  modalExtraWide: {
    width: "min(1450px, 100%)",
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

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "18px",
  },

  generalConsumableNotice: {
    padding: "12px 14px",
    border: "1px solid #d8e6dd",
    borderRadius: "9px",
    background: "#f5faf7",
    color: "#60776a",
    fontSize: "11px",
    lineHeight: 1.7,
  },

  itemSummary: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "10px",
    marginBottom: "18px",
    padding: "14px",
    border: "1px solid #e1e9e4",
    borderRadius: "10px",
    background: "#fafcfb",
    color: "#4c6256",
    fontSize: "11px",
  },

  summaryLabel: {
    display: "block",
    marginBottom: "4px",
    color: "#89968f",
    fontSize: "9px",
  },

  quantityChangePreview: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "10px",
    padding: "16px",
    border: "1px solid #dce7e0",
    borderRadius: "10px",
    background: "#f7fbf8",
    color: "#65766d",
  },

  quantityAfter: {
    color: "#2e6f50",
    fontSize: "20px",
  },

  adjustWarning: {
    padding: "12px 14px",
    border: "1px solid #eadba7",
    borderRadius: "10px",
    background: "#fffbed",
    color: "#79631e",
    fontSize: "11px",
    lineHeight: 1.7,
  },

  historyFilters: {
    display: "grid",
    gridTemplateColumns:
      "minmax(300px, 1fr) 220px",
    gap: "12px",
    marginBottom: "14px",
  },

  historyTableCard: {
    border: "1px solid #e0e8e3",
    borderRadius: "10px",
    overflow: "hidden",
  },

  transactionBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    fontSize: "9px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  transactionPositive: {
    background: "#e8f5ed",
    color: "#297151",
  },

  transactionNegative: {
    background: "#f9e9e7",
    color: "#a24942",
  },

  transactionAdjust: {
    background: "#fff4dc",
    color: "#8b6a1a",
  },

  transactionNeutral: {
    background: "#eff2f0",
    color: "#6c7972",
  },

  positiveChange: {
    color: "#2f7654",
  },

  negativeChange: {
    color: "#a34c45",
  },

  neutralChange: {
    color: "#6c7972",
  },

  historyLegend: {
    display: "grid",
    gap: "8px",
    marginTop: "14px",
    padding: "12px 14px",
    border: "1px solid #e1e9e4",
    borderRadius: "10px",
    background: "#fafcfb",
    color: "#65776d",
    fontSize: "10px",
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
