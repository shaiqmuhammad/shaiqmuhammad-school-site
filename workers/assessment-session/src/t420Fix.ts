/**
 * t420 one-time (Shaiq's choice, 27 Nov pm): make the online Islamic B Term 1 curriculum SC the same as the Excel trackers.
 *  1. Backup first (settings "mig:t420:log", never overwritten): every affected unit row, the overrides on changed units and
 *     the quiz SC tags before the re-link.
 *  2. Replace the SC of each listed unit with the Excel SC (only if id, subject, year and term still match). Title, week,
 *     status, lessons, quiz links stay. The old Arabic SC no longer match, so they are cleared and the unit is flagged for
 *     Arabic review (the old Arabic SC are in the backup).
 *  3. Create the Excel topics that had no online Term 1 unit (id fixed, skipped if it exists), at the SOW week, beside any unit
 *     already in that week.
 *  4. Overrides on changed units: kept where the SC is the same skill at the same index (T420_KEEP); every other one moves
 *     into the backup log (removed from the tracker, kept in settings) so the Excel sync supplies the value.
 *  5. Then every Excel mark is written as an override (applyOverrideSet, own key "t420s": guards, backup, run once).
 * Runs once (settings "mig:t420").
 */
import { T420_CHANGES, T420_KEEP, T420_NEW_UNITS, T420_OLD_TAGS, T420_SYNC_ROWS, T420_SYNC_STUDENTS, T420_SYNC_UNITS } from "./t420Data";
import { applyOverrideSet, type OvSet } from "./trkOvFix";
type Sql = { exec: (q: string, ...a: unknown[]) => { toArray: () => Record<string, unknown>[] } };
export const T420_BY = "Excel tracker SC (t420)";
/** Units whose SC were replaced: answers saved with an old tag on these units are re-tagged from today's questions. */
export const T420_RELINKED = new Set(T420_CHANGES.map((c) => c.id));
export const T420_SYNC: OvSet = { key: "t420s", by: "Excel tracker (27 Nov pm)", what: "SC · set from Excel tracker (27 Nov pm, all topics)", students: T420_SYNC_STUDENTS, units: T420_SYNC_UNITS, rows: T420_SYNC_ROWS };

export function applyT420(sql: Sql, now = Date.now()) {
  const done = sql.exec(`SELECT v FROM settings WHERE k='mig:t420'`).toArray()[0];
  if (done && String(done.v) === "1") return null;
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_ov (student TEXT, unit TEXT, i INTEGER, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, unit, i))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_audit (id TEXT PRIMARY KEY, at INTEGER, by_id TEXT, by_name TEXT, student TEXT, what TEXT, prev TEXT, next TEXT)`);
  const ids = [...T420_CHANGES.map((c) => c.id), ...T420_NEW_UNITS.map((u) => u.id)];
  const qs = ids.map(() => "?").join(",");
  const chIds = T420_CHANGES.map((c) => c.id);
  sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t420:log', ?) ON CONFLICT(k) DO NOTHING`, JSON.stringify({
    at: now,
    units_before: sql.exec(`SELECT * FROM cur WHERE id IN (${qs})`, ...ids).toArray(),
    trk_ov_before: sql.exec(`SELECT * FROM trk_ov WHERE unit IN (${chIds.map(() => "?").join(",")})`, ...chIds).toArray(),
    quiz_tags_before: T420_OLD_TAGS,
  }));
  const changed: string[] = [], skipped: string[] = [], created: string[] = [], moved: Record<string, unknown>[] = [];
  for (const c of T420_CHANGES) {
    const r = sql.exec(`SELECT subject, yr, term FROM cur WHERE id=?`, c.id).toArray()[0];
    if (!r || String(r.subject) !== "Islamic B" || String(r.yr) !== c.yr || String(r.term) !== "Term 1") { skipped.push(c.id); continue; }
    sql.exec(`UPDATE cur SET sc=?, sc_ar='[]', ar_review=1, updated=?, by_name=? WHERE id=?`, JSON.stringify(c.sc), now, T420_BY, c.id);
    changed.push(c.id);
  }
  for (const u of T420_NEW_UNITS) {
    if (sql.exec(`SELECT id FROM cur WHERE id=?`, u.id).toArray().length) { skipped.push(u.id); continue; }
    sql.exec(`INSERT INTO cur (id, subject, yr, term, title, objectives, lessons, resources, wk_from, wk_to, status, quiz, page, ord, by_name, updated, links, notes, sc, std, title_ar, sc_ar, obj_ar, ar_review, sow)
      VALUES (?, 'Islamic B', ?, 'Term 1', ?, '', '[]', '[]', ?, ?, 'planned', '', '', 0, ?, ?, '[]', '', ?, '{}', ?, '[]', '', 1, '{}')`, u.id, u.yr, u.title, u.wk, u.wk, T420_BY, now, JSON.stringify(u.sc), u.titleAr);
    created.push(u.id);
  }
  const keep = new Set(T420_KEEP); let n = 0;
  for (const uid of changed) for (const o of sql.exec(`SELECT * FROM trk_ov WHERE unit=?`, uid).toArray()) {
    if (keep.has(`${uid}#${Number(o.i)}`)) continue;
    moved.push(o);
    sql.exec(`DELETE FROM trk_ov WHERE student=? AND unit=? AND i=?`, o.student, o.unit, o.i);
    sql.exec(`INSERT OR IGNORE INTO trk_audit (id, at, by_id, by_name, student, what, prev, next) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, `ta_t420_${n}`, now + n++, "system", T420_BY, String(o.student), `SC override moved to backup (SC replaced) · ${uid} #${Number(o.i) + 1}`, String(o.val), "auto");
  }
  sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t420:result', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify({ at: now, changed, skipped, created, moved }));
  sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t420', '1') ON CONFLICT(k) DO UPDATE SET v='1'`);
  return { changed: changed.length, skipped, created: created.length, moved: moved.length };
}
export const applyT420Sync = (sql: Sql, now = Date.now()) => applyOverrideSet(sql, T420_SYNC, now);
