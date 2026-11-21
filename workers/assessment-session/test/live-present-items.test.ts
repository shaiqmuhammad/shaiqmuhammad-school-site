import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activatePresentItem,
  applyActivePresentItem,
  closeLibraryPresentItems,
  closePresentItem,
  normalizePresentItems,
  openPresentItem,
  presentItemId,
  youtubeVideoId,
  type PresentItemsState,
} from "../src/livePresentItems";

function blank(): PresentItemsState {
  return { packId: "", packTitle: "Whiteboard", slide: 0, strokes: [] };
}

test("youtubeVideoId accepts watch, short, and embed links", () => {
  assert.equal(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9wgGcQ"), "dQw4w9wgGcQ");
  assert.equal(youtubeVideoId("https://youtu.be/dQw4w9wgGcQ"), "dQw4w9wgGcQ");
  assert.equal(youtubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9wgGcQ"), "dQw4w9wgGcQ");
  assert.equal(youtubeVideoId("nope"), "");
});

test("legacy present state becomes a board tab plus the open pack", () => {
  const p: PresentItemsState = { packId: "pk1", packTitle: "Fractions", slide: 2, strokes: [{ c: "#000", w: 3, d: [1, 2, 3, 4], by: "t" }] };
  normalizePresentItems(p);
  applyActivePresentItem(p);
  assert.deepEqual(p.items?.map((i) => i.id), ["board", "lesson:pk1"]);
  assert.equal(p.activeId, "lesson:pk1");
  assert.equal(p.slide, 2);
  assert.equal(p.items?.[1].strokes.length, 1);
});

test("opening a second library item keeps the first and switches the active tab", () => {
  const p = blank();
  openPresentItem(p, { packId: "pk1", packTitle: "Fractions", kind: "lesson", slide: 0 });
  p.slide = 3;
  p.strokes = [{ c: "#1b3a57", w: 3, d: [0, 0, 1, 1], by: "t" }];
  openPresentItem(p, { packId: "pk2", packTitle: "Homework 1", kind: "homework", slide: 1 });
  assert.equal(p.activeId, "homework:pk2");
  assert.equal(p.packTitle, "Homework 1");
  assert.equal(p.slide, 1);
  assert.equal(p.strokes.length, 0);
  activatePresentItem(p, "lesson:pk1");
  assert.equal(p.packTitle, "Fractions");
  assert.equal(p.slide, 3);
  assert.equal(p.strokes.length, 1);
});

test("opening the same lesson again only switches to that tab", () => {
  const p = blank();
  openPresentItem(p, { packId: "pk1", packTitle: "Fractions", kind: "lesson" });
  openPresentItem(p, { packId: "pk2", packTitle: "Task", kind: "task" });
  openPresentItem(p, { packId: "pk1", packTitle: "Fractions", kind: "lesson" });
  assert.equal(p.items?.filter((i) => i.kind === "lesson").length, 1);
  assert.equal(p.activeId, presentItemId("lesson", "pk1"));
});

test("closing the active item reveals the remaining pack, and stop returns to the board", () => {
  const p = blank();
  openPresentItem(p, { packId: "a", packTitle: "A", kind: "lesson" });
  openPresentItem(p, { packId: "b", packTitle: "B", kind: "homework" });
  closePresentItem(p, "homework:b");
  assert.equal(p.activeId, "lesson:a");
  closeLibraryPresentItems(p);
  assert.equal(p.activeId, "board");
  assert.equal(p.packId, "");
  assert.equal(p.items?.length, 1);
});

test("the board tab cannot be closed", () => {
  const p = blank();
  openPresentItem(p, { packId: "a", packTitle: "A", kind: "lesson" });
  closePresentItem(p, "board");
  assert.ok(p.items?.some((i) => i.id === "board"));
  assert.equal(p.activeId, "lesson:a");
});

test("youtube media cursor is stashed per tab and restored on switch", () => {
  const p: PresentItemsState = { packId: "", packTitle: "Whiteboard", slide: 0, strokes: [] };
  openPresentItem(p, { packId: "", packTitle: "YouTube", kind: "youtube", src: "dQw4w9wgGcQ" });
  assert.equal(p.src, "dQw4w9wgGcQ");
  assert.equal(p.media?.src, "dQw4w9wgGcQ");
  assert.equal(p.media?.playing, false);
  p.media = { src: "dQw4w9wgGcQ", playing: true, t: 42, at: 9 };
  openPresentItem(p, { packId: "", packTitle: "YouTube", kind: "youtube", src: "oHg5SJYRHA0" });
  assert.equal(p.src, "oHg5SJYRHA0");
  assert.equal(p.media?.src, "oHg5SJYRHA0");
  assert.equal(p.media?.t, 0);
  activatePresentItem(p, "youtube:dQw4w9wgGcQ");
  assert.equal(p.src, "dQw4w9wgGcQ");
  assert.equal(p.media?.playing, true);
  assert.equal(p.media?.t, 42);
  activatePresentItem(p, "board");
  assert.equal(p.src, "");
  assert.equal(p.media, undefined);
});

test("upload slides are stashed per tab and restored on switch", () => {
  const p: PresentItemsState = { packId: "", packTitle: "Whiteboard", slide: 0, strokes: [] };
  const slides = [{ id: "s1", bg: "#fff", els: [{ id: "e1", t: "img", src: "lpm_1", x: 0, y: 0, w: 100, h: 100 }] }];
  openPresentItem(p, { packId: "up_a", packTitle: "Notes", kind: "upload", src: "up_a", slides });
  assert.equal(p.slides?.length, 1);
  assert.equal(p.slides?.[0].id, "s1");
  openPresentItem(p, { packId: "", packTitle: "YouTube", kind: "youtube", src: "dQw4w9wgGcQ" });
  assert.equal(p.slides, undefined);
  activatePresentItem(p, "upload:up_a");
  assert.equal(p.packTitle, "Notes");
  assert.equal(p.slides?.[0].els[0].src, "lpm_1");
});
