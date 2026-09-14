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
  canCreate as canCreateModule,
} from "../utils/permissions";

/* =========================================================
   Constants
========================================================= */

const SESSION_STORAGE_KEY =
  "dentflow-auth-session";

type ReceiveForm = {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;

  supplier: string;
  orderNumber: string;
  note: string;
};

type HistoryDateFilter =
  | "全部"
  | "今天"
  | "近 7 天"
  | "近 30 天"
  | "自訂";

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

  return String(
    error,
  );
}

function createReceiveForm():
  ReceiveForm {
  return {
    inventoryItemId: "",
    quantity: "1",
    unitCost: "",

    supplier: "",
    orderNumber: "",
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
    normalized === "植體" ||
    normalized === "套件" ||
    normalized === "implant" ||
    normalized === "kit"
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
    new Date(
      value,
    );

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

function formatMoney(
  value:
    number |
    null |
    undefined,
) {
  const amount =
    Number(
      value ?? 0,
    );

  if (
    !Number.isFinite(
      amount,
    )
  ) {
    return "NT$0";
  }

  return new Intl.NumberFormat(
    "zh-TW",
    {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: 2,
    },
  ).format(
    amount,
  );
}

function getTodayStart() {
  const date =
    new Date();

  date.setHours(
    0,
    0,
    0,
    0,
  );

  return date;
}

function subtractDays(
  days: number,
) {
  const date =
    getTodayStart();

  date.setDate(
    date.getDate() -
      days,
  );

  return date;
}

function getHistoryRange(
  filter:
    HistoryDateFilter,
  customStartDate:
    string,
  customEndDate:
    string,
) {
  if (
    filter === "今天"
  ) {
    return {
      start:
        getTodayStart(),

      end:
        null,
    };
  }

  if (
    filter === "近 7 天"
  ) {
    return {
      start:
        subtractDays(6),

      end:
        null,
    };
  }

  if (
    filter === "近 30 天"
  ) {
    return {
      start:
        subtractDays(29),

      end:
        null,
    };
  }

  if (
    filter === "自訂"
  ) {
    const start =
      customStartDate
        ? new Date(
            `${customStartDate}T00:00:00`,
          )
        : null;

    const end =
      customEndDate
        ? new Date(
            `${customEndDate}T23:59:59.999`,
          )
        : null;

    return {
      start,
      end,
    };
  }

  return {
    start: null,
    end: null,
  };
}

function buildReceiveNote(
  form:
    ReceiveForm,
) {
  const parts:
    string[] = [];

  const supplier =
    form.supplier.trim();

  const orderNumber =
    form.orderNumber.trim();

  const note =
    form.note.trim();

  if (supplier) {
    parts.push(
      `供應商：${supplier}`,
    );
  }

  if (orderNumber) {
    parts.push(
      `單號：${orderNumber}`,
    );
  }

  if (note) {
    parts.push(
      note,
    );
  }

  return parts.join(
    "｜",
  );
}

/* =========================================================
   Main
========================================================= */

export default function Purchase() {
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
    useState(
      true,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState(
      "",
    );

  const [
    success,
    setSuccess,
  ] =
    useState(
      "",
    );

  const [
    receiveOpen,
    setReceiveOpen,
  ] =
    useState(
      false,
    );

  const [
    receiveForm,
    setReceiveForm,
  ] =
    useState<ReceiveForm>(
      createReceiveForm(),
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      "",
    );

  const [
    historyDateFilter,
    setHistoryDateFilter,
  ] =
    useState<HistoryDateFilter>(
      "近 30 天",
    );

  const [
    customStartDate,
    setCustomStartDate,
  ] =
    useState(
      "",
    );

  const [
    customEndDate,
    setCustomEndDate,
  ] =
    useState(
      "",
    );

  const [
    historyItemFilter,
    setHistoryItemFilter,
  ] =
    useState(
      "全部",
    );

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
      "purchase",
    );

  const canReceive =
    role !== null &&
    canCreateModule(
      role,
      "purchase",
    );

  /* =======================================================
     Load
  ======================================================= */

  useEffect(
    () => {
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
    },
    [],
  );

  async function loadData(
    activeSession:
      DentflowAuthSession,
  ) {
    try {
      setLoading(
        true,
      );

      setError(
        "",
      );

      const [
        inventoryRecords,
        transactionRecords,
      ] =
        await Promise.all([
          window.dentflow.inventory.list(
            activeSession.clinicId,
          ),

          window.dentflow.inventoryTransactions.list(
            activeSession.clinicId,
          ),
        ]);

      setInventory(
        inventoryRecords,
      );

      setTransactions(
        transactionRecords,
      );
    } catch (
      loadError
    ) {
      setInventory(
        [],
      );

      setTransactions(
        [],
      );

      setError(
        getErrorMessage(
          loadError,
        ),
      );
    } finally {
      setLoading(
        false,
      );
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

  /* =======================================================
     Low Stock
  ======================================================= */

  const lowStockItems =
    useMemo(
      () =>
        inventory
          .filter(
            (item) =>
              item.quantity <=
              item.safetyStock,
          )
          .sort(
            (
              a,
              b,
            ) => {
              const aDifference =
                a.quantity -
                a.safetyStock;

              const bDifference =
                b.quantity -
                b.safetyStock;

              if (
                aDifference !==
                bDifference
              ) {
                return (
                  aDifference -
                  bDifference
                );
              }

              return a.name.localeCompare(
                b.name,
                "zh-TW",
              );
            },
          ),
      [
        inventory,
      ],
    );

  const zeroStockCount =
    useMemo(
      () =>
        inventory.filter(
          (item) =>
            item.quantity ===
            0,
        ).length,
      [
        inventory,
      ],
    );

  /* =======================================================
     Inbound Transactions
  ======================================================= */

  const inboundTransactions =
    useMemo(
      () =>
        transactions.filter(
          (transaction) =>
            transaction.type ===
            "入庫",
        ),
      [
        transactions,
      ],
    );

  const filteredInboundTransactions =
    useMemo(
      () => {
        const keyword =
          search
            .trim()
            .toLowerCase();

        const range =
          getHistoryRange(
            historyDateFilter,
            customStartDate,
            customEndDate,
          );

        return inboundTransactions
          .filter(
            (transaction) => {
              if (
                historyItemFilter !==
                  "全部" &&
                transaction.inventoryItemId !==
                  Number(
                    historyItemFilter,
                  )
              ) {
                return false;
              }

              const created =
                new Date(
                  transaction.createdAt,
                );

              if (
                range.start &&
                created <
                  range.start
              ) {
                return false;
              }

              if (
                range.end &&
                created >
                  range.end
              ) {
                return false;
              }

              if (!keyword) {
                return true;
              }

              const haystack =
                [
                  transaction.inventoryName,
                  transaction.inventoryCategory,
                  transaction.inventoryBrand,
                  transaction.inventoryModel,
                  transaction.inventorySpecification,
                  transaction.inventoryRefNumber,
                  transaction.inventoryLotNumber,
                  transaction.inventoryExpiryDate,
                  transaction.note,
                  transaction.createdAt,
                ]
                  .join(" ")
                  .toLowerCase();

              return haystack.includes(
                keyword,
              );
            },
          )
          .sort(
            (
              a,
              b,
            ) => {
              const aTime =
                new Date(
                  a.createdAt,
                ).getTime();

              const bTime =
                new Date(
                  b.createdAt,
                ).getTime();

              if (
                aTime !==
                bTime
              ) {
                return (
                  bTime -
                  aTime
                );
              }

              return (
                b.id -
                a.id
              );
            },
          );
      },
      [
        inboundTransactions,
        search,
        historyDateFilter,
        customStartDate,
        customEndDate,
        historyItemFilter,
      ],
    );

  const totalReceivedQuantity =
    useMemo(
      () =>
        filteredInboundTransactions.reduce(
          (
            total,
            transaction,
          ) =>
            total +
            Math.max(
              transaction.quantityChange,
              0,
            ),
          0,
        ),
      [
        filteredInboundTransactions,
      ],
    );

  const totalReceivedCost =
    useMemo(
      () =>
        filteredInboundTransactions.reduce(
          (
            total,
            transaction,
          ) =>
            total +
            Number(
              transaction.totalCost ??
                0,
            ),
          0,
        ),
      [
        filteredInboundTransactions,
      ],
    );

  /* =======================================================
     Receive Modal
  ======================================================= */

  function openReceive(
    item?:
      DentflowInventoryRecord,
  ) {
    if (!canReceive) {
      return;
    }

    setError(
      "",
    );

    setSuccess(
      "",
    );

    setReceiveForm({
      ...createReceiveForm(),

      inventoryItemId:
        item
          ? String(
              item.id,
            )
          : "",
    });

    setReceiveOpen(
      true,
    );
  }

  function closeReceive() {
    if (saving) {
      return;
    }

    setReceiveOpen(
      false,
    );

    setReceiveForm(
      createReceiveForm(),
    );
  }

  const selectedReceiveItem =
    useMemo(
      () =>
        inventory.find(
          (item) =>
            item.id ===
            Number(
              receiveForm.inventoryItemId,
            ),
        ) ??
        null,
      [
        inventory,
        receiveForm.inventoryItemId,
      ],
    );

  async function handleReceive(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !session ||
      !canReceive
    ) {
      return;
    }

    const inventoryItemId =
      Number(
        receiveForm.inventoryItemId,
      );

    const quantity =
      Number(
        receiveForm.quantity,
      );

    const unitCost =
      Number(
        receiveForm.unitCost,
      );

    if (
      !Number.isInteger(
        inventoryItemId,
      ) ||
      inventoryItemId <=
        0
    ) {
      setError(
        "請選擇入庫品項。",
      );

      return;
    }

    if (
      !Number.isInteger(
        quantity,
      ) ||
      quantity <=
        0
    ) {
      setError(
        "入庫數量必須是大於 0 的整數。",
      );

      return;
    }

    if (
      receiveForm.unitCost.trim() ===
        "" ||
      !Number.isFinite(
        unitCost,
      ) ||
      unitCost <
        0
    ) {
      setError(
        "請輸入有效的單位成本，金額不可小於 0。",
      );

      return;
    }

    const selectedItem =
      inventory.find(
        (item) =>
          item.id ===
          inventoryItemId,
      );

    if (!selectedItem) {
      setError(
        "找不到選擇的庫存品項，請重新整理後再試。",
      );

      return;
    }

    const note =
      buildReceiveNote(
        receiveForm,
      );

    if (!note) {
      setError(
        "請至少填寫供應商、單號或入庫備註其中一項。",
      );

      return;
    }

    try {
      setSaving(
        true,
      );

      setError(
        "",
      );

      setSuccess(
        "",
      );

      await window.dentflow.inventory.receive(
        inventoryItemId,
        session.clinicId,
        quantity,
        unitCost,
        note,
      );

      setReceiveOpen(
        false,
      );

      setReceiveForm(
        createReceiveForm(),
      );

      setSuccess(
        `「${selectedItem.name}」已入庫 +${quantity}，本次進貨成本 ${formatMoney(
          unitCost *
            quantity,
        )}。`,
      );

      await refresh();
    } catch (
      receiveError
    ) {
      setError(
        getErrorMessage(
          receiveError,
        ),
      );
    } finally {
      setSaving(
        false,
      );
    }
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
          此帳號沒有採購入庫中心的使用權限。
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
            PURCHASE & RECEIVING
          </div>

          <h1 style={styles.title}>
            採購入庫
          </h1>

          <div style={styles.subtitle}>
            {session
              ? `${session.clinicName}｜進貨入庫、低庫存補貨與歷史追溯`
              : "採購入庫"}
          </div>
        </div>

        {canReceive && (
          <button
            type="button"
            style={styles.primaryButton}
            onClick={() =>
              openReceive()
            }
          >
            ＋ 新增入庫
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
          Statistics
      =================================================== */}

      <div style={styles.statsGrid}>
        <StatCard
          label="庫存品項"
          value={
            inventory.length
          }
        />

        <StatCard
          label="低庫存品項"
          value={
            lowStockItems.length
          }
        />

        <StatCard
          label="零庫存"
          value={
            zeroStockCount
          }
        />

        <StatCard
          label="目前篩選入庫筆數"
          value={
            filteredInboundTransactions.length
          }
        />

        <StatCard
          label="目前篩選入庫數量"
          value={
            totalReceivedQuantity
          }
        />

        <StatCard
          label="目前篩選進貨成本"
          value={
            formatMoney(
              totalReceivedCost,
            )
          }
        />
      </div>

      {/* ===================================================
          Process Notice
      =================================================== */}

      <div style={styles.infoNotice}>
        <strong>
          入庫流程
        </strong>

        <div style={styles.noticeText}>
          此頁的「入庫數量」是本次實際收到的數量；「單位成本」會保存為本次進貨成本快照，並更新該庫存批次的移動加權平均成本。若只是盤點修正庫存總數，請改到庫存管理使用「手動調整」。
        </div>
      </div>

      {/* ===================================================
          Low Stock
      =================================================== */}

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>
              低庫存快速補貨
            </h2>

            <div style={styles.sectionSubtitle}>
              庫存低於或等於安全庫存的品項會顯示在這裡。
            </div>
          </div>

          <span style={styles.sectionCount}>
            {
              lowStockItems.length
            }{" "}
            項
          </span>
        </div>

        {loading ? (
          <div style={styles.emptyState}>
            庫存資料讀取中...
          </div>
        ) : lowStockItems.length ===
          0 ? (
          <div style={styles.goodState}>
            目前沒有低庫存品項。
          </div>
        ) : (
          <div style={styles.lowStockGrid}>
            {lowStockItems.map(
              (item) => {
                const shortage =
                  Math.max(
                    item.safetyStock -
                      item.quantity,
                    0,
                  );

                const refLotEnabled =
                  isRefLotCategory(
                    item.category,
                  );

                return (
                  <div
                    key={
                      item.id
                    }
                    style={
                      item.quantity ===
                      0
                        ? {
                            ...styles.lowStockCard,
                            ...styles.zeroStockCard,
                          }
                        : styles.lowStockCard
                    }
                  >
                    <div style={styles.lowStockCardHeader}>
                      <div>
                        <span style={styles.categoryBadge}>
                          {
                            item.category
                          }
                        </span>

                        <h3 style={styles.lowStockName}>
                          {
                            item.name
                          }
                        </h3>
                      </div>

                      <StockBadge
                        quantity={
                          item.quantity
                        }
                      />
                    </div>

                    <div style={styles.lowStockMeta}>
                      <Detail
                        label="品牌 / 型號"
                        value={
                          [
                            item.brand,
                            item.model,
                          ]
                            .filter(Boolean)
                            .join(" / ") ||
                          "—"
                        }
                      />

                      <Detail
                        label="規格"
                        value={
                          item.specification ||
                          "—"
                        }
                      />

                      <Detail
                        label="目前庫存"
                        value={
                          item.quantity
                        }
                      />

                      <Detail
                        label="安全庫存"
                        value={
                          item.safetyStock
                        }
                      />

                      <Detail
                        label="至少補足"
                        value={
                          shortage
                        }
                      />

                      <Detail
                        label="有效期限"
                        value={
                          item.expiryDate ||
                          "—"
                        }
                      />

                      {refLotEnabled && (
                        <>
                          <Detail
                            label="REF"
                            value={
                              item.refNumber ||
                              "—"
                            }
                          />

                          <Detail
                            label="LOT"
                            value={
                              item.lotNumber ||
                              "—"
                            }
                          />
                        </>
                      )}
                    </div>

                    {canReceive && (
                      <button
                        type="button"
                        style={styles.quickReceiveButton}
                        onClick={() =>
                          openReceive(
                            item,
                          )
                        }
                      >
                        快速入庫
                      </button>
                    )}
                  </div>
                );
              },
            )}
          </div>
        )}
      </section>

      {/* ===================================================
          History
      =================================================== */}

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>
              入庫歷史
            </h2>

            <div style={styles.sectionSubtitle}>
              顯示由庫存入庫功能建立的「入庫」異動紀錄。
            </div>
          </div>
        </div>

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
                placeholder="品項、品牌、型號、規格、供應商、單號..."
              />
            </label>

            <label style={styles.field}>
              <span style={styles.label}>
                品項
              </span>

              <select
                style={styles.input}
                value={
                  historyItemFilter
                }
                onChange={
                  (event) =>
                    setHistoryItemFilter(
                      event.target.value,
                    )
                }
              >
                <option value="全部">
                  全部品項
                </option>

                {inventory.map(
                  (item) => (
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
                    </option>
                  ),
                )}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.label}>
                日期
              </span>

              <select
                style={styles.input}
                value={
                  historyDateFilter
                }
                onChange={
                  (event) =>
                    setHistoryDateFilter(
                      event.target.value as
                        HistoryDateFilter,
                    )
                }
              >
                <option value="全部">
                  全部
                </option>

                <option value="今天">
                  今天
                </option>

                <option value="近 7 天">
                  近 7 天
                </option>

                <option value="近 30 天">
                  近 30 天
                </option>

                <option value="自訂">
                  自訂日期
                </option>
              </select>
            </label>
          </div>

          {historyDateFilter ===
            "自訂" && (
            <div style={styles.customDateGrid}>
              <label style={styles.field}>
                <span style={styles.label}>
                  起始日期
                </span>

                <input
                  type="date"
                  style={styles.input}
                  value={
                    customStartDate
                  }
                  onChange={
                    (event) =>
                      setCustomStartDate(
                        event.target.value,
                      )
                  }
                />
              </label>

              <label style={styles.field}>
                <span style={styles.label}>
                  結束日期
                </span>

                <input
                  type="date"
                  style={styles.input}
                  value={
                    customEndDate
                  }
                  onChange={
                    (event) =>
                      setCustomEndDate(
                        event.target.value,
                      )
                  }
                />
              </label>
            </div>
          )}
        </div>

        {loading ? (
          <div style={styles.emptyState}>
            入庫紀錄讀取中...
          </div>
        ) : filteredInboundTransactions.length ===
          0 ? (
          <div style={styles.emptyState}>
            尚無符合條件的入庫紀錄。
          </div>
        ) : (
          <div style={styles.tableCard}>
            <div style={styles.tableScroll}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>
                      入庫時間
                    </th>

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
                      本次入庫
                    </th>

                    <th style={styles.th}>
                      單位成本
                    </th>

                    <th style={styles.th}>
                      本次總成本
                    </th>

                    <th style={styles.th}>
                      入庫前
                    </th>

                    <th style={styles.th}>
                      入庫後
                    </th>

                    <th style={styles.th}>
                      來源 / 備註
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredInboundTransactions.map(
                    (
                      transaction,
                    ) => {
                      const refLotEnabled =
                        isRefLotCategory(
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
                            <span style={styles.categoryBadge}>
                              {
                                transaction.inventoryCategory
                              }
                            </span>
                          </td>

                          <td style={styles.td}>
                            <strong style={styles.itemName}>
                              {
                                transaction.inventoryName
                              }
                            </strong>
                          </td>

                          <td style={styles.td}>
                            {[
                              transaction.inventoryBrand,
                              transaction.inventoryModel,
                            ]
                              .filter(Boolean)
                              .join(" / ") ||
                              "—"}
                          </td>

                          <td style={styles.td}>
                            {
                              transaction.inventorySpecification ||
                              "—"
                            }
                          </td>

                          <td style={styles.td}>
                            {refLotEnabled
                              ? transaction.inventoryRefNumber ||
                                "—"
                              : "—"}
                          </td>

                          <td style={styles.td}>
                            {refLotEnabled
                              ? transaction.inventoryLotNumber ||
                                "—"
                              : "—"}
                          </td>

                          <td style={styles.td}>
                            {
                              transaction.inventoryExpiryDate ||
                              "—"
                            }
                          </td>

                          <td style={styles.td}>
                            <strong style={styles.receivedQuantity}>
                              +
                              {
                                transaction.quantityChange
                              }
                            </strong>
                          </td>

                          <td style={styles.td}>
                            {
                              formatMoney(
                                transaction.unitCost,
                              )
                            }
                          </td>

                          <td style={styles.td}>
                            <strong style={styles.costValue}>
                              {
                                formatMoney(
                                  transaction.totalCost,
                                )
                              }
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

                          <td style={styles.noteCell}>
                            {
                              transaction.note ||
                              "—"
                            }
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
      </section>

      {/* ===================================================
          Receive Modal
      =================================================== */}

      {receiveOpen &&
        canReceive && (
          <Modal
            title="新增入庫"
            onClose={
              closeReceive
            }
            wide
          >
            <form
              style={styles.modalForm}
              onSubmit={
                handleReceive
              }
            >
              <div style={styles.formGrid}>
                <label style={styles.field}>
                  <span style={styles.label}>
                    入庫品項 *
                  </span>

                  <select
                    style={styles.input}
                    value={
                      receiveForm.inventoryItemId
                    }
                    onChange={
                      (event) =>
                        setReceiveForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            inventoryItemId:
                              event.target.value,
                          }),
                        )
                    }
                  >
                    <option value="">
                      請選擇品項
                    </option>

                    {inventory.map(
                      (item) => (
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
                          ｜目前{" "}
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
                    本次入庫數量 *
                  </span>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    style={styles.input}
                    value={
                      receiveForm.quantity
                    }
                    onChange={
                      (event) =>
                        setReceiveForm(
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
                    單位成本（NT$）*
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style={styles.input}
                    value={
                      receiveForm.unitCost
                    }
                    onChange={
                      (event) =>
                        setReceiveForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            unitCost:
                              event.target.value,
                          }),
                        )
                    }
                    placeholder="例如：3600"
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    供應商
                  </span>

                  <input
                    style={styles.input}
                    value={
                      receiveForm.supplier
                    }
                    onChange={
                      (event) =>
                        setReceiveForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            supplier:
                              event.target.value,
                          }),
                        )
                    }
                    placeholder="例如：XX 醫材"
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    採購 / 發票 / 進貨單號
                  </span>

                  <input
                    style={styles.input}
                    value={
                      receiveForm.orderNumber
                    }
                    onChange={
                      (event) =>
                        setReceiveForm(
                          (
                            current,
                          ) => ({
                            ...current,

                            orderNumber:
                              event.target.value,
                          }),
                        )
                    }
                    placeholder="選填"
                  />
                </label>
              </div>

              {selectedReceiveItem && (
                <>
                  <div style={styles.itemPreview}>
                    <Detail
                      label="分類"
                      value={
                        selectedReceiveItem.category
                      }
                    />

                    <Detail
                      label="品項"
                      value={
                        selectedReceiveItem.name
                      }
                    />

                    <Detail
                      label="規格"
                      value={
                        selectedReceiveItem.specification ||
                        "—"
                      }
                    />

                    <Detail
                      label="目前庫存"
                      value={
                        selectedReceiveItem.quantity
                      }
                    />

                    <Detail
                      label="入庫後"
                      value={
                        selectedReceiveItem.quantity +
                        (
                          Number(
                            receiveForm.quantity,
                          ) ||
                          0
                        )
                      }
                    />

                    <Detail
                      label="本次單位成本"
                      value={
                        receiveForm.unitCost.trim() ===
                        ""
                          ? "—"
                          : formatMoney(
                              Number(
                                receiveForm.unitCost,
                              ),
                            )
                      }
                    />

                    <Detail
                      label="本次進貨總成本"
                      value={
                        formatMoney(
                          (
                            Number(
                              receiveForm.quantity,
                            ) ||
                            0
                          ) *
                            (
                              Number(
                                receiveForm.unitCost,
                              ) ||
                              0
                            ),
                        )
                      }
                    />

                    <Detail
                      label="目前平均單位成本"
                      value={
                        formatMoney(
                          selectedReceiveItem.unitCost,
                        )
                      }
                    />

                    <Detail
                      label="有效期限"
                      value={
                        selectedReceiveItem.expiryDate ||
                        "—"
                      }
                    />

                    {isRefLotCategory(
                      selectedReceiveItem.category,
                    ) && (
                      <>
                        <Detail
                          label="REF"
                          value={
                            selectedReceiveItem.refNumber ||
                            "—"
                          }
                        />

                        <Detail
                          label="LOT"
                          value={
                            selectedReceiveItem.lotNumber ||
                            "—"
                          }
                        />
                      </>
                    )}
                  </div>

                  {!isRefLotCategory(
                    selectedReceiveItem.category,
                  ) && (
                    <div style={styles.generalConsumableNotice}>
                      此品項屬於一般耗材，入庫紀錄只追蹤有效期限與數量，不使用 REF / LOT。
                    </div>
                  )}
                </>
              )}

              <label style={styles.field}>
                <span style={styles.label}>
                  入庫備註
                </span>

                <textarea
                  rows={4}
                  style={styles.textarea}
                  value={
                    receiveForm.note
                  }
                  onChange={
                    (event) =>
                      setReceiveForm(
                        (
                          current,
                        ) => ({
                          ...current,

                          note:
                            event.target.value,
                        }),
                      )
                  }
                  placeholder="例如：9 月例行進貨、補足安全庫存..."
                />
              </label>

              <div style={styles.receiveWarning}>
                確認後系統會立即增加庫存，保存本次單位成本與總成本，並更新該批次的移動加權平均成本。若目前庫存本身有盤點差異，請不要用入庫修正，應至庫存管理使用「手動調整」。
              </div>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  disabled={
                    saving
                  }
                  onClick={
                    closeReceive
                  }
                >
                  取消
                </button>

                <button
                  type="submit"
                  style={styles.primaryButton}
                  disabled={
                    saving
                  }
                >
                  {saving
                    ? "入庫中..."
                    : "確認入庫"}
                </button>
              </div>
            </form>
          </Modal>
        )}
    </div>
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
    ReactNode;
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

function Detail({
  label,
  value,
}: {
  label:
    string;

  value:
    ReactNode;
}) {
  return (
    <div style={styles.detail}>
      <span style={styles.detailLabel}>
        {label}
      </span>

      <strong style={styles.detailValue}>
        {value}
      </strong>
    </div>
  );
}

function StockBadge({
  quantity,
}: {
  quantity:
    number;
}) {
  return (
    <span
      style={
        quantity ===
        0
          ? {
              ...styles.stockBadge,
              ...styles.stockDanger,
            }
          : {
              ...styles.stockBadge,
              ...styles.stockWarning,
            }
      }
    >
      {quantity ===
      0
        ? "零庫存"
        : "低庫存"}
    </span>
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
      "repeat(auto-fit, minmax(155px, 1fr))",
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
    marginBottom: "20px",
    padding: "14px 16px",
    border: "1px solid #cfe0d5",
    borderRadius: "12px",
    background: "#f4faf6",
    color: "#315e47",
  },

  noticeText: {
    marginTop: "5px",
    color: "#6f8177",
    fontSize: "12px",
    lineHeight: 1.65,
  },

  section: {
    marginBottom: "28px",
  },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "16px",
    marginBottom: "12px",
  },

  sectionTitle: {
    margin: 0,
    color: "#294f3c",
    fontSize: "18px",
  },

  sectionSubtitle: {
    marginTop: "5px",
    color: "#849188",
    fontSize: "11px",
  },

  sectionCount: {
    display: "inline-flex",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#eef5f0",
    color: "#51705f",
    fontSize: "11px",
    fontWeight: 800,
  },

  lowStockGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(290px, 1fr))",
    gap: "12px",
  },

  lowStockCard: {
    padding: "16px",
    border: "1px solid #eadba7",
    borderRadius: "13px",
    background: "#fffdf6",
  },

  zeroStockCard: {
    borderColor: "#e5c2be",
    background: "#fff8f7",
  },

  lowStockCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
  },

  lowStockName: {
    margin: "7px 0 0",
    color: "#334f40",
    fontSize: "16px",
  },

  lowStockMeta: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "14px",
  },

  quickReceiveButton: {
    width: "100%",
    minHeight: "39px",
    marginTop: "14px",
    border: "1px solid #47795e",
    borderRadius: "9px",
    background: "#47795e",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
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

  stockBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 800,
  },

  stockWarning: {
    background: "#fff0c9",
    color: "#8c640d",
  },

  stockDanger: {
    background: "#f8e5e3",
    color: "#a44942",
  },

  detail: {
    minWidth: 0,
  },

  detailLabel: {
    display: "block",
    marginBottom: "3px",
    color: "#909b95",
    fontSize: "9px",
  },

  detailValue: {
    color: "#53665b",
    fontSize: "11px",
    overflowWrap: "anywhere",
  },

  filterCard: {
    marginBottom: "14px",
    padding: "15px",
    border: "1px solid #e0e8e3",
    borderRadius: "12px",
    background: "#ffffff",
  },

  filterGrid: {
    display: "grid",
    gridTemplateColumns:
      "minmax(300px, 1fr) 240px 180px",
    gap: "12px",
  },

  customDateGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 220px))",
    gap: "12px",
    marginTop: "12px",
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
    minHeight: "40px",
    padding: "0 14px",
    border: "1px solid #d2dfd7",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#51665a",
    fontWeight: 700,
    cursor: "pointer",
  },

  tableCard: {
    minWidth: 0,
    border: "1px solid #dfe8e2",
    borderRadius: "14px",
    background: "#ffffff",
    overflow: "hidden",
  },

  tableScroll: {
    width: "100%",
    overflowX: "auto",
  },

  table: {
    width: "100%",
    minWidth: "1850px",
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
    maxWidth: "360px",
    padding: "12px 13px",
    borderBottom: "1px solid #edf2ef",
    color: "#465b50",
    fontSize: "11px",
    verticalAlign: "middle",
    whiteSpace: "normal",
  },

  itemName: {
    color: "#294f3c",
  },

  receivedQuantity: {
    color: "#2f7755",
    fontSize: "13px",
  },

  costValue: {
    color: "#315f49",
    fontSize: "12px",
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
    width: "min(950px, 100%)",
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

  itemPreview: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(120px, 1fr))",
    gap: "12px",
    padding: "14px",
    border: "1px solid #dfe8e2",
    borderRadius: "10px",
    background: "#fafcfb",
  },

  generalConsumableNotice: {
    padding: "11px 13px",
    border: "1px solid #d7e5dc",
    borderRadius: "9px",
    background: "#f5faf7",
    color: "#60766a",
    fontSize: "11px",
  },

  receiveWarning: {
    padding: "12px 14px",
    border: "1px solid #eadba7",
    borderRadius: "10px",
    background: "#fffbed",
    color: "#79631e",
    fontSize: "11px",
    lineHeight: 1.7,
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "4px",
  },

  emptyState: {
    padding: "44px 20px",
    border: "1px dashed #d9e4dc",
    borderRadius: "13px",
    color: "#839087",
    textAlign: "center",
  },

  goodState: {
    padding: "30px 20px",
    border: "1px solid #cfe2d6",
    borderRadius: "13px",
    background: "#f4faf6",
    color: "#347054",
    textAlign: "center",
    fontWeight: 700,
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
