import assert from "node:assert/strict";
import test from "node:test";
import { inventoryActivationIdentity, inventoryOpeningHash, validateInventoryOpening } from "../src/inventoryOpening.js";

import { openingFixture } from "./inventoryOpeningFixture.js";
test("opening requires explicit counted stock and exact two-decimal cost", () => {
  const opening = validateInventoryOpening(openingFixture()); assert.equal(opening.unitCost, "1200.50");
  assert.equal(validateInventoryOpening({ ...openingFixture(), countedQuantity: 0, unitCost: 0 }).unitCost, "0.00");
  for (const change of [{ countedQuantity: undefined }, { countedQuantity: -1 }, { countedQuantity: 1.5 }, { countedQuantity: 1000001 },
    { unitCost: undefined }, { unitCost: -1 }, { unitCost: 1.234 }, { unitCost: "1200.5" }, { reconciliationNote: "" }, { quantity: 99 }, { requestId: "bad" }]) {
    assert.throws(() => validateInventoryOpening({ ...openingFixture(), ...change }));
  }
  assert.notEqual(inventoryOpeningHash(1, opening), inventoryOpeningHash(2, opening));
  assert.notEqual(inventoryOpeningHash(1, opening), inventoryOpeningHash(1, { ...opening, countedQuantity: 4 }));
});
test("batch identity rejects REF/LOT aliases and normalizes specification fallbacks", () => {
  const batch = { name: "Implant", category: "植體", brand: "Brand", model: "Model", specification: "4 x 10", refNumber: " REF-1 ", lotNumber: "LOT-1" };
  assert.equal(inventoryActivationIdentity(batch), inventoryActivationIdentity({ ...batch, name: "Another name", refNumber: "ref-1", lotNumber: "lot-1" }));
  assert.notEqual(inventoryActivationIdentity(batch), inventoryActivationIdentity({ ...batch, lotNumber: "LOT-2" }));
  const noLot = { ...batch, refNumber: "", lotNumber: "" };
  assert.equal(inventoryActivationIdentity(noLot), inventoryActivationIdentity({ ...noLot, name: "  Ｉｍｐｌａｎｔ  ", specification: "4  x  10" }));
});
