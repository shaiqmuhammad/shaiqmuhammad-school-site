import assert from "node:assert/strict";
import { test } from "node:test";
import { GRACE_MS, STALE_MS, memberAge, nextAlarmAt, shouldDropMember } from "../src/livePresence";

const att = (over: Partial<{ present: boolean; seenAt: number; hb: boolean }> = {}) => ({ id: "s1", present: true, seenAt: 1_000, ...over });

test("a closed socket is kept during the reconnect grace window", () => {
  assert.equal(shouldDropMember(att({ present: false, seenAt: 10_000 }), { now: 10_000 + GRACE_MS - 1, sockets: 0, isHost: false }), "keep");
});

test("an attendee is removed after the socket stays closed past the grace window", () => {
  assert.equal(shouldDropMember(att({ present: false, seenAt: 10_000 }), { now: 10_000 + GRACE_MS, sockets: 0, isHost: false }), "drop");
});

test("the host is marked offline, not removed, after the grace window", () => {
  assert.equal(shouldDropMember({ id: "t1", present: false, seenAt: 10_000 }, { now: 10_000 + GRACE_MS, sockets: 0, isHost: true }), "offline");
});

test("an open socket without a heartbeat is kept, so older clients are not dropped while idle", () => {
  assert.equal(shouldDropMember(att({ seenAt: 10_000, hb: false }), { now: 10_000 + STALE_MS + 5_000, sockets: 1, isHost: false }), "keep");
});

test("an open socket that started pinging is dropped after the heartbeat timeout", () => {
  assert.equal(shouldDropMember(att({ seenAt: 10_000, hb: true }), { now: 10_000 + STALE_MS, sockets: 1, isHost: false }), "drop");
  assert.equal(shouldDropMember({ id: "t1", present: true, seenAt: 10_000, hb: true }, { now: 10_000 + STALE_MS, sockets: 1, isHost: true }), "offline");
});

test("missing seenAt is treated as fresh, so a deploy does not immediately drop everyone", () => {
  assert.equal(memberAge({ }, 50_000), 0);
  assert.equal(shouldDropMember({ id: "s1", present: false }, { now: 50_000, sockets: 0, isHost: false }), "keep");
});

test("the next alarm is the sooner of the sweep interval and the lesson end", () => {
  assert.equal(nextAlarmAt(1_000, 1_000 + 60_000, 15_000), 16_000);
  assert.equal(nextAlarmAt(1_000, 1_000 + 5_000, 15_000), 6_000);
});
