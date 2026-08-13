import assert from "node:assert/strict";
import test from "node:test";
import { materialValueBounds, matchesMaterialValueRange } from "../lib/property-filter.mjs";

test("extracts single, negative, and displayed range values", () => {
  assert.deepEqual(materialValueBounds("~36"), { min: 36, max: 36 });
  assert.deepEqual(materialValueBounds("388–403"), { min: 388, max: 403 });
  assert.deepEqual(materialValueBounds("−2.4 eV"), { min: -2.4, max: -2.4 });
});

test("numeric filtering keeps rows whose displayed ranges overlap", () => {
  assert.equal(matchesMaterialValueRange("388–403", { min: "400", max: "500" }), true);
  assert.equal(matchesMaterialValueRange("388–403", { min: "404", max: "500" }), false);
  assert.equal(matchesMaterialValueRange("36", { min: "35", max: "40" }), true);
  assert.equal(matchesMaterialValueRange("not reported", { min: "0", max: "100" }), false);
});
