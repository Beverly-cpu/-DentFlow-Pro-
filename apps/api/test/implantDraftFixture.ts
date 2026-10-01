export function implantDraftFixture() {
  return { clinicId: 10, patientId: 50, doctorUserId: 20, implantDate: "2026-10-01", note: "Draft",
    teeth: [{ toothPosition: "36", items: [{ name: "Implant", category: "植體", brand: "Brand", model: "Model", specification: "4 x 10", quantity: 1 }] }] };
}
export const draftRequestId = "00000000-0000-4000-8000-000000000001";
