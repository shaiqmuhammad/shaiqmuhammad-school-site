import assert from "node:assert/strict";
import { test } from "node:test";
import { LIVE_SHAPE_KINDS, normalizeLiveShape, normalizeLiveShapes } from "../src/liveShapes.ts";

test("every listed shape kind is kept, unknown kinds become a rectangle", () => {
  const ok = normalizeLiveShape({ id: "a", kind: "beaker", x: 10, y: 10, w: 40, h: 40, c: "#047857", by: "t" }, "z");
  assert.equal(ok.kind, "beaker");
  const bad = normalizeLiveShape({ id: "b", kind: "nope" as "rect", x: 0, y: 0, w: 1, h: 1, c: "#000", by: "t" }, "z");
  assert.equal(bad.kind, "rect");
  assert.ok(LIVE_SHAPE_KINDS.includes("table"));
  assert.ok(LIVE_SHAPE_KINDS.includes("protractor"));
});

test("table grids are clamped and attached", () => {
  const sh = normalizeLiveShape({ id: "t", kind: "table", x: 0, y: 0, w: 10, h: 10, c: "#1b3a57", by: "t", rows: 99, cols: 0 }, "z");
  assert.equal(sh.rows, 12);
  assert.equal(sh.cols, 3);
  const list = normalizeLiveShapes([sh, sh], () => "n");
  assert.equal(list.length, 2);
});
