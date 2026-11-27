import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyT413Sc } from "../src/curScFix";

const mk = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT); CREATE TABLE cur (id TEXT PRIMARY KEY, subject TEXT, yr TEXT, term TEXT, title TEXT, wk_from INTEGER, sc TEXT, updated INTEGER, by_name TEXT)`);
  const ins = db.prepare(`INSERT INTO cur VALUES (?,?,?,?,?,?,?,?,?)`);
  ins.run("cu_mvdiwondaaf6251b", "Islamic B", "Year 3", "Term 1", "Making Wudu Well (Hadith)", 9, "[]", 1, "x");
  ins.run("cu_mvdiwond1e7ffbef", "Islamic B", "Year 6", "Term 1", "Al-Iqlab", 9, '["Teacher SC"]', 1, "x");
  ins.run("cu_other", "Islamic B", "Year 3", "Term 1", "Other", 2, "[]", 1, "x");
  // Like Durable Object SqlStorage: a statement runs when exec() is called.
  const sql = { exec: (q: string, ...a: unknown[]) => { const st = db.prepare(q); const rows = (/^\s*SELECT/i.test(q) ? st.all(...(a as never[])) : (st.run(...(a as never[])), [])) as Record<string, unknown>[]; return { toArray: () => rows }; } };
  return { db, sql };
};

test("adds SC only to the listed unit that still has none; keeps title/week; runs once", () => {
  const { db, sql } = mk();
  assert.deepEqual(applyT413Sc(sql, 5), [{ id: "cu_mvdiwondaaf6251b", changed: true }, { id: "cu_mvdiwond1e7ffbef", changed: false }]);
  const r = db.prepare(`SELECT * FROM cur WHERE id='cu_mvdiwondaaf6251b'`).get() as Record<string, unknown>;
  assert.equal(JSON.parse(String(r.sc)).length, 3); assert.equal(r.title, "Making Wudu Well (Hadith)"); assert.equal(r.wk_from, 9);
  assert.equal((db.prepare(`SELECT sc FROM cur WHERE id='cu_mvdiwond1e7ffbef'`).get() as { sc: string }).sc, '["Teacher SC"]'); // teacher's SC kept
  assert.equal((db.prepare(`SELECT sc FROM cur WHERE id='cu_other'`).get() as { sc: string }).sc, "[]"); // other units untouched
  assert.ok(String((db.prepare(`SELECT v FROM settings WHERE k='mig:t413:log'`).get() as { v: string }).v).includes("Making Wudu Well"));
  db.exec(`UPDATE cur SET sc='[]' WHERE id='cu_mvdiwondaaf6251b'`);
  assert.deepEqual(applyT413Sc(sql), []); // once only: a later teacher edit is never overwritten
});
