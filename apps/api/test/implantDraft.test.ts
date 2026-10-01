import assert from "node:assert/strict";
import test from "node:test";
import { draftRequestId, implantDraftHash, validateImplantDraft } from "../src/implantDraft.js";
import { implantDraftFixture } from "./implantDraftFixture.js";

test("drafts normalize central references and specification-only plans for stable request identity", () => {
  const raw = implantDraftFixture(); const a = validateImplantDraft(raw);
  const b = validateImplantDraft({ ...raw, note: "  Draft  " });
  assert.equal(implantDraftHash(a), implantDraftHash(b));
  assert.equal(a.patientId, 50); assert.equal(a.doctorUserId, 20); assert.equal(a.teeth[0]!.items[0]!.quantity, 1);
  assert.equal(validateImplantDraft({ ...raw, doctorUserId: null }).doctorUserId, null);
  assert.equal(draftRequestId("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});
test("drafts reject old IDs, inventory quantities, photos, status changes and duplicate or invalid FDI teeth", () => {
  const input = implantDraftFixture(); const tooth = input.teeth[0]!; const item = tooth.items[0]!;
  for (const body of [{ ...input, patientId: "50" }, { ...input, doctorId: 9 }, { ...input, status: "已完成" },
    { ...input, doctorSignature: "data:image/png;base64,abc" }, { ...input, teeth: [tooth, tooth] },
    { ...input, teeth: [{ ...tooth, toothPosition: "99" }] }, { ...input, teeth: [{ ...tooth, toothPosition: "56" }] },
    { ...input, teeth: [{ ...tooth, items: [{ ...item, inventoryItemId: 100 }] }] },
    { ...input, teeth: [{ ...tooth, items: [{ ...item, lotNumber: "LOT" }] }] },
    { ...input, teeth: [{ ...tooth, items: [{ ...item, quantity: 0 }] }] },
    { ...input, teeth: [{ ...tooth, items: [{ ...item, quantity: 1001 }] }] }]) assert.throws(() => validateImplantDraft(body));
});
test("drafts reject impossible dates, invalid requests and bounded Unicode notes", () => {
  for (const body of [{ ...implantDraftFixture(), implantDate: "2026-02-30" }, { ...implantDraftFixture(), implantDate: "" },
    { ...implantDraftFixture(), note: "牙".repeat(6000) }, { ...implantDraftFixture(), teeth: [] }]) assert.throws(() => validateImplantDraft(body));
  for (const key of [null, "abc", "00000000-0000-0000-0000-000000000001"]) assert.throws(() => draftRequestId(key));
});
