/**
 * Department Report (KHDA-style): server-side aggregation over LMS data. Read-only by design.
 *
 *   POST /api/lms/report-dept      {filters?} -> {filters, options, settings, kpis, attainment, progress, quran, homework, coverage, students}
 *   POST /api/lms/report-student   {id}       -> {student, scores[], homework[], quran[]}
 *   POST /api/lms/report-settings  {save?: {...}} -> {settings}   (reading: any report role; saving: admin only)
 *
 * Who may read reports is decided by REPORT_ROLES only, so a read-only "inspector"/leadership role can be added later
 * by adding it there — none of these actions ever write LMS data (only report-settings save, which is admin-only).
 * Assessment results are recorded under the name typed at the quiz, so scores are matched to a student by name
 * (only when that name is unique among students); unmatched results are counted, never guessed.
 */
import type { Actor } from "./lms";

type Row = Record<string, unknown>;
type Sql = { exec: (q: string, ...a: unknown[]) => { toArray(): Row[] } };
export type ReportCtx = {
  sql: Sql;
  results: () => Promise<Row[]>;
  homework: () => { id: string; kind: string; title: string; cls: string; section: string; students: string[]; due: number | null; created: number }[];
  assignees: (h: { cls: string; section: string; students: string[] }) => string[];
};
/** Roles allowed to READ reports. Future: add "inspector" (read-only leadership) here. */
export const REPORT_ROLES = new Set<string>(["admin"]);
const DEF = { above: 80, at: 60, progBetter: 10, progExpected: 0 };
type Settings = typeof DEF;

export function phaseOf(cls: string, phase: string): string {
  if (phase) return phase;
  const c = cls.toLowerCase();
  if (/fs|kg|foundation|nursery|reception|pre/.test(c)) return "EYFS";
  const n = Number((c.match(/(\d+)/) || [])[1] || NaN);
  if (n >= 1 && n <= 6) return "Primary";
  if (n >= 7 && n <= 13) return "Secondary";
  return "";
}
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
function settingsOf(sql: Sql): Settings {
  let s: Partial<Settings> = {};
  try { s = JSON.parse(String(sql.exec(`SELECT v FROM settings WHERE k='report_cfg'`).toArray()[0]?.v || "{}")); } catch { /* defaults */ }
  return { above: num(s.above, DEF.above, 1, 100), at: num(s.at, DEF.at, 0, 99), progBetter: num(s.progBetter, DEF.progBetter, -100, 100), progExpected: num(s.progExpected, DEF.progExpected, -100, 100) };
}
const band = (p: number, s: Settings) => (p >= s.above ? "above" : p >= s.at ? "at" : "below");
const pband = (d: number, s: Settings) => (d >= s.progBetter ? "better" : d >= s.progExpected ? "expected" : "below");
const yearSort = (a: string, b: string) => { const na = Number((a.match(/\d+/) || ["-1"])[0]), nb = Number((b.match(/\d+/) || ["-1"])[0]); const fa = /fs|kg/i.test(a) ? -10 : 0, fb = /fs|kg/i.test(b) ? -10 : 0; return fa + na - (fb + nb) || a.localeCompare(b); };
const month = (t: number) => new Date(t + 4 * 3600_000).toISOString().slice(0, 7); // Asia/Dubai
const week = (t: number) => { const d = new Date(t + 4 * 3600_000); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

type Stu = { id: string; name: string; cls: string; section: string; gender: string; sen: string; phase: string; subject: string };
function students(sql: Sql): Stu[] {
  return sql.exec(`SELECT id, name, cls, section, gender, sen, phase, subject FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray().map((r) => ({
    id: String(r.id), name: String(r.name), cls: String(r.cls || ""), section: String(r.section || ""),
    gender: r.gender === "b" || r.gender === "g" ? String(r.gender) : "", sen: r.sen === "1" ? "yes" : r.sen === "0" ? "no" : "", phase: phaseOf(String(r.cls || ""), String(r.phase || "")), subject: String(r.subject || ""),
  }));
}
type Score = { t: number; p: number; title: string; kind: string };
async function scoresByStudent(c: ReportCtx, all: Stu[]) {
  const byName = new Map<string, string[]>();
  for (const s of all) { const k = s.name.trim().toLowerCase(); byName.set(k, [...(byName.get(k) || []), s.id]); }
  const out = new Map<string, Score[]>();
  let unmatched = 0, ambiguous = 0, total = 0;
  for (const r of await c.results()) {
    total++;
    const ids = byName.get(String(r.name || "").trim().toLowerCase()) || [];
    if (ids.length !== 1) { if (ids.length > 1) ambiguous++; else unmatched++; continue; }
    const p = Number(r.percentage);
    if (!Number.isFinite(p)) continue;
    out.set(ids[0], [...(out.get(ids[0]) || []), { t: Number(r.finishedAt), p: Math.round(p), title: String(r.quizTitle || ""), kind: String(r.kind || "") }]);
  }
  for (const v of out.values()) v.sort((a, b) => a.t - b.t);
  return { out, unmatched, ambiguous, total };
}

export async function reportHandle(c: ReportCtx, a: Actor, action: string, input: Row) {
  if (!REPORT_ROLES.has(a.role) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
  const S = settingsOf(c.sql);
  if (action === "report-settings") {
    const sv = input.save as Row | undefined;
    if (sv) {
      if (a.role !== "admin") return { status: 403, body: { error: "read_only" } };
      const n: Settings = { above: num(sv.above, S.above, 1, 100), at: num(sv.at, S.at, 0, 99), progBetter: num(sv.progBetter, S.progBetter, -100, 100), progExpected: num(sv.progExpected, S.progExpected, -100, 100) };
      if (n.at >= n.above) return { status: 400, body: { error: "at_must_be_below_above" } };
      if (n.progExpected > n.progBetter) return { status: 400, body: { error: "expected_must_not_exceed_better" } };
      c.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('report_cfg', ?)`, JSON.stringify(n));
      return { status: 200, body: { settings: n, defaults: DEF } };
    }
    return { status: 200, body: { settings: S, defaults: DEF } };
  }
  const all = students(c.sql);
  const groups = c.sql.exec(`SELECT id, name, students FROM grp ORDER BY name`).toArray().map((r) => ({ id: String(r.id), name: String(r.name), students: JSON.parse(String(r.students || "[]")) as string[] }));

  if (action === "report-student") {
    const s = all.find((x) => x.id === String(input.id || ""));
    if (!s) return { status: 404, body: { error: "not_found" } };
    const sc = (await scoresByStudent(c, all)).out.get(s.id) || [];
    const subs = new Map(c.sql.exec(`SELECT hw, status, submitted_at, updated FROM subs WHERE student=?`, s.id).toArray().map((r) => [String(r.hw), r]));
    const hw = c.homework().filter((h) => c.assignees(h).includes(s.id)).map((h) => {
      const r = subs.get(h.id); const st = String(r?.status || "none"); const at = Number(r?.submitted_at || 0) || (st === "approved" ? Number(r?.updated || 0) : 0);
      const done = st === "submitted" || st === "approved" || st === "returned";
      return { title: h.title, kind: h.kind, due: h.due, status: st, submittedAt: at || null, onTime: done && (!h.due || (at > 0 && at <= h.due)) };
    });
    const qr = c.sql.exec(`SELECT surah, from_ayah, to_ayah, grade, approved FROM tracker WHERE student=? AND approved>0 ORDER BY approved`, s.id).toArray().map((r) => ({ surah: Number(r.surah), from: Number(r.from_ayah), to: Number(r.to_ayah), grade: String(r.grade || "green"), at: Number(r.approved) }));
    return { status: 200, body: { student: { ...s, groups: groups.filter((g) => g.students.includes(s.id)).map((g) => g.name) }, settings: S, scores: sc.map((x) => ({ ...x, band: band(x.p, S) })), homework: hw, quran: qr } };
  }
  if (action !== "report-dept") return { status: 404, body: { error: "unknown_action" } };

  const f = (input.filters || {}) as Row;
  const fv = (k: string) => String(f[k] ?? "");
  const grp = groups.find((g) => g.id === fv("group"));
  const sel = all.filter((s) =>
    (!fv("subject") || (fv("subject") === "__none" ? !s.subject : s.subject === fv("subject"))) &&
    (!fv("phase") || (fv("phase") === "__none" ? !s.phase : s.phase === fv("phase"))) &&
    (!fv("year") || s.cls === fv("year")) && (!fv("section") || s.section === fv("section")) &&
    (!grp || grp.students.includes(s.id)) &&
    (!fv("gender") || (fv("gender") === "__none" ? !s.gender : s.gender === fv("gender"))) &&
    (!fv("sen") || (fv("sen") === "__none" ? !s.sen : s.sen === fv("sen"))));
  const ids = new Set(sel.map((s) => s.id));
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  const options = {
    subjects: uniq([...c.sql.exec(`SELECT name FROM catalog WHERE kind='subject'`).toArray().map((r) => String(r.name)), ...all.map((s) => s.subject)]).sort(), phases: uniq(["EYFS", "Primary", "Secondary", ...all.map((s) => s.phase)]),
    years: uniq(all.map((s) => s.cls)).sort(yearSort), sections: uniq(all.filter((s) => !fv("year") || s.cls === fv("year")).map((s) => s.section)).sort(),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
  };
  const notSet = { subject: sel.filter((s) => !s.subject).length, phase: sel.filter((s) => !s.phase).length, gender: sel.filter((s) => !s.gender).length, sen: sel.filter((s) => !s.sen).length };
  const years = uniq(sel.map((s) => s.cls)).sort(yearSort);

  // Attainment + progress
  const sc = await scoresByStudent(c, all);
  const per = sel.map((s) => {
    const v = sc.out.get(s.id) || [];
    const recent = v.slice(-3); const att = recent.length ? Math.round(recent.reduce((t, x) => t + x.p, 0) / recent.length) : null;
    const first = v[0]?.p ?? null, latest = v.length ? v[v.length - 1].p : null; const delta = v.length >= 2 ? (latest as number) - (first as number) : null;
    return { s, n: v.length, att, attBand: att == null ? null : band(att, S), first, latest, delta, progBand: delta == null ? null : pband(delta, S) };
  });
  const attainment = years.map((y) => { const r = per.filter((x) => x.s.cls === y); return { year: y, students: r.length, above: r.filter((x) => x.attBand === "above").length, at: r.filter((x) => x.attBand === "at").length, below: r.filter((x) => x.attBand === "below").length, noData: r.filter((x) => x.att == null).length }; });
  const months = new Map<string, Map<string, number[]>>();
  for (const s of sel) for (const x of sc.out.get(s.id) || []) { const m = month(x.t); if (!months.has(m)) months.set(m, new Map()); const mm = months.get(m)!; mm.set(s.cls, [...(mm.get(s.cls) || []), x.p]); }
  const progress = {
    byYear: years.map((y) => { const r = per.filter((x) => x.s.cls === y); return { year: y, students: r.length, better: r.filter((x) => x.progBand === "better").length, expected: r.filter((x) => x.progBand === "expected").length, below: r.filter((x) => x.progBand === "below").length, noData: r.filter((x) => x.delta == null).length }; }),
    distribution: [[-100, -20], [-20, -10], [-10, 0], [0, 10], [10, 20], [20, 101]].map(([lo, hi]) => ({ lo, hi, n: per.filter((x) => x.delta != null && x.delta >= lo && x.delta < hi).length })),
    trend: [...months.keys()].sort().map((m) => ({ month: m, byYear: Object.fromEntries([...months.get(m)!].map(([y, v]) => [y, Math.round(v.reduce((t, p) => t + p, 0) / v.length)])) })),
  };

  // Quran (approved tracker entries; verses counted per grade)
  const qrows = c.sql.exec(`SELECT student, from_ayah, to_ayah, grade FROM tracker WHERE approved>0`).toArray().filter((r) => ids.has(String(r.student)));
  const qs = new Map<string, { green: number; yellow: number; red: number }>();
  for (const r of qrows) { const g = (["green", "yellow", "red"].includes(String(r.grade)) ? String(r.grade) : "green") as "green"; const k = String(r.student); const o = qs.get(k) || { green: 0, yellow: 0, red: 0 }; o[g] += Math.max(1, Number(r.to_ayah) - Number(r.from_ayah) + 1); qs.set(k, o); }
  const quran = years.map((y) => { const st = sel.filter((s) => s.cls === y); const o = { year: y, students: st.length, withData: 0, green: 0, yellow: 0, red: 0 }; for (const s of st) { const q = qs.get(s.id); if (q) { o.withData++; o.green += q.green; o.yellow += q.yellow; o.red += q.red; } } return o; });

  // Homework (only students in the selection count as expected)
  const subs = c.sql.exec(`SELECT hw, student, status, submitted_at, updated FROM subs`).toArray();
  const subMap = new Map(subs.map((r) => [`${r.hw}|${r.student}`, r]));
  const hwStu = new Map<string, { exp: number; done: number; onTime: number }>();
  const trendW = new Map<string, { exp: number; done: number; onTime: number }>();
  let hwCount = 0;
  const hwByYear = new Map<string, { exp: number; done: number; onTime: number }>();
  const byId = new Map(sel.map((s) => [s.id, s]));
  for (const h of c.homework()) {
    const target = c.assignees(h).filter((x) => ids.has(x)); if (!target.length) continue; hwCount++;
    const wk = week(h.due || h.created); const tw = trendW.get(wk) || { exp: 0, done: 0, onTime: 0 };
    for (const sid of target) {
      const r = subMap.get(`${h.id}|${sid}`); const st = String(r?.status || ""); const done = st === "submitted" || st === "approved" || st === "returned";
      const at = Number(r?.submitted_at || 0) || (done ? Number(r?.updated || 0) : 0); const ot = done && (!h.due || at <= h.due);
      for (const o of [tw, hwStu.get(sid) || (hwStu.set(sid, { exp: 0, done: 0, onTime: 0 }), hwStu.get(sid)!), hwByYear.get(byId.get(sid)!.cls) || (hwByYear.set(byId.get(sid)!.cls, { exp: 0, done: 0, onTime: 0 }), hwByYear.get(byId.get(sid)!.cls)!)]) { o.exp++; if (done) o.done++; if (ot) o.onTime++; }
    }
    trendW.set(wk, tw);
  }
  const tot = [...hwByYear.values()].reduce((t, o) => ({ exp: t.exp + o.exp, done: t.done + o.done, onTime: t.onTime + o.onTime }), { exp: 0, done: 0, onTime: 0 });
  const homework = { assignments: hwCount, ...tot, byYear: years.map((y) => ({ year: y, ...(hwByYear.get(y) || { exp: 0, done: 0, onTime: 0 }) })), trend: [...trendW.keys()].sort().slice(-16).map((w) => ({ week: w, ...trendW.get(w)! })) };

  // Curriculum coverage: taught = status "taught"; assessed = a linked homework/quiz has at least one submission/result
  const subHw = new Set(subs.filter((r) => ["submitted", "approved", "returned"].includes(String(r.status))).map((r) => String(r.hw)));
  const resQuiz = new Set((await c.results()).flatMap((r) => [String(r.quizId || ""), String(r.quizSlug || "")]).filter(Boolean));
  const curYears = fv("year") ? [fv("year")] : years.length ? years : [];
  const cur = c.sql.exec(`SELECT yr, subject, status, links, quiz FROM cur`).toArray().filter((r) => curYears.includes(String(r.yr)) && (!fv("subject") || fv("subject") === "__none" || String(r.subject) === fv("subject") || !String(r.subject)));
  const coverage = curYears.map((y) => {
    const u = cur.filter((r) => String(r.yr) === y);
    const assessed = u.filter((r) => { let l: { t: string; id: string }[] = []; try { l = JSON.parse(String(r.links || "[]")); } catch { /* none */ } if (r.quiz) l.push({ t: "quiz", id: String(r.quiz) }); return l.some((x) => (x.t === "hw" ? subHw.has(x.id) : resQuiz.has(x.id))); }).length;
    return { year: y, total: u.length, taught: u.filter((r) => r.status === "taught").length, inProgress: u.filter((r) => r.status === "in_progress").length, assessed };
  });

  const withScore = per.filter((x) => x.att != null);
  const kpis = {
    students: sel.length, withScores: withScore.length,
    atOrAbove: withScore.length ? Math.round((100 * withScore.filter((x) => x.attBand !== "below").length) / withScore.length) : null,
    expectedOrBetter: per.some((x) => x.delta != null) ? Math.round((100 * per.filter((x) => x.progBand === "better" || x.progBand === "expected").length) / per.filter((x) => x.delta != null).length) : null,
    onTime: tot.exp ? Math.round((100 * tot.onTime) / tot.exp) : null, completion: tot.exp ? Math.round((100 * tot.done) / tot.exp) : null,
    quranGreen: (() => { const t = quran.reduce((s, q) => s + q.green + q.yellow + q.red, 0); return t ? Math.round((100 * quran.reduce((s, q) => s + q.green, 0)) / t) : null; })(),
    coverage: (() => { const t = coverage.reduce((s, x) => s + x.total, 0); return t ? Math.round((100 * coverage.reduce((s, x) => s + x.taught, 0)) / t) : null; })(),
    results: { total: sc.total, unmatched: sc.unmatched, ambiguous: sc.ambiguous },
  };
  const studentsOut = per.map((x) => {
    const q = qs.get(x.s.id); const h = hwStu.get(x.s.id);
    return { ...x.s, n: x.n, att: x.att, attBand: x.attBand, first: x.first, latest: x.latest, delta: x.delta, progBand: x.progBand, quran: q || null, hw: h || null };
  });
  return { status: 200, body: { generated: Date.now(), filters: f, options, notSet, settings: S, kpis, attainment, progress, quran, homework, coverage, students: studentsOut } };
}
