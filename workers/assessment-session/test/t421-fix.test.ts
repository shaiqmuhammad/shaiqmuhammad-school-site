import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyOverrideSet, type OvSet } from "../src/trkOvFix";
import { applyT421, T421_SET } from "../src/t421Fix";
import { T421_CLEARS, T421_ROWS } from "../src/t421Data";
import { applyT420, applyT420Sync } from "../src/t420Fix";
import { T420_CHANGES, T420_NEW_UNITS, T420_SYNC_STUDENTS, T420_SYNC_UNITS, T420_SYNC_ROWS } from "../src/t420Data";

test("t421 data: valid marks, unique cells, no clears in this set, every unit text present", () => {
  const seen = new Set<string>();
  for (const [si, ui, i, v] of T421_ROWS) {
    assert.ok(v >= 0 && v <= 3 && Number.isInteger(v));
    assert.ok(T421_SET.students[si] && T421_SET.units[ui] && T421_SET.units[ui][1][String(i)]);
    const k = `${si}|${ui}|${i}`; assert.ok(!seen.has(k)); seen.add(k);
  }
  assert.deepEqual(T421_CLEARS, []);
  assert.equal(T421_SET.clears?.length, 0);
  assert.ok(T421_ROWS.length > T420_SYNC_ROWS.length); // later Excel has more filled cells than the 12:16 read
});

const schema = `CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE cur (id TEXT PRIMARY KEY, subject TEXT, yr TEXT, term TEXT, title TEXT, objectives TEXT DEFAULT '', lessons TEXT DEFAULT '[]', resources TEXT DEFAULT '[]', wk_from INTEGER DEFAULT 0, wk_to INTEGER DEFAULT 0, status TEXT DEFAULT 'planned', quiz TEXT DEFAULT '', page TEXT DEFAULT '', ord INTEGER DEFAULT 0, by_name TEXT, updated INTEGER, links TEXT DEFAULT '[]', notes TEXT DEFAULT '', sc TEXT DEFAULT '[]', std TEXT DEFAULT '{}', title_ar TEXT DEFAULT '', sc_ar TEXT DEFAULT '[]', obj_ar TEXT DEFAULT '', ar_review INTEGER DEFAULT 0, sow TEXT DEFAULT '{}');
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, role TEXT);
  CREATE TABLE trk_ov (student TEXT, unit TEXT, i INTEGER, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, unit, i));
  CREATE TABLE trk_audit (id TEXT PRIMARY KEY, at INTEGER, by_id TEXT, by_name TEXT, student TEXT, what TEXT, prev TEXT, next TEXT);`;
const sqlOf = (db: DatabaseSync) => ({ exec: (q: string, ...a: unknown[]) => { const st = db.prepare(q); const rows = (/^\s*SELECT/i.test(q) ? st.all(...(a as never[])) : (st.run(...(a as never[])), [])) as Record<string, unknown>[]; return { toArray: () => rows }; } });

test("after t420, t421 writes only new or changed Excel marks, skips identical ones, and runs once", () => {
  const db = new DatabaseSync(":memory:"); db.exec(schema);
  for (const c of T420_CHANGES) db.prepare(`INSERT INTO cur (id, subject, yr, term, title, sc) VALUES (?, 'Islamic B', ?, 'Term 1', ?, '["old"]')`).run(c.id, c.yr, c.title);
  const have = new Set(T420_CHANGES.map((c) => c.id));
  for (const n of T420_NEW_UNITS) { /* created by applyT420 */ have.add(n.id); }
  for (const [id, texts] of T420_SYNC_UNITS) if (!have.has(id)) {
    const n = Math.max(...Object.keys(texts).map(Number)) + 1;
    db.prepare(`INSERT INTO cur (id, subject, yr, term, title, sc) VALUES (?, 'Islamic B', 'Year 9', 'Term 1', 'x', ?)`).run(id, JSON.stringify(Array.from({ length: n }, (_, i) => texts[String(i)] ?? `x${i}`)));
  }
  const names = new Map<string, string>([...T420_SYNC_STUDENTS, ...T421_SET.students]);
  for (const [id, name] of names) db.prepare(`INSERT OR IGNORE INTO users VALUES (?,?,?)`).run(id, name, "student");
  const sql = sqlOf(db);
  assert.ok(applyT420(sql, 1)); const s0 = applyT420Sync(sql, 2)!;
  assert.equal(s0.skipped, 0); assert.equal(s0.written + s0.same, T420_SYNC_ROWS.length);
  const r = applyT421(sql, 3)!;
  assert.equal(r.skipped, 0); assert.equal(r.cleared, 0);
  assert.equal(r.written + r.same, T421_ROWS.length);
  assert.ok(r.written > 0); // new or changed since 12:16
  assert.ok(r.same > 0); // marks already synced at 12:16
  assert.equal(applyT421(sql, 4), null);
  const log = JSON.parse(String((db.prepare(`SELECT v FROM settings WHERE k='mig:t421:log'`).get() as { v: string }).v));
  assert.ok(Array.isArray(log.trk_ov_before));
});

test("Excel wins over an existing override (any source); a clear only removes an Excel-sync override", () => {
  const db = new DatabaseSync(":memory:"); db.exec(schema);
  db.prepare(`INSERT INTO cur (id, subject, yr, term, title, sc) VALUES ('cu_u', 'Islamic B', 'Year 3', 'Term 1', 'T', '["A","B","C"]')`).run();
  db.prepare(`INSERT INTO users VALUES ('s1', 'Sam Student', 'student')`).run();
  db.prepare(`INSERT INTO trk_ov VALUES ('s1', 'cu_u', 0, '1', 'Teacher', 1)`).run(); // other source, Excel will replace
  db.prepare(`INSERT INTO trk_ov VALUES ('s1', 'cu_u', 1, '2', 'Excel tracker (27 Nov pm)', 1)`).run(); // Excel sync, will be cleared
  db.prepare(`INSERT INTO trk_ov VALUES ('s1', 'cu_u', 2, '3', 'Teacher', 1)`).run(); // other source, clear request must not touch it
  const set: OvSet = {
    key: "t421x", by: "Excel tracker (27 Nov 12:50)", what: "test",
    students: [["s1", "Sam Student"]], units: [["cu_u", { "0": "A", "1": "B", "2": "C" }]],
    rows: [[0, 0, 0, 3]], // Excel now has 3 on SC1 (was teacher 1)
    clears: [[0, 0, 1], [0, 0, 2]], // SC2 blanked (Excel source); SC3 blanked but teacher-owned
  };
  const r = applyOverrideSet(sqlOf(db), set, 9)!;
  assert.equal(r.written, 1); assert.equal(r.replaced, 1); assert.equal(r.cleared, 1); assert.equal(r.skipped, 0);
  assert.deepEqual({ ...(db.prepare(`SELECT val, by_name FROM trk_ov WHERE i=0`).get() as object) }, { val: "3", by_name: "Excel tracker (27 Nov 12:50)" });
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM trk_ov WHERE i=1`).get() as { c: number }).c, 0);
  assert.deepEqual({ ...(db.prepare(`SELECT val, by_name FROM trk_ov WHERE i=2`).get() as object) }, { val: "3", by_name: "Teacher" });
  const res = JSON.parse(String((db.prepare(`SELECT v FROM settings WHERE k='mig:t421x:result'`).get() as { v: string }).v));
  assert.equal(res.clearedRows[0].was, "2");
  assert.equal(res.skippedClears[0].by, "Teacher");
});
