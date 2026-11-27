import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyT416Overrides, T416_BY } from "../src/trkOvFix";
import { T416_ROWS, T416_STUDENTS, T416_UNITS } from "../src/trkOvData";
import { T413_SC } from "../src/curScFix";

const mk = (opts: { skipUnit?: string; badName?: string } = {}) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT); CREATE TABLE cur (id TEXT PRIMARY KEY, sc TEXT); CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, role TEXT);
    CREATE TABLE trk_ov (student TEXT, unit TEXT, i INTEGER, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, unit, i));
    CREATE TABLE trk_audit (id TEXT PRIMARY KEY, at INTEGER, by_id TEXT, by_name TEXT, student TEXT, what TEXT, prev TEXT, next TEXT)`);
  for (const [id, texts] of T416_UNITS) { if (id === opts.skipUnit) continue; const n = Math.max(...Object.keys(texts).map(Number)) + 1; db.prepare(`INSERT INTO cur VALUES (?,?)`).run(id, JSON.stringify(Array.from({ length: n }, (_, i) => texts[String(i)] ?? `x${i}`))); }
  for (const [id, name] of T416_STUDENTS) db.prepare(`INSERT INTO users VALUES (?,?,?)`).run(id, id === opts.badName ? name + "x" : name, "student");
  const sql = { exec: (q: string, ...a: unknown[]) => { const st = db.prepare(q); const rows = (/^\s*SELECT/i.test(q) ? st.all(...(a as never[])) : (st.run(...(a as never[])), [])) as Record<string, unknown>[]; return { toArray: () => rows }; } };
  return { db, sql };
};

test("data is consistent: valid marks, unique cells, SC text of the two t413 units equals the t413 SC", () => {
  const seen = new Set<string>();
  for (const [si, ui, i, v] of T416_ROWS) {
    assert.ok(v >= 0 && v <= 3 && Number.isInteger(v)); assert.ok(T416_STUDENTS[si] && T416_UNITS[ui]); assert.ok(T416_UNITS[ui][1][String(i)]);
    const k = `${si}|${ui}|${i}`; assert.ok(!seen.has(k)); seen.add(k);
  }
  for (const t of T413_SC) { const u = T416_UNITS.find(([id]) => id === t.id); if (u) t.sc.forEach((s, i) => { if (u[1][String(i)] !== undefined) assert.equal(u[1][String(i)], s); }); }
});

test("writes every Excel mark once, keeps other overrides, backs up and logs, runs once", () => {
  const { db, sql } = mk();
  const [si, ui, i, v] = T416_ROWS[0]; const sid = T416_STUDENTS[si][0], uid = T416_UNITS[ui][0];
  db.prepare(`INSERT INTO trk_ov VALUES (?,?,?,?,?,?)`).run(sid, uid, i, String((v + 1) % 4), "Teacher", 1); // different value → replaced, old kept in log
  db.prepare(`INSERT INTO trk_ov VALUES (?,?,?,?,?,?)`).run("u_keep", "cu_keep", 0, "2", "Teacher", 1); // unrelated → untouched
  const r = applyT416Overrides(sql, 1000)!;
  assert.equal(r.written, T416_ROWS.length); assert.equal(r.skipped, 0); assert.equal(r.replaced, 1);
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM trk_ov`).get() as { c: number }).c, T416_ROWS.length + 1);
  assert.equal((db.prepare(`SELECT val, by_name FROM trk_ov WHERE student=? AND unit=? AND i=?`).get(sid, uid, i) as { val: string }).val, String(v));
  assert.deepEqual({ ...(db.prepare(`SELECT val, by_name FROM trk_ov WHERE student='u_keep'`).get() as object) }, { val: "2", by_name: "Teacher" });
  const log = JSON.parse(String((db.prepare(`SELECT v FROM settings WHERE k='mig:t416:log'`).get() as { v: string }).v));
  assert.equal(log.trk_ov_before.length, 2); assert.ok(log.trk_ov_before.some((o: { val: string }) => o.val === String((v + 1) % 4)));
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM trk_audit`).get() as { c: number }).c, new Set(T416_ROWS.map((x) => x[0])).size);
  assert.equal(T416_BY, "Excel tracker (27 Nov)");
  db.prepare(`UPDATE trk_ov SET val='0' WHERE student=?`).run(sid); // a later teacher edit is never overwritten
  assert.equal(applyT416Overrides(sql, 2000), null);
  assert.equal((db.prepare(`SELECT val FROM trk_ov WHERE student=? AND unit=? AND i=?`).get(sid, uid, i) as { val: string }).val, "0");
});

test("skips a cell when the student's name or the unit's SC text no longer matches; never writes it", () => {
  const badName = T416_STUDENTS[0][0], skipUnit = T416_UNITS[0][0];
  const { db, sql } = mk({ badName, skipUnit });
  const r = applyT416Overrides(sql, 5)!;
  const expectSkipped = T416_ROWS.filter((x) => T416_STUDENTS[x[0]][0] === badName || T416_UNITS[x[1]][0] === skipUnit).length;
  assert.ok(expectSkipped > 0); assert.equal(r.skipped, expectSkipped); assert.equal(r.written, T416_ROWS.length - expectSkipped);
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM trk_ov WHERE student=?`).get(badName) as { c: number }).c, 0);
  const { db: db2, sql: sql2 } = mk(); db2.prepare(`UPDATE cur SET sc='["changed"]' WHERE id=?`).run(T416_UNITS[1][0]);
  assert.equal((applyT416Overrides(sql2, 5)!).skipped, T416_ROWS.filter((x) => x[1] === 1).length);
});
