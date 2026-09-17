import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  useOutletContext,
} from "react-router-dom";

import type {
  DentflowMainLayoutContext,
} from "../layouts/MainLayout";

/* =========================================================
   Types
========================================================= */

type Patient =
  DentflowPatientRecord;

type Doctor =
  DentflowDoctorRecord;

type InventoryItem =
  DentflowInventoryRecord;

type InstrumentItem = InventoryItem & {
  clinicCode: string;
  clinicName: string;
};

type OrderType = "植體" | "套件" | "植體與套件";

type Implant =
  DentflowImplantRecord & {
    clinicName: string;
    clinicCode: string;
  };

type ImplantStatus =
  DentflowImplantStatus;

type PlanOption = {
  key: string;

  name: string;

  category: string;

  brand: string;

  model: string;

  specification: string;

  totalStock: number;
};

type PlanItemForm = {
  key: string;

  category: "植體" | "植體套件";

  brand: string;

  model: string;

  planKey: string;

  quantity: string;
};

type ToothForm = {
  key: string;

  toothPosition: string;

  items:
    PlanItemForm[];
};

type ImplantForm = {
  orderType: OrderType;

  instrumentIds: string[];

  patientId: string;

  doctorId: string;

  implantDate: string;

  note: string;

  status:
    ImplantStatus;

  teeth:
    ToothForm[];
};

type UsageRow = {
  key: string;

  inventoryItemId: string;

  quantity: string;
};

type UsageDraft = {
  [planItemId: number]:
    UsageRow[];
};

/* =========================================================
   Status
========================================================= */

const statusFlow:
  ImplantStatus[] = [
    "待醫師叫貨",
    "醫師已叫貨",
    "已取出待手術",
    "待術後紀錄",
    "待歸回品項",
    "已完成",
  ];

/* =========================================================
   Helpers
========================================================= */

function createKey() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function getOrderReminder(implant: Implant): "逾期未叫貨" | "七天內未叫貨" | "尚未叫貨" | null {
  if (implant.status !== "待醫師叫貨" || !implant.implantDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${implant.implantDate}T00:00:00`);
  const days = Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "逾期未叫貨";
  if (days <= 7) return "七天內未叫貨";
  return "尚未叫貨";
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-TW") : "—";
}

function emptyPlanItem(category: "植體" | "植體套件" = "植體"):
  PlanItemForm {
  return {
    key:
      createKey(),

    category,

    brand:
      "",

    model:
      "",

    planKey:
      "",

    quantity:
      "1",
  };
}

function emptyTooth():
  ToothForm {
  return {
    key:
      createKey(),

    toothPosition:
      "",

    items: [
      emptyPlanItem(),
    ],
  };
}

function emptyForm():
  ImplantForm {
  return {
    orderType: "植體",

    instrumentIds: [],

    patientId:
      "",

    doctorId:
      "",

    implantDate:
      "",

    note:
      "",

    status:
      "待醫師叫貨",

    teeth: [
      emptyTooth(),
    ],
  };
}

function normalize(
  value: string,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    );
}

function planIdentity(
  item: {
    name: string;

    category: string;

    brand: string;

    model: string;

    specification: string;
  },
) {
  return [
    normalize(
      item.name,
    ),

    normalize(
      item.category,
    ),

    normalize(
      item.brand,
    ),

    normalize(
      item.model,
    ),

    normalize(
      item.specification,
    ),
  ].join(
    "||",
  );
}

function formatPlanOption(
  option: {
    name: string;

    category: string;

    brand: string;

    model: string;

    specification: string;
  },
) {
  return [
    option.name,
    option.brand,
    option.model,
    option.specification,
  ]
    .filter(
      Boolean,
    )
    .join(
      "｜",
    );
}

function uniqueSorted(
  values: string[],
) {
  return [
    ...new Set(
      values
        .map((value) =>
          String(value ?? "").trim(),
        )
        .filter(Boolean),
    ),
  ].sort((a, b) =>
    a.localeCompare(b),
  );
}

function formatPlanItem(
  plan: {
    name: string;

    brand: string;

    model: string;

    specification: string;
  },
) {
  return [
    plan.name,
    plan.brand,
    plan.model,
    plan.specification,
  ]
    .filter(
      Boolean,
    )
    .join(
      "｜",
    );
}

function getErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (
    error instanceof
    Error
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

/* =========================================================
   Component
========================================================= */

export default function Implants() {
  const {
    session,
    clinicScope,
    isAllClinics,
  } =
    useOutletContext<
      DentflowMainLayoutContext
    >();

  const activeClinicId =
    clinicScope.mode ===
    "clinic"
      ? clinicScope.clinicId
      : session.clinicId;

  const [
    implants,
    setImplants,
  ] =
    useState<
      Implant[]
    >([]);

  const [
    patients,
    setPatients,
  ] =
    useState<
      Patient[]
    >([]);

  const [
    doctors,
    setDoctors,
  ] =
    useState<
      Doctor[]
    >([]);

  const [
    inventory,
    setInventory,
  ] =
    useState<
      InventoryItem[]
    >([]);

  const [instruments, setInstruments] = useState<InstrumentItem[]>([]);
  const [newInstrumentName, setNewInstrumentName] = useState("");

  const [
    doctorProfile,
    setDoctorProfile,
  ] =
    useState<
      Doctor | null
    >(null);

  const [
    form,
    setForm,
  ] =
    useState<
      ImplantForm
    >(
      emptyForm(),
    );

  const [
    editingId,
    setEditingId,
  ] =
    useState<
      number | null
    >(null);

  const [
    usageDrafts,
    setUsageDrafts,
  ] =
    useState<
      Record<
        number,
        UsageDraft
      >
    >({});

  const [
    keyword,
    setKeyword,
  ] =
    useState("");

  const [patientSearch, setPatientSearch] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState(() => new URLSearchParams(window.location.search).get("orderReminder") ?? "全部");

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
    activeId,
    setActiveId,
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

  const isDoctor =
    session.role ===
    "Doctor";

  const canCreate =
    session.role ===
      "Assistant" ||
    session.role ===
      "Admin";

  const canUpdate =
    session.role ===
      "Doctor" ||
    session.role ===
      "Assistant" ||
    session.role ===
      "Admin";

  const canDelete =
    session.role ===
    "Admin";

  /* =======================================================
     Load
  ======================================================= */

  useEffect(
    () => {
      void loadAll();
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

  async function loadAll() {
    const activeSession =
      session;

    if (!activeSession) {
      setImplants(
        [],
      );

      setPatients(
        [],
      );

      setDoctors(
        [],
      );

      setInventory(
        [],
      );

      setInstruments([]);

      setDoctorProfile(
        null,
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
        patientRecords,
        doctorRecords,
        inventoryRecords,
        instrumentRecords,
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

          window.dentflow.inventory.instrumentsAll(),
        ]);

      setPatients(
        patientRecords,
      );

      setDoctors(
        doctorRecords.filter(
          (doctor) =>
            doctor.isActive ===
              1 &&
            doctor.role ===
              "Doctor",
        ),
      );

      setInventory(
        inventoryRecords,
      );

      setInstruments(instrumentRecords);

      /* ===================================================
         Doctor
      =================================================== */

      if (
        activeSession.role ===
        "Doctor"
      ) {
        const doctor =
          await window.dentflow.doctors.byUserId(
            activeSession.userId,
            activeClinicId,
          );

        setDoctorProfile(
          doctor,
        );

        if (
          isAllClinics
        ) {
          if (!doctor) {
            setImplants(
              [],
            );

            return;
          }

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

          const implantGroups =
            await Promise.all(
              activeMemberships.map(
                async (membership) => {
                  const records =
                    await window.dentflow.implants.byDoctor(
                      doctor.id,
                      membership.clinicId,
                    );

                  return records.map(
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

          setImplants(
            implantGroups.flat(),
          );

          return;
        }

        if (!doctor) {
          setImplants(
            [],
          );

          return;
        }

        const implantRecords =
          await window.dentflow.implants.byDoctor(
            doctor.id,
            activeClinicId,
          );

        setImplants(
          implantRecords.map(
            (record) => ({
              ...record,

              clinicName:
                activeSession.clinicName,

              clinicCode:
                activeSession.clinicCode,
            }),
          ),
        );

        return;
      }

      /* ===================================================
         Assistant / Admin
      =================================================== */

      setDoctorProfile(
        null,
      );

      const implantRecords =
        await window.dentflow.implants.list(
          activeClinicId,
        );

      setImplants(
        implantRecords.map(
          (record) => ({
            ...record,

            clinicName:
              activeSession.clinicName,

            clinicCode:
              activeSession.clinicCode,
          }),
        ),
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "讀取植體資料失敗。",
        ),
      );
    } finally {
      setIsLoading(
        false,
      );
    }
  }

  /* =======================================================
     Current Clinic Check
  ======================================================= */

  function isCurrentClinicCase(
    implant: Implant,
  ) {
    return (
      !isAllClinics &&
      implant.clinicId ===
        activeClinicId
    );
  }

  function requireCurrentClinic(
    implant: Implant,
  ) {
    if (
      isCurrentClinicCase(
        implant,
      )
    ) {
      return true;
    }

    window.alert(
      `此案件屬於「${implant.clinicName || "其他院所"}」。請先從上方院所選單切換到該院所，再進行修改、流程操作或庫存扣除。`,
    );

    return false;
  }

  /* =======================================================
     Plan Options

     同規格不同 REF / LOT 合併。
  ======================================================= */

  const planOptions =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            PlanOption
          >();

        for (
          const item of
          inventory
        ) {
          if (
            item.category !==
              "植體" &&
            item.category !==
              "套件" &&
            item.category !==
              "套件" &&
            item.category !==
              "植體套件"
          ) {
            continue;
          }

          const key =
            planIdentity(
              item,
            );

          const existing =
            map.get(
              key,
            );

          if (existing) {
            existing.totalStock +=
              item.quantity;
          } else {
            map.set(
              key,
              {
                key,

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

                totalStock:
                  item.quantity,
              },
            );
          }
        }

        return [
          ...map.values(),
        ].sort(
          (
            a,
            b,
          ) =>
            formatPlanOption(
              a,
            ).localeCompare(
              formatPlanOption(
                b,
              ),
            ),
        );
      },
      [
        inventory,
      ],
    );

  /* =======================================================
     Filter
  ======================================================= */

  const filteredImplants =
    useMemo(
      () => {
        const query =
          keyword
            .trim()
            .toLowerCase();

        return implants.filter(
          (implant) => {
            const reminderFilters = ["七天內未叫貨", "逾期未叫貨", "尚未叫貨"];
            if (statusFilter !== "全部") {
              if (reminderFilters.includes(statusFilter)) {
                if (getOrderReminder(implant) !== statusFilter) return false;
              } else if (implant.status !== statusFilter) return false;
            }

            if (!query) {
              return true;
            }

            const values = [
              implant.patientName,

              implant.patientChartNumber,

              implant.doctorName ??
                "",

              implant.clinicName,

              implant.clinicCode,

              implant.implantDate,

              implant.note,

              ...implant.teeth.flatMap(
                (tooth) => [
                  tooth.toothPosition,

                  ...tooth.items.flatMap(
                    (item) => [
                      item.name,
                      item.category,
                      item.brand,
                      item.model,
                      item.specification,

                      ...item.usageItems.flatMap(
                        (usage) => [
                          usage.inventoryRefNumber,
                          usage.inventoryLotNumber,
                          usage.inventoryExpiryDate,
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ];

            return values.some(
              (value) =>
                String(
                  value ?? "",
                )
                  .toLowerCase()
                  .includes(
                    query,
                  ),
            );
          },
        );
      },
      [
        implants,
        keyword,
        statusFilter,
      ],
    );

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) return patients;
    return patients.filter((patient) =>
      [patient.chartNumber, patient.name]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [patients, patientSearch]);

  /* =======================================================
     Form
  ======================================================= */

  function openCreateForm() {
    if (isAllClinics) {
      window.alert(
        "我的全部院所為跨院所瀏覽模式。請先切換到指定院所，再新增植體個案。",
      );

      return;
    }

    setEditingId(
      null,
    );

    const initial =
      emptyForm();

    if (
      session.role ===
        "Doctor" &&
      doctorProfile
    ) {
      initial.doctorId =
        String(
          doctorProfile.id,
        );
    }

    setForm(
      initial,
    );

    setPatientSearch("");

    setIsFormOpen(
      true,
    );

    setErrorMessage(
      "",
    );
  }

  function resetForm() {
    setEditingId(
      null,
    );

    setForm(
      emptyForm(),
    );

    setPatientSearch("");

    setIsFormOpen(
      false,
    );
  }

  function updateRoot(
    field:
      | "patientId"
      | "doctorId"
      | "implantDate"
      | "note",

    value: string,
  ) {
    setForm(
      (previous) => ({
        ...previous,

        [field]:
          value,
      }),
    );
  }

  function addTooth() {
    setForm(
      (previous) => {
        const tooth = emptyTooth();
        if (previous.orderType === "套件") tooth.items = [emptyPlanItem("植體套件")];
        if (previous.orderType === "植體與套件") tooth.items = [emptyPlanItem("植體"), emptyPlanItem("植體套件")];
        return {...previous, teeth: [...previous.teeth, tooth]};
      },
    );
  }

  function changeOrderType(orderType: OrderType) {
    setForm((previous) => ({
      ...previous,
      orderType,
      teeth: previous.teeth.map((tooth) => ({
        ...tooth,
        items: orderType === "植體與套件"
          ? [emptyPlanItem("植體"), emptyPlanItem("植體套件")]
          : [emptyPlanItem(orderType === "套件" ? "植體套件" : "植體")],
      })),
    }));
  }

  function toggleInstrument(id: number) {
    const value = String(id);
    setForm((previous) => ({
      ...previous,
      instrumentIds: previous.instrumentIds.includes(value)
        ? previous.instrumentIds.filter((item) => item !== value)
        : [...previous.instrumentIds, value],
    }));
  }

  function removeTooth(
    toothKey: string,
  ) {
    setForm(
      (previous) => {
        if (
          previous.teeth.length <=
          1
        ) {
          return previous;
        }

        return {
          ...previous,

          teeth:
            previous.teeth.filter(
              (tooth) =>
                tooth.key !==
                toothKey,
            ),
        };
      },
    );
  }

  function updateTooth(
    toothKey: string,
    value: string,
  ) {
    setForm(
      (previous) => ({
        ...previous,

        teeth:
          previous.teeth.map(
            (tooth) =>
              tooth.key ===
              toothKey
                ? {
                    ...tooth,

                    toothPosition:
                      value,
                  }
                : tooth,
          ),
      }),
    );
  }

  function addPlanItem(
    toothKey: string,
  ) {
    setForm(
      (previous) => ({
        ...previous,

        teeth:
          previous.teeth.map(
            (tooth) =>
              tooth.key ===
              toothKey
                ? {
                    ...tooth,

                    items: [
                      ...tooth.items,

                      emptyPlanItem(previous.orderType === "套件" ? "植體套件" : "植體"),
                    ],
                  }
                : tooth,
          ),
      }),
    );
  }

  function updatePlanItem(
    toothKey: string,
    itemKey: string,
    field:
      | "brand"
      | "model"
      | "planKey"
      | "quantity",
    value: string,
  ) {
    setForm(
      (previous) => ({
        ...previous,
        teeth:
          previous.teeth.map(
            (tooth) =>
              tooth.key === toothKey
                ? {
                    ...tooth,
                    items:
                      tooth.items.map(
                        (item) => {
                          if (item.key !== itemKey) {
                            return item;
                          }

                          if (field === "brand") {
                            return {
                              ...item,
                              brand: value,
                              model: "",
                              planKey: "",
                            };
                          }

                          if (field === "model") {
                            return {
                              ...item,
                              model: value,
                              planKey: "",
                            };
                          }

                          return {
                            ...item,
                            [field]: value,
                          };
                        },
                      ),
                  }
                : tooth,
          ),
      }),
    );
  }

  function removePlanItem(
    toothKey: string,
    itemKey: string,
  ) {
    setForm(
      (previous) => ({
        ...previous,

        teeth:
          previous.teeth.map(
            (tooth) => {
              if (
                tooth.key !==
                toothKey
              ) {
                return tooth;
              }

              if (
                tooth.items.length <=
                1
              ) {
                return tooth;
              }

              return {
                ...tooth,

                items:
                  tooth.items.filter(
                    (item) =>
                      item.key !==
                      itemKey,
                  ),
              };
            },
          ),
      }),
    );
  }

  /* =======================================================
     Edit
  ======================================================= */

  function handleEdit(
    implant: Implant,
  ) {
    if (
      !requireCurrentClinic(
        implant,
      )
    ) {
      return;
    }

    setEditingId(
      implant.id,
    );

    setForm({
      orderType: (() => {
        const categories = implant.teeth.flatMap((tooth) => tooth.items.map((item) => item.category));
        const hasImplant = categories.includes("植體");
        const hasKit = categories.includes("植體套件");
        return hasImplant && hasKit ? "植體與套件" : hasKit ? "套件" : "植體";
      })(),

      instrumentIds: implant.teeth
        .flatMap((tooth) => tooth.items)
        .filter((item) => item.category === "器械")
        .map((item) => {
          const match = instruments.find((instrument) =>
            instrument.name === item.name && instrument.brand === item.brand && instrument.model === item.model,
          );
          return match ? String(match.id) : "";
        })
        .filter(Boolean),

      patientId:
        String(
          implant.patientId,
        ),

      doctorId:
        implant.doctorId ===
        null
          ? ""
          : String(
              implant.doctorId,
            ),

      implantDate:
        implant.implantDate,

      note:
        implant.note,

      status:
        implant.status,

      teeth:
        implant.teeth.map(
          (tooth) => ({
            key:
              createKey(),

            toothPosition:
              tooth.toothPosition,

            items:
              tooth.items.filter((item) => item.category !== "器械").map(
                (item) => ({
                  key:
                    createKey(),

                  category: item.category === "植體套件" ? "植體套件" : "植體",

                  brand:
                    item.brand,

                  model:
                    item.model,

                  planKey:
                    planIdentity(
                      item,
                    ),

                  quantity:
                    String(
                      item.plannedQuantity,
                    ),
                }),
              ),
          }),
        ),
    });

    setPatientSearch(`${implant.patientChartNumber} ${implant.patientName}`);

    setIsFormOpen(
      true,
    );

    window.scrollTo({
      top: 0,

      behavior:
        "smooth",
    });
  }

  /* =======================================================
     Submit
  ======================================================= */

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const activeSession =
      session;

    if (!activeSession) {
      return;
    }

    if (
      !form.patientId
    ) {
      window.alert(
        "請選擇病患。",
      );

      return;
    }

    if (
      !form.implantDate
    ) {
      window.alert(
        "請選擇手術日期。",
      );

      return;
    }

    if (
      !form.doctorId
    ) {
      window.alert(
        "請選擇醫師。",
      );

      return;
    }

    const teethPayload:
      DentflowImplantToothInput[] =
        [];

    for (
      const tooth of
      form.teeth
    ) {
      if (
        !tooth.toothPosition.trim()
      ) {
        window.alert(
          "請填寫牙位。",
        );

        return;
      }

      const planItems:
        DentflowImplantPlanItemInput[] =
          [];

      for (
        const item of
        tooth.items
      ) {
        const option =
          planOptions.find(
            (plan) =>
              plan.key ===
              item.planKey,
          );

        if (!item.brand) {
          window.alert(
            `牙位 #${tooth.toothPosition} 尚未選擇植體廠牌。`,
          );
          return;
        }

        if (session.role === "Assistant") {
          planItems.push({
            name: item.category === "植體" ? "待醫師選擇植體" : "待醫師選擇套件",
            category: item.category,
            brand: item.brand,
            model: "",
            specification: "",
            quantity: 1,
          });
          continue;
        }

        if (!item.model) {
          window.alert(
            `牙位 #${tooth.toothPosition} 尚未選擇植體型號 / 系列。`,
          );
          return;
        }

        if (!option) {
          window.alert(
            `牙位 #${tooth.toothPosition} 尚未選擇植體規格。`,
          );
          return;
        }

        planItems.push({
          name:
            option.name,

          category:
            option.category,

          brand:
            option.brand,

          model:
            option.model,

          specification:
            option.specification,

          quantity: 1,
        });
      }

      teethPayload.push({
        toothPosition:
          tooth.toothPosition.trim(),

        items:
          planItems,
      });
    }

    const requestedInstruments = form.instrumentIds
      .map((id) => instruments.find((instrument) => instrument.id === Number(id)))
      .filter((instrument): instrument is InstrumentItem => Boolean(instrument));

    if (requestedInstruments.length > 0 && teethPayload.length > 0) {
      teethPayload[0].items.push(...requestedInstruments.map((instrument) => ({
        name: instrument.name,
        category: "器械",
        brand: instrument.brand,
        model: instrument.model,
        specification: `${instrument.specification}${instrument.specification ? "｜" : ""}來源院所：${instrument.clinicName}（${instrument.clinicCode}）`,
        quantity: 1,
      })));
    }

    const payload:
      DentflowImplantInput = {
      patientId:
        Number(
          form.patientId,
        ),

      doctorId:
        Number(
          form.doctorId,
        ),

      implantDate:
        form.implantDate,

      note:
        form.note.trim(),

      status:
        form.status,

      teeth:
        teethPayload,
    };

    try {
      setIsSaving(
        true,
      );

      setErrorMessage(
        "",
      );

      if (
        editingId ===
        null
      ) {
        await window.dentflow.implants.create(
          activeClinicId,
          payload,
        );
      } else {
        await window.dentflow.implants.update(
          editingId,
          activeClinicId,
          payload,
        );
      }

      resetForm();

      await loadAll();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "儲存植體個案失敗。",
        ),
      );
    } finally {
      setIsSaving(
        false,
      );
    }
  }

  async function createInstrument() {
    const name = newInstrumentName.trim();
    if (!name) return;
    try {
      await window.dentflow.inventory.create(activeClinicId, {
        name,
        category: "器械",
        brand: "",
        model: "",
        specification: "",
        refNumber: "",
        lotNumber: "",
        expiryDate: "",
        quantity: 1,
        safetyStock: 0,
        unitCost: 0,
        note: "植體手術器械",
      });
      setNewInstrumentName("");
      await loadAll();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "新增器械失敗。"));
    }
  }

  async function deleteInstrument(instrument: InstrumentItem) {
    if (instrument.clinicId !== activeClinicId) {
      window.alert("請先切換到器械所屬院所再刪除。");
      return;
    }
    if (!window.confirm(`確認刪除器械「${instrument.name}」？`)) return;
    try {
      await window.dentflow.inventory.delete(instrument.id, activeClinicId);
      await loadAll();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "刪除器械失敗。"));
    }
  }

  /* =======================================================
     Workflow
  ======================================================= */

  async function handleNextStatus(
    implant: Implant,
  ) {
    if (
      !session ||
      !requireCurrentClinic(
        implant,
      )
    ) {
      return;
    }

    const currentIndex =
      statusFlow.indexOf(
        implant.status,
      );

    if (
      currentIndex < 0 ||
      currentIndex >=
        statusFlow.length -
          1
    ) {
      return;
    }

    if (
      implant.status ===
      "待術後紀錄"
    ) {
      window.alert(
        "請先完成術後實際 REF / LOT 紀錄。",
      );

      return;
    }

    if (
      implant.status ===
      "待歸回品項"
    ) {
      window.alert(
        "此為舊版待歸回個案，請先完成舊資料歸回處理。",
      );

      return;
    }

    const next =
      statusFlow[
        currentIndex +
          1
      ];

    const message =
      next ===
      "已取出待手術"
        ? "確認植體規格已備妥並進入手術流程嗎？此步驟不會指定 REF / LOT，也不會扣除特定批號庫存。"
        : next ===
            "待術後紀錄"
          ? "確認手術已完成，進入術後實際 REF / LOT 紀錄嗎？"
          : `確定進入「${next}」嗎？`;

    if (
      !window.confirm(
        message,
      )
    ) {
      return;
    }

    try {
      setActiveId(
        implant.id,
      );

      setErrorMessage(
        "",
      );

      await window.dentflow.implants.updateStatus(
        implant.id,
        activeClinicId,
        next,
        session.userId,
      );

      await loadAll();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "更新植體流程失敗。",
        ),
      );
    } finally {
      setActiveId(
        null,
      );
    }
  }

  async function handleCancelCase(implant: Implant) {
    if (!requireCurrentClinic(implant)) return;
    const reason = window.prompt("請輸入取消原因：")?.trim();
    if (!reason) return;
    try {
      setActiveId(implant.id);
      await window.dentflow.implants.cancel(implant.id, activeClinicId, reason, session.userId);
      await loadAll();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "取消個案失敗。"));
    } finally {
      setActiveId(null);
    }
  }

  async function handleCloseCase(implant: Implant) {
    if (!requireCurrentClinic(implant) || !window.confirm("確認此個案資料完整並正式結案？")) return;
    try {
      setActiveId(implant.id);
      await window.dentflow.implants.close(implant.id, activeClinicId, session.userId);
      await loadAll();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "結案失敗。"));
    } finally {
      setActiveId(null);
    }
  }

  async function handleDoctorSign(implant: Implant) {
    if (!doctorProfile || implant.doctorId !== doctorProfile.id) {
      window.alert("只有此個案指定的醫師可以簽名。");
      return;
    }
    const signature = window.prompt(
      "請輸入您的姓名作為電子簽名，確認下方實際使用植體資料正確：",
      doctorProfile.name,
    )?.trim();
    if (!signature) return;
    if (!window.confirm(`確認以「${signature}」簽署此植體使用紀錄？簽署後不可修改。`)) return;
    try {
      setActiveId(implant.id);
      await window.dentflow.implants.signUsage(
        implant.id,
        activeClinicId,
        doctorProfile.id,
        signature,
        session.userId,
      );
      await loadAll();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "植體使用簽名失敗。"));
    } finally {
      setActiveId(null);
    }
  }

  /* =======================================================
     Usage Draft
  ======================================================= */

  function getUsageRows(
    implantId: number,
    planId: number,
  ) {
    return (
      usageDrafts[
        implantId
      ]?.[
        planId
      ] ?? []
    );
  }

  function addUsageRow(
    implantId: number,
    planId: number,
  ) {
    setUsageDrafts(
      (previous) => ({
        ...previous,

        [implantId]: {
          ...(
            previous[
              implantId
            ] ?? {}
          ),

          [planId]: [
            ...(
              previous[
                implantId
              ]?.[
                planId
              ] ?? []
            ),

            {
              key:
                createKey(),

              inventoryItemId:
                "",

              quantity:
                "1",
            },
          ],
        },
      }),
    );
  }

  function updateUsageRow(
    implantId: number,
    planId: number,
    rowKey: string,
    field:
      | "inventoryItemId"
      | "quantity",
    value: string,
  ) {
    setUsageDrafts(
      (previous) => ({
        ...previous,

        [implantId]: {
          ...(
            previous[
              implantId
            ] ?? {}
          ),

          [planId]:
            (
              previous[
                implantId
              ]?.[
                planId
              ] ??
              []
            ).map(
              (row) =>
                row.key ===
                rowKey
                  ? {
                      ...row,

                      [field]:
                        value,
                    }
                  : row,
            ),
        },
      }),
    );
  }

  function removeUsageRow(
    implantId: number,
    planId: number,
    rowKey: string,
  ) {
    setUsageDrafts(
      (previous) => ({
        ...previous,

        [implantId]: {
          ...(
            previous[
              implantId
            ] ?? {}
          ),

          [planId]:
            (
              previous[
                implantId
              ]?.[
                planId
              ] ??
              []
            ).filter(
              (row) =>
                row.key !==
                rowKey,
            ),
        },
      }),
    );
  }

  /* =======================================================
     Matching Inventory
  ======================================================= */

  function matchingInventory(
    plan:
      DentflowImplantPlanItemRecord,
  ) {
    return inventory.filter(
      (item) =>
        normalize(
          item.name,
        ) ===
          normalize(
            plan.name,
          ) &&
        normalize(
          item.category,
        ) ===
          normalize(
            plan.category,
          ) &&
        normalize(
          item.brand,
        ) ===
          normalize(
            plan.brand,
          ) &&
        normalize(
          item.model,
        ) ===
          normalize(
            plan.model,
          ) &&
        normalize(
          item.specification,
        ) ===
          normalize(
            plan.specification,
          ),
    );
  }

  /* =======================================================
     Save Post-op
  ======================================================= */

  async function savePostOp(
    implant: Implant,
  ) {
    if (
      !session ||
      !requireCurrentClinic(
        implant,
      )
    ) {
      return;
    }

    type PostOpUsageSelection = {
      inventoryItemId: number;
      quantity: number;
    };

    type PostOpPlanUsage = {
      implantPlanItemId: number;
      usages: PostOpUsageSelection[];
    };

    const inputs:
      PostOpPlanUsage[] =
        [];

    for (
      const tooth of
      implant.teeth
    ) {
      for (
        const plan of
        tooth.items
      ) {
        const rows =
          getUsageRows(
            implant.id,
            plan.id,
          );

        const usages:
          PostOpUsageSelection[] =
            [];

        const usedInventoryIds =
          new Set<number>();

        let total =
          0;

        for (
          const row of
          rows
        ) {
          if (
            !row.inventoryItemId
          ) {
            window.alert(
              `牙位 #${tooth.toothPosition} 尚有 REF / LOT 未選。`,
            );

            return;
          }

          const inventoryItemId =
            Number(
              row.inventoryItemId,
            );

          if (
            usedInventoryIds.has(
              inventoryItemId,
            )
          ) {
            window.alert(
              `牙位 #${tooth.toothPosition} 同一個 REF / LOT 請合併數量，不要重複選擇。`,
            );

            return;
          }

          usedInventoryIds.add(
            inventoryItemId,
          );

          const quantity =
            Number(
              row.quantity,
            );

          if (
            !Number.isInteger(
              quantity,
            ) ||
            quantity <= 0
          ) {
            window.alert(
              "實際使用數量必須是大於 0 的整數。",
            );

            return;
          }

          total +=
            quantity;

          usages.push({
            inventoryItemId,

            quantity,
          });
        }

        if (
          total >
          plan.plannedQuantity
        ) {
          window.alert(
            `牙位 #${tooth.toothPosition}｜${formatPlanItem(
              plan,
            )} 預計 ${plan.plannedQuantity} 隻，實際使用不可超過 ${plan.plannedQuantity} 隻。`,
          );

          return;
        }

        inputs.push({
          implantPlanItemId:
            plan.id,

          usages,
        });
      }
    }

    if (
      !window.confirm(
        "確定儲存術後實際 REF / LOT？儲存後會扣除真正使用的庫存，並將此個案完成。",
      )
    ) {
      return;
    }

    try {
      setActiveId(
        implant.id,
      );

      setErrorMessage(
        "",
      );

      await window.dentflow.implants.recordUsage(
        implant.id,
        activeClinicId,
        inputs as unknown as
          DentflowImplantUsageInput[],
        session.userId,
      );

      setUsageDrafts(
        (previous) => {
          const next = {
            ...previous,
          };

          delete next[
            implant.id
          ];

          return next;
        },
      );

      await loadAll();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "術後 REF / LOT 紀錄儲存失敗。",
        ),
      );
    } finally {
      setActiveId(
        null,
      );
    }
  }

  /* =======================================================
     Delete
  ======================================================= */

  async function handleDelete(
    implant: Implant,
  ) {
    if (
      !session ||
      !requireCurrentClinic(
        implant,
      )
    ) {
      return;
    }

    if (
      !window.confirm(
        `確定刪除 ${implant.patientName} 的植體個案嗎？`,
      )
    ) {
      return;
    }

    try {
      setActiveId(
        implant.id,
      );

      setErrorMessage(
        "",
      );

      await window.dentflow.implants.delete(
        implant.id,
        activeClinicId,
      );

      await loadAll();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          "刪除植體個案失敗。",
        ),
      );
    } finally {
      setActiveId(
        null,
      );
    }
  }

  /* =======================================================
     UI
  ======================================================= */

  return (
    <section
      style={{
        padding: 32,

        color:
          "#304437",
      }}
    >
      {/* ===================================================
          Header
      =================================================== */}

      <header
        style={{
          display:
            "flex",

          justifyContent:
            "space-between",

          alignItems:
            "flex-start",

          gap: 20,

          marginBottom: 24,
        }}
      >
        <div>
          <p
            style={{
              color:
                "#78917e",

              margin:
                "0 0 6px",
            }}
          >
            IMPLANT TRACKING
          </p>

          <h1
            style={{
              margin:
                "0 0 8px",
            }}
          >
            植體追蹤
          </h1>

          <p
            style={{
              color:
                "#748078",

              margin: 0,
            }}
          >
            術前只管理植體規格與數量；術後才記錄實際 REF、LOT 並扣除真正使用的庫存。
          </p>

          {session && (
            <div
              style={{
                marginTop: 10,

                fontSize: 13,

                color:
                  "#66766b",
              }}
            >
              目前範圍：
              <strong>
                {isAllClinics
                  ? "我的全部院所"
                  : session.clinicName}
              </strong>

              {!isAllClinics &&
              session.clinicCode
                ? `（${session.clinicCode}）`
                : ""}
            </div>
          )}
        </div>

        {canCreate &&
          !isAllClinics && (
          <button
            type="button"
            className="primary-button"
            onClick={
              openCreateForm
            }
          >
            ＋ 新增植體個案
          </button>
        )}
      </header>

      {/* ===================================================
          Cross-clinic Scope Notice
      =================================================== */}

      {isDoctor &&
        isAllClinics && (
        <div
          style={{
            marginBottom: 18,
            padding: "12px 14px",
            borderRadius: 10,
            background: "#f1f6f1",
            color: "#526759",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <strong>我的全部院所｜跨院所瀏覽模式</strong>
          <div>
            現在顯示您所有執業院所的植體案件。跨院所模式不允許新增、編輯、推進流程、術後 REF / LOT 登錄或任何庫存異動；請先從上方院所選單切換到案件所屬院所後再操作。
          </div>
        </div>
      )}

      {/* ===================================================
          Error
      =================================================== */}

      {errorMessage && (
        <div
          style={{
            padding: 12,

            marginBottom: 16,

            borderRadius: 10,

            background:
              "#fff1f1",

            color:
              "#9a3f3f",
          }}
        >
          {
            errorMessage
          }
        </div>
      )}

      {/* ===================================================
          Search
      =================================================== */}

      <div
        style={{
          display:
            "flex",

          gap: 10,

          marginBottom: 20,

          flexWrap:
            "wrap",
        }}
      >
        <input
          value={
            keyword
          }
          onChange={(
            event,
          ) =>
            setKeyword(
              event.target.value,
            )
          }
          placeholder="搜尋病患、牙位、規格、REF、LOT、院所"
          style={{
            ...fieldStyle,

            flex: 1,

            minWidth: 260,

            marginTop: 0,
          }}
        />

        <select
          value={
            statusFilter
          }
          onChange={(
            event,
          ) =>
            setStatusFilter(
              event.target.value,
            )
          }
          style={{
            ...fieldStyle,

            width: 180,

            marginTop: 0,
          }}
        >
          <option value="全部">
            全部狀態
          </option>
          <option value="七天內未叫貨">七天內未叫貨</option>
          <option value="逾期未叫貨">逾期未叫貨</option>
          <option value="尚未叫貨">尚未叫貨</option>

          {statusFlow.map(
            (status) => (
              <option
                key={
                  status
                }
                value={
                  status
                }
              >
                {
                  status
                }
              </option>
            ),
          )}
        </select>
      </div>

      {/* ===================================================
          Form
      =================================================== */}

      {isFormOpen && (
        <form
          onSubmit={
            handleSubmit
          }
          style={{
            ...panelStyle,

            marginBottom: 24,
          }}
        >
          <div
            style={{
              display:
                "flex",

              justifyContent:
                "space-between",

              alignItems:
                "center",

              gap: 12,

              marginBottom: 20,
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    "0 0 4px",
                }}
              >
                {editingId !==
                null
                  ? "編輯植體個案"
                  : "新增植體個案"}
              </h2>

            </div>

            <button
              type="button"
              onClick={
                resetForm
              }
            >
              關閉
            </button>
          </div>

          <div
            style={{
              display:
                "grid",

              gridTemplateColumns:
                "repeat(auto-fit,minmax(240px,1fr))",

              gap: 16,
            }}
          >
            <label>
              病患

              <input
                type="search"
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="搜尋病歷號或姓名"
                style={{...fieldStyle, marginBottom: 8}}
              />

              <select
                value={
                  form.patientId
                }
                onChange={(event) => {
                  const value = event.target.value;
                  updateRoot("patientId", value);
                  const selected = patients.find((patient) => String(patient.id) === value);
                  if (selected) setPatientSearch(`${selected.chartNumber} ${selected.name}`);
                }}
                style={
                  fieldStyle
                }
              >
                <option value="">
                  請選擇
                </option>

                {filteredPatients.map(
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
                      ｜
                      {
                        patient.name
                      }
                    </option>
                  ),
                )}

                {filteredPatients.length === 0 && (
                  <option value="" disabled>找不到符合的病患</option>
                )}
              </select>
            </label>

            <label>
              醫師

              <select
                value={
                  form.doctorId
                }
                onChange={(
                  event,
                ) =>
                  updateRoot(
                    "doctorId",
                    event.target.value,
                  )
                }
                style={
                  fieldStyle
                }
                disabled={
                  isDoctor &&
                  doctorProfile !==
                    null
                }
              >
                <option value="">
                  請選擇
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
                      {
                        doctor.name
                      }
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              手術日期

              <input
                type="date"
                value={
                  form.implantDate
                }
                onChange={(
                  event,
                ) =>
                  updateRoot(
                    "implantDate",
                    event.target.value,
                  )
                }
                style={
                  fieldStyle
                }
              />
            </label>

            <label>
              叫貨類型

              <select
                value={form.orderType}
                onChange={(event) => changeOrderType(event.target.value as OrderType)}
                style={fieldStyle}
              >
                <option value="植體">植體</option>
                <option value="套件">套件</option>
                <option value="植體與套件">植體與套件</option>
              </select>
            </label>

            <label>
              狀態

              <input
                readOnly
                value={
                  form.status
                }
                style={{
                  ...fieldStyle,

                  background:
                    "#f4f7f4",
                }}
              />
            </label>
          </div>

          {/* ===============================================
              Teeth
          =============================================== */}

          <div
            style={{
              marginTop: 24,
            }}
          >
            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",

                gap: 12,
              }}
            >
              <div>
                <h3
                  style={{
                    margin:
                      "0 0 4px",
                  }}
                >
                  治療牙位 / 叫貨廠牌
                </h3>

              </div>

              <button
                type="button"
                onClick={
                  addTooth
                }
              >
                ＋ 新增牙位
              </button>
            </div>

            {form.teeth.map(
              (
                tooth,
                index,
              ) => (
                <div
                  key={
                    tooth.key
                  }
                  style={{
                    ...subPanelStyle,

                    marginTop: 14,
                  }}
                >
                  <div
                    style={{
                      display:
                        "flex",

                      gap: 10,

                      alignItems:
                        "end",
                    }}
                  >
                    <label
                      style={{
                        flex: 1,
                      }}
                    >
                      牙位 #{index + 1}

                      <input
                        value={
                          tooth.toothPosition
                        }
                        onChange={(
                          event,
                        ) =>
                          updateTooth(
                            tooth.key,
                            event.target.value,
                          )
                        }
                        placeholder="例如：36"
                        style={
                          fieldStyle
                        }
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        removeTooth(
                          tooth.key,
                        )
                      }
                      disabled={
                        form.teeth.length <=
                        1
                      }
                    >
                      移除牙位
                    </button>
                  </div>

                  {tooth.items.map(
                    (
                      item,
                      itemIndex,
                    ) => (
                      <div
                        key={
                          item.key
                        }
                        style={{
                          display:
                            "grid",

                          gridTemplateColumns: session.role === "Assistant"
                            ? "minmax(240px,1fr)"
                            : "minmax(150px,0.8fr) minmax(170px,1fr) minmax(230px,1.4fr) auto",

                          gap: 10,

                          marginTop: 14,

                          alignItems:
                            "end",
                        }}
                      >
                        <label>
                          {item.category === "植體" ? "植體廠牌" : "套件廠牌"} #{itemIndex + 1}

                          <select
                            value={item.brand}
                            onChange={(event) =>
                              updatePlanItem(
                                tooth.key,
                                item.key,
                                "brand",
                                event.target.value,
                              )
                            }
                            style={fieldStyle}
                          >
                            <option value="">
                              請選擇廠牌
                            </option>

                            {uniqueSorted(
                              planOptions.map(
                                (option) =>
                                  (item.category === "植體"
                                    ? option.category === "植體"
                                    : option.category === "套件" || option.category === "植體套件")
                                    ? option.brand
                                    : "",
                              ),
                            ).map((brand) => (
                              <option
                                key={brand}
                                value={brand}
                              >
                                {brand}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={{display: session.role === "Assistant" ? "none" : "block"}}>
                          型號 / 系列

                          <select
                            value={item.model}
                            onChange={(event) =>
                              updatePlanItem(
                                tooth.key,
                                item.key,
                                "model",
                                event.target.value,
                              )
                            }
                            style={fieldStyle}
                            disabled={!item.brand}
                          >
                            <option value="">
                              {item.brand
                                ? "請選擇型號 / 系列"
                                : "請先選擇廠牌"}
                            </option>

                            {uniqueSorted(
                              planOptions
                                .filter(
                                  (option) =>
                                    (item.category === "植體"
                                      ? option.category === "植體"
                                      : option.category === "套件" || option.category === "植體套件") &&
                                    normalize(option.brand) ===
                                    normalize(item.brand),
                                )
                                .map(
                                  (option) => option.model,
                                ),
                            ).map((model) => (
                              <option
                                key={model}
                                value={model}
                              >
                                {model}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label style={{display: session.role === "Assistant" ? "none" : "block"}}>
                          植體規格

                          <select
                            value={item.planKey}
                            onChange={(event) =>
                              updatePlanItem(
                                tooth.key,
                                item.key,
                                "planKey",
                                event.target.value,
                              )
                            }
                            style={fieldStyle}
                            disabled={
                              !item.brand ||
                              !item.model
                            }
                          >
                            <option value="">
                              {item.model
                                ? "請選擇植體規格"
                                : "請先選擇型號 / 系列"}
                            </option>

                            {planOptions
                              .filter(
                                (option) =>
                                  (item.category === "植體"
                                    ? option.category === "植體"
                                    : option.category === "套件" || option.category === "植體套件") &&
                                  normalize(option.brand) ===
                                    normalize(item.brand) &&
                                  normalize(option.model) ===
                                    normalize(item.model),
                              )
                              .map((option) => (
                                <option
                                  key={option.key}
                                  value={option.key}
                                >
                                  {[
                                    option.name,
                                    option.specification,
                                  ]
                                    .filter(Boolean)
                                    .join("｜")}
                                  ｜目前總庫存{" "}
                                  {option.totalStock}
                                </option>
                              ))}
                          </select>

                        </label>

                        <button
                          type="button"
                          onClick={() =>
                            removePlanItem(
                              tooth.key,
                              item.key,
                            )
                          }
                          disabled={
                            tooth.items.length <=
                            1
                          }
                          style={{display: session.role === "Assistant" ? "none" : "block"}}
                        >
                          移除
                        </button>
                      </div>
                    ),
                  )}

                  {session.role !== "Assistant" && (
                    <button
                      type="button"
                      onClick={() => addPlanItem(tooth.key)}
                      style={{marginTop: 14}}
                    >
                      ＋ 新增規格
                    </button>
                  )}
                </div>
              ),
            )}
          </div>

          {session.role !== "Assistant" && (
            <div style={{...subPanelStyle, marginTop: 20}}>
              <h3 style={{margin: "0 0 6px"}}>器械叫貨</h3>
              <small style={{color: "#78817a"}}>
                可選擇其他院所器械；叫貨單會保留來源院所，供搬運與歸還追蹤。
              </small>
              <div style={{display: "grid", gap: 8, marginTop: 12}}>
                {instruments.length === 0 ? (
                  <span style={{color: "#78817a"}}>尚未建立器械。</span>
                ) : instruments.map((instrument) => (
                  <label key={instrument.id} style={{display: "flex", gap: 10, alignItems: "center"}}>
                    <input
                      type="checkbox"
                      checked={form.instrumentIds.includes(String(instrument.id))}
                      onChange={() => toggleInstrument(instrument.id)}
                    />
                    <span>
                      <strong>{instrument.name}</strong>
                      {instrument.brand ? `｜${instrument.brand}` : ""}
                      {instrument.model ? `｜${instrument.model}` : ""}
                      {`｜來源：${instrument.clinicName}（${instrument.clinicCode}）｜可用 ${instrument.quantity}`}
                    </span>
                  </label>
                ))}
              </div>

              {session.role === "Admin" && (
                <div style={{marginTop: 16, paddingTop: 14, borderTop: "1px solid #e5eae5"}}>
                  <strong>管理目前院所器械</strong>
                  <div style={{display: "flex", gap: 8, marginTop: 8}}>
                    <input
                      value={newInstrumentName}
                      onChange={(event) => setNewInstrumentName(event.target.value)}
                      placeholder="輸入器械名稱"
                      style={{...fieldStyle, marginTop: 0}}
                    />
                    <button type="button" onClick={() => void createInstrument()}>新增器械</button>
                  </div>
                  <div style={{display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10}}>
                    {instruments.filter((item) => item.clinicId === activeClinicId).map((instrument) => (
                      <button type="button" key={instrument.id} onClick={() => void deleteInstrument(instrument)}>
                        刪除 {instrument.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <label
            style={{
              display:
                "block",

              marginTop: 20,
            }}
          >
            備註

            <textarea
              value={
                form.note
              }
              onChange={(
                event,
              ) =>
                updateRoot(
                  "note",
                  event.target.value,
                )
              }
              style={{
                ...fieldStyle,

                minHeight: 90,

                resize:
                  "vertical",
              }}
            />
          </label>

          <div
            style={{
              display:
                "flex",

              justifyContent:
                "flex-end",

              gap: 10,

              marginTop: 20,
            }}
          >
            <button
              type="button"
              onClick={
                resetForm
              }
              disabled={
                isSaving
              }
            >
              取消
            </button>

            <button
              type="submit"
              className="primary-button"
              disabled={
                isSaving
              }
            >
              {isSaving
                ? "儲存中…"
                : editingId !==
                    null
                  ? "儲存修改"
                  : "建立個案"}
            </button>
          </div>
        </form>
      )}

      {/* ===================================================
          Cases
      =================================================== */}

      <div
        style={{
          display:
            "grid",

          gap: 16,
        }}
      >
        {isLoading ? (
          <div
            style={
              emptyStyle
            }
          >
            讀取植體資料中…
          </div>
        ) : filteredImplants.length ===
          0 ? (
          <div
            style={
              emptyStyle
            }
          >
            尚無符合條件的植體個案
          </div>
        ) : (
          filteredImplants.map(
            (implant) => {
              const busy =
                activeId ===
                implant.id;

              const currentClinic =
                isCurrentClinicCase(
                  implant,
                );

              return (
                <article
                  key={
                    implant.id
                  }
                  style={
                    panelStyle
                  }
                >
                  {/* =======================================
                      Case Header
                  ======================================= */}

                  <div
                    style={{
                      display:
                        "flex",

                      justifyContent:
                        "space-between",

                      alignItems:
                        "flex-start",

                      gap: 20,

                      flexWrap:
                        "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display:
                            "flex",

                          alignItems:
                            "center",

                          gap: 8,

                          flexWrap:
                            "wrap",
                        }}
                      >
                        <h2
                          style={{
                            margin: 0,
                          }}
                        >
                          {
                            implant.patientName
                          }
                        </h2>

                        <span
                          style={
                            statusBadgeStyle(
                              implant.status,
                            )
                          }
                        >
                          {
                            implant.status
                          }
                        </span>

                        {getOrderReminder(implant) && (
                          <span style={{...statusBadgeStyle("待歸回品項"), fontWeight: 800}}>
                            {getOrderReminder(implant)}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 8,

                          color:
                            "#66746a",
                        }}
                      >
                        病歷號：
                        {
                          implant.patientChartNumber
                        }
                        {" ｜ "}
                        醫師：
                        {
                          implant.doctorName ||
                          "—"
                        }
                        {" ｜ "}
                        手術日期：
                        {
                          implant.implantDate ||
                          "—"
                        }
                      </div>

                      <div
                        style={{
                          marginTop: 6,

                          display:
                            "flex",

                          alignItems:
                            "center",

                          gap: 8,

                          flexWrap:
                            "wrap",
                        }}
                      >
                        <span
                          style={
                            clinicBadgeStyle
                          }
                        >
                          {
                            implant.clinicName
                          }

                          {implant.clinicCode
                            ? `｜${implant.clinicCode}`
                            : ""}
                        </span>

                        {!currentClinic && (
                          <span
                            style={{
                              color:
                                "#9a6b32",

                              fontSize: 12,
                            }}
                          >
                            其他院所案件・切換院所後才能操作
                          </span>
                        )}
                      </div>

                      {implant.note && (
                        <div
                          style={{
                            marginTop: 10,

                            color:
                              "#6c786f",
                          }}
                        >
                          備註：
                          {
                            implant.note
                          }
                        </div>
                      )}

                      <div style={{marginTop: 10, color: "#728078", fontSize: 12, lineHeight: 1.8}}>
                        叫貨：{formatTimestamp(implant.orderedAt)}（#{implant.orderedByUserId ?? "—"}） ｜ 取出：{formatTimestamp(implant.pickedAt)}（#{implant.pickedByUserId ?? "—"}） ｜ 手術完成：{formatTimestamp(implant.surgeryCompletedAt)}（#{implant.surgeryCompletedByUserId ?? "—"}） ｜ 歸回：{formatTimestamp(implant.returnedAt)}（#{implant.returnedByUserId ?? "—"}） ｜ 結案：{formatTimestamp(implant.closedAt)}（#{implant.closedByUserId ?? "—"}）
                      </div>

                      {implant.doctorSignedAt && (
                        <div style={{marginTop: 8, color: "#347047", fontWeight: 700}}>
                          醫師已簽名確認實際使用植體：{implant.doctorSignature}｜{formatTimestamp(implant.doctorSignedAt)}
                        </div>
                      )}

                      {implant.reservations.length > 0 && (
                        <div style={{marginTop: 6, color: "#526b58", fontSize: 12}}>
                          備貨 {implant.reservations.reduce((sum, item) => sum + item.reservedQuantity, 0)} ｜ 已取出 {implant.reservations.reduce((sum, item) => sum + item.pickedQuantity, 0)} ｜ 已使用 {implant.reservations.reduce((sum, item) => sum + item.usedQuantity, 0)} ｜ 已歸回 {implant.reservations.reduce((sum, item) => sum + item.returnedQuantity, 0)}
                        </div>
                      )}

                      {implant.status === "已取消" && (
                        <div style={{marginTop: 6, color: "#985163", fontSize: 12}}>
                          取消：{formatTimestamp(implant.cancelledAt)}（#{implant.cancelledByUserId ?? "—"}） ｜ 原因：{implant.cancelReason}
                        </div>
                      )}
                    </div>

                    {/* ===================================
                        Actions
                    =================================== */}

                    <div
                      style={{
                        display:
                          "flex",

                        gap: 8,

                        flexWrap:
                          "wrap",
                      }}
                    >
                      {canUpdate &&
                        currentClinic &&
                        ((isDoctor && implant.status === "待醫師叫貨") ||
                          (!isDoctor && implant.status !== "待醫師叫貨")) &&
                        ![
                          "待術後紀錄",
                          "待歸回品項",
                          "已完成",
                          "已結案",
                          "已取消",
                        ].includes(
                          implant.status,
                        ) && (
                          <button
                            type="button"
                            className="primary-button"
                            disabled={
                              busy
                            }
                            onClick={() =>
                              void handleNextStatus(
                                implant,
                              )
                            }
                          >
                            {busy
                              ? "處理中…"
                              : "下一階段 →"}
                          </button>
                        )}

                      {canUpdate &&
                        currentClinic &&
                        (!isDoctor || implant.status === "待醫師叫貨") &&
                        ![
                          "待術後紀錄",
                          "待歸回品項",
                          "已完成",
                          "已結案",
                          "已取消",
                        ].includes(
                          implant.status,
                        ) && (
                          <button
                            type="button"
                            disabled={
                              busy
                            }
                            onClick={() =>
                              handleEdit(
                                implant,
                              )
                            }
                          >
                            編輯
                          </button>
                        )}

                      {canDelete &&
                        currentClinic && (
                          <button
                            type="button"
                            className="danger-action"
                            disabled={
                              busy
                            }
                            onClick={() =>
                              void handleDelete(
                                implant,
                              )
                            }
                          >
                            刪除
                          </button>
                        )}

                      {canUpdate && currentClinic && implant.status === "已完成" && (
                        !isDoctor &&
                        <button type="button" disabled={busy} onClick={() => void handleCloseCase(implant)}>
                          正式結案
                        </button>
                      )}

                      {isDoctor && currentClinic && implant.status === "已完成" && !implant.doctorSignedAt && (
                        <button type="button" className="primary-button" disabled={busy} onClick={() => void handleDoctorSign(implant)}>
                          簽名確認實際使用植體
                        </button>
                      )}

                      {canUpdate && !isDoctor && currentClinic && ["待醫師叫貨", "醫師已叫貨", "已取出待手術"].includes(implant.status) && (
                        <button type="button" className="danger-action" disabled={busy} onClick={() => void handleCancelCase(implant)}>
                          取消個案
                        </button>
                      )}
                    </div>
                  </div>

                  {/* =======================================
                      Teeth / Plans
                  ======================================= */}

                  <div
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(320px,1fr))",

                      gap: 12,

                      marginTop: 18,
                    }}
                  >
                    {implant.teeth.map(
                      (tooth) => (
                        <div
                          key={
                            tooth.id
                          }
                          style={
                            subPanelStyle
                          }
                        >
                          <h3
                            style={{
                              margin:
                                "0 0 12px",
                            }}
                          >
                            牙位 #
                            {
                              tooth.toothPosition
                            }
                          </h3>

                          {tooth.items.map(
                            (plan) => {
                              const matching =
                                matchingInventory(
                                  plan,
                                );

                              const rows =
                                getUsageRows(
                                  implant.id,
                                  plan.id,
                                );

                              const actualTotal =
                                plan.usageItems.reduce(
                                  (
                                    sum,
                                    usage,
                                  ) =>
                                    sum +
                                    usage.quantity,
                                  0,
                                );

                              return (
                                <div
                                  key={
                                    plan.id
                                  }
                                  style={{
                                    padding: 12,

                                    marginBottom: 10,

                                    border:
                                      "1px solid #e5ebe5",

                                    borderRadius: 10,

                                    background:
                                      "#ffffff",
                                  }}
                                >
                                  <strong>
                                    {formatPlanItem(
                                      plan,
                                    )}
                                  </strong>

                                  <div
                                    style={{
                                      display:
                                        "flex",

                                      gap: 12,

                                      flexWrap:
                                        "wrap",

                                      marginTop: 6,

                                      color:
                                        "#657168",

                                      fontSize: 13,
                                    }}
                                  >
                                    <span>
                                      類別：
                                      {
                                        plan.category
                                      }
                                    </span>

                                    <span>
                                      預計：
                                      {
                                        plan.plannedQuantity
                                      }
                                    </span>

                                    {plan.usageItems.length >
                                      0 && (
                                      <span>
                                        實際：
                                        {
                                          actualTotal
                                        }
                                      </span>
                                    )}
                                  </div>

                                  {/* =======================
                                      Actual Usage
                                  ======================= */}

                                  {plan.usageItems.length >
                                    0 && (
                                    <div
                                      style={{
                                        marginTop: 12,

                                        padding: 10,

                                        borderRadius: 8,

                                        background:
                                          "#f4f8f4",
                                      }}
                                    >
                                      <strong
                                        style={{
                                          fontSize: 13,
                                        }}
                                      >
                                        術後實際使用
                                      </strong>

                                      {plan.usageItems.map(
                                        (usage) => (
                                          <div
                                            key={
                                              usage.id
                                            }
                                            style={{
                                              marginTop: 7,

                                              fontSize: 13,

                                              lineHeight: 1.6,
                                            }}
                                          >
                                            <div>
                                              REF：
                                              <strong>
                                                {usage.inventoryRefNumber ||
                                                  "—"}
                                              </strong>
                                            </div>

                                            <div>
                                              LOT：
                                              <strong>
                                                {usage.inventoryLotNumber ||
                                                  "—"}
                                              </strong>
                                            </div>

                                            <div>
                                              數量：×
                                              {
                                                usage.quantity
                                              }

                                              {usage.inventoryExpiryDate
                                                ? `｜效期 ${usage.inventoryExpiryDate}`
                                                : ""}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}

                                  {/* =======================
                                      Post Op Entry
                                  ======================= */}

                                  {canUpdate &&
                                    !isDoctor &&
                                    currentClinic &&
                                    implant.status ===
                                      "待術後紀錄" && (
                                      <div
                                        style={{
                                          marginTop: 14,

                                          paddingTop: 12,

                                          borderTop:
                                            "1px solid #e5ebe5",
                                        }}
                                      >
                                        <strong>
                                          術後實際 REF / LOT
                                        </strong>

                                        <p
                                          style={{
                                            margin:
                                              "5px 0 8px",

                                            fontSize: 12,

                                            color:
                                              "#78817a",
                                          }}
                                        >
                                          若此規格未實際使用，不需要新增批號；系統會以 usages: [] 儲存。
                                        </p>

                                        {matching.length ===
                                          0 && (
                                          <div
                                            style={{
                                              padding:
                                                "8px 10px",

                                              marginBottom: 8,

                                              borderRadius: 8,

                                              background:
                                                "#fff7ed",

                                              color:
                                                "#9a6730",

                                              fontSize: 12,
                                            }}
                                          >
                                            目前院所沒有相符規格的 REF / LOT 庫存。
                                          </div>
                                        )}

                                        {rows.map(
                                          (row) => (
                                            <div
                                              key={
                                                row.key
                                              }
                                              style={{
                                                display:
                                                  "grid",

                                                gridTemplateColumns:
                                                  "minmax(180px,1fr) 90px auto",

                                                gap: 8,

                                                marginTop: 8,

                                                alignItems:
                                                  "center",
                                              }}
                                            >
                                              <select
                                                value={
                                                  row.inventoryItemId
                                                }
                                                onChange={(
                                                  event,
                                                ) =>
                                                  updateUsageRow(
                                                    implant.id,
                                                    plan.id,
                                                    row.key,
                                                    "inventoryItemId",
                                                    event.target.value,
                                                  )
                                                }
                                                style={
                                                  compactFieldStyle
                                                }
                                              >
                                                <option value="">
                                                  選擇 REF / LOT
                                                </option>

                                                {matching.map(
                                                  (item) => (
                                                    <option
                                                      key={
                                                        item.id
                                                      }
                                                      value={
                                                        item.id
                                                      }
                                                    >
                                                      REF{" "}
                                                      {item.refNumber ||
                                                        "—"}
                                                      ｜LOT{" "}
                                                      {item.lotNumber ||
                                                        "—"}
                                                      ｜庫存{" "}
                                                      {
                                                        item.quantity
                                                      }
                                                      {item.expiryDate
                                                        ? `｜效期 ${item.expiryDate}`
                                                        : ""}
                                                    </option>
                                                  ),
                                                )}
                                              </select>

                                              <input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={
                                                  row.quantity
                                                }
                                                onChange={(
                                                  event,
                                                ) =>
                                                  updateUsageRow(
                                                    implant.id,
                                                    plan.id,
                                                    row.key,
                                                    "quantity",
                                                    event.target.value,
                                                  )
                                                }
                                                style={
                                                  compactFieldStyle
                                                }
                                              />

                                              <button
                                                type="button"
                                                onClick={() =>
                                                  removeUsageRow(
                                                    implant.id,
                                                    plan.id,
                                                    row.key,
                                                  )
                                                }
                                              >
                                                移除
                                              </button>
                                            </div>
                                          ),
                                        )}

                                        <button
                                          type="button"
                                          onClick={() =>
                                            addUsageRow(
                                              implant.id,
                                              plan.id,
                                            )
                                          }
                                          style={{
                                            marginTop: 10,
                                          }}
                                        >
                                          ＋ 新增實際 REF / LOT
                                        </button>
                                      </div>
                                    )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      ),
                    )}
                  </div>

                  {/* =======================================
                      Save Post Op
                  ======================================= */}

                  {canUpdate &&
                    !isDoctor &&
                    currentClinic &&
                    implant.status ===
                      "待術後紀錄" && (
                      <div
                        style={{
                          display:
                            "flex",

                          justifyContent:
                            "flex-end",

                          marginTop: 16,
                        }}
                      >
                        <button
                          type="button"
                          className="primary-button"
                          disabled={
                            busy
                          }
                          onClick={() =>
                            void savePostOp(
                              implant,
                            )
                          }
                        >
                          {busy
                            ? "儲存中…"
                            : "儲存術後 REF / LOT 並完成個案"}
                        </button>
                      </div>
                    )}

                  {/* =======================================
                      Legacy
                  ======================================= */}

                  {implant.status ===
                    "待歸回品項" && (
                    <div
                      style={{
                        marginTop: 16,

                        padding:
                          "10px 12px",

                        borderRadius: 10,

                        background:
                          "#fff6ed",

                        color:
                          "#97622e",

                        fontSize: 13,
                      }}
                    >
                      此個案屬於舊版術前已扣庫存流程，目前保留「待歸回品項」狀態。新版個案不會再進入此流程。
                    </div>
                  )}
                </article>
              );
            },
          )
        )}
      </div>
    </section>
  );
}

/* =========================================================
   Styles
========================================================= */

const panelStyle:
  React.CSSProperties = {
    padding: 20,

    border:
      "1px solid #e1e8e1",

    borderRadius: 16,

    background:
      "#ffffff",

    boxShadow:
      "0 4px 18px rgba(55, 80, 62, 0.05)",
  };

const subPanelStyle:
  React.CSSProperties = {
    padding: 14,

    border:
      "1px solid #e5eae5",

    borderRadius: 12,

    background:
      "#fafcf9",
  };

const fieldStyle:
  React.CSSProperties = {
    display:
      "block",

    width:
      "100%",

    boxSizing:
      "border-box",

    marginTop: 7,

    padding:
      "10px 12px",

    border:
      "1px solid #d6dfd7",

    borderRadius: 9,

    background:
      "#ffffff",

    color:
      "#304437",

    font:
      "inherit",
  };

const compactFieldStyle:
  React.CSSProperties = {
    width:
      "100%",

    boxSizing:
      "border-box",

    padding:
      "8px 9px",

    border:
      "1px solid #d6dfd7",

    borderRadius: 8,

    background:
      "#ffffff",

    color:
      "#304437",
  };

const emptyStyle:
  React.CSSProperties = {
    padding: 36,

    border:
      "1px dashed #d8e1d8",

    borderRadius: 14,

    background:
      "#fafcf9",

    textAlign:
      "center",

    color:
      "#758279",
  };

const clinicBadgeStyle:
  React.CSSProperties = {
    display:
      "inline-flex",

    alignItems:
      "center",

    padding:
      "4px 8px",

    borderRadius: 999,

    background:
      "#edf4ee",

    color:
      "#526b58",

    fontSize: 12,

    fontWeight: 600,
  };

function statusBadgeStyle(
  status:
    ImplantStatus,
):
  React.CSSProperties {
  let background =
    "#edf1ed";

  let color =
    "#566158";

  switch (
    status
  ) {
    case "待醫師叫貨":
      background =
        "#fff4df";

      color =
        "#91621f";
      break;

    case "醫師已叫貨":
      background =
        "#eaf5ec";

      color =
        "#397148";
      break;

    case "已取出待手術":
      background =
        "#eaf1fb";

      color =
        "#3c6392";
      break;

    case "待術後紀錄":
      background =
        "#f0ebfa";

      color =
        "#68528f";
      break;

    case "待歸回品項":
      background =
        "#fff0f2";

      color =
        "#985163";
      break;

    case "已完成":
      background =
        "#e8f4eb";

      color =
        "#347047";
      break;

    case "已結案":
      background = "#e2f0e6";
      color = "#245d36";
      break;

    case "已取消":
      background = "#fff0f2";
      color = "#985163";
      break;
  }

  return {
    display:
      "inline-flex",

    alignItems:
      "center",

    padding:
      "5px 9px",

    borderRadius: 999,

    background,

    color,

    fontSize: 12,

    fontWeight: 700,
  };
}
