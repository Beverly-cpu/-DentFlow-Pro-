/* eslint-disable react-hooks/immutability */
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  CSSProperties,
  ReactNode,
} from "react";

import {
  useOutletContext,
} from "react-router-dom";

import type {
  DentflowMainLayoutContext,
} from "../layouts/MainLayout";

/* =========================================================
   Constants
========================================================= */

const PRINT_STYLE_ID =
  "dentflow-reports-print-style";

type ReportTab =
  | "植體使用紀錄"
  | "導航機使用紀錄"
  | "連針帶線使用紀錄"
  | "牙周藥膏使用紀錄"
  | "冷光藥劑使用紀錄"
  | "膠原蛋白使用紀錄"
  | "骨粉使用紀錄"
  | "再生膜使用紀錄"
  | "其他耗材使用紀錄";

const REPORT_TABS:
  ReportTab[] = [
    "植體使用紀錄",
    "導航機使用紀錄",
    "連針帶線使用紀錄",
    "牙周藥膏使用紀錄",
    "冷光藥劑使用紀錄",
    "膠原蛋白使用紀錄",
    "骨粉使用紀錄",
    "再生膜使用紀錄",
    "其他耗材使用紀錄",
  ];

/* =========================================================
   Report Row Types
========================================================= */

type ImplantReportRow = {
  key: string;

  implantId: number;

  clinicId: number;
  clinicName: string;
  clinicCode: string;

  patientName: string;
  patientChartNumber: string;

  doctorName: string;

  implantDate: string;

  toothPosition: string;

  itemName: string;

  category: string;

  brand: string;
  model: string;
  specification: string;

  refNumber: string;
  lotNumber: string;
  expiryDate: string;

  quantity: number;

  unitCost: number;

  totalCost: number;

  note: string;
};

type ConsumableReportRow = {
  key: string;

  usageRecordId: number;
  usageItemId: number;

  clinicId: number;
  clinicName: string;
  clinicCode: string;

  usageType:
    DentflowConsumableUsageType;

  patientName: string;
  patientChartNumber: string;

  doctorName: string;

  usageDate: string;

  toothPosition: string;

  itemName: string;

  category: string;

  brand: string;
  model: string;
  specification: string;

  expiryDate: string;

  quantity: number;

  unitCost: number;

  totalCost: number;

  note: string;

  status:
    DentflowConsumableUsageStatus;

  signatureDataUrl:
    string | null;

  signedAt:
    string | null;

  cancelledAt:
    string | null;

  cancelReason:
    string;
};

type MachineUsageReportRow = {
  id: number;
  machineName: string;
  clinicName: string;
  clinicCode: string;
  patientNameSnapshot: string;
  patientBirthDateSnapshot: string;
  usageDate: string;
  toothPositions: string[];
  doctorName: string;
  createdByName: string | null;
  status: string;
  signature: string;
  signedAt: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  cancellationReason: string;
  unitCost?: number;
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

function formatMoney(
  value: number,
) {
  return new Intl.NumberFormat(
    "zh-TW",
    {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: 2,
    },
  ).format(
    Number.isFinite(value)
      ? value
      : 0,
  );
}

function isDateInRange(
  value: string,
  startDate: string,
  endDate: string,
) {
  if (
    startDate &&
    value <
      startDate
  ) {
    return false;
  }

  if (
    endDate &&
    value >
      endDate
  ) {
    return false;
  }

  return true;
}

function escapeCsv(
  value:
    string |
    number |
    null |
    undefined,
) {
  const text =
    String(
      value ?? "",
    );

  if (
    text.includes(",") ||
    text.includes("\"") ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return `"${text.replace(
      /"/g,
      "\"\"",
    )}"`;
  }

  return text;
}

function downloadCsv(
  filename: string,
  rows:
    Array<
      Array<
        string |
        number |
        null |
        undefined
      >
    >,
) {
  const csv =
    rows
      .map(
        (row) =>
          row
            .map(
              escapeCsv,
            )
            .join(","),
      )
      .join("\r\n");

  const blob =
    new Blob(
      [
        "\uFEFF",
        csv,
      ],
      {
        type:
          "text/csv;charset=utf-8;",
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  document.body.appendChild(
    anchor,
  );

  anchor.click();

  document.body.removeChild(
    anchor,
  );

  URL.revokeObjectURL(
    url,
  );
}

function getUsageTypeFromTab(
  tab: ReportTab,
):
  DentflowConsumableUsageType | null {
  switch (tab) {
    case "連針帶線使用紀錄":
      return "連針帶線";

    case "牙周藥膏使用紀錄":
      return "牙周藥膏";

    case "冷光藥劑使用紀錄":
      return "冷光藥劑";

    case "膠原蛋白使用紀錄":
      return "膠原蛋白";

    case "骨粉使用紀錄":
      return "骨粉";

    case "再生膜使用紀錄":
      return "再生膜";

    case "其他耗材使用紀錄":
      return "其他耗材";

    default:
      return null;
  }
}

/* =========================================================
   Main
========================================================= */

export default function Reports() {
  const {
    session,
    clinicScope,
    isAllClinics,
    currentClinicId,
  } =
    useOutletContext<
      DentflowMainLayoutContext
    >();

  type ImplantWithClinic =
    DentflowImplantRecord & {
      clinicName?: string;
      clinicCode?: string;
    };

  type ConsumableWithClinic =
    DentflowConsumableUsageRecord & {
      clinicName?: string;
      clinicCode?: string;
    };

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<ReportTab>(
      "植體使用紀錄",
    );

  const [
    implants,
    setImplants,
  ] =
    useState<
      ImplantWithClinic[]
    >([]);

  const [
    consumables,
    setConsumables,
  ] =
    useState<
      ConsumableWithClinic[]
    >([]);

  const [machineUsageRecords, setMachineUsageRecords] =
    useState<MachineUsageReportRow[]>([]);

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

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    startDate,
    setStartDate,
  ] =
    useState("");

  const [
    endDate,
    setEndDate,
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

  /* =======================================================
     Permissions
  ======================================================= */

  const canView =
    session?.role ===
      "Doctor" ||
    session?.role ===
      "Admin" ||
    session?.role ===
      "Accountant";

  const isImplantTab =
    activeTab ===
    "植體使用紀錄";

  const isMachineTab = activeTab === "導航機使用紀錄";

  const isDoctor =
    session.role ===
    "Doctor";

  const activeClinicId =
    clinicScope.mode ===
    "clinic"
      ? clinicScope.clinicId
      : currentClinicId ??
        session.clinicId;

  /* =======================================================
     Print CSS
  ======================================================= */

  useEffect(() => {
    const existing =
      document.getElementById(
        PRINT_STYLE_ID,
      );

    if (existing) {
      return;
    }

    const style =
      document.createElement(
        "style",
      );

    style.id =
      PRINT_STYLE_ID;

    style.textContent = `
      @media print {
        @page {
          size: A4 landscape;
          margin: 9mm;
        }

        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }

        body * {
          visibility: hidden !important;
        }

        #reports-print-root,
        #reports-print-root * {
          visibility: visible !important;
        }

        #reports-print-root {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
        }

        .reports-screen-only {
          display: none !important;
        }

        .reports-print-header {
          display: block !important;
        }

        .reports-print-card {
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          overflow: visible !important;
        }

        .reports-print-scroll {
          overflow: visible !important;
        }

        .reports-print-table {
          width: 100% !important;
          min-width: 0 !important;
          table-layout: auto !important;
          border-collapse: collapse !important;
          font-size: 8pt !important;
        }

        .reports-print-table th,
        .reports-print-table td {
          padding: 4px 5px !important;
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          color: #111111 !important;
          border: 1px solid #bbbbbb !important;
          vertical-align: middle !important;
        }

        .reports-print-table th {
          background: #eeeeee !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .reports-signature-image {
          width: 90px !important;
          height: 38px !important;
          object-fit: contain !important;
        }

        .reports-cancelled-row {
          background: #f3f3f3 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        tr {
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }

        thead {
          display: table-header-group !important;
        }

        tfoot {
          display: table-footer-group !important;
        }
      }

      @media screen {
        .reports-print-header {
          display: none;
        }
      }
    `;

    document.head.appendChild(
      style,
    );

    return () => {
      style.remove();
    };
  }, []);

  /* =======================================================
     Load
  ======================================================= */

  useEffect(() => {
    queueMicrotask(() => void loadReports());
  }, [
    session.userId,
    session.role,
    session.clinicId,
    clinicScope.mode,
    clinicScope.mode ===
      "clinic"
      ? clinicScope.clinicId
      : 0,
  ]);

  async function loadReports() {
    try {
      setLoading(true);
      setError("");

      let implantRecords:
        ImplantWithClinic[] =
        [];

      let consumableRecords:
        ConsumableWithClinic[] =
        [];

      let machineRecords: MachineUsageReportRow[] = [];

      if (
        session.role ===
        "Doctor"
      ) {
        const doctor =
          await window.dentflow.doctors.byUserId(
            session.userId,
            activeClinicId,
          );

        if (!doctor) {
          throw new Error(
            "找不到目前登入帳號對應的醫師資料。",
          );
        }

        if (isAllClinics) {
          const memberships =
            await window.dentflow.doctors.clinics(
              doctor.id,
            );

          const activeMemberships =
            memberships.filter(
              (membership) =>
                membership.clinicIsActive ===
                1,
            );

          const groups =
            await Promise.all(
              activeMemberships.map(
                async (
                  membership,
                ) => {
                  const [
                    clinicImplants,
                    clinicConsumables,
                  ] =
                    await Promise.all([
                      window.dentflow.implants.byDoctor(
                        doctor.id,
                        membership.clinicId,
                        session.userId,
                      ),

                      window.dentflow.consumables.byDoctor(
                        doctor.id,
                        membership.clinicId,
                        undefined,
                        session.userId,
                      ),
                    ]);

                  return {
                    implants:
                      clinicImplants.map(
                        (record) => ({
                          ...record,
                          clinicName:
                            membership.clinicName,
                          clinicCode:
                            membership.clinicCode,
                        }),
                      ),

                    consumables:
                      clinicConsumables.map(
                        (record) => ({
                          ...record,
                          clinicName:
                            membership.clinicName,
                          clinicCode:
                            membership.clinicCode,
                        }),
                      ),
                  };
                },
              ),
            );

          implantRecords =
            groups.flatMap(
              (group) =>
                group.implants,
            );

          consumableRecords =
            groups.flatMap(
              (group) =>
                group.consumables,
            );
        } else {
          const [
            clinicImplants,
            clinicConsumables,
          ] =
            await Promise.all([
              window.dentflow.implants.byDoctor(
                doctor.id,
                activeClinicId,
                session.userId,
              ),

              window.dentflow.consumables.byDoctor(
                doctor.id,
                activeClinicId,
                undefined,
                session.userId,
              ),
            ]);

          implantRecords =
            clinicImplants.map(
              (record) => ({
                ...record,
                clinicName:
                  session.clinicName,
                clinicCode:
                  session.clinicCode,
              }),
            );

          consumableRecords =
            clinicConsumables.map(
              (record) => ({
                ...record,
                clinicName:
                  session.clinicName,
                clinicCode:
                  session.clinicCode,
              }),
            );
        }
      } else if (
        session.role ===
          "Admin" ||
        session.role ===
          "Accountant"
      ) {
        const [
          clinicImplants,
          clinicConsumables,
          navigationUsage,
        ] =
          await Promise.all([
            window.dentflow.implants.list(
              activeClinicId,
              session.userId,
            ),

            window.dentflow.consumables.list(
              activeClinicId,
              undefined,
              session.userId,
            ),

            window.dentflow.machines.usageRecords(
              session.userId,
            ),
          ]);

        machineRecords = navigationUsage;

        implantRecords =
          clinicImplants.map(
            (record) => ({
              ...record,
              clinicName:
                session.clinicName,
              clinicCode:
                session.clinicCode,
            }),
          );

        consumableRecords =
          clinicConsumables.map(
            (record) => ({
              ...record,
              clinicName:
                session.clinicName,
              clinicCode:
                session.clinicCode,
            }),
          );
      }

      setImplants(
        implantRecords,
      );

      setConsumables(
        consumableRecords,
      );

      setMachineUsageRecords(machineRecords);
    } catch (
      loadError
    ) {
      setImplants([]);
      setConsumables([]);
      setMachineUsageRecords([]);

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
     Implant Rows
  ======================================================= */

  const implantRows =
    useMemo<
      ImplantReportRow[]
    >(() => {
      const keyword =
        search
          .trim()
          .toLowerCase();

      return implants
        .filter(
          (implant) =>
            implant.status ===
            "已完成",
        )
        .flatMap(
          (implant) =>
            implant.teeth.flatMap(
              (tooth) =>
                tooth.items.flatMap(
                  (planItem) =>
                    planItem.usageItems.map(
                      (usage) => ({
                        key:
                          `${implant.id}-${tooth.id}-${planItem.id}-${usage.id}`,

                        implantId:
                          implant.id,

                        clinicId:
                          implant.clinicId,

                        clinicName:
                          implant.clinicName ??
                          session.clinicName,

                        clinicCode:
                          implant.clinicCode ??
                          "",

                        patientName:
                          implant.patientName,

                        patientChartNumber:
                          implant.patientChartNumber,

                        doctorName:
                          implant.doctorName,

                        implantDate:
                          implant.implantDate,

                        toothPosition:
                          tooth.toothPosition,

                        itemName:
                          planItem.name,

                        category:
                          planItem.category,

                        brand:
                          usage.inventoryBrand,

                        model:
                          usage.inventoryModel,

                        specification:
                          usage.inventorySpecification,

                        refNumber:
                          usage.inventoryRefNumber,

                        lotNumber:
                          usage.inventoryLotNumber,

                        expiryDate:
                          usage.inventoryExpiryDate,

                        quantity:
                          usage.quantity,

                        unitCost:
                          Number(
                            usage.unitCost ??
                              0,
                          ),

                        totalCost:
                          Number(
                            usage.totalCost ??
                              0,
                          ),

                        note:
                          implant.note,
                      }),
                    ),
                ),
            ),
        )
        .filter(
          (row) => {
            if (
              !isDateInRange(
                row.implantDate,
                startDate,
                endDate,
              )
            ) {
              return false;
            }

            if (!keyword) {
              return true;
            }

            const haystack =
              [
                row.clinicName,
                row.clinicCode,
                row.patientName,
                row.patientChartNumber,
                row.doctorName,
                row.implantDate,
                row.toothPosition,
                row.itemName,
                row.brand,
                row.model,
                row.specification,
                row.refNumber,
                row.lotNumber,
                row.expiryDate,
                row.unitCost,
                row.totalCost,
                row.note,
              ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              keyword,
            );
          },
        );
    }, [
      implants,
      search,
      startDate,
      endDate,
      session.clinicName,
    ]);

  /* =======================================================
     Consumable Rows
  ======================================================= */

  const activeUsageType =
    getUsageTypeFromTab(
      activeTab,
    );

  const filteredConsumableRecords =
    useMemo(() => {
      if (
        !activeUsageType
      ) {
        return [];
      }

      const keyword =
        search
          .trim()
          .toLowerCase();

      return consumables
        .filter(
          (record) =>
            record.usageType ===
            activeUsageType,
        )
        .filter(
          (record) =>
            statusFilter ===
              "全部" ||
            record.status ===
              statusFilter,
        )
        .filter(
          (record) => {
            if (
              !isDateInRange(
                record.usageDate,
                startDate,
                endDate,
              )
            ) {
              return false;
            }

            if (!keyword) {
              return true;
            }

            const itemsText =
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
                      item.unitCost,
                      item.totalCost,
                    ].join(" "),
                )
                .join(" ");

            const haystack =
              [
                record.clinicName,
                record.clinicCode,
                record.patientName,
                record.patientChartNumber,
                record.doctorName,
                record.usageDate,
                record.toothPosition,
                record.note,
                record.status,
                record.cancelReason,
                itemsText,
              ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              keyword,
            );
          },
        );
    }, [
      consumables,
      activeUsageType,
      statusFilter,
      search,
      startDate,
      endDate,
    ]);

  const consumableRows =
    useMemo<
      ConsumableReportRow[]
    >(() => {
      return filteredConsumableRecords.flatMap(
        (record) =>
          record.items.map(
            (item) => ({
              key:
                `${record.id}-${item.id}`,

              usageRecordId:
                record.id,

              usageItemId:
                item.id,

              clinicId:
                record.clinicId,

              clinicName:
                record.clinicName ??
                session.clinicName,

              clinicCode:
                record.clinicCode ??
                "",

              usageType:
                record.usageType,

              patientName:
                record.patientName,

              patientChartNumber:
                record.patientChartNumber,

              doctorName:
                record.doctorName,

              usageDate:
                record.usageDate,

              toothPosition:
                record.toothPosition,

              itemName:
                item.inventoryName,

              category:
                item.inventoryCategory,

              brand:
                item.inventoryBrand,

              model:
                item.inventoryModel,

              specification:
                item.inventorySpecification,

              expiryDate:
                item.expiryDate,

              quantity:
                item.quantity,

              unitCost:
                Number(
                  item.unitCost ??
                    0,
                ),

              totalCost:
                Number(
                  item.totalCost ??
                    0,
                ),

              note:
                record.note,

              status:
                record.status,

              signatureDataUrl:
                record.doctorSignatureDataUrl,

              signedAt:
                record.signedAt,

              cancelledAt:
                record.cancelledAt,

              cancelReason:
                record.cancelReason,
            }),
          ),
      );
    }, [
      filteredConsumableRecords,
      session.clinicName,
    ]);

  const filteredMachineRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return machineUsageRecords
      .filter((record) => statusFilter === "全部" || record.status === statusFilter)
      .filter((record) => isDateInRange(record.usageDate, startDate, endDate))
      .filter((record) => {
        if (!keyword) return true;
        return [
          record.machineName,
          record.clinicName,
          record.clinicCode,
          record.patientNameSnapshot,
          record.patientBirthDateSnapshot,
          record.doctorName,
          record.createdByName,
          record.usageDate,
          record.toothPositions.join(" "),
          record.status,
          record.cancellationReason,
        ].join(" ").toLowerCase().includes(keyword);
      });
  }, [machineUsageRecords, statusFilter, search, startDate, endDate]);

  /* =======================================================
     Statistics
  ======================================================= */

  const currentCount =
    isMachineTab
      ? filteredMachineRecords.length
      : isImplantTab
      ? implantRows.length
      : filteredConsumableRecords.length;

  const currentItemRowCount =
    isMachineTab
      ? filteredMachineRecords.length
      : isImplantTab
      ? implantRows.length
      : consumableRows.length;

  const currentQuantity =
    isMachineTab
      ? filteredMachineRecords.filter(record => record.status !== "已取消").length
      : isImplantTab
      ? implantRows.reduce(
          (
            total,
            row,
          ) =>
            total +
            row.quantity,
          0,
        )
      : consumableRows
          .filter(
            (row) =>
              row.status !==
              "已取消",
          )
          .reduce(
            (
              total,
              row,
            ) =>
              total +
              row.quantity,
            0,
          );

  const currentCost =
    isMachineTab
      ? filteredMachineRecords
          .filter(record => record.status !== "已取消")
          .reduce((total, record) => total + Number(record.unitCost ?? 0), 0)
      : isImplantTab
      ? implantRows.reduce(
          (
            total,
            row,
          ) =>
            total +
            row.totalCost,
          0,
        )
      : consumableRows
          .filter(
            (row) =>
              row.status !==
              "已取消",
          )
          .reduce(
            (
              total,
              row,
            ) =>
              total +
              row.totalCost,
            0,
          );

  const pendingCount =
    (isMachineTab ? filteredMachineRecords : filteredConsumableRecords).filter(
      (record) =>
        record.status ===
        "待醫師簽名",
    ).length;

  const signedCount =
    (isMachineTab ? filteredMachineRecords : filteredConsumableRecords).filter(
      (record) =>
        record.status ===
        "已簽名",
    ).length;

  const cancelledCount =
    (isMachineTab ? filteredMachineRecords : filteredConsumableRecords).filter(
      (record) =>
        record.status ===
        "已取消",
    ).length;

  /* =======================================================
     Export CSV
  ======================================================= */

  function exportCurrentReport() {
    setError("");

    if (isMachineTab) {
      const rows: Array<Array<string | number>> = [[
        "院所", "院所代碼", "使用日期", "機台", "病患", "生日", "牙位", "醫師",
        "助理紀錄者", "狀態", "簽名狀態", "簽名時間", "單次成本", "有效成本",
        "取消人", "取消時間", "取消原因",
      ]];
      filteredMachineRecords.forEach(record => rows.push([
        record.clinicName, record.clinicCode, record.usageDate, record.machineName,
        record.patientNameSnapshot, record.patientBirthDateSnapshot,
        record.toothPositions.join("、"), record.doctorName, record.createdByName ?? "",
        record.status, record.signature?.startsWith("data:image/") ? "已簽名" : "未簽名",
        record.signedAt ?? "", Number(record.unitCost ?? 0),
        record.status === "已取消" ? 0 : Number(record.unitCost ?? 0),
        record.cancelledByName ?? "", record.cancelledAt ?? "", record.cancellationReason,
      ]));
      downloadCsv(`C&C-DENTAL-${activeTab}.csv`, rows);
      return;
    }

    if (
      isImplantTab
    ) {
      const rows:
        Array<
          Array<
            string |
            number
          >
        > = [
          [
            ...(isAllClinics
              ? ["院所", "院所代碼"]
              : []),
            "植入日期",
            "病歷號",
            "病患",
            "醫師",
            "牙位",
            "品項",
            "品牌",
            "型號",
            "規格",
            "REF",
            "LOT",
            "有效期限",
            "使用數量",
            "單位成本",
            "使用成本",
            "備註",
          ],
        ];

      implantRows.forEach(
        (row) => {
          rows.push([
            ...(isAllClinics
              ? [
                  row.clinicName,
                  row.clinicCode,
                ]
              : []),
            row.implantDate,
            row.patientChartNumber,
            row.patientName,
            row.doctorName,
            row.toothPosition,
            row.itemName,
            row.brand,
            row.model,
            row.specification,
            row.refNumber,
            row.lotNumber,
            row.expiryDate,
            row.quantity,
            row.unitCost,
            row.totalCost,
            row.note,
          ]);
        },
      );

      downloadCsv(
        `C&C-DENTAL-${activeTab}.csv`,
        rows,
      );

      return;
    }

    const rows:
      Array<
        Array<
          string |
          number
        >
      > = [
        [
          ...(isAllClinics
            ? ["院所", "院所代碼"]
            : []),
          "使用日期",
          "病歷號",
          "病患",
          "醫師",
          "牙位",
          "品項",
          "分類",
          "品牌",
          "型號",
          "規格",
          "有效期限",
          "使用數量",
          "單位成本",
          "使用成本",
          "有效成本",
          "紀錄狀態",
          "簽名時間",
          "取消時間",
          "取消原因",
          "備註",
        ],
      ];

    consumableRows.forEach(
      (row) => {
        rows.push([
          ...(isAllClinics
            ? [
                row.clinicName,
                row.clinicCode,
              ]
            : []),
          row.usageDate,
          row.patientChartNumber,
          row.patientName,
          row.doctorName,
          row.toothPosition,
          row.itemName,
          row.category,
          row.brand,
          row.model,
          row.specification,
          row.expiryDate,
          row.quantity,
          row.unitCost,
          row.totalCost,
          row.status ===
          "已取消"
            ? 0
            : row.totalCost,
          row.status,
          row.signedAt ?? "",
          row.cancelledAt ?? "",
          row.cancelReason,
          row.note,
        ]);
      },
    );

    downloadCsv(
      `C&C-DENTAL-${activeTab}.csv`,
      rows,
    );
  }

  /* =======================================================
     Print
  ======================================================= */

  function printCurrentReport() {
    if (
      currentItemRowCount ===
      0
    ) {
      setError(
        "目前沒有可列印的報表資料。",
      );

      return;
    }

    setError("");

    const previousTitle =
      document.title;

    const clinicName =
      isDoctor &&
      isAllClinics
        ? "我的全部院所"
        : session.clinicName;

    document.title =
      `${clinicName}-${activeTab}`;

    window.setTimeout(
      () => {
        window.print();

        window.setTimeout(
          () => {
            document.title =
              previousTitle;
          },
          500,
        );
      },
      80,
    );
  }

  /* =======================================================
     Filters
  ======================================================= */

  function clearFilters() {
    setSearch("");
    setStartDate("");
    setEndDate("");

    setStatusFilter(
      "全部",
    );
  }

  function changeTab(
    tab: ReportTab,
  ) {
    setActiveTab(
      tab,
    );

    setSearch("");
    setStartDate("");
    setEndDate("");

    setStatusFilter(
      "全部",
    );
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
          此帳號沒有報表瀏覽權限。
        </div>
      </div>
    );
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div
      id="reports-print-root"
      style={styles.page}
    >
      {/* ===================================================
          Print Header
      =================================================== */}

      <div
        className="reports-print-header"
        style={styles.printHeader}
      >
        <div style={styles.printClinic}>
          {isDoctor &&
          isAllClinics
            ? "我的全部院所"
            : session.clinicName}
        </div>

        <h1 style={styles.printTitle}>
          {activeTab}
        </h1>

        <div style={styles.printMeta}>
          {startDate ||
          endDate
            ? `日期範圍：${startDate || "不限"} ～ ${endDate || "不限"}`
            : "日期範圍：全部"}

          {!isImplantTab
            ? ` ｜ 狀態：${statusFilter}`
            : ""}

          {" ｜ "}

          列印時間：
          {new Date().toLocaleString(
            "zh-TW",
          )}
        </div>
      </div>

      {/* ===================================================
          Screen Header
      =================================================== */}

      <div
        className="reports-screen-only"
        style={styles.header}
      >
        <div>
          <div style={styles.eyebrow}>
            TRACEABILITY REPORTS
          </div>

          <h1 style={styles.title}>
            使用紀錄報表
          </h1>

        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            style={
              currentItemRowCount >
              0
                ? styles.secondaryButton
                : styles.disabledButton
            }
            disabled={
              currentItemRowCount ===
              0
            }
            onClick={
              exportCurrentReport
            }
          >
            匯出 CSV
          </button>

          <button
            type="button"
            style={
              currentItemRowCount >
              0
                ? styles.printButton
                : styles.disabledButton
            }
            disabled={
              currentItemRowCount ===
              0
            }
            onClick={
              printCurrentReport
            }
          >
            🖨 列印目前報表
          </button>
        </div>
      </div>

      {isDoctor &&
        isAllClinics && (
        <div
          className="reports-screen-only"
          style={styles.scopeNotice}
        >
          <strong>
            我的全部院所
          </strong>

          <span>
            目前報表已合併您所有執業院所的紀錄；院所欄位會同步保留在畫面、CSV 與列印報表中。
          </span>
        </div>
      )}

      {error && (
        <div
          className="reports-screen-only"
          style={styles.errorMessage}
        >
          {error}
        </div>
      )}

      {/* ===================================================
          Tabs
      =================================================== */}

      <div
        className="reports-screen-only"
        style={styles.tabs}
      >
        {REPORT_TABS.map(
          (tab) => (
            <button
              key={tab}
              type="button"
              style={
                activeTab ===
                tab
                  ? {
                      ...styles.tabButton,
                      ...styles.tabButtonActive,
                    }
                  : styles.tabButton
              }
              onClick={() =>
                changeTab(
                  tab,
                )
              }
            >
              {tab}
            </button>
          ),
        )}
      </div>

      {/* ===================================================
          Statistics
      =================================================== */}

      <div
        className="reports-screen-only"
        style={styles.statsGrid}
      >
        <StatCard
          label={
            isMachineTab
              ? "使用紀錄"
              : isImplantTab
              ? "使用列數"
              : "使用紀錄"
          }
          value={
            currentCount
          }
        />

        <StatCard
          label={isMachineTab ? "有效扣除次數" : "有效使用數量"}
          value={
            currentQuantity
          }
        />

        <StatCard
          label={
            isMachineTab
              ? "有效使用總成本"
              : isImplantTab
              ? "篩選後植體總成本"
              : "有效使用總成本"
          }
          value={
            formatMoney(
              currentCost,
            )
          }
        />

        {!isImplantTab && (
          <>
            <StatCard
              label="待醫師簽名"
              value={
                pendingCount
              }
            />

            <StatCard
              label="已簽名"
              value={
                signedCount
              }
            />

            <StatCard
              label="已取消"
              value={
                cancelledCount
              }
            />
          </>
        )}
      </div>

      {/* ===================================================
          Filter
      =================================================== */}

      <div
        className="reports-screen-only"
        style={styles.filterCard}
      >
        <div
          style={
            isImplantTab
              ? styles.filterGridImplant
              : styles.filterGridConsumable
          }
        >
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
              placeholder={
                isImplantTab
                  ? isAllClinics
                    ? "院所、病患、醫師、牙位、品項、REF、LOT、規格..."
                    : "病患、醫師、牙位、品項、REF、LOT、規格..."
                  : isMachineTab
                    ? "院所、機台、病患、醫師、牙位、紀錄者、取消原因..."
                  : isAllClinics
                    ? "院所、病患、醫師、品項、規格、有效期限、取消原因..."
                    : "病患、醫師、品項、規格、有效期限、取消原因..."
              }
            />
          </label>

          <label style={styles.field}>
            <span style={styles.label}>
              起始日期
            </span>

            <input
              type="date"
              style={styles.input}
              value={startDate}
              onChange={
                (event) =>
                  setStartDate(
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
              value={endDate}
              onChange={
                (event) =>
                  setEndDate(
                    event.target.value,
                  )
              }
            />
          </label>

          {!isImplantTab && (
            <label style={styles.field}>
              <span style={styles.label}>
                紀錄狀態
              </span>

              <select
                style={styles.input}
                value={
                  statusFilter
                }
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
          )}

          <button
            type="button"
            style={styles.clearButton}
            onClick={
              clearFilters
            }
          >
            清除篩選
          </button>
        </div>
      </div>

      {/* ===================================================
          Heading
      =================================================== */}

      <div style={styles.reportHeading}>
        <div>
          <strong style={styles.reportHeadingTitle}>
            {activeTab}
          </strong>

          <div style={styles.reportHeadingMeta}>
            {isMachineTab
              ? `共 ${filteredMachineRecords.length} 筆紀錄，有效扣除 ${currentQuantity} 次，有效總成本 ${formatMoney(currentCost)}`
              : isImplantTab
              ? `共 ${implantRows.length} 列，使用數量 ${currentQuantity}，總成本 ${formatMoney(
                  currentCost,
                )}`
              : `共 ${filteredConsumableRecords.length} 筆紀錄、${consumableRows.length} 個品項，有效使用數量 ${currentQuantity}，有效總成本 ${formatMoney(
                  currentCost,
                )}`}
          </div>
        </div>

        {!isImplantTab && (
          <div style={styles.signatureLegend}>
            <span style={styles.legendPending}>
              ● 待醫師簽名
            </span>

            <span style={styles.legendSigned}>
              ● 已簽名
            </span>

            <span style={styles.legendCancelled}>
              ● 已取消
            </span>
          </div>
        )}
      </div>

      {/* ===================================================
          Tables
      =================================================== */}

      {loading ? (
        <div style={styles.emptyState}>
          報表讀取中...
        </div>
      ) : isMachineTab ? (
        <MachineUsageReportTable rows={filteredMachineRecords} />
      ) : isImplantTab ? (
        <ImplantReportTable
          rows={
            implantRows
          }
          showClinic={
            isDoctor &&
            isAllClinics
          }
        />
      ) : (
        <ConsumableReportTable
          records={
            filteredConsumableRecords
          }
          showClinic={
            isDoctor &&
            isAllClinics
          }
        />
      )}

      {/* ===================================================
          Print Footer
      =================================================== */}

      <div
        className="reports-print-header"
        style={styles.printFooter}
      >
        捷晞美學牙醫｜C&C DENTAL
      </div>
    </div>
  );
}

/* =========================================================
   Navigation Machine Usage Report
========================================================= */

function MachineUsageReportTable({rows}: {rows: MachineUsageReportRow[]}) {
  if (rows.length === 0) {
    return <div style={styles.emptyState}>尚無符合條件的導航機使用紀錄。</div>;
  }

  const totalCost = rows
    .filter(row => row.status !== "已取消")
    .reduce((total, row) => total + Number(row.unitCost ?? 0), 0);

  return <div className="reports-print-card" style={styles.tableCard}>
    <div className="reports-print-scroll" style={styles.tableScroll}>
      <table className="reports-print-table" style={styles.implantTable}>
        <thead><tr>{["院所","日期","機台","病患／生日","牙位","醫師","助理紀錄者","狀態","醫師簽名","單次成本","取消稽核"].map(label => <th key={label} style={styles.th}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className={row.status === "已取消" ? "reports-cancelled-row" : undefined}>
          <td style={styles.td}><strong>{row.clinicName}</strong><div style={styles.clinicCode}>{row.clinicCode}</div></td>
          <td style={styles.td}>{row.usageDate}</td>
          <td style={styles.td}>{row.machineName}</td>
          <td style={styles.td}><strong>{row.patientNameSnapshot}</strong><div>{row.patientBirthDateSnapshot || "—"}</div></td>
          <td style={styles.td}>{row.toothPositions.join("、") || "—"}</td>
          <td style={styles.td}>{row.doctorName}</td>
          <td style={styles.td}>{row.createdByName || "—"}</td>
          <td style={styles.td}><strong>{row.status}</strong>{row.signedAt && <div>{formatDateTime(row.signedAt)}</div>}</td>
          <td style={styles.td}>{row.signature?.startsWith("data:image/") ? <img className="reports-signature-image" src={row.signature} alt={`${row.doctorName} 醫師簽名`} /> : "—"}</td>
          <td style={styles.td}>{formatMoney(Number(row.unitCost ?? 0))}</td>
          <td style={styles.noteCell}>{row.status === "已取消" ? <>{row.cancellationReason || "—"}<div>{row.cancelledByName || "—"}｜{formatDateTime(row.cancelledAt)}</div></> : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div style={{display:"flex",justifyContent:"flex-end",padding:"14px 16px",borderTop:"1px solid #e2e9e3",background:"#f7faf7"}}><strong>導航機有效使用成本合計：{formatMoney(totalCost)}</strong></div>
  </div>;
}

/* =========================================================
   Implant Report
========================================================= */

function ImplantReportTable({
  rows,
  showClinic,
}: {
  rows:
    ImplantReportRow[];
  showClinic: boolean;
}) {
  const totalCost = rows.reduce((sum, row) => sum + Number(row.totalCost || 0), 0);
  if (
    rows.length ===
    0
  ) {
    return (
      <div style={styles.emptyState}>
        尚無符合條件的植體使用紀錄。
      </div>
    );
  }

  return (
    <div
      className="reports-print-card"
      style={styles.tableCard}
    >
      <div
        className="reports-print-scroll"
        style={styles.tableScroll}
      >
        <table
          className="reports-print-table"
          style={styles.implantTable}
        >
          <thead>
            <tr>
              {showClinic && (
                <th style={styles.th}>
                  院所
                </th>
              )}

              <th style={styles.th}>
                日期
              </th>

              <th style={styles.th}>
                病患
              </th>

              <th style={styles.th}>
                病歷號
              </th>

              <th style={styles.th}>
                醫師
              </th>

              <th style={styles.th}>
                牙位
              </th>

              <th style={styles.th}>
                品項
              </th>

              <th style={styles.th}>
                分類
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
                數量
              </th>

              <th style={styles.th}>
                單位成本
              </th>

              <th style={styles.th}>
                使用成本
              </th>

              <th style={styles.th}>
                備註
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map(
              (row) => (
                <tr key={row.key}>
                  {showClinic && (
                    <td style={styles.td}>
                      <strong>
                        {row.clinicName ||
                          "—"}
                      </strong>

                      {row.clinicCode && (
                        <div style={styles.clinicCode}>
                          {row.clinicCode}
                        </div>
                      )}
                    </td>
                  )}

                  <td style={styles.td}>
                    {row.implantDate}
                  </td>

                  <td style={styles.td}>
                    <strong>
                      {row.patientName}
                    </strong>
                  </td>

                  <td style={styles.td}>
                    {row.patientChartNumber}
                  </td>

                  <td style={styles.td}>
                    {row.doctorName}
                  </td>

                  <td style={styles.td}>
                    {row.toothPosition ||
                      "—"}
                  </td>

                  <td style={styles.td}>
                    <strong>
                      {row.itemName}
                    </strong>
                  </td>

                  <td style={styles.td}>
                    {row.category === "植體套件" ? "套件" : row.category}
                  </td>

                  <td style={styles.td}>
                    {[
                      row.brand,
                      row.model,
                    ]
                      .filter(Boolean)
                      .join(" / ") ||
                      "—"}
                  </td>

                  <td style={styles.td}>
                    {row.specification ||
                      "—"}
                  </td>

                  <td style={styles.td}>
                    <strong>
                      {row.refNumber ||
                        "—"}
                    </strong>
                  </td>

                  <td style={styles.td}>
                    <strong>
                      {row.lotNumber ||
                        "—"}
                    </strong>
                  </td>

                  <td style={styles.td}>
                    {row.expiryDate ||
                      "—"}
                  </td>

                  <td style={styles.td}>
                    <strong>
                      {row.quantity}
                    </strong>
                  </td>

                  <td style={styles.td}>
                    {formatMoney(
                      row.unitCost,
                    )}
                  </td>

                  <td style={styles.td}>
                    <strong>
                      {formatMoney(
                        row.totalCost,
                      )}
                    </strong>
                  </td>

                  <td style={styles.noteCell}>
                    {row.note ||
                      "—"}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",padding:"14px 16px",borderTop:"1px solid #e2e9e3",background:"#f7faf7"}}>
        <strong>植體／套件使用成本合計：{formatMoney(totalCost)}</strong>
      </div>
    </div>
  );
}

/* =========================================================
   Consumable Report
========================================================= */

function ConsumableReportTable({
  records,
  showClinic,
}: {
  records:
    Array<
      DentflowConsumableUsageRecord & {
        clinicName?: string;
        clinicCode?: string;
      }
    >;
  showClinic: boolean;
}) {
  if (
    records.length ===
    0
  ) {
    return (
      <div style={styles.emptyState}>
        尚無符合條件的耗材使用紀錄。
      </div>
    );
  }

  return (
    <div style={styles.consumableRecordList}>
      {records.map(
        (record) => (
          <ConsumableRecordReport
            key={`${record.clinicId}-${record.id}`}
            record={record}
            showClinic={showClinic}
          />
        ),
      )}
    </div>
  );
}

/* =========================================================
   Consumable Record Report
========================================================= */

function ConsumableRecordReport({
  record,
  showClinic,
}: {
  record:
    DentflowConsumableUsageRecord & {
      clinicName?: string;
      clinicCode?: string;
    };
  showClinic: boolean;
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

  const originalTotalCost =
    record.items.reduce(
      (
        total,
        item,
      ) =>
        total +
        Number(
          item.totalCost ??
            0,
        ),
      0,
    );

  const effectiveTotalCost =
    record.status ===
    "已取消"
      ? 0
      : originalTotalCost;

  return (
    <div
      className={
        record.status ===
        "已取消"
          ? "reports-print-card reports-cancelled-row"
          : "reports-print-card"
      }
      style={
        record.status ===
        "已取消"
          ? {
              ...styles.recordReportCard,
              ...styles.cancelledReportCard,
            }
          : styles.recordReportCard
      }
    >
      {/* ===================================================
          Record Header
      =================================================== */}

      <div style={styles.recordReportHeader}>
        <div>
          <div style={styles.recordReportTitle}>
            <strong>
              {record.patientName}
            </strong>

            <span>
              {record.patientChartNumber}
            </span>

            <StatusBadge
              status={
                record.status
              }
            />
          </div>

          <div style={styles.recordReportMeta}>
            {showClinic && (
              <>
                <strong>
                  {record.clinicName ||
                    "未知院所"}
                </strong>

                {record.clinicCode
                  ? `（${record.clinicCode}）`
                  : ""}

                {" ｜ "}
              </>
            )}

            {record.usageDate}
            {" ｜ "}
            {record.usageType}
            {" ｜ "}
            醫師：
            {record.doctorName}

            {record.toothPosition
              ? ` ｜ 牙位：${record.toothPosition}`
              : ""}
          </div>
        </div>

        <div style={styles.recordSummaryBoxes}>
          <div style={styles.totalQuantityBox}>
            <span>
              {record.status ===
              "已取消"
                ? "原始數量"
                : "使用數量"}
            </span>

            <strong>
              {totalQuantity}
            </strong>
          </div>

          <div style={styles.totalCostBox}>
            <span>
              {record.status ===
              "已取消"
                ? "有效成本"
                : "使用成本"}
            </span>

            <strong>
              {formatMoney(
                effectiveTotalCost,
              )}
            </strong>

            {record.status ===
              "已取消" && (
              <small style={styles.originalCostText}>
                原始：
                {formatMoney(
                  originalTotalCost,
                )}
              </small>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================
          Items
      =================================================== */}

      <div
        className="reports-print-scroll"
        style={styles.tableScroll}
      >
        <table
          className="reports-print-table"
          style={styles.consumableTable}
        >
          <thead>
            <tr>
              <th style={styles.th}>
                品項
              </th>

              <th style={styles.th}>
                分類
              </th>

              <th style={styles.th}>
                品牌
              </th>

              <th style={styles.th}>
                型號
              </th>

              <th style={styles.th}>
                規格
              </th>

              <th style={styles.th}>
                有效期限
              </th>

              <th style={styles.th}>
                數量
              </th>

              <th style={styles.th}>
                單位成本
              </th>

              <th style={styles.th}>
                使用成本
              </th>
            </tr>
          </thead>

          <tbody>
            {record.items.map(
              (item) => (
                <tr key={item.id}>
                  <td style={styles.td}>
                    <strong>
                      {
                        item.inventoryName
                      }
                    </strong>
                  </td>

                  <td style={styles.td}>
                    {
                      item.inventoryCategory ||
                      "—"
                    }
                  </td>

                  <td style={styles.td}>
                    {
                      item.inventoryBrand ||
                      "—"
                    }
                  </td>

                  <td style={styles.td}>
                    {
                      item.inventoryModel ||
                      "—"
                    }
                  </td>

                  <td style={styles.td}>
                    {
                      item.inventorySpecification ||
                      "—"
                    }
                  </td>

                  <td style={styles.td}>
                    {
                      item.expiryDate ||
                      "—"
                    }
                  </td>

                  <td style={styles.td}>
                    <strong>
                      {item.quantity}
                    </strong>
                  </td>

                  <td style={styles.td}>
                    {formatMoney(
                      Number(
                        item.unitCost ??
                          0,
                      ),
                    )}
                  </td>

                  <td style={styles.td}>
                    <strong>
                      {formatMoney(
                        Number(
                          item.totalCost ??
                            0,
                        ),
                      )}
                    </strong>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {/* ===================================================
          Note
      =================================================== */}

      {record.note && (
        <div style={styles.reportNote}>
          <span>
            備註
          </span>

          <strong>
            {record.note}
          </strong>
        </div>
      )}

      {/* ===================================================
          Signature / Cancel
      =================================================== */}

      {record.status ===
      "已簽名" ? (
        <div style={styles.signatureReportArea}>
          <div style={styles.signatureLabel}>
            醫師電子簽名
          </div>

          <div style={styles.signatureContent}>
            {record.doctorSignatureDataUrl ? (
              <img
                className="reports-signature-image"
                src={
                  record.doctorSignatureDataUrl
                }
                alt={`${record.doctorName}醫師簽名`}
                style={styles.signatureImage}
              />
            ) : (
              <div style={styles.signatureMissing}>
                簽名影像未載入
              </div>
            )}

            <div>
              <strong style={styles.signedDoctor}>
                {record.doctorName} 醫師
              </strong>

              <div style={styles.signatureTime}>
                簽名時間：
                {formatDateTime(
                  record.signedAt,
                )}
              </div>
            </div>
          </div>
        </div>
      ) : record.status ===
        "已取消" ? (
        <div style={styles.cancelReportArea}>
          <div style={styles.cancelReportHeading}>
            此筆紀錄已取消
          </div>

          <div style={styles.cancelReportGrid}>
            <DetailDisplay
              label="取消時間"
              value={formatDateTime(
                record.cancelledAt,
              )}
            />

            <DetailDisplay
              label="取消原因"
              value={
                record.cancelReason ||
                "—"
              }
            />
          </div>

          <div style={styles.cancelReportNotice}>
            原始使用紀錄與成本快照保留供稽核，原扣除庫存已透過取消流程歸回；本筆數量與成本皆不計入有效使用量及有效總成本。
          </div>
        </div>
      ) : (
        <div style={styles.pendingReportArea}>
          <strong>
            待醫師簽名
          </strong>

          <span>
            等待{" "}
            {record.doctorName}{" "}
            醫師完成電子簽名。
          </span>
        </div>
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
  label: string;
  value: ReactNode;
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
  let statusStyle =
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

function DetailDisplay({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div style={styles.detailDisplay}>
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>
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
    minWidth: 0,
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

  headerActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "9px",
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
    padding: "0 14px",
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

  filterCard: {
    padding: "16px",
    marginBottom: "18px",
    border: "1px solid #e1e9e4",
    borderRadius: "14px",
    background: "#ffffff",
  },

  filterGridImplant: {
    display: "grid",
    gridTemplateColumns:
      "minmax(260px, 1fr) 170px 170px auto",
    gap: "12px",
    alignItems: "end",
  },

  filterGridConsumable: {
    display: "grid",
    gridTemplateColumns:
      "minmax(240px, 1fr) 160px 160px 180px auto",
    gap: "12px",
    alignItems: "end",
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

  clearButton: {
    minHeight: "42px",
    padding: "0 14px",
    border: "1px solid #d2dfd7",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#51665a",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  secondaryButton: {
    minHeight: "42px",
    padding: "0 15px",
    border: "1px solid #cbdad1",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#4e6859",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  printButton: {
    minHeight: "42px",
    padding: "0 16px",
    border: "1px solid #47795e",
    borderRadius: "9px",
    background: "#47795e",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  disabledButton: {
    minHeight: "42px",
    padding: "0 16px",
    border: "1px solid #dce3df",
    borderRadius: "9px",
    background: "#edf1ef",
    color: "#a0aaa4",
    fontWeight: 800,
    cursor: "not-allowed",
    whiteSpace: "nowrap",
  },

  reportHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "18px",
    marginBottom: "11px",
  },

  reportHeadingTitle: {
    color: "#294f3c",
    fontSize: "16px",
  },

  reportHeadingMeta: {
    marginTop: "4px",
    color: "#849188",
    fontSize: "11px",
  },

  signatureLegend: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    fontSize: "11px",
  },

  legendPending: {
    color: "#947019",
  },

  legendSigned: {
    color: "#2d7756",
  },

  legendCancelled: {
    color: "#9b4b44",
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

  implantTable: {
    width: "100%",
    minWidth: "1760px",
    borderCollapse: "collapse",
  },

  consumableTable: {
    width: "100%",
    minWidth: "1220px",
    borderCollapse: "collapse",
  },

  th: {
    padding: "11px 12px",
    borderBottom: "1px solid #dfe8e2",
    background: "#f6faf8",
    color: "#60746a",
    fontSize: "11px",
    fontWeight: 800,
    textAlign: "left",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "11px 12px",
    borderBottom: "1px solid #edf2ef",
    color: "#465b50",
    fontSize: "11px",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },

  noteCell: {
    maxWidth: "260px",
    padding: "11px 12px",
    borderBottom: "1px solid #edf2ef",
    color: "#465b50",
    fontSize: "11px",
    verticalAlign: "middle",
    whiteSpace: "normal",
  },

  consumableRecordList: {
    display: "grid",
    gap: "16px",
  },

  recordReportCard: {
    border: "1px solid #dfe8e2",
    borderRadius: "14px",
    background: "#ffffff",
    overflow: "hidden",
  },

  cancelledReportCard: {
    borderColor: "#decac7",
    background: "#fcfaf9",
  },

  recordReportHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "18px",
    padding: "14px 16px",
    background: "#fafcfb",
    borderBottom: "1px solid #e7eee9",
  },

  recordReportTitle: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "9px",
    color: "#294e3c",
  },

  recordReportMeta: {
    marginTop: "6px",
    color: "#7a8880",
    fontSize: "11px",
  },

  recordSummaryBoxes: {
    display: "flex",
    alignItems: "stretch",
    gap: "8px",
  },

  totalQuantityBox: {
    minWidth: "90px",
    padding: "9px 12px",
    border: "1px solid #dde7e1",
    borderRadius: "9px",
    background: "#ffffff",
    textAlign: "center",
  },

  totalCostBox: {
    minWidth: "130px",
    padding: "9px 12px",
    border: "1px solid #dde7e1",
    borderRadius: "9px",
    background: "#ffffff",
    textAlign: "center",
  },

  originalCostText: {
    display: "block",
    marginTop: "3px",
    color: "#9a7772",
    fontSize: "9px",
  },

  reportNote: {
    display: "flex",
    gap: "12px",
    padding: "11px 15px",
    borderTop: "1px solid #edf2ef",
    color: "#67786f",
    fontSize: "11px",
  },

  signatureReportArea: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    padding: "14px 16px",
    borderTop: "1px solid #d8e7de",
    background: "#f5faf7",
  },

  signatureLabel: {
    color: "#557064",
    fontSize: "11px",
    fontWeight: 800,
  },

  signatureContent: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },

  signatureImage: {
    width: "120px",
    height: "52px",
    objectFit: "contain",
    border: "1px solid #d7e3dc",
    borderRadius: "6px",
    background: "#ffffff",
  },

  signatureMissing: {
    width: "120px",
    padding: "17px 8px",
    boxSizing: "border-box",
    border: "1px dashed #cdd9d2",
    borderRadius: "6px",
    color: "#88968e",
    textAlign: "center",
    fontSize: "10px",
  },

  signedDoctor: {
    color: "#2f694e",
  },

  signatureTime: {
    marginTop: "4px",
    color: "#819087",
    fontSize: "10px",
  },

  pendingReportArea: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "13px 16px",
    borderTop: "1px solid #eadcae",
    background: "#fffbed",
    color: "#826919",
    fontSize: "11px",
  },

  cancelReportArea: {
    padding: "14px 16px",
    borderTop: "1px solid #e1c8c5",
    background: "#fff7f6",
  },

  cancelReportHeading: {
    marginBottom: "10px",
    color: "#984c45",
    fontSize: "13px",
    fontWeight: 800,
  },

  cancelReportGrid: {
    display: "grid",
    gridTemplateColumns:
      "180px minmax(0, 1fr)",
    gap: "10px",
  },

  detailDisplay: {
    padding: "9px 10px",
    border: "1px solid #ead7d4",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#765d59",
    fontSize: "11px",
  },

  cancelReportNotice: {
    marginTop: "10px",
    paddingTop: "9px",
    borderTop: "1px solid #ead9d7",
    color: "#91635e",
    fontSize: "10px",
  },

  statusBadge: {
    display: "inline-flex",
    padding: "5px 8px",
    borderRadius: "999px",
    fontSize: "10px",
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

  scopeNotice: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "16px",
    padding: "12px 14px",
    border: "1px solid #cfe0d5",
    borderRadius: "10px",
    background: "#f3f8f4",
    color: "#42604f",
    fontSize: "12px",
  },

  clinicCode: {
    marginTop: "3px",
    color: "#849188",
    fontSize: "9px",
    fontWeight: 500,
  },

  errorMessage: {
    marginBottom: "16px",
    padding: "12px 14px",
    border: "1px solid #edc9c6",
    borderRadius: "10px",
    background: "#fff4f3",
    color: "#a3433b",
  },

  printHeader: {
    marginBottom: "14px",
    paddingBottom: "10px",
    borderBottom: "2px solid #333333",
  },

  printClinic: {
    marginBottom: "3px",
    color: "#333333",
    fontSize: "11px",
    fontWeight: 700,
  },

  printTitle: {
    margin: "0 0 5px",
    color: "#111111",
    fontSize: "21px",
  },

  printMeta: {
    color: "#444444",
    fontSize: "9px",
  },

  printFooter: {
    marginTop: "10px",
    paddingTop: "7px",
    borderTop: "1px solid #bbbbbb",
    color: "#666666",
    fontSize: "8px",
    textAlign: "right",
  },
};
