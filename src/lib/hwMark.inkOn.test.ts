import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CODES, STAMP_INK, STAMP_WHITE, inkOn, parseCssColor } from "./hwMark.ts";

describe("inkOn", () => {
  it("uses dark ink on light default stamp colours that fail with white text", () => {
    const dark = ["ok", "star", "sa", "p", "c", "chk"];
    for (const id of dark) {
      const c = DEFAULT_CODES.find((x) => x.id === id);
      assert.ok(c, id);
      assert.equal(inkOn(c!.color), STAMP_INK, id);
    }
  });
  it("keeps white text on darker default stamps that already meet 4.5:1", () => {
    const white = ["pa", "sp", "gr", "nw"];
    for (const id of white) {
      const c = DEFAULT_CODES.find((x) => x.id === id);
      assert.ok(c, id);
      assert.equal(inkOn(c!.color), STAMP_WHITE, id);
    }
  });
  it("auto-picks readable text for custom colours", () => {
    assert.equal(inkOn("#fbbf24"), STAMP_INK); // gold
    assert.equal(inkOn("#38bdf8"), STAMP_INK); // sky
    assert.equal(inkOn("#4c1d95"), STAMP_WHITE); // deep violet
    assert.equal(inkOn("#0f766e"), STAMP_WHITE);
    assert.equal(inkOn("#fff"), STAMP_INK);
    assert.equal(inkOn("#000"), STAMP_WHITE);
    assert.equal(inkOn("rgb(251, 191, 36)"), STAMP_INK);
  });
  it("parses hex and rgb", () => {
    assert.deepEqual(parseCssColor("#0d9488"), [13, 148, 136]);
    assert.deepEqual(parseCssColor("#abc"), [170, 187, 204]);
    assert.deepEqual(parseCssColor("rgb(5, 150, 105)"), [5, 150, 105]);
    assert.equal(parseCssColor("nope"), null);
  });
});
