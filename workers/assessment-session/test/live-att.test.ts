import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { isLiveGuestId, liveAttPeriod } from "../src/liveAtt";

test("live attendance period is Dubai-local Live HH:MM and fits 12 chars", () => {
  // 21 Nov 2026 10:15 Asia/Dubai = 06:15 UTC
  const { day, period } = liveAttPeriod(Date.UTC(2026, 10, 21, 6, 15, 0));
  assert.equal(day, "2026-11-21");
  assert.equal(period, "Live 10:15");
  assert.ok(period.length <= 12);
});

test("guest ids are excluded from attendance", () => {
  assert.equal(isLiveGuestId("lgid_ab12cd"), true);
  assert.equal(isLiveGuestId("lg_token"), true);
  assert.equal(isLiveGuestId("lk_share"), true);
  assert.equal(isLiveGuestId(""), true);
  assert.equal(isLiveGuestId("stu_abc"), false);
});

test("attendance insert is present-only and does not overwrite an existing mark", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE att (id TEXT PRIMARY KEY, student TEXT, cls TEXT, section TEXT, day TEXT, period TEXT, status TEXT, note TEXT DEFAULT '', by TEXT, by_name TEXT, at INTEGER, alerted INTEGER DEFAULT 0, UNIQUE (student, day, period))`);
  const ins = (status: string) => {
    const stmt = db.prepare(`INSERT INTO att (id, student, cls, section, day, period, status, note, by, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?) ON CONFLICT(student, day, period) DO NOTHING`);
    stmt.run(`at_${status}_${Math.random()}`, "stu_1", "Y4", "A", "2026-11-21", "Live 10:15", status, "t1", "Teacher", Date.now());
  };
  ins("A");
  ins("P");
  const row = db.prepare(`SELECT status, COUNT(*) AS n FROM att WHERE student='stu_1'`).get() as { status: string; n: number };
  assert.equal(row.status, "A");
  assert.equal(row.n, 1);
});
