import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useOutletContext,
} from "react-router-dom";

import type {
  DentflowMainLayoutContext,
} from "../layouts/MainLayout";

import "../styles/dashboard.css";

import birdMascot from "../assets/jiexi-bird.png";

/* =========================================================
   Extended Dashboard Types
========================================================= */

type DashboardImplant = {
  record:
    DentflowImplantRecord;

  clinicId:
    number;

  clinicName:
    string;
};

type DashboardConsumable = {
  record:
    DentflowConsumableUsageRecord;

  clinicId:
    number;

  clinicName:
    string;
};

type DashboardInventory = {
  record:
    DentflowInventoryRecord;

  clinicId:
    number;

  clinicName:
    string;
};

type DashboardTransaction = {
  record:
    DentflowInventoryTransactionRecord;

  clinicId:
    number;

  clinicName:
    string;
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
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function getTodayDisplay() {
  return new Intl.DateTimeFormat(
    "zh-TW",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
    },
  ).format(new Date());
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

function getExpiryDays(
  expiryDate: string,
) {
  if (!expiryDate) {
    return null;
  }

  const expiry =
    new Date(
      `${expiryDate}T00:00:00`,
    );

  if (
    Number.isNaN(
      expiry.getTime(),
    )
  ) {
    return null;
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0,
  );

  return Math.ceil(
    (
      expiry.getTime() -
      today.getTime()
    ) /
      86_400_000,
  );
}

function getTransactionChangeText(
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

export default function Dashboard() {
  const navigate =
    useNavigate();

  const {
    session,
    clinicScope,
    isAllClinics,
  } =
    useOutletContext<
      DentflowMainLayoutContext
    >();

  const [
    doctorIdentity,
    setDoctorIdentity,
  ] =
    useState<
      DentflowDoctorRecord | null
    >(null);

  const [
    implants,
    setImplants,
  ] =
    useState<
      DashboardImplant[]
    >([]);

  const [
    consumables,
    setConsumables,
  ] =
    useState<
      DashboardConsumable[]
    >([]);

  const [
    inventory,
    setInventory,
  ] =
    useState<
      DashboardInventory[]
    >([]);

  const [
    transactions,
    setTransactions,
  ] =
    useState<
      DashboardTransaction[]
    >([]);

  const [
    clinicCount,
    setClinicCount,
  ] =
    useState(1);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  /* =======================================================
     Permissions
  ======================================================= */

  const role =
    session.role;

  const isDoctor =
    role ===
    "Doctor";

  const isAssistant =
    role ===
    "Assistant";

  const isAdmin =
    role ===
    "Admin";

  const isAccountant =
    role ===
    "Accountant";

  const isProcurement =
    role ===
    "Procurement";

  const canViewImplants =
    isDoctor ||
    isAssistant ||
    isAdmin;

  const canViewConsumables =
    isDoctor ||
    isAssistant ||
    isAdmin;

  const canViewInventory =
    isDoctor ||
    isAssistant ||
    isAdmin ||
    isProcurement;

  const canViewPurchase =
    isAdmin ||
    isAccountant ||
    isProcurement;

  const canViewReports =
    isDoctor ||
    isAdmin ||
    isAccountant;

  /* =======================================================
     Load Whenever Scope Changes
  ======================================================= */

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      setImplants([]);
      setConsumables([]);
      setInventory([]);
      setTransactions([]);

      /*
       * =====================================================
       * Doctor
       * =====================================================
       */

      if (
        session.role ===
        "Doctor"
      ) {
        const doctor =
          await window.dentflow.doctors.byUserId(
            session.userId,
            session.clinicId,
          );

        if (!doctor) {
          throw new Error(
            "找不到目前登入帳號對應的醫師資料。",
          );
        }

        setDoctorIdentity(
          doctor,
        );

        /*
         * ===================================================
         * Doctor / All Clinics
         * ===================================================
         */

        if (
          isAllClinics
        ) {
          const memberships =
            await window.dentflow.doctors.clinics(
              doctor.id,
            );

          const activeClinics =
            memberships.filter(
              (membership) =>
                membership.clinicIsActive ===
                1,
            );

          setClinicCount(
            activeClinics.length,
          );

          const results =
            await Promise.all(
              activeClinics.map(
                async (
                  membership,
                ) => {
                  const clinicId =
                    membership.clinicId;

                  const clinicName =
                    membership.clinicName;

                  const [
                    implantRecords,
                    consumableRecords,
                    inventoryRecords,
                    transactionRecords,
                  ] =
                    await Promise.all([
                      window.dentflow.implants.byDoctor(
                        doctor.id,
                        clinicId,
                        session.userId,
                      ),

                      window.dentflow.consumables.byDoctor(
                        doctor.id,
                        clinicId,
                        undefined,
                        session.userId,
                      ),

                      window.dentflow.inventory.list(
                        clinicId,
                        session.userId,
                      ),

                      window.dentflow.inventoryTransactions.list(
                        clinicId,
                      ),
                    ]);

                  return {
                    clinicId,
                    clinicName,

                    implantRecords,
                    consumableRecords,
                    inventoryRecords,
                    transactionRecords,
                  };
                },
              ),
            );

          setImplants(
            results.flatMap(
              (result) =>
                result.implantRecords.map(
                  (record) => ({
                    record,

                    clinicId:
                      result.clinicId,

                    clinicName:
                      result.clinicName,
                  }),
                ),
            ),
          );

          setConsumables(
            results.flatMap(
              (result) =>
                result.consumableRecords.map(
                  (record) => ({
                    record,

                    clinicId:
                      result.clinicId,

                    clinicName:
                      result.clinicName,
                  }),
                ),
            ),
          );

          setInventory(
            results.flatMap(
              (result) =>
                result.inventoryRecords.map(
                  (record) => ({
                    record,

                    clinicId:
                      result.clinicId,

                    clinicName:
                      result.clinicName,
                  }),
                ),
            ),
          );

          setTransactions(
            results.flatMap(
              (result) =>
                result.transactionRecords.map(
                  (record) => ({
                    record,

                    clinicId:
                      result.clinicId,

                    clinicName:
                      result.clinicName,
                  }),
                ),
            ),
          );

          return;
        }

        /*
         * ===================================================
         * Doctor / Single Clinic
         * ===================================================
         */

        const clinicId =
          clinicScope.mode ===
          "clinic"
            ? clinicScope.clinicId
            : session.clinicId;

        const [
          implantRecords,
          consumableRecords,
          inventoryRecords,
          transactionRecords,
        ] =
          await Promise.all([
            window.dentflow.implants.byDoctor(
              doctor.id,
              clinicId,
              session.userId,
            ),

            window.dentflow.consumables.byDoctor(
              doctor.id,
              clinicId,
              undefined,
              session.userId,
            ),

            window.dentflow.inventory.list(
              clinicId,
              session.userId,
            ),

            window.dentflow.inventoryTransactions.list(
              clinicId,
            ),
          ]);

        setClinicCount(1);

        setImplants(
          implantRecords.map(
            (record) => ({
              record,

              clinicId,

              clinicName:
                session.clinicName,
            }),
          ),
        );

        setConsumables(
          consumableRecords.map(
            (record) => ({
              record,

              clinicId,

              clinicName:
                session.clinicName,
            }),
          ),
        );

        setInventory(
          inventoryRecords.map(
            (record) => ({
              record,

              clinicId,

              clinicName:
                session.clinicName,
            }),
          ),
        );

        setTransactions(
          transactionRecords.map(
            (record) => ({
              record,

              clinicId,

              clinicName:
                session.clinicName,
            }),
          ),
        );

        return;
      }

      /*
       * =====================================================
       * Non-Doctor
       *
       * 目前仍維持單院所模式。
       * =====================================================
       */

      setDoctorIdentity(null);
      setClinicCount(1);

      const clinicId =
        session.clinicId;

      const [
        inventoryRecords,
        transactionRecords,
      ] =
        await Promise.all([
          window.dentflow.inventory.list(
            clinicId,
            session.userId,
          ),

          window.dentflow.inventoryTransactions.list(
            clinicId,
          ),
        ]);

      setInventory(
        inventoryRecords.map(
          (record) => ({
            record,

            clinicId,

            clinicName:
              session.clinicName,
          }),
        ),
      );

      setTransactions(
        transactionRecords.map(
          (record) => ({
            record,

            clinicId,

            clinicName:
              session.clinicName,
          }),
        ),
      );

      if (
        session.role ===
          "Assistant" ||
        session.role ===
          "Admin"
      ) {
        const [
          implantRecords,
          consumableRecords,
        ] =
          await Promise.all([
            window.dentflow.implants.list(
              clinicId,
              session.userId,
            ),

            window.dentflow.consumables.list(
              clinicId,
              undefined,
              session.userId,
            ),
          ]);

        setImplants(
          implantRecords.map(
            (record) => ({
              record,

              clinicId,

              clinicName:
                session.clinicName,
            }),
          ),
        );

        setConsumables(
          consumableRecords.map(
            (record) => ({
              record,

              clinicId,

              clinicName:
                session.clinicName,
            }),
          ),
        );
      }
    } catch (
      loadError
    ) {
      setImplants([]);
      setConsumables([]);
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
  }, [clinicScope, isAllClinics, session.clinicId, session.clinicName, session.role, session.userId]);

  useEffect(() => {
    queueMicrotask(() => void loadDashboard());
  }, [loadDashboard]);

  async function refresh() {
    await loadDashboard();
  }

  /* =======================================================
     Date
  ======================================================= */

  const today =
    getTodayString();

  /* =======================================================
     Implant Statistics
  ======================================================= */


  const pendingOrderCount =
    useMemo(
      () =>
        implants.filter(
          (item) =>
            item.record.status ===
            "待醫師叫貨",
        ).length,
      [
        implants,
      ],
    );

  const urgentPendingOrderCount =
    useMemo(
      () => implants.filter((item) => {
        if (item.record.status !== "待醫師叫貨" || !item.record.implantDate) return false;
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const target = new Date(`${item.record.implantDate}T00:00:00`);
        const days = Math.ceil((target.getTime() - start.getTime()) / 86_400_000);
        return days >= 0 && days <= 7;
      }).length,
      [implants],
    );

  const overduePendingOrderCount = useMemo(
    () => implants.filter((item) => {
      if (item.record.status !== "待醫師叫貨" || !item.record.implantDate) return false;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const target = new Date(`${item.record.implantDate}T00:00:00`);
      return target.getTime() < start.getTime();
    }).length,
    [implants],
  );

  const futurePendingOrderCount = pendingOrderCount - urgentPendingOrderCount - overduePendingOrderCount;

  const orderedCount =
    useMemo(
      () =>
        implants.filter(
          (item) =>
            item.record.status ===
            "醫師已叫貨",
        ).length,
      [
        implants,
      ],
    );

  const surgeryReadyCount =
    useMemo(
      () =>
        implants.filter(
          (item) =>
            item.record.status ===
            "已取出待手術",
        ).length,
      [
        implants,
      ],
    );

  const postOpPendingCount =
    useMemo(
      () =>
        implants.filter(
          (item) =>
            item.record.status ===
            "待術後紀錄",
        ).length,
      [
        implants,
      ],
    );


  /* =======================================================
     Consumable Statistics
  ======================================================= */

  const pendingSignatureRecords =
    useMemo(
      () =>
        consumables.filter(
          (item) =>
            item.record.status ===
            "待醫師簽名",
        ),
      [
        consumables,
      ],
    );

  const todayConsumables =
    useMemo(
      () =>
        consumables.filter(
          (item) =>
            item.record.usageDate ===
              today &&
            item.record.status !==
              "已取消",
        ),
      [
        consumables,
        today,
      ],
    );

  /* =======================================================
     Inventory Statistics
  ======================================================= */

  const lowStockItems =
    useMemo(
      () =>
        inventory.filter(
          (item) =>
            item.record.quantity <=
            item.record.safetyStock,
        ),
      [
        inventory,
      ],
    );

  const zeroStockItems =
    useMemo(
      () =>
        inventory.filter(
          (item) =>
            item.record.quantity ===
            0,
        ),
      [
        inventory,
      ],
    );

  const expiredItems =
    useMemo(
      () =>
        inventory.filter(
          (item) => {
            const days =
              getExpiryDays(
                item.record.expiryDate,
              );

            return (
              days !==
                null &&
              days < 0
            );
          },
        ),
      [
        inventory,
      ],
    );

  const expiringSoonItems =
    useMemo(
      () =>
        inventory.filter(
          (item) => {
            const days =
              getExpiryDays(
                item.record.expiryDate,
              );

            return (
              days !==
                null &&
              days >=
                0 &&
              days <=
                30
            );
          },
        ),
      [
        inventory,
      ],
    );

  /* =======================================================
     Recent Activity
  ======================================================= */

  const recentTransactions =
    useMemo(
      () =>
        [
          ...transactions,
        ]
          .sort(
            (
              a,
              b,
            ) => {
              const timeA =
                new Date(
                  a.record.createdAt,
                ).getTime();

              const timeB =
                new Date(
                  b.record.createdAt,
                ).getTime();

              if (
                timeA !==
                timeB
              ) {
                return (
                  timeB -
                  timeA
                );
              }

              return (
                b.record.id -
                a.record.id
              );
            },
          )
          .slice(
            0,
            8,
          ),
      [
        transactions,
      ],
    );

  const recentConsumables =
    useMemo(
      () =>
        [
          ...consumables,
        ]
          .sort(
            (
              a,
              b,
            ) => {
              if (
                a.record.usageDate !==
                b.record.usageDate
              ) {
                return b.record.usageDate.localeCompare(
                  a.record.usageDate,
                );
              }

              return (
                b.record.id -
                a.record.id
              );
            },
          )
          .slice(
            0,
            6,
          ),
      [
        consumables,
      ],
    );

  const recentImplants =
    useMemo(
      () =>
        [...implants]
          .sort(
            (
              a,
              b,
            ) => {
              if (
                a.record.implantDate !==
                b.record.implantDate
              ) {
                return b.record.implantDate.localeCompare(
                  a.record.implantDate,
                );
              }

              return (
                b.record.id -
                a.record.id
              );
            },
          )
          .slice(
            0,
            6,
          ),
      [
        implants,
      ],
    );

  const inventoryTotalQuantity =
    useMemo(
      () =>
        inventory.reduce(
          (
            total,
            item,
          ) =>
            total +
            item.record.quantity,
          0,
        ),
      [
        inventory,
      ],
    );

  const implantInventoryQuantity =
    useMemo(
      () =>
        inventory
          .filter(
            (item) =>
              item.record.category ===
                "植體" ||
              item.record.category ===
                "套件",
          )
          .reduce(
            (
              total,
              item,
            ) =>
              total +
              item.record.quantity,
            0,
          ),
      [
        inventory,
      ],
    );

  const consumableInventoryQuantity =
    Math.max(
      inventoryTotalQuantity -
        implantInventoryQuantity,
      0,
    );

  /* =======================================================
     Priority Tasks
  ======================================================= */

  const priorityTasks =
    useMemo(
      () => {
        const tasks:
          Array<{
            key: string;

            title: string;

            description: string;

            count: number;

            path: string;

            level:
              | "danger"
              | "warning"
              | "normal";
          }> = [];

        if (canViewImplants && overduePendingOrderCount > 0) {
          tasks.push({
            key: "implant-order-overdue", title: "逾期未叫貨",
            description: "手術日已過，仍未完成叫貨。", count: overduePendingOrderCount,
            path: "/implants?orderReminder=逾期未叫貨", level: "danger",
          });
        }

        if (canViewImplants && urgentPendingOrderCount > 0) tasks.push({
          key: "implant-order-seven-days", title: "七天內未叫貨",
          description: "手術日進入七天內，請優先處理。", count: urgentPendingOrderCount,
          path: "/implants?orderReminder=七天內未叫貨", level: "warning",
        });

        if (canViewImplants && futurePendingOrderCount > 0) tasks.push({
          key: "implant-order-pending", title: "尚未叫貨",
          description: "尚未進入七天提醒期的待叫貨個案。", count: futurePendingOrderCount,
          path: "/implants?orderReminder=尚未叫貨", level: "normal",
        });

        if (
          canViewImplants &&
          postOpPendingCount >
            0
        ) {
          tasks.push({
            key:
              "post-op",

            title:
              "待術後紀錄",

            description:
              "需要選擇實際使用批次並完成植體追溯。",

            count:
              postOpPendingCount,

            path:
              "/implants",

            level:
              "danger",
          });
        }

        if (
          canViewConsumables &&
          pendingSignatureRecords.length >
            0
        ) {
          tasks.push({
            key:
              "signature",

            title:
              "待醫師簽名",

            description:
              isDoctor
                ? "有一般耗材使用紀錄等待您簽名。"
                : "有一般耗材使用紀錄尚待指定醫師簽名。",

            count:
              pendingSignatureRecords.length,

            path:
              "/consumables",

            level:
              "warning",
          });
        }

        if (
          canViewInventory &&
          zeroStockItems.length >
            0
        ) {
          tasks.push({
            key:
              "zero-stock",

            title:
              "零庫存",

            description:
              "有庫存品項目前數量為 0。",

            count:
              zeroStockItems.length,

            path:
              canViewPurchase
                ? "/purchase"
                : "/inventory",

            level:
              "danger",
          });
        }

        if (
          canViewInventory &&
          lowStockItems.length >
            0
        ) {
          tasks.push({
            key:
              "low-stock",

            title:
              "低庫存",

            description:
              "庫存低於或等於安全庫存，建議安排補貨。",

            count:
              lowStockItems.length,

            path:
              canViewPurchase
                ? "/purchase"
                : "/inventory",

            level:
              "warning",
          });
        }

        if (
          canViewInventory &&
          expiredItems.length >
            0
        ) {
          tasks.push({
            key:
              "expired",

            title:
              "已過期品項",

            description:
              "有庫存品項已超過有效期限，請立即確認。",

            count:
              expiredItems.length,

            path:
              "/inventory",

            level:
              "danger",
          });
        }

        return tasks;
      },
      [
        canViewImplants,
        canViewConsumables,
        canViewInventory,
        canViewPurchase,
        isDoctor,
        urgentPendingOrderCount,
        overduePendingOrderCount,
        futurePendingOrderCount,
        postOpPendingCount,
        pendingSignatureRecords.length,
        zeroStockItems.length,
        lowStockItems.length,
        expiredItems.length,
      ],
    );

  /* =======================================================
     UI Labels
  ======================================================= */


  const scopeDescription =
    isAllClinics &&
    isDoctor
      ? `整合瀏覽 ${clinicCount} 間執業院所`
      : "目前院所";

  /* =======================================================
     UI
  ======================================================= */

  const todayDisplay =
    getTodayDisplay();

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="dashboard-hero-kicker">
            {scopeDescription}
          </div>

          <h1 className="dashboard-hero-title">
            早安，
            {isDoctor &&
            doctorIdentity
              ? `${doctorIdentity.name} 醫師`
              : session.name}
            <span aria-hidden="true">
              👋
            </span>
          </h1>

          <div className="dashboard-hero-date">
            今天是 {todayDisplay}
          </div>

          {isAllClinics &&
            isDoctor && (
            <div className="dashboard-scope-pill">
              已整合 {clinicCount} 間執業院所
            </div>
          )}
        </div>

        <div className="dashboard-hero-mascot">
          <div className="dashboard-hero-note">
            <strong>
              用專業，
            </strong>
            <span>
              讓笑容更美好
            </span>
          </div>

          <img
            src={birdMascot}
            alt=""
          />
        </div>

        <button
          type="button"
          className="dashboard-refresh-button"
          disabled={loading}
          onClick={() =>
            void refresh()
          }
        >
          {loading
            ? "更新中..."
            : "重新整理"}
        </button>
      </section>

      {error && (
        <div className="dashboard-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="dashboard-loading">
          儀表板資料讀取中...
        </div>
      ) : (
        <>
          <section className="dashboard-metrics">
            {canViewImplants && (
              <>
                <DashboardStat
                  icon="🦷"
                  label="待醫師叫貨"
                  value={pendingOrderCount}
                  suffix="個案"
                  hint="查看清單 →"
                  kind={
                    pendingOrderCount >
                    0
                      ? "warning"
                      : "normal"
                  }
                  onClick={() =>
                    navigate(
                      "/implants",
                    )
                  }
                />

                <DashboardStat
                  icon="▤"
                  label="醫師已叫貨"
                  value={orderedCount}
                  suffix="個案"
                  hint="查看清單 →"
                  kind="normal"
                  onClick={() =>
                    navigate(
                      "/implants",
                    )
                  }
                />

                <DashboardStat
                  icon="▣"
                  label="已取出待手術"
                  value={surgeryReadyCount}
                  suffix="個案"
                  hint="查看清單 →"
                  kind="normal"
                  onClick={() =>
                    navigate(
                      "/implants",
                    )
                  }
                />

                <DashboardStat
                  icon="✎"
                  label="待術後紀錄"
                  value={postOpPendingCount}
                  suffix="個案"
                  hint="查看清單 →"
                  kind={
                    postOpPendingCount >
                    0
                      ? "warning"
                      : "normal"
                  }
                  onClick={() =>
                    navigate(
                      "/implants",
                    )
                  }
                />
              </>
            )}

            {canViewConsumables && (
              <DashboardStat
                icon="↶"
                label="待醫師簽名"
                value={
                  pendingSignatureRecords.length
                }
                suffix="筆"
                hint="查看清單 →"
                kind={
                  pendingSignatureRecords.length >
                  0
                    ? "warning"
                    : "normal"
                }
                onClick={() =>
                  navigate(
                    "/consumables",
                  )
                }
              />
            )}

            {canViewInventory && (
              <DashboardStat
                icon="△"
                label="低庫存提醒"
                value={lowStockItems.length}
                suffix="項"
                hint="查看清單 →"
                kind={
                  lowStockItems.length >
                  0
                    ? "danger"
                    : "normal"
                }
                onClick={() =>
                  navigate(
                    canViewPurchase
                      ? "/purchase"
                      : "/inventory",
                  )
                }
              />
            )}
          </section>

          <div className="dashboard-main-grid">
            {canViewImplants && (
              <section className="dashboard-panel dashboard-case-panel">
                <div className="dashboard-panel-header">
                  <div>
                    <h2>
                      最近個案動態
                    </h2>

                    <p>
                      近期植體病例與目前進度
                    </p>
                  </div>

                  <button
                    type="button"
                    className="dashboard-text-button"
                    onClick={() =>
                      navigate(
                        "/implants",
                      )
                    }
                  >
                    查看全部 →
                  </button>
                </div>

                {recentImplants.length ===
                0 ? (
                  <div className="dashboard-empty">
                    尚無植體病例資料。
                  </div>
                ) : (
                  <div className="dashboard-case-table-wrap">
                    <table className="dashboard-case-table">
                      <thead>
                        <tr>
                          <th>
                            個案編號
                          </th>
                          <th>
                            病患姓名
                          </th>
                          <th>
                            牙位
                          </th>
                          <th>
                            日期
                          </th>
                          <th>
                            狀態
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {recentImplants.map(
                          (item) => {
                            const record =
                              item.record;

                            const toothText =
                              record.teeth
                                .map(
                                  (tooth) =>
                                    tooth.toothPosition,
                                )
                                .filter(Boolean)
                                .join("、") ||
                              "—";

                            return (
                              <tr
                                key={`${item.clinicId}-${record.id}`}
                              >
                                <td>
                                  IMP-
                                  {String(
                                    record.id,
                                  ).padStart(
                                    6,
                                    "0",
                                  )}
                                </td>

                                <td>
                                  <strong>
                                    {record.patientName}
                                  </strong>

                                  {isAllClinics && (
                                    <span className="dashboard-table-sub">
                                      {item.clinicName}
                                    </span>
                                  )}
                                </td>

                                <td>
                                  {toothText}
                                </td>

                                <td>
                                  {record.implantDate ||
                                    "—"}
                                </td>

                                <td>
                                  <ImplantStatusBadge
                                    status={
                                      record.status
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          },
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <section className="dashboard-panel dashboard-quick-panel">
              <div className="dashboard-panel-header">
                <div>
                  <h2>
                    快速功能
                  </h2>

                  <p>
                    依帳號權限顯示常用入口
                  </p>
                </div>
              </div>

              <div className="dashboard-quick-grid">
                {(isDoctor ||
                  isAssistant ||
                  isAdmin) && (
                  <QuickLink
                    icon="＋"
                    title="新增病患"
                    onClick={() =>
                      navigate(
                        "/patients",
                      )
                    }
                  />
                )}

                {canViewImplants && (
                  <QuickLink
                    icon="🦷"
                    title="植體病例"
                    onClick={() =>
                      navigate(
                        "/implants",
                      )
                    }
                  />
                )}

                {canViewConsumables && (
                  <QuickLink
                    icon="▤"
                    title="耗材使用"
                    onClick={() =>
                      navigate(
                        "/consumables",
                      )
                    }
                  />
                )}

                {canViewInventory && (
                  <QuickLink
                    icon="□"
                    title="庫存管理"
                    onClick={() =>
                      navigate(
                        "/inventory",
                      )
                    }
                  />
                )}

                {canViewPurchase && (
                  <QuickLink
                    icon="↻"
                    title="採購入庫"
                    onClick={() =>
                      navigate(
                        "/purchase",
                      )
                    }
                  />
                )}

                {canViewReports && (
                  <QuickLink
                    icon="◷"
                    title="報表查詢"
                    onClick={() =>
                      navigate(
                        "/reports",
                      )
                    }
                  />
                )}
              </div>
            </section>
          </div>

          <div className="dashboard-bottom-grid">
            {canViewInventory && (
              <section className="dashboard-panel">
                <div className="dashboard-panel-header">
                  <div>
                    <h2>
                      庫存狀態概覽
                    </h2>

                    <p>
                      即時掌握目前庫存與安全存量
                    </p>
                  </div>

                  <button
                    type="button"
                    className="dashboard-text-button"
                    onClick={() =>
                      navigate(
                        "/inventory",
                      )
                    }
                  >
                    查看全部 →
                  </button>
                </div>

                <div className="dashboard-inventory-overview">
                  <InventoryOverviewItem
                    icon="🦷"
                    label="植體與套件"
                    value={
                      implantInventoryQuantity
                    }
                    suffix="項"
                  />

                  <InventoryOverviewItem
                    icon="◇"
                    label="一般耗材"
                    value={
                      consumableInventoryQuantity
                    }
                    suffix="項"
                  />

                  <InventoryOverviewItem
                    icon="⚠"
                    label="低庫存"
                    value={
                      lowStockItems.length
                    }
                    suffix="項"
                    warning
                  />

                  <InventoryOverviewItem
                    icon="✓"
                    label="安全庫存內"
                    value={Math.max(
                      inventory.length -
                        lowStockItems.length,
                      0,
                    )}
                    suffix="項"
                  />
                </div>

                <div className="dashboard-stock-strip">
                  <span>
                    30 天內到期：
                    <strong>
                      {expiringSoonItems.length}
                    </strong>
                  </span>

                  <span>
                    已過期：
                    <strong className="danger">
                      {expiredItems.length}
                    </strong>
                  </span>

                  <span>
                    零庫存：
                    <strong className="danger">
                      {zeroStockItems.length}
                    </strong>
                  </span>
                </div>
              </section>
            )}

            <section className="dashboard-panel">
              <div className="dashboard-panel-header">
                <div>
                  <h2>
                    待處理事項
                  </h2>

                  <p>
                    依目前角色整理優先工作
                  </p>
                </div>
              </div>

              {priorityTasks.length ===
              0 ? (
                <div className="dashboard-good-state">
                  ✓ 目前沒有需要優先處理的事項
                </div>
              ) : (
                <div className="dashboard-reminder-list">
                  {priorityTasks
                    .slice(
                      0,
                      4,
                    )
                    .map(
                      (task) => (
                        <button
                          key={
                            task.key
                          }
                          type="button"
                          className={`dashboard-reminder-row ${task.level}`}
                          onClick={() =>
                            navigate(
                              task.path,
                            )
                          }
                        >
                          <span className="dashboard-reminder-dot" />

                          <span className="dashboard-reminder-copy">
                            <strong>
                              {task.title}
                            </strong>

                            <small>
                              {task.description}
                            </small>
                          </span>

                          <span className="dashboard-reminder-count">
                            {task.count}
                          </span>
                        </button>
                      ),
                    )}
                </div>
              )}
            </section>
          </div>

          <div className="dashboard-bottom-grid">
            {canViewInventory && (
              <section className="dashboard-panel">
                <div className="dashboard-panel-header">
                  <div>
                    <h2>
                      最近庫存異動
                    </h2>

                    <p>
                      最新庫存增減紀錄
                    </p>
                  </div>
                </div>

                {recentTransactions.length ===
                0 ? (
                  <div className="dashboard-empty">
                    尚無庫存異動紀錄。
                  </div>
                ) : (
                  <div className="dashboard-activity-list">
                    {recentTransactions
                      .slice(
                        0,
                        5,
                      )
                      .map(
                        (item) => {
                          const transaction =
                            item.record;

                          return (
                            <div
                              key={`${item.clinicId}-${transaction.id}`}
                              className="dashboard-activity-row"
                            >
                              <div>
                                <strong>
                                  {
                                    transaction.inventoryName
                                  }
                                </strong>

                                <span>
                                  {isAllClinics
                                    ? `${item.clinicName}｜`
                                    : ""}
                                  {formatDateTime(
                                    transaction.createdAt,
                                  )}
                                </span>
                              </div>

                              <div className="dashboard-activity-right">
                                <TransactionBadge
                                  type={
                                    transaction.type
                                  }
                                />

                                <strong
                                  className={
                                    transaction.quantityChange >
                                    0
                                      ? "dashboard-quantity-positive"
                                      : transaction.quantityChange <
                                          0
                                        ? "dashboard-quantity-negative"
                                        : "dashboard-quantity-neutral"
                                  }
                                >
                                  {getTransactionChangeText(
                                    transaction.quantityChange,
                                  )}
                                </strong>
                              </div>
                            </div>
                          );
                        },
                      )}
                  </div>
                )}
              </section>
            )}

            {canViewConsumables && (
              <section className="dashboard-panel">
                <div className="dashboard-panel-header">
                  <div>
                    <h2>
                      最近耗材使用
                    </h2>

                    <p>
                      今日有效使用 {todayConsumables.length} 筆
                    </p>
                  </div>

                  <button
                    type="button"
                    className="dashboard-text-button"
                    onClick={() =>
                      navigate(
                        "/consumables",
                      )
                    }
                  >
                    查看全部 →
                  </button>
                </div>

                {recentConsumables.length ===
                0 ? (
                  <div className="dashboard-empty">
                    尚無耗材使用紀錄。
                  </div>
                ) : (
                  <div className="dashboard-activity-list">
                    {recentConsumables
                      .slice(
                        0,
                        5,
                      )
                      .map(
                        (item) => {
                          const record =
                            item.record;

                          const quantity =
                            record.items.reduce(
                              (
                                total,
                                usageItem,
                              ) =>
                                total +
                                usageItem.quantity,
                              0,
                            );

                          return (
                            <div
                              key={`${item.clinicId}-${record.id}`}
                              className="dashboard-activity-row"
                            >
                              <div>
                                <strong>
                                  {
                                    record.patientName
                                  }
                                </strong>

                                <span>
                                  {isAllClinics
                                    ? `${item.clinicName}｜`
                                    : ""}
                                  {record.usageType}
                                  ｜{record.doctorName}
                                </span>
                              </div>

                              <div className="dashboard-activity-right">
                                <ConsumableStatusBadge
                                  status={
                                    record.status
                                  }
                                />

                                <strong>
                                  ×{quantity}
                                </strong>
                              </div>
                            </div>
                          );
                        },
                      )}
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* =========================================================
   Dashboard Stat
========================================================= */

function DashboardStat({
  icon,
  label,
  value,
  suffix,
  hint,
  kind,
  onClick,
}: {
  icon: string;
  label: string;
  value: number;
  suffix: string;
  hint: string;
  kind:
    | "normal"
    | "warning"
    | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`dashboard-stat-card ${kind}`}
      onClick={onClick}
    >
      <div className="dashboard-stat-top">
        <span className="dashboard-stat-icon">
          {icon}
        </span>

        <span className="dashboard-stat-label">
          {label}
        </span>
      </div>

      <div className="dashboard-stat-number">
        <strong>
          {value}
        </strong>

        <span>
          {suffix}
        </span>
      </div>

      <span className="dashboard-stat-hint">
        {hint}
      </span>
    </button>
  );
}

/* =========================================================
   Quick Link
========================================================= */

function QuickLink({
  icon,
  title,
  onClick,
}: {
  icon: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="dashboard-quick-card"
      onClick={onClick}
    >
      <span className="dashboard-quick-icon">
        {icon}
      </span>

      <strong>
        {title}
      </strong>
    </button>
  );
}

/* =========================================================
   Inventory Overview
========================================================= */

function InventoryOverviewItem({
  icon,
  label,
  value,
  suffix,
  warning = false,
}: {
  icon: string;
  label: string;
  value: number;
  suffix: string;
  warning?: boolean;
}) {
  return (
    <div className="dashboard-inventory-item">
      <span className="dashboard-inventory-icon">
        {icon}
      </span>

      <div>
        <span>
          {label}
        </span>

        <div>
          <strong
            className={
              warning
                ? "warning"
                : ""
            }
          >
            {value}
          </strong>

          <small>
            {suffix}
          </small>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Implant Status Badge
========================================================= */

function ImplantStatusBadge({
  status,
}: {
  status:
    DentflowImplantStatus;
}) {
  let kind =
    "neutral";

  if (
    status ===
      "待醫師叫貨" ||
    status ===
      "待術後紀錄" ||
    status ===
      "待歸回品項"
  ) {
    kind =
      "warning";
  }

  if (
    status === "已完成" || status === "已結案"
  ) {
    kind =
      "success";
  }

  if (status === "已取消") {
    kind = "neutral";
  }

  return (
    <span
      className={`dashboard-case-status ${kind}`}
    >
      {status}
    </span>
  );
}

/* =========================================================
   Transaction Badge
========================================================= */

function TransactionBadge({
  type,
}: {
  type:
    DentflowInventoryTransactionType;
}) {
  let kind =
    "neutral";

  if (
    type === "入庫" ||
    type === "手術歸回" ||
    type === "歸回" ||
    type ===
      "耗材取消歸回"
  ) {
    kind =
      "success";
  }

  if (
    type === "手術取出" ||
    type === "耗材使用"
  ) {
    kind =
      "danger";
  }

  if (
    type === "手動調整"
  ) {
    kind =
      "warning";
  }

  return (
    <span
      className={`dashboard-badge ${kind}`}
    >
      {type}
    </span>
  );
}

/* =========================================================
   Consumable Badge
========================================================= */

function ConsumableStatusBadge({
  status,
}: {
  status:
    DentflowConsumableUsageStatus;
}) {
  let kind =
    "warning";

  if (
    status ===
    "已簽名"
  ) {
    kind =
      "success";
  }

  if (
    status ===
    "已取消"
  ) {
    kind =
      "danger";
  }

  return (
    <span
      className={`dashboard-badge ${kind}`}
    >
      {status}
    </span>
  );
}
