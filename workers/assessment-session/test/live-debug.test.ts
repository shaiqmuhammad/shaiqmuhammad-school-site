import assert from "node:assert/strict";
import { test } from "node:test";
import { keepDebugLogs, sanitizeLiveDebug } from "../src/liveDebug.ts";

test("sanitizeLiveDebug drops empty payloads and keeps known events", () => {
  assert.equal(sanitizeLiveDebug({}, ""), null);
  const blob = sanitizeLiveDebug({
    t0: 100,
    events: [
      { t: 12, ev: "join" },
      { t: 40, ev: "ice_servers", detail: "stun:2 turn:1" },
      { t: 5, ev: "<script>", detail: "x" },
      { t: 9, ev: "first_remote_frame", detail: "A".repeat(400) },
    ],
  }, "abc123");
  assert.ok(blob);
  assert.equal(blob!.clientId, "abc123");
  assert.equal(blob!.events.length, 3);
  assert.equal(blob!.events[0]!.ev, "join");
  assert.equal(blob!.events[2]!.detail?.length, 160);
});

test("keepDebugLogs replaces the same client and expires old rows", () => {
  const now = 1_000_000;
  const old = { clientId: "a", at: now - 8 * 3600 * 1000, t0: 1, events: [{ t: 1, ev: "join" }] };
  const cur = { clientId: "b", at: now - 10, t0: 1, events: [{ t: 1, ev: "join" }] };
  const next = { clientId: "b", at: now, t0: 2, events: [{ t: 20, ev: "ready" }] };
  const out = keepDebugLogs([old, cur], next, now);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.events[0]!.ev, "ready");
});
