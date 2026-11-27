import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { grid, RIS_PRIMARY, scoreFromPct, type TrkCtx } from "../src/tracker";
import type { Actor } from "../src/lms";

test("scoreFromPct uses 40/60/85 by default and follows any configured cut-offs", () => {
  const cut = RIS_PRIMARY.cut;
  assert.deepEqual(cut, [40, 60, 85]);
  assert.equal(scoreFromPct(0, cut), 0);
  assert.equal(scoreFromPct(39.9, cut), 0);
  assert.equal(scoreFromPct(40, cut), 1);
  assert.equal(scoreFromPct(50, cut), 1); // was 2 under round(e/p×3)
  assert.equal(scoreFromPct(59.9, cut), 1);
  assert.equal(scoreFromPct(60, cut), 2);
  assert.equal(scoreFromPct(84.9, cut), 2);
  assert.equal(scoreFromPct(85, cut), 3);
  assert.equal(scoreFromPct(100, cut), 3);
  assert.equal(scoreFromPct(50, [50, 70, 90]), 1);
  assert.equal(scoreFromPct(65, [50, 70, 90]), 1); // still 2 under the default 40/60/85
  assert.equal(scoreFromPct(70, [50, 70, 90]), 2);
  assert.equal(scoreFromPct(90, [50, 70, 90]), 3);
});

const mkSql = (db: DatabaseSync) => ({
  exec: (q: string, ...a: unknown[]) => {
    const st = db.prepare(q);
    const rows = (/^\s*SELECT/i.test(q) ? st.all(...(a as never[])) : (st.run(...(a as never[])), [])) as Record<string, unknown>[];
    return { toArray: () => rows, one: () => rows[0] || {} };
  },
});

const schema = `
  CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, first_name TEXT, last_name TEXT, section TEXT, target TEXT, scaled TEXT, isams_id TEXT, subject TEXT, role TEXT, cls TEXT, disabled INTEGER);
  CREATE TABLE cur (id TEXT PRIMARY KEY, title TEXT, title_ar TEXT, sc_ar TEXT, term TEXT, wk_from INTEGER, sc TEXT, links TEXT, subject TEXT, quiz TEXT, std TEXT, yr TEXT, ord INTEGER);
  CREATE TABLE trk_link (id TEXT PRIMARY KEY, kind TEXT, on_ INTEGER, keep_before INTEGER, by_name TEXT, at INTEGER);
  CREATE TABLE trk_ov (student TEXT, unit TEXT, i INTEGER, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, unit, i));
  CREATE TABLE trk_gov (student TEXT, cls TEXT, term TEXT, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, cls, term));
  CREATE TABLE trk_eff (student TEXT, term TEXT, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, term));
  CREATE TABLE subs (hw TEXT, student TEXT, grade TEXT, updated INTEGER);
`;

function setup(opts: { cut?: number[]; override?: { val: string } } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(schema);
  db.prepare(`INSERT INTO settings VALUES ('trk_link_default','on')`).run();
  if (opts.cut) db.prepare(`INSERT INTO settings VALUES ('asys', ?)`).run(JSON.stringify([{ id: "ris-primary", cut: opts.cut, isDefault: true, active: true }]));
  db.prepare(`INSERT INTO users VALUES ('s1','Sam Student','Sam','Student','3A','5','','','Islamic B','student','Year 3',0)`).run();
  db.prepare(`INSERT INTO cur VALUES ('cu_u','Wudu','','[]','Term 1',1,?,'[]','Islamic B','q-wudu','{}','Year 3',1)`).run(JSON.stringify(["SC1", "SC2", "SC3"]));
  if (opts.override) db.prepare(`INSERT INTO trk_ov VALUES ('s1','cu_u',0,?, 'Teacher', 1)`).run(opts.override.val);
  const tagged: TrkCtx["tagged"] = async () => [{
    studentId: "s1", quizId: "q-wudu", slug: "year-3-making-wudu-well", at: 10,
    details: [
      { sc: "cu_u#0", prompt: "a", earned: 2, points: 4 }, // 50%
      { sc: "cu_u#1", prompt: "b", earned: 2, points: 6 }, // 33%
      { sc: "cu_u#2", prompt: "c", earned: 6, points: 6 }, // 100%
    ],
  }];
  const c: TrkCtx = { sql: mkSql(db), inScope: () => true, homework: () => [], tagged };
  const admin = { id: "a1", role: "admin", name: "Admin", cls: "", perms: [] } as Actor;
  return { db, c, admin };
}

test("tagged quiz cells use the system's % cut-offs, not round(e/p×3)", async () => {
  const { c, admin } = setup();
  const g = await grid(c, admin, "Year 3", "Term 1") as { cells: Record<string, { v: number | null; src: string; auto: number | null }> };
  // 50% → 1 (would have been 2); 33% → 0 (would have been 1); 100% → 3
  assert.deepEqual(g.cells["s1|cu_u|0"], { v: 1, src: "quiz", auto: 1, autoSrc: "quiz", note: "2/4 pts" });
  assert.equal(g.cells["s1|cu_u|1"].v, 0);
  assert.equal(g.cells["s1|cu_u|2"].v, 3);
});

test("admin-configured attainment-system cut-offs apply to tagged cells", async () => {
  const { db, admin } = setup({ cut: [50, 70, 90] });
  const tagged: TrkCtx["tagged"] = async () => [{
    studentId: "s1", quizId: "q-wudu", at: 10,
    details: [
      { sc: "cu_u#0", earned: 13, points: 20 }, // 65%: 2 under 40/60/85, 1 under 50/70/90
      { sc: "cu_u#1", earned: 2, points: 6 },
      { sc: "cu_u#2", earned: 6, points: 6 },
    ],
  }];
  const c: TrkCtx = { sql: mkSql(db), inScope: () => true, homework: () => [], tagged };
  const g = await grid(c, admin, "Year 3", "Term 1") as { cells: Record<string, { v: number | null }> };
  assert.equal(g.cells["s1|cu_u|0"].v, 1);
  assert.equal(g.cells["s1|cu_u|1"].v, 0);
  assert.equal(g.cells["s1|cu_u|2"].v, 3);
});

test("a teacher override is the displayed value and is not rewritten by the new scoring", async () => {
  const { c, admin, db } = setup({ override: { val: "3" } });
  const g = await grid(c, admin, "Year 3", "Term 1") as { cells: Record<string, { v: number | null; src: string; auto: number | null; by?: string }> };
  assert.equal(g.cells["s1|cu_u|0"].v, 3);
  assert.equal(g.cells["s1|cu_u|0"].src, "override");
  assert.equal(g.cells["s1|cu_u|0"].auto, 1); // auto is the cut-off score; the override still shows
  assert.equal(g.cells["s1|cu_u|0"].by, "Teacher");
  const ov = db.prepare(`SELECT val, by_name FROM trk_ov WHERE student='s1' AND unit='cu_u' AND i=0`).get() as { val: string; by_name: string }; assert.equal(ov.val, "3"); assert.equal(ov.by_name, "Teacher");
});
