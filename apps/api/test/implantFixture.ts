export function implantFixture() {
  return {
    clinicCode: "TPE",
    snapshot: {
      case: { id: 7, clinicId: 1, patientId: 8, doctorId: 9 as number | null,
        implantDate: "2026-09-30", note: "test", status: "待歸回品項", createdByUserId: 2 },
      teeth: [{ id: 10, implantId: 7, toothPosition: "36" }],
      planItems: [{ id: 11, implantToothId: 10, legacyImplantItemId: null, plannedQuantity: 2 }],
      usageItems: [{ id: 12, implantPlanItemId: 11, inventoryItemId: 100, quantity: 1,
        inventoryRefNumber: "REF-001", inventoryLotNumber: "LOT-001", unitCost: 1200, totalCost: 1200 }],
      reservations: [{ id: 13, implantId: 7, implantPlanItemId: 11,
        reservedQuantity: 2, pickedQuantity: 2, usedQuantity: 1, returnedQuantity: 0 }],
      returnAudits: [{ id: 14, implantId: 7, reservationId: 13, implantPlanItemId: 11,
        pickedQuantity: 2, returnedQuantity: 0, actorUserId: 2, reason: "test" }],
      legacyItems: [],
    },
    assets: [{ table: "implants", legacyId: 7, field: "doctorSignature", dataUrlSha256: "a".repeat(64), dataUrlBytes: 200 }],
  };
}
