/**
 * t413 one-time: add Success Criteria to two Term 1 Islamic B units that had none, so their assessments show in the
 * Assessment Tracker. SC text is from the teacher's updated Excel trackers (27 Nov 2026). Only a unit whose SC is still
 * empty, whose id, year and subject match is changed (title, week and every other field stay). The rows as they were are kept in
 * settings "mig:t413:log" as a backup. Runs once (settings "mig:t413").
 */
type Sql = { exec: (q: string, ...a: unknown[]) => { toArray: () => Record<string, unknown>[] } };
export const T413_SC: { id: string; yr: string; sc: string[] }[] = [
  { id: "cu_mvdiwondaaf6251b", yr: "Year 3", sc: [ // tracker topic "Perfecting Wudu" (live unit: Making Wudu Well (Hadith), week 9)
    "Order six cards showing the actions of Wudu.",
    "Explain the reward of perfecting Wudu as mentioned in the Hadith.",
    "Correct two mistakes in performing Wudu.",
  ] },
  { id: "cu_mvdiwond1e7ffbef", yr: "Year 6", sc: [ // tracker topic "The Rule of Iqlab" (live unit: Al-Iqlab, week 9)
    "Sort four examples into Iqlab and Idgham, giving the letter as the reason.",
    "Correct two mistakes in understanding or applying Iqlab and explain the correction.",
    "Recite four examples showing the difference between applying Iqlab and applying Idgham.",
  ] },
];
const emptySc = (v: unknown) => { try { const a = JSON.parse(String(v || "[]")); return !Array.isArray(a) || !a.some((x) => String(x || "").trim()); } catch { return !String(v || "").trim(); } };
export function applyT413Sc(sql: Sql, now = Date.now()): { id: string; changed: boolean }[] {
  const done = sql.exec(`SELECT v FROM settings WHERE k='mig:t413'`).toArray()[0];
  if (done && String(done.v) === "1") return [];
  const out: { id: string; changed: boolean }[] = []; const log: unknown[] = [];
  for (const u of T413_SC) {
    const r = sql.exec(`SELECT id, yr, subject, title, wk_from, sc, updated, by_name FROM cur WHERE id=?`, u.id).toArray()[0];
    const ok = !!r && String(r.yr) === u.yr && String(r.subject) === "Islamic B" && emptySc(r.sc);
    if (ok) { sql.exec(`UPDATE cur SET sc=?, updated=?, by_name=? WHERE id=?`, JSON.stringify(u.sc), now, "Tracker SC (t413)", u.id); log.push({ before: r, sc: u.sc }); }
    else log.push({ id: u.id, skipped: r ? "has SC or other unit" : "missing" });
    out.push({ id: u.id, changed: ok });
  }
  sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t413:log', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify(log));
  sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t413', '1') ON CONFLICT(k) DO UPDATE SET v='1'`);
  return out;
}
