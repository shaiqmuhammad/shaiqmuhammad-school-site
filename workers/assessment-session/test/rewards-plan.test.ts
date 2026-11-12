import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mpOf } from "../src/modperm";
import { rcHandle, rcInit, type RcCtx } from "../src/rewards";

/** In-memory stand-in for the worker's sql.exec().toArray() helper. */
function memorySql() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT)`);
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, cls TEXT, section TEXT, role TEXT, disabled INTEGER DEFAULT 0)`);
  const sql = {
    exec(q: string, ...b: unknown[]) {
      const stmt = db.prepare(q);
      if (/^\s*(select|pragma)\b/i.test(q)) return { toArray: () => stmt.all(...(b as never[])) as Record<string, unknown>[] };
      stmt.run(...(b as never[]));
      return { toArray: () => [] as Record<string, unknown>[] };
    },
  };
  return { db, sql };
}

const wallet = (db: DatabaseSync) => db.prepare(`SELECT id, student, kind, amt, label FROM rc ORDER BY id`).all();

function ctx(sql: ReturnType<typeof memorySql>["sql"]): RcCtx {
  return { sql, acc: (a) => mpOf(sql, a, "rw"), inScope: () => true };
}

const teacher = (perms: string[] = [], viewAs = false) => ({ id: "t1", role: "teacher", name: "Teacher", perms, viewAs });
const admin = { id: "a1", role: "admin", name: "Admin", perms: [] as string[] };

test("teachers start without Reward Cards plan permission", () => {
  const { sql } = memorySql();
  const plain = mpOf(sql, teacher(), "rw");
  assert.equal(plain.view, true);
  assert.equal(plain.add, true);
  assert.equal(plain.edit, false);
  assert.equal(plain.plan, false);
  assert.equal(plain.exc, false);
  assert.equal(mpOf(sql, teacher(["mp:rw:plan:on"]), "rw").plan, true);
  assert.equal(mpOf(sql, teacher(["mp:rw:plan:on", "mp:rw:view:off"]), "rw").plan, false);
  assert.equal(mpOf(sql, admin, "rw").plan, true);
});

test("plan and shop saves follow plan permission and leave the wallet ledger alone", async () => {
  const { db, sql } = memorySql();
  rcInit(sql);
  const since = 1_700_000_000_000;
  sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('rc_plan', ?)`, JSON.stringify({ on: true, legacy: false, since, resetAt: 0, manualMax: 4 }));
  sql.exec(`INSERT INTO rc (id, student, kind, ref, amt, label, by, at) VALUES ('rc_keep', 'stu_1', 'manual', 'ref_keep', 7, 'kept', 'auto', ?)`, since + 10);
  sql.exec(`INSERT INTO users (id, name, cls, section, role, disabled) VALUES ('stu_1', 'Learner', 'Year 4', 'A', 'student', 0)`);
  const before = wallet(db);
  const shopBefore = db.prepare(`SELECT id, name, cost FROM rcshop ORDER BY pos`).all();
  assert.ok(shopBefore.length > 0);
  const c = ctx(sql);
  const planBody = { plan: { on: true, legacy: false, manualMax: 9, resetAt: 999 } };

  const denied = await rcHandle(c, teacher(), "rc-plan-save", planBody);
  assert.equal(denied.status, 403);
  const shopDenied = await rcHandle(c, teacher(), "rc-shop-save", { name: "Extra prize", cost: 15 });
  assert.equal(shopDenied.status, 403);
  const resetDenied = await rcHandle(c, teacher(["mp:rw:plan:on"]), "rc-reset", {});
  assert.equal(resetDenied.status, 403);
  assert.equal((resetDenied.body as { error: string }).error, "admin_only");

  const saved = await rcHandle(c, teacher(["mp:rw:plan:on"]), "rc-plan-save", planBody);
  assert.equal(saved.status, 200);
  const plan = (saved.body as { plan: { manualMax: number; resetAt: number; since: number } }).plan;
  assert.equal(plan.manualMax, 9);
  assert.equal(plan.resetAt, 0);
  assert.equal(plan.since, since);

  const preview = await rcHandle(c, teacher(["mp:rw:plan:on"], true), "rc-plan-save", { plan: { manualMax: 3 } });
  assert.equal(preview.status, 403);

  const item = await rcHandle(c, teacher(["mp:rw:plan:on"]), "rc-shop-save", { name: "Extra prize", nameAr: "جائزة إضافية", icon: "🎁", cost: 15, stock: -1, bands: "abc", on: true });
  assert.equal(item.status, 200);
  const del = await rcHandle(c, teacher(), "rc-shop-delete", { id: "missing" });
  assert.equal(del.status, 403);

  const staff = await rcHandle(c, teacher(["mp:rw:plan:on"]), "rc-staff", {});
  assert.equal(staff.status, 200);
  const body = staff.body as { admin: boolean; acc: { plan: boolean; edit: boolean }; students: { balance: number }[] };
  assert.equal(body.admin, false);
  assert.equal(body.acc.plan, true);
  assert.equal(body.acc.edit, false);
  assert.equal(body.students[0].balance, 7);

  const hidden = await rcHandle(c, teacher(), "rc-staff", {});
  assert.equal((hidden.body as { acc: { plan: boolean } }).acc.plan, false);

  const asAdmin = await rcHandle(c, admin, "rc-staff", {});
  assert.equal((asAdmin.body as { admin: boolean; acc: { plan: boolean } }).admin, true);
  assert.equal((asAdmin.body as { acc: { plan: boolean } }).acc.plan, true);

  assert.deepEqual(wallet(db), before);
  const names = db.prepare(`SELECT name FROM rcshop ORDER BY pos, name`).all().map((r) => String(r.name));
  for (const row of shopBefore) assert.ok(names.includes(String((row as { name: string }).name)));
  assert.ok(names.includes("Extra prize"));
  const stored = JSON.parse(String(db.prepare(`SELECT v FROM settings WHERE k='rc_plan'`).get()?.v));
  assert.equal(stored.resetAt, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM rc`).get()?.n, 1);
});
