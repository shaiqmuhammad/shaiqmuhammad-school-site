import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyT420, applyT420Sync, T420_RELINKED } from "../src/t420Fix";
import { T420_CHANGES, T420_KEEP, T420_NEW_UNITS, T420_SYNC_ROWS, T420_SYNC_STUDENTS, T420_SYNC_UNITS } from "../src/t420Data";
import { retag } from "../src/scRetag";

const mk = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE cur (id TEXT PRIMARY KEY, subject TEXT, yr TEXT, term TEXT, title TEXT, objectives TEXT DEFAULT '', lessons TEXT DEFAULT '[]', resources TEXT DEFAULT '[]', wk_from INTEGER DEFAULT 0, wk_to INTEGER DEFAULT 0, status TEXT DEFAULT 'planned', quiz TEXT DEFAULT '', page TEXT DEFAULT '', ord INTEGER DEFAULT 0, by_name TEXT, updated INTEGER, links TEXT DEFAULT '[]', notes TEXT DEFAULT '', sc TEXT DEFAULT '[]', std TEXT DEFAULT '{}', title_ar TEXT DEFAULT '', sc_ar TEXT DEFAULT '[]', obj_ar TEXT DEFAULT '', ar_review INTEGER DEFAULT 0, sow TEXT DEFAULT '{}');
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, role TEXT);
    CREATE TABLE trk_ov (student TEXT, unit TEXT, i INTEGER, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, unit, i));`);
  for (const c of T420_CHANGES) db.prepare(`INSERT INTO cur (id, subject, yr, term, title, wk_from, status, quiz, lessons, sc, sc_ar) VALUES (?, 'Islamic B', ?, 'Term 1', ?, 5, 'taught', 'q1', '["L"]', '["old a","old b","old c","old d"]', '["ع"]')`).run(c.id, c.yr, c.title);
  // units the sync also writes to (unchanged ones) get their recorded SC text
  for (const [id, texts] of T420_SYNC_UNITS) if (!T420_CHANGES.some((c) => c.id === id) && !T420_NEW_UNITS.some((u) => u.id === id)) {
    const n = Math.max(...Object.keys(texts).map(Number)) + 1;
    db.prepare(`INSERT INTO cur (id, subject, yr, term, title, sc) VALUES (?, 'Islamic B', 'Year 9', 'Term 1', 'x', ?)`).run(id, JSON.stringify(Array.from({ length: n }, (_, i) => texts[String(i)] ?? `x${i}`)));
  }
  for (const [id, name] of T420_SYNC_STUDENTS) db.prepare(`INSERT INTO users VALUES (?,?,?)`).run(id, name, "student");
  const sql = { exec: (q: string, ...a: unknown[]) => { const st = db.prepare(q); const rows = (/^\s*SELECT/i.test(q) ? st.all(...(a as never[])) : (st.run(...(a as never[])), [])) as Record<string, unknown>[]; return { toArray: () => rows }; } };
  return { db, sql };
};

test("replaces SC (keeps title/week/status/lessons/quiz), creates new units, moves non-matching overrides to the log, runs once", () => {
  const { db, sql } = mk();
  const keep = T420_KEEP[0].split("#"), moveUnit = T420_CHANGES.find((c) => !T420_KEEP.some((k) => k.startsWith(c.id + "#")))!.id;
  db.prepare(`INSERT INTO trk_ov VALUES ('s_keep', ?, ?, '2', 'Teacher', 1)`).run(keep[0], Number(keep[1]));
  db.prepare(`INSERT INTO trk_ov VALUES ('s_move', ?, 3, '1', 'Teacher', 1)`).run(moveUnit);
  db.prepare(`INSERT INTO trk_ov VALUES ('s_other', 'cu_unrelated', 0, '3', 'Teacher', 1)`).run();
  const r = applyT420(sql, 10)!;
  assert.equal(r.changed, T420_CHANGES.length); assert.equal(r.created, T420_NEW_UNITS.length); assert.deepEqual(r.skipped, []); assert.equal(r.moved, 1);
  for (const c of T420_CHANGES) {
    const u = db.prepare(`SELECT * FROM cur WHERE id=?`).get(c.id) as Record<string, unknown>;
    assert.deepEqual(JSON.parse(String(u.sc)), c.sc); assert.equal(u.title, c.title); assert.equal(u.wk_from, 5); assert.equal(u.status, "taught"); assert.equal(u.lessons, '["L"]'); assert.equal(u.quiz, "q1");
    assert.equal(u.sc_ar, "[]"); assert.equal(u.ar_review, 1);
  }
  for (const n of T420_NEW_UNITS) { const u = db.prepare(`SELECT * FROM cur WHERE id=?`).get(n.id) as Record<string, unknown>; assert.equal(u.wk_from, n.wk); assert.equal(u.subject, "Islamic B"); assert.equal(u.term, "Term 1"); assert.deepEqual(JSON.parse(String(u.sc)), n.sc); assert.equal(u.title_ar, n.titleAr); }
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM trk_ov WHERE student IN ('s_keep','s_other')`).get() as { c: number }).c, 2);
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM trk_ov WHERE student='s_move'`).get() as { c: number }).c, 0);
  const log = JSON.parse(String((db.prepare(`SELECT v FROM settings WHERE k='mig:t420:log'`).get() as { v: string }).v));
  assert.equal(log.units_before.length, T420_CHANGES.length); assert.ok(log.units_before[0].sc.includes("old a")); assert.ok(log.trk_ov_before.some((o: { student: string }) => o.student === "s_move"));
  assert.ok(Object.keys(log.quiz_tags_before).length >= 7);
  const res = JSON.parse(String((db.prepare(`SELECT v FROM settings WHERE k='mig:t420:result'`).get() as { v: string }).v));
  assert.equal(res.moved[0].student, "s_move");
  assert.equal(applyT420(sql, 11), null);
  // then the sync lands every Excel mark on the new SC
  const s = applyT420Sync(sql, 12)!;
  assert.equal(s.skipped, 0); assert.equal(s.written + s.same, T420_SYNC_ROWS.length);
});

test("skips a unit whose year/subject/term no longer match; its marks are not synced", () => {
  const { db, sql } = mk();
  const c = T420_CHANGES[0]; db.prepare(`UPDATE cur SET term='Term 2' WHERE id=?`).run(c.id);
  const r = applyT420(sql, 10)!; assert.deepEqual(r.skipped, [c.id]);
  assert.equal(JSON.parse(String((db.prepare(`SELECT sc FROM cur WHERE id=?`).get(c.id) as { sc: string }).sc))[0], "old a");
  const ui = T420_SYNC_UNITS.findIndex(([id]) => id === c.id);
  const s = applyT420Sync(sql, 12)!; assert.equal(s.skipped, T420_SYNC_ROWS.filter((x) => x[1] === ui).length);
});

test("answers saved with a tag on a re-linked unit take today's tag for the same prompt; others keep theirs", () => {
  const uid = [...T420_RELINKED][0];
  const defs = { q: { "what is x?": `${uid}#2` } };
  const out = retag([{ sc: `${uid}#4`, prompt: "What is x?", earned: 1, points: 1 }, { sc: `${uid}#3`, prompt: "Gone", earned: 1, points: 1 }, { sc: "cu_keep#4", prompt: "What is x?", earned: 1, points: 1 }], defs, ["q"], T420_RELINKED);
  assert.deepEqual(out.map((d) => d.sc), [`${uid}#2`, undefined, "cu_keep#4"]);
});
