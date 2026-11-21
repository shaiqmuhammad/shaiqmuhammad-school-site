import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeUploadSlides, recOverCap, uploadFileKind, MAX_REC_BYTES } from "./liveUpload.ts";

test("uploadFileKind accepts pptx and pdf and flags legacy ppt", () => {
  assert.equal(uploadFileKind("slides.PPTX"), "pptx");
  assert.equal(uploadFileKind("notes.pdf", "application/pdf"), "pdf");
  assert.equal(uploadFileKind("old.ppt"), "ppt");
  assert.equal(uploadFileKind("photo.png"), "");
});

test("normalizeUploadSlides keeps a short deck and drops junk", () => {
  const slides = normalizeUploadSlides([
    { id: "s1", bg: "#fff", els: [{ id: "e1", t: "img", src: "lpm_abc", x: 0, y: 0, w: 100, h: 100 }] },
    { id: "bad" },
    null,
  ]);
  assert.equal(slides.length, 2);
  assert.equal(slides[0].els[0].src, "lpm_abc");
});

test("recOverCap stops a recording before it leaves the free-tier budget", () => {
  assert.equal(recOverCap(MAX_REC_BYTES - 10, 20), true);
});
