import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_AGE_MS, alertsFor, countIncrease, pickAlerts } from "../../../src/lib/notifyRules";

const NOW = 1_800_000_000_000;
const n = (id: string, kind: string, ageMin: number, read = false) => ({ id, kind, created: NOW - ageMin * 60_000, read });

test("each role is only alerted for its own kinds; students never for revision reminders", () => {
  assert.ok(alertsFor("student", "hw_new") && alertsFor("student", "feedback") && alertsFor("student", "graded"));
  assert.ok(!alertsFor("student", "revise"));
  assert.ok(!alertsFor("student", "sub_new"));
  assert.ok(alertsFor("teacher", "sub_new") && !alertsFor("teacher", "graded"));
  assert.ok(alertsFor("admin", "sub_new") && !alertsFor("admin", "hw_new"));
});

test("first visit only sets the baseline, nothing pops up", () => {
  const r = pickAlerts([n("a", "hw_new", 1)], "student", null, NOW);
  assert.deepEqual(r.fresh, []);
  assert.equal(r.lastSeen, NOW - 60_000);
});

test("new unread notes pop up once, oldest first, limited to 3 with a +more count", () => {
  const items = [n("1", "hw_new", 5), n("2", "feedback", 4), n("3", "graded", 3), n("4", "approved", 2), n("old", "hw_new", 30)];
  const r = pickAlerts(items, "student", NOW - 10 * 60_000, NOW);
  assert.deepEqual(r.fresh.map((x) => x.id), ["2", "3", "4"]);
  assert.equal(r.more, 1);
  assert.equal(r.lastSeen, NOW - 2 * 60_000);
  assert.deepEqual(pickAlerts(items, "student", r.lastSeen, NOW).fresh, []);
});

test("read notes, revision reminders and stale notes do not pop up", () => {
  const items = [n("r", "hw_new", 1, true), n("v", "revise", 1), n("s", "hw_new", MAX_AGE_MS / 60_000 + 1)];
  assert.deepEqual(pickAlerts(items, "student", NOW - 60 * 60_000, NOW).fresh, []);
});

test("counters alert only when they grow", () => {
  assert.equal(countIncrease(null, 4), 0);
  assert.equal(countIncrease(2, 5), 3);
  assert.equal(countIncrease(5, 5), 0);
  assert.equal(countIncrease(5, 1), 0);
});
