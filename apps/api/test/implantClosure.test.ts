import assert from "node:assert/strict";
import test from "node:test";
import { clinicalAssetInput, clinicalRequestHash, closureInput } from "../src/implantClosure.js";
import { imageDataUrl } from "./assetFixture.js";
const common = { clinicId: 10, expectedVersion: 8, requestId: "00000000-0000-4000-8000-000000000001" };
test("clinical assets require precise central owners and reject forged signer and object keys", () => {
  assert.equal(clinicalAssetInput({ ...common, kind: "instrument_photo", planItemId: 7, dataUrl: imageDataUrl }).planItemId, 7);
  assert.equal(clinicalAssetInput({ ...common, kind: "ref_lot_photo", reservationId: common.requestId, dataUrl: imageDataUrl }).reservationId, common.requestId);
  for (const extra of [{ kind: "other" }, { kind: "doctor_signature", planItemId: 7 }, { kind: "instrument_photo" }, { kind: "doctor_signature", actorUserId: 20 }, { kind: "doctor_signature", objectKey: "external" }]) assert.throws(() => clinicalAssetInput({ ...common, dataUrl: imageDataUrl, ...extra }));
});
test("signature accepts PNG only and closure requires explicit version and stable request identity", () => {
  assert.equal(clinicalAssetInput({ ...common, kind: "doctor_signature", dataUrl: imageDataUrl }).decoded.contentType, "image/png");
  assert.throws(() => clinicalAssetInput({ ...common, kind: "doctor_signature", dataUrl: "data:image/jpeg;base64,/9j/2Q==" }));
  for (const input of [{ ...common, expectedVersion: 0 }, { ...common, requestId: "bad" }, { ...common, signatureId: "forged" }]) assert.throws(() => closureInput(input));
  assert.notEqual(clinicalRequestHash({ version: 1 }), clinicalRequestHash({ version: 2 }));
});
