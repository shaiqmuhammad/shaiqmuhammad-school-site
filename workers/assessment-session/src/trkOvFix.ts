/**
 * t416 one-time: make the online Assessment Tracker show the same SC marks (0-3) as the teacher's Islamic B Excel trackers
 * (Y1-Y6, 27 Nov 2026). The marks are written as teacher overrides (trk_ov), the same rows the tracker's own edit writes, so
 * nothing else changes and each cell can still be edited or cleared in the tracker.
 * Safety:
 *  - only a cell with a value in Excel is written; blank Excel cells write nothing; no override is deleted or cleared;
 *  - a cell is written only if the student still exists, is a student and has the same name, and the unit's SC text at that
 *    index is exactly the text recorded in the data (so the mark lands on the same criterion); anything else is skipped and logged;
 *  - a different existing override is replaced (Excel is the source) and its old value kept in settings "mig:t416:log", which
 *    also holds a snapshot of every override row from before; an identical override is left alone;
 *  - audit: one trk_audit line per student; runs once (settings "mig:t416"), after the t413 SC migration.
 */
import { T416_ROWS, T416_STUDENTS, T416_UNITS } from "./trkOvData";
type Sql = { exec: (q: string, ...a: unknown[]) => { toArray: () => Record<string, unknown>[] } };
export const T416_BY = "Excel tracker (27 Nov)";
export type OvSet = { key: string; by: string; what: string; students: [string, string][]; units: [string, Record<string, string>][]; rows: [number, number, number, number][] };
export function applyT416Overrides(sql: Sql, now = Date.now()) {
  return applyOverrideSet(sql, { key: "t416", by: T416_BY, what: "SC · set from Excel tracker (27 Nov)", students: T416_STUDENTS, units: T416_UNITS, rows: T416_ROWS }, now);
}
/** Generic one-time override import (same guards/backup as t416); settings keys mig:<key>, mig:<key>:log, mig:<key>:result. */
export function applyOverrideSet(sql: Sql, set: OvSet, now = Date.now()): { written: number; same: number; replaced: number; skipped: number } | null {
  const K = `mig:${set.key}`;
  const done = sql.exec(`SELECT v FROM settings WHERE k=?`, K).toArray()[0];
  if (done && String(done.v) === "1") return null;
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_ov (student TEXT, unit TEXT, i INTEGER, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, unit, i))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_audit (id TEXT PRIMARY KEY, at INTEGER, by_id TEXT, by_name TEXT, student TEXT, what TEXT, prev TEXT, next TEXT)`);
  // Backup first, never overwritten by a retry.
  sql.exec(`INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO NOTHING`, `${K}:log`, JSON.stringify({ at: now, trk_ov_before: sql.exec(`SELECT * FROM trk_ov`).toArray() }));
  const scOf = new Map<string, string[] | null>();
  const unitSc = (id: string) => {
    if (!scOf.has(id)) { const r = sql.exec(`SELECT sc FROM cur WHERE id=?`, id).toArray()[0]; let a: string[] | null = null; try { if (r) a = JSON.parse(String(r.sc || "[]")); } catch { /* */ } scOf.set(id, Array.isArray(a) ? a.map(String) : null); }
    return scOf.get(id)!;
  };
  const stOk = new Map<string, boolean>();
  const studentOk = (id: string, name: string) => {
    if (!stOk.has(id)) { const r = sql.exec(`SELECT role, name FROM users WHERE id=?`, id).toArray()[0]; stOk.set(id, !!r && String(r.role) === "student" && String(r.name) === name); }
    return stOk.get(id)!;
  };
  let written = 0, same = 0, replaced = 0, skipped = 0; const replacedRows: unknown[] = []; const skippedRows: unknown[] = []; const perStudent = new Map<string, number>();
  for (const [si, ui, i, val] of set.rows) {
    const [sid, sname] = set.students[si]; const [uid, texts] = set.units[ui];
    const sc = unitSc(uid);
    if (!studentOk(sid, sname) || !sc || sc[i] !== texts[String(i)]) { skipped++; if (skippedRows.length < 300) skippedRows.push([sid, uid, i, val]); continue; }
    const prev = sql.exec(`SELECT val FROM trk_ov WHERE student=? AND unit=? AND i=?`, sid, uid, i).toArray()[0];
    if (prev && String(prev.val) === String(val)) { same++; continue; }
    if (prev) { replaced++; replacedRows.push({ student: sid, unit: uid, i, was: String(prev.val), now: val }); }
    sql.exec(`INSERT OR REPLACE INTO trk_ov (student, unit, i, val, by_name, at) VALUES (?, ?, ?, ?, ?, ?)`, sid, uid, i, String(val), set.by, now);
    written++; perStudent.set(sid, (perStudent.get(sid) || 0) + 1);
  }
  let n = 0;
  for (const [sid, c] of perStudent) sql.exec(`INSERT OR IGNORE INTO trk_audit (id, at, by_id, by_name, student, what, prev, next) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, `ta_${set.key}_${sid}`, now + n++, "system", set.by, sid, set.what, "auto", `${c} cells`);
  sql.exec(`INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, `${K}:result`, JSON.stringify({ at: now, written, same, replaced, skipped, replacedRows, skippedRows }));
  sql.exec(`INSERT INTO settings (k, v) VALUES (?, '1') ON CONFLICT(k) DO UPDATE SET v='1'`, K);
  return { written, same, replaced, skipped };
}

/**
 * t419 one-time: the teacher's Excel edits made after t416 (27 Nov pm re-check) that land on an online SC with the same text.
 * Only Y6 "The Rule of Iqlab" (online: Al-Iqlab) for one student; same guards, backup ("mig:t419:log") and run-once rule as t416.
 */
export const T419_SET: OvSet = {
  key: "t419", by: "Excel tracker (27 Nov pm)", what: "SC · set from Excel tracker (27 Nov pm)",
  students: [["u_mv1g3ia3c91a134d12", "Sophia Abdalla"]],
  units: [["cu_mvdiwond1e7ffbef", {
    "0": "Sort four examples into Iqlab and Idgham, giving the letter as the reason.",
    "1": "Correct two mistakes in understanding or applying Iqlab and explain the correction.",
    "2": "Recite four examples showing the difference between applying Iqlab and applying Idgham.",
  }]],
  rows: [[0, 0, 0, 2], [0, 0, 1, 1], [0, 0, 2, 2]],
};
export const applyT419Overrides = (sql: Sql, now = Date.now()) => applyOverrideSet(sql, T419_SET, now);
