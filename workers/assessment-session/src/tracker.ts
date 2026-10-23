/**
 * Assessment Tracker + "RIS Primary Attainment and Progress System" (Shaiq Muhammad System).
 *
 * Attainment & Progress Systems are named, versioned framework configs (settings key "asys"); RIS Primary is the first.
 * The tracker grid per class & term: topics/SC rows come from Curriculum SC lists (week order), SC cells 0–3 auto-filled
 * from SC-tagged quiz questions (% → 0–3 cut-offs) and Quran homework grades, with teacher overrides (audited).
 * Access switches (view/edit/effort/xlsx/pdf/isams): system global → per-teacher perms "trk:<key>:on|off". Server-enforced.
 *
 * Actions: asys-list, asys-save (admin) · trk-get {cls, term} · trk-set {student, unit, i, val|null} · trk-grade {student, cls, term, val|null}
 *          trk-effort {student, term, val} · trk-export {cls, term, kind} · trk-audit (admin) · trk-summary (report)
 *          trk-targets-import {rows} (admin) · isams-tpl-list / isams-tpl-save / isams-tpl-get / isams-tpl-delete · trk-isams {cycle}
 */
import type { Actor } from "./lms";

type Json = Record<string, unknown>;
type Row = Record<string, unknown>;
type Sql = { exec: (q: string, ...a: unknown[]) => { toArray: () => Row[]; one: () => Row } };
type Hw = { id: string; kind: string };
export type TrkCtx = {
  sql: Sql;
  inScope: (a: Actor, cls: string, section: string, sid?: string) => boolean;
  homework: () => Hw[];
  tagged: (ids: string[], quizIds: string[]) => Promise<{ studentId: string; quizId: string; slug?: string; at: number; details: { sc?: string; earned: number; points: number }[] }[]>;
};
type Reply = { status: number; body: unknown };

const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, max);
const rid = (p: string) => `${p}_${Date.now().toString(36)}${Array.from(crypto.getRandomValues(new Uint8Array(4)), (x) => x.toString(16).padStart(2, "0")).join("")}`;
const forbid = (e = "forbidden"): Reply => ({ status: 403, body: { error: e } });

export const TRK_KEYS = ["view", "edit", "effort", "xlsx", "pdf", "isams"] as const;
export type TrkKey = (typeof TRK_KEYS)[number];
export const KEY_TEXT = "0 - Working Below\n•\tWorking below the grade related expected standard and is not able to complete work to access this expectation.\n•\tFocus on prior objective/standard\n\n1 - Working Towards\n•\tRequires additional support to access the objective and expected standard\n•\tProgressing towards some aspects but not achieving the entire objective\n•\tUnless supported, there is no or very little evidence of transfer of skills across the subject areas\n•\tDifferentiation is required for students at this level with use of concrete materials\n\n2 - Working At\n•\tRequires little or no support to meet the objective and expected standard\n•\tSome transfer of skills is evident across the subject areas\n\n3 - Greater Depth\n•\tIndependently achieves and exceeds aspects of the objective and expected standard\n•\tTransfer of skills is evident across the subject areas\n•\tIs working at greater depth and displaying mastery of skills\n•\tDifferentiation to challenge and extend is required ";

export type ASys = {
  id: string; name: string; version: string; active: boolean;
  scope: { phase: string; years: string[]; subject: string };
  scale: { v: number; label: string }[]; key: string;
  cut: [number, number, number]; // % at/above which a cell is 1, 2, 3 (below cut[0] = 0)
  quran: { red: string; yellow: string; green: string }; quranPattern: string;
  bands: number[]; // upper bound of the average for grade 1..7
  capTarget: boolean;
  capExempt: string[]; // classes whose tracker has no Target−1 cap (the department Year 1 / FS2 files use the plain IF formula)
  scaled: [number, number, number][]; // [from, to, target]
  effort: string[]; targetList: string[]; attainList: string[];
  thresholds: number[];
  access: Record<TrkKey, boolean>;
  isDefault: boolean; // the default system for its phase (one at a time per phase)
  resub: "latest" | "best" | "first"; // which attempt counts when a weekly assessment is re-submitted
  untagged: boolean; // a linked assessment with no SC tags gives its overall % to every SC of the unit (flagged)
  updated?: number; by?: string;
};
export const RIS_PRIMARY: ASys = {
  id: "ris-primary", name: "RIS Primary Attainment and Progress System", version: "1.0", active: true,
  scope: { phase: "Primary", years: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6"], subject: "Islamic B" },
  scale: [{ v: 0, label: "Working Below" }, { v: 1, label: "Working Towards" }, { v: 2, label: "Working At" }, { v: 3, label: "Greater Depth" }], key: KEY_TEXT,
  cut: [40, 60, 85], quran: { red: "1", yellow: "2", green: "3" }, quranPattern: "^Recit",
  bands: [0.9, 1.4, 1.9, 2.2, 2.5, 2.8, 3], capTarget: true, capExempt: ["FS2", "Year 1"],
  scaled: [[67, 80, 2], [81, 93, 3], [94, 109, 4], [110, 120, 5], [121, 999, 6]],
  effort: ["Very Good", " Good ", "Average", " Weak", " Very weak", " "], targetList: ["7", "6", "5", "4", "3", "2", "1", "NA"], attainList: ["7", "6", "5", "4", "3", "2", "1", "NA", " "],
  thresholds: [4, 5],
  access: { view: true, edit: true, effort: true, xlsx: true, pdf: true, isams: true },
  isDefault: true, resub: "latest", untagged: true,
};

export function trkInit(sql: Sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_ov (student TEXT, unit TEXT, i INTEGER, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, unit, i))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_gov (student TEXT, cls TEXT, term TEXT, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, cls, term))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_eff (student TEXT, term TEXT, val TEXT, by_name TEXT, at INTEGER, PRIMARY KEY (student, term))`);
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_audit (id TEXT PRIMARY KEY, at INTEGER, by_id TEXT, by_name TEXT, student TEXT, what TEXT, prev TEXT, next TEXT)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS isams_tpl (cycle TEXT PRIMARY KEY, name TEXT, term TEXT, data TEXT, at INTEGER)`);
  try { sql.exec(`ALTER TABLE users ADD COLUMN isams_id TEXT DEFAULT ''`); } catch { /* exists */ }
  // 'Link to Assessment Tracker' switch per assessment (quiz id/slug) or Quran homework id. on=0 = practice.
  // keep_before: when switched off with "keep", submissions before this time still count.
  sql.exec(`CREATE TABLE IF NOT EXISTS trk_link (id TEXT PRIMARY KEY, kind TEXT, on_ INTEGER, keep_before INTEGER DEFAULT 0, by_name TEXT, at INTEGER)`);
  // One-time: assessments / Quran homework already linked to a curriculum unit keep ON.
  if (!sql.exec(`SELECT v FROM settings WHERE k='trk_link_seeded'`).toArray().length) {
    try {
      for (const r of sql.exec(`SELECT quiz, links FROM cur`).toArray()) {
        let links: { t: string; id: string }[] = []; try { links = JSON.parse(String(r.links || "[]")); } catch { /* */ }
        const items = [...(r.quiz ? [{ t: "quiz", id: String(r.quiz) }] : []), ...links];
        for (const l of items) if (l.id) sql.exec(`INSERT OR IGNORE INTO trk_link (id, kind, on_, keep_before, by_name, at) VALUES (?, ?, 1, 0, 'System (existing end-of-topic)', ?)`, l.id, l.t === "hw" ? "hw" : "quiz", Date.now());
      }
      sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('trk_link_seeded', '1')`);
    } catch { /* cur not created yet: seed on a later start */ }
  }
}
/** Whether a submission at time `at` on assessment/homework `id` may feed the tracker. */
export function linkRule(sql: Sql) {
  const rows = new Map(sql.exec(`SELECT id, on_, keep_before FROM trk_link`).toArray().map((r) => [String(r.id), { on: Number(r.on_) === 1, keep: Number(r.keep_before) || 0 }] as const));
  const def = String(sql.exec(`SELECT v FROM settings WHERE k='trk_link_default'`).toArray()[0]?.v || "off") === "on";
  return (id: string, at: number) => { const r = rows.get(id); if (!r) return def; return r.on || (r.keep > 0 && at < r.keep); };
}

const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const strs = (v: unknown, d: string[], n = 20) => (Array.isArray(v) ? v.slice(0, n).map((x) => String(x ?? "").slice(0, 40)) : d);
function cleanSys(raw: Json, prev: ASys): ASys {
  const sc = (raw.scope || {}) as Json, acc = (raw.access || {}) as Json, q = (raw.quran || {}) as Json;
  const cut = Array.isArray(raw.cut) ? (raw.cut as unknown[]).map((x, i) => num(x, prev.cut[i], 0, 100)) : prev.cut;
  const bands = Array.isArray(raw.bands) && raw.bands.length === 7 ? (raw.bands as unknown[]).map((x, i) => num(x, prev.bands[i], 0, 3)) : prev.bands;
  return {
    id: prev.id, name: str(raw.name ?? prev.name, 120) || prev.name, version: str(raw.version ?? prev.version, 20) || prev.version, active: raw.active === undefined ? prev.active : !!raw.active,
    scope: { phase: str(sc.phase ?? prev.scope.phase, 40), years: strs(sc.years, prev.scope.years, 20), subject: str(sc.subject ?? prev.scope.subject, 60) },
    scale: Array.isArray(raw.scale) ? (raw.scale as Json[]).slice(0, 4).map((x, i) => ({ v: i, label: str(x?.label, 60) || prev.scale[i]?.label || "" })) : prev.scale,
    key: raw.key === undefined ? prev.key : String(raw.key ?? "").slice(0, 4000),
    cut: [cut[0], Math.max(cut[0], cut[1]), Math.max(cut[1], cut[2])] as [number, number, number],
    quran: { red: str(q.red ?? prev.quran.red, 2), yellow: str(q.yellow ?? prev.quran.yellow, 2), green: str(q.green ?? prev.quran.green, 2) },
    quranPattern: str(raw.quranPattern ?? prev.quranPattern, 80),
    bands: bands.map((b, i) => (i ? Math.max(b, bands[i - 1]) : b)), capTarget: raw.capTarget === undefined ? prev.capTarget : !!raw.capTarget, capExempt: raw.capExempt === undefined ? prev.capExempt || [] : strs(raw.capExempt, [], 20),
    scaled: Array.isArray(raw.scaled) ? (raw.scaled as unknown[][]).slice(0, 10).map((r) => [num(r?.[0], 0, 0, 999), num(r?.[1], 0, 0, 999), num(r?.[2], 0, 0, 9)] as [number, number, number]) : prev.scaled,
    effort: raw.effort === undefined ? prev.effort : strs(raw.effort, prev.effort), targetList: raw.targetList === undefined ? prev.targetList : strs(raw.targetList, prev.targetList), attainList: raw.attainList === undefined ? prev.attainList : strs(raw.attainList, prev.attainList),
    thresholds: Array.isArray(raw.thresholds) ? [...new Set((raw.thresholds as unknown[]).map((x) => Math.round(num(x, 4, 1, 9))))].sort((a, b) => a - b).slice(0, 6) : prev.thresholds,
    access: Object.fromEntries(TRK_KEYS.map((k) => [k, acc[k] === undefined ? prev.access[k] : !!acc[k]])) as Record<TrkKey, boolean>,
    isDefault: raw.isDefault === undefined ? prev.isDefault : !!raw.isDefault,
    resub: ["latest", "best", "first"].includes(String(raw.resub)) ? (String(raw.resub) as ASys["resub"]) : prev.resub,
    untagged: raw.untagged === undefined ? prev.untagged : !!raw.untagged,
  };
}
export function systems(sql: Sql): ASys[] {
  let list: ASys[] = [];
  try { list = JSON.parse(String(sql.exec(`SELECT v FROM settings WHERE k='asys'`).toArray()[0]?.v || "[]")); } catch { list = []; }
  if (!list.some((s) => s.id === RIS_PRIMARY.id)) list.unshift(RIS_PRIMARY);
  return list.map((s) => ({ ...RIS_PRIMARY, ...s, scope: { ...RIS_PRIMARY.scope, ...(s.scope || {}) }, access: { ...RIS_PRIMARY.access, ...(s.access || {}) } }));
}
/** The system for a class: an explicitly chosen one, else the default for that class's phase, else any active system covering the class. */
const sysFor = (sql: Sql, cls: string, want = "") => {
  const all = systems(sql).filter((s) => s.active && s.scope.years.includes(cls));
  return (want && all.find((s) => s.id === want)) || all.find((s) => s.isDefault) || all[0];
};
export function trkAccess(sys: ASys | undefined, a: Actor): Record<TrkKey, boolean> {
  if (a.role === "admin") return Object.fromEntries(TRK_KEYS.map((k) => [k, true])) as Record<TrkKey, boolean>;
  const out = { ...(sys?.access || RIS_PRIMARY.access) };
  for (const p of a.perms || []) { const m = /^trk:([a-z]+):(on|off)$/.exec(p); if (m && (TRK_KEYS as readonly string[]).includes(m[1])) out[m[1] as TrkKey] = m[2] === "on"; }
  if (!out.view) for (const k of TRK_KEYS) out[k] = false;
  return out;
}
export const scoreFromPct = (p: number, cut: number[]) => (p >= cut[2] ? 3 : p >= cut[1] ? 2 : p >= cut[0] ? 1 : 0);
export const capsFor = (sys: ASys, cls: string) => sys.capTarget && !(sys.capExempt || []).includes(cls);
export function gradeOf(avg: number | null, target: string, sys: ASys, cls = ""): number | null {
  if (avg == null) return null;
  let g = sys.bands.findIndex((b) => avg <= b + 1e-9) + 1;
  if (g <= 0) g = 7;
  const t = Number(target);
  if (capsFor(sys, cls) && target && Number.isFinite(t)) g = Math.min(g, t - 1);
  return g;
}
export const targetFromScaledSys = (v: number, sys: ASys) => { const r = sys.scaled.find(([a, b]) => v >= a && v <= b); return r ? String(r[2]) : ""; };

const TERMS = ["Term 1", "Term 2", "Term 3"];
type Cell = { v: number | null; src: "quiz" | "quiz-all" | "quran" | "override" | ""; auto: number | null; autoSrc: string; by?: string; at?: number; note?: string };

/** The grid for one class (and term, "" = whole year), limited to the students this actor may see. */
async function grid(c: TrkCtx, a: Actor, cls: string, term: string, want = "") {
  const sys = sysFor(c.sql, cls, want);
  if (!sys) return null;
  const students = c.sql.exec(`SELECT id, name, first_name, last_name, section, target, scaled, isams_id FROM users WHERE role='student' AND cls=? AND COALESCE(disabled,0)=0 ORDER BY name`, cls).toArray()
    .filter((s) => a.role === "admin" || c.inScope(a, cls, String(s.section || ""), String(s.id)))
    .map((s) => { const t = String(s.target || "") || (s.scaled ? targetFromScaledSys(Number(s.scaled), sys) : ""); return { id: String(s.id), name: String(s.name), first: String(s.first_name || ""), last: String(s.last_name || ""), target: t, targetSrc: s.target ? "profile" : t ? "scaled" : "", isamsId: String(s.isams_id || "") }; });
  const units = c.sql.exec(`SELECT id, title, term, wk_from, sc, links, subject, quiz, std FROM cur WHERE yr=? ${sys.scope.subject ? "AND subject=?" : ""} ORDER BY term, wk_from, ord, title`, ...(sys.scope.subject ? [cls, sys.scope.subject] : [cls])).toArray()
    .filter((u) => !term || String(u.term) === term)
    .map((u) => { let sc: string[] = []; let links: { t: string; id: string }[] = []; let std: { codes: string[]; skill: number } = { codes: [], skill: 0 }; try { sc = JSON.parse(String(u.sc || "[]")); } catch { /* */ } try { links = JSON.parse(String(u.links || "[]")); } catch { /* */ } try { std = { codes: [], skill: 0, ...JSON.parse(String(u.std || "{}")) }; } catch { /* */ } const quizzes = [...new Set([String(u.quiz || ""), ...links.filter((l) => l.t === "quiz").map((l) => l.id)].filter(Boolean))]; return { id: String(u.id), title: String(u.title), term: String(u.term), wk: Number(u.wk_from) || 0, sc, links, quizzes, std }; })
    .filter((u) => u.sc.length)
    .sort((x, y) => TERMS.indexOf(x.term) - TERMS.indexOf(y.term) || x.wk - y.wk);
  const ids = students.map((s) => s.id);
  const cells: Record<string, Cell> = {};
  const key = (s: string, u: string, i: number) => `${s}|${u}|${i}`;
  // Quiz: per tagged SC, the attempt chosen by the re-submission rule (sum of earned/points on that SC's questions).
  // Untagged attempts on the unit's linked (weekly) assessment give their overall % to every SC of that unit, flagged.
  const pick = (prev: { at: number; e: number; p: number } | undefined, x: { at: number; e: number; p: number }) =>
    !prev || (sys.resub === "first" ? x.at < prev.at : sys.resub === "best" ? x.e / x.p > prev.e / prev.p || (x.e / x.p === prev.e / prev.p && x.at > prev.at) : x.at > prev.at);
  const pct = new Map<string, { at: number; e: number; p: number }>();
  const whole = new Map<string, { at: number; e: number; p: number }>(); // `${student}|${unit}` from untagged linked assessments
  const byQuiz = new Map<string, string[]>(); for (const u of units) for (const q of u.quizzes) byQuiz.set(q, [...(byQuiz.get(q) || []), u.id]);
  const linked = linkRule(c.sql);
  if (ids.length) for (const r of await c.tagged(ids, [...byQuiz.keys()])) {
    if (!linked(r.quizId, r.at) && !(r.slug && r.slug !== r.quizId && linked(r.slug, r.at))) continue; // practice assessment: saved as usual, never in the tracker
    const per = new Map<string, { e: number; p: number }>(); let te = 0, tp = 0;
    for (const d of r.details) { te += Number(d.earned) || 0; tp += Number(d.points) || 0; if (d.sc) { const x = per.get(d.sc) || { e: 0, p: 0 }; x.e += Number(d.earned) || 0; x.p += Number(d.points) || 0; per.set(d.sc, x); } }
    for (const [tag, x] of per) { const k = `${r.studentId}|${tag}`; const v = { at: r.at, ...x }; if (x.p > 0 && pick(pct.get(k), v)) pct.set(k, v); }
    if (!per.size && sys.untagged && tp > 0) for (const uid of new Set([...(byQuiz.get(r.quizId) || []), ...(r.slug ? byQuiz.get(r.slug) || [] : [])])) { const k = `${r.studentId}|${uid}`; const v = { at: r.at, e: te, p: tp }; if (pick(whole.get(k), v)) whole.set(k, v); }
  }
  // Quran: latest grade on Quran homework linked to the unit.
  const qhw = new Set(c.homework().filter((h) => h.kind === "quran").map((h) => h.id));
  const re = (() => { try { return new RegExp(sys.quranPattern || "^Recit", "i"); } catch { return /^Recit/i; } })();
  for (const u of units) {
    const hws = u.links.filter((l) => l.t === "hw" && qhw.has(l.id)).map((l) => l.id);
    const qg = new Map<string, string>();
    if (hws.length && ids.length) for (const r of c.sql.exec(`SELECT hw, student, grade, updated FROM subs WHERE hw IN (${hws.map(() => "?").join(",")}) AND grade != '' ORDER BY updated`, ...hws).toArray()) if (linked(String(r.hw), Number(r.updated))) qg.set(String(r.student), String(r.grade));
    for (const s of students) u.sc.forEach((t, i) => {
      const tagP = pct.get(`${s.id}|${u.id}#${i}`), allP = tagP ? undefined : whole.get(`${s.id}|${u.id}`); const quizP = tagP || allP;
      const g = qg.get(s.id); const qv = g && re.test(t) ? (sys.quran as Record<string, string>)[g] : "";
      let auto: number | null = null, autoSrc = "";
      const qn = qv !== "" && qv !== undefined && Number.isFinite(Number(qv)) ? Number(qv) : null;
      if (qn != null && re.test(t)) { auto = qn; autoSrc = "quran"; }
      else if (quizP) { auto = scoreFromPct((quizP.e / quizP.p) * 100, sys.cut); autoSrc = tagP ? "quiz" : "quiz-all"; }
      else if (qn != null) { auto = qn; autoSrc = "quran"; }
      cells[key(s.id, u.id, i)] = { v: auto, src: autoSrc as Cell["src"], auto, autoSrc, note: autoSrc.startsWith("quiz") && quizP ? `${Math.round((quizP.e / quizP.p) * 100)}%` : autoSrc === "quran" ? String(g) : undefined };
    });
  }
  if (ids.length) for (const o of c.sql.exec(`SELECT * FROM trk_ov WHERE student IN (${ids.map(() => "?").join(",")})`, ...ids).toArray()) {
    const k = key(String(o.student), String(o.unit), Number(o.i)); const cur = cells[k]; if (!cur) continue;
    cells[k] = { ...cur, v: o.val === "" ? null : Number(o.val), src: "override", by: String(o.by_name || ""), at: Number(o.at) };
  }
  const tk = term || "Year";
  const gov = new Map(ids.length ? c.sql.exec(`SELECT * FROM trk_gov WHERE cls=? AND term=?`, cls, tk).toArray().map((r) => [String(r.student), r] as const) : []);
  const eff = new Map(ids.length ? c.sql.exec(`SELECT * FROM trk_eff WHERE term=?`, tk).toArray().map((r) => [String(r.student), r] as const) : []);
  const results = students.map((s) => {
    const vals: number[] = []; for (const u of units) u.sc.forEach((_, i) => { const v = cells[key(s.id, u.id, i)]?.v; if (v != null && Number.isFinite(v)) vals.push(v); });
    const avg = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
    const calc = gradeOf(avg, s.target, sys, cls); const o = gov.get(s.id);
    return { id: s.id, avg, calc, grade: o ? (o.val === "" ? null : Number(o.val)) : calc, override: o ? { by: String(o.by_name || ""), at: Number(o.at) } : null, effort: String(eff.get(s.id)?.val ?? ""), n: vals.length };
  });
  return { sys, cls, term, students, units: units.map(({ links: _l, ...u }) => u), cells, results };
}

/** Each class once, with the system that applies to it (default for its phase). */
const yearSystems = (sql: Sql) => { const seen = new Set<string>(); const out: { cl: string; s: ASys }[] = []; for (const s of systems(sql).filter((x) => x.active)) for (const cl of s.scope.years) { if (seen.has(cl)) continue; const d = sysFor(sql, cl); if (d) { seen.add(cl); out.push({ cl, s: d }); } } return out; };

export async function trackerHandle(c: TrkCtx, a: Actor, action: string, input: Json): Promise<Reply> {
  const sql = c.sql;
  if (a.role !== "admin" && a.role !== "teacher" && action !== "trk-link-get") return forbid();
  const audit = (student: string, what: string, prev: string, next: string) => sql.exec(`INSERT INTO trk_audit (id, at, by_id, by_name, student, what, prev, next) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, rid("ta"), Date.now(), a.id, a.name || (a.role === "admin" ? "Admin" : ""), student, what, prev, next);
  const cls = str(input.cls, 60), term = TERMS.includes(String(input.term)) ? String(input.term) : "";
  switch (action) {
    case "asys-list": {
      const sys = systems(sql);
      const repView = String(sql.exec(`SELECT v FROM settings WHERE k='rep_view'`).toArray()[0]?.v || "tracker");
      return { status: 200, body: { repView, systems: a.role === "admin" ? sys : sys.map((s) => ({ id: s.id, name: s.name, version: s.version, active: s.active, isDefault: s.isDefault, scope: s.scope })), platform: "Shaiq Muhammad System", years: [...new Set(sys.filter((s) => s.active).flatMap((s) => s.scope.years))], access: trkAccess(sys.find((s) => s.active), a) } };
    }
    case "trk-link-get": {
      const ids = (Array.isArray(input.ids) ? input.ids : []).slice(0, 500).map((x) => str(x, 80));
      const def = String(sql.exec(`SELECT v FROM settings WHERE k='trk_link_default'`).toArray()[0]?.v || "off");
      const rows = new Map(sql.exec(`SELECT * FROM trk_link`).toArray().map((r) => [String(r.id), r] as const));
      const sys = systems(sql).find((x) => x.active && x.isDefault) || systems(sql)[0];
      return { status: 200, body: { default: def, canSet: a.role === "admin" || (a.role === "teacher" && !a.viewAs && trkAccess(sys, a).edit), items: Object.fromEntries(ids.map((id) => { const r = rows.get(id); return [id, r ? { on: Number(r.on_) === 1, keepBefore: Number(r.keep_before) || 0, by: String(r.by_name || ""), at: Number(r.at) } : { on: def === "on", keepBefore: 0, by: "", at: 0, isDefault: true }]; })) } };
    }
    case "trk-link-set": {
      // Teachers with tracker Add/Edit and admin. keep=false when switching off removes the scores it already added.
      const sys = systems(sql).find((x) => x.active && x.isDefault) || systems(sql)[0];
      if (a.viewAs || (a.role !== "admin" && !trkAccess(sys, a).edit)) return forbid("edit_not_allowed");
      if (input.default !== undefined) { if (a.role !== "admin") return forbid(); sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('trk_link_default', ?)`, input.default === "on" ? "on" : "off"); return { status: 200, body: { ok: true } }; }
      const id = str(input.id, 80); if (!id) return { status: 400, body: { error: "missing_id" } };
      const on = !!input.on; const prev = sql.exec(`SELECT * FROM trk_link WHERE id=?`, id).toArray()[0];
      const keep = on ? 0 : input.keep === true ? Date.now() : 0;
      sql.exec(`INSERT OR REPLACE INTO trk_link (id, kind, on_, keep_before, by_name, at) VALUES (?, ?, ?, ?, ?, ?)`, id, input.kind === "hw" ? "hw" : "quiz", on ? 1 : 0, keep, a.name || "Admin", Date.now());
      audit("", `Tracker link · ${input.kind === "hw" ? "Quran homework" : "Assessment"} ${id}`, prev ? (Number(prev.on_) ? "on" : "off") : "default", on ? "on" : keep ? "off (keep earlier scores)" : "off (remove scores)");
      return { status: 200, body: { ok: true } };
    }
    case "asys-save": {
      if (a.role !== "admin" || a.viewAs) return forbid();
      const list = systems(sql); const id = str((input.system as Json)?.id, 60);
      const raw = (input.system || {}) as Json;
      if (input.remove) { if (id === RIS_PRIMARY.id) return { status: 400, body: { error: "cannot_remove_default" } }; sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('asys', ?)`, JSON.stringify(list.filter((s) => s.id !== id))); return { status: 200, body: { ok: true } }; }
      const prev = list.find((s) => s.id === id) || { ...RIS_PRIMARY, id: id || rid("sys"), name: str(raw.name, 120) || "New system", active: false, scope: { phase: "", years: [], subject: "" } };
      if (input.repView !== undefined) { sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('rep_view', ?)`, input.repView === "percent" ? "percent" : "tracker"); if (!input.system) return { status: 200, body: { ok: true } }; }
      const next = { ...cleanSys(raw, prev), updated: Date.now(), by: a.name || "Admin" };
      // One default at a time per phase: making this one default clears the others in the same phase.
      let out = list.some((s) => s.id === next.id) ? list.map((s) => (s.id === next.id ? next : s)) : [...list, next];
      if (next.isDefault) out = out.map((s) => (s.id !== next.id && (s.scope?.phase || "") === next.scope.phase ? { ...s, isDefault: false } : s));
      sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('asys', ?)`, JSON.stringify(out));
      return { status: 200, body: { ok: true, system: next } };
    }
    case "trk-get": case "trk-export": {
      const want = str(input.sys, 60); const sys = sysFor(sql, cls, want); const acc = trkAccess(sys, a);
      if (!sys) return { status: 404, body: { error: "no_system_for_class" } };
      if (!acc.view) return forbid("module_hidden");
      if (action === "trk-export") { const k = String(input.kind) as TrkKey; if (!["xlsx", "pdf", "isams"].includes(k) || !acc[k]) return forbid("export_not_allowed"); }
      const g = await grid(c, a, cls, term, want);
      if (!g || (a.role !== "admin" && !g.students.length)) return forbid("not_your_class");
      return { status: 200, body: { ...g, access: acc, sys: g.sys } };
    }
    case "trk-set": case "trk-grade": case "trk-effort": {
      const sid = str(input.student, 40);
      const u = sql.exec(`SELECT id, cls, section, name FROM users WHERE id=? AND role='student'`, sid).toArray()[0];
      if (!u || a.viewAs) return { status: 404, body: { error: "not_found" } };
      const sys = sysFor(sql, String(u.cls)); const acc = trkAccess(sys, a);
      if (!sys || (a.role !== "admin" && !c.inScope(a, String(u.cls), String(u.section || ""), sid))) return forbid("not_your_class");
      const raw = input.val; const clear = raw === null || raw === undefined;
      if (action === "trk-effort") {
        if (!acc.effort) return forbid("effort_not_allowed");
        const v = String(raw ?? ""); if (!clear && !sys.effort.includes(v)) return { status: 400, body: { error: "bad_value" } };
        const tk = term || "Year"; const prev = String(sql.exec(`SELECT val FROM trk_eff WHERE student=? AND term=?`, sid, tk).toArray()[0]?.val ?? "");
        if (clear) sql.exec(`DELETE FROM trk_eff WHERE student=? AND term=?`, sid, tk); else sql.exec(`INSERT OR REPLACE INTO trk_eff (student, term, val, by_name, at) VALUES (?, ?, ?, ?, ?)`, sid, tk, v, a.name || "Admin", Date.now());
        audit(sid, `Effort · ${tk}`, prev, clear ? "" : v); return { status: 200, body: { ok: true } };
      }
      if (!acc.edit) return forbid("edit_not_allowed");
      const v = raw === "" ? "" : Math.round(Number(raw));
      if (action === "trk-set") {
        const unit = str(input.unit, 40), i = Math.round(Number(input.i));
        const cu = sql.exec(`SELECT title, sc FROM cur WHERE id=?`, unit).toArray()[0];
        let n = 0; try { n = JSON.parse(String(cu?.sc || "[]")).length; } catch { /* */ }
        if (!cu || !(i >= 0 && i < n)) return { status: 400, body: { error: "bad_sc" } };
        if (!clear && v !== "" && !(Number(v) >= 0 && Number(v) <= 3)) return { status: 400, body: { error: "bad_value" } };
        const prev = sql.exec(`SELECT val FROM trk_ov WHERE student=? AND unit=? AND i=?`, sid, unit, i).toArray()[0];
        if (clear) sql.exec(`DELETE FROM trk_ov WHERE student=? AND unit=? AND i=?`, sid, unit, i);
        else sql.exec(`INSERT OR REPLACE INTO trk_ov (student, unit, i, val, by_name, at) VALUES (?, ?, ?, ?, ?, ?)`, sid, unit, i, String(v), a.name || "Admin", Date.now());
        audit(sid, `SC · ${cu.title} #${i + 1}`, prev ? String(prev.val) : "auto", clear ? "auto" : String(v)); return { status: 200, body: { ok: true } };
      }
      const gcls = String(u.cls), tk = term || "Year";
      if (!clear && v !== "" && !(Number(v) >= 1 && Number(v) <= 9)) return { status: 400, body: { error: "bad_value" } };
      const prev = sql.exec(`SELECT val FROM trk_gov WHERE student=? AND cls=? AND term=?`, sid, gcls, tk).toArray()[0];
      if (clear) sql.exec(`DELETE FROM trk_gov WHERE student=? AND cls=? AND term=?`, sid, gcls, tk);
      else sql.exec(`INSERT OR REPLACE INTO trk_gov (student, cls, term, val, by_name, at) VALUES (?, ?, ?, ?, ?, ?)`, sid, gcls, tk, String(v), a.name || "Admin", Date.now());
      audit(sid, `Attainment Grade · ${tk}`, prev ? String(prev.val) : "auto", clear ? "auto" : String(v)); return { status: 200, body: { ok: true } };
    }
    case "trk-audit": {
      if (a.role !== "admin") return forbid();
      const rows = sql.exec(`SELECT t.*, u.name AS sname, u.cls AS scls FROM trk_audit t LEFT JOIN users u ON u.id=t.student ORDER BY t.at DESC LIMIT 500`).toArray();
      return { status: 200, body: { items: rows.map((r) => ({ at: Number(r.at), by: String(r.by_name), student: String(r.sname || r.student), cls: String(r.scls || ""), what: String(r.what), prev: String(r.prev), next: String(r.next) })) } };
    }
    case "trk-targets-import": {
      if (a.role !== "admin" || a.viewAs) return forbid();
      const sys = systems(sql).find((s) => s.id === RIS_PRIMARY.id)!;
      const all = sql.exec(`SELECT id, username, name, first_name, last_name, cls, isams_id FROM users WHERE role='student'`).toArray();
      const norm = (s: unknown) => String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
      const out: { row: number; name: string; student?: string; target?: string; how?: string; error?: string }[] = [];
      const apply = input.apply === true;
      for (const [i, r] of ((Array.isArray(input.rows) ? input.rows : []) as Json[]).slice(0, 2000).entries()) {
        const sid = str(r.schoolId, 30), un = str(r.username, 60).toLowerCase(), full = norm(r.name || `${r.first ?? ""} ${r.last ?? ""}`), yr = str(r.cls, 40);
        let m = all.filter((u) => (sid && String(u.isams_id) === sid) || (un && String(u.username) === un));
        if (!m.length && full) m = all.filter((u) => (!yr || String(u.cls) === yr || String(u.cls).replace(/\D/g, "") === yr.replace(/\D/g, "")) && (norm(u.name) === full || norm(`${u.first_name} ${u.last_name}`) === full));
        const label = String(r.name || `${r.first ?? ""} ${r.last ?? ""}`).trim() || un || sid;
        if (m.length !== 1) { out.push({ row: i + 2, name: label, error: m.length ? "ambiguous" : "no_match" }); continue; }
        const t0 = str(r.target, 4), sc = Number(r.scaled);
        const tgt = t0 && Number.isFinite(Number(t0)) ? String(Math.round(Number(t0))) : Number.isFinite(sc) && r.scaled !== "" && r.scaled != null ? targetFromScaledSys(sc, sys) : "";
        const how = t0 ? "target" : tgt ? `scaled ${sc}` : "";
        if (!tgt && !sid) { out.push({ row: i + 2, name: label, student: String(m[0].name), error: "no_target" }); continue; }
        if (apply) {
          if (tgt) sql.exec(`UPDATE users SET target=? WHERE id=?`, tgt, String(m[0].id));
          if (Number.isFinite(sc) && r.scaled !== "" && r.scaled != null) sql.exec(`UPDATE users SET scaled=? WHERE id=?`, String(Math.round(sc)), String(m[0].id));
          if (sid) sql.exec(`UPDATE users SET isams_id=? WHERE id=?`, sid, String(m[0].id));
        }
        out.push({ row: i + 2, name: label, student: String(m[0].name), target: tgt, how });
      }
      return { status: 200, body: { ok: true, applied: apply, rows: out } };
    }
    case "isams-tpl-list": {
      if (a.role !== "admin" && !trkAccess(systems(sql).find((s) => s.active), a).isams) return forbid();
      return { status: 200, body: { items: sql.exec(`SELECT cycle, name, term, at, length(data) AS size FROM isams_tpl ORDER BY at DESC`).toArray().map((r) => ({ cycle: String(r.cycle), name: String(r.name), term: String(r.term), at: Number(r.at), size: Number(r.size) })) } };
    }
    case "isams-tpl-save": {
      if (a.role !== "admin" || a.viewAs) return forbid();
      const cycle = str(input.cycle, 80), data = String(input.data || "");
      if (!cycle || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 1_500_000) return { status: 400, body: { error: "bad_file" } };
      sql.exec(`INSERT OR REPLACE INTO isams_tpl (cycle, name, term, data, at) VALUES (?, ?, ?, ?, ?)`, cycle, str(input.name, 160), TERMS.includes(String(input.term)) ? String(input.term) : "", data, Date.now());
      return { status: 200, body: { ok: true } };
    }
    case "isams-tpl-delete": {
      if (a.role !== "admin" || a.viewAs) return forbid();
      sql.exec(`DELETE FROM isams_tpl WHERE cycle=?`, str(input.cycle, 80)); return { status: 200, body: { ok: true } };
    }
    case "trk-isams": {
      // Data to fill an uploaded iSAMS template: per Primary class, Target / Effort / Attainment per student (+ iSAMS SchoolID).
      const sysP = systems(sql).find((s) => s.active); const acc = trkAccess(sysP, a);
      if (!acc.isams) return forbid("export_not_allowed");
      const t = sql.exec(`SELECT cycle, name, term, data FROM isams_tpl WHERE cycle=?`, str(input.cycle, 80)).toArray()[0];
      if (!t) return { status: 404, body: { error: "no_template" } };
      const tm = TERMS.includes(String(input.term)) ? String(input.term) : String(t.term || "");
      const classes: { cls: string; students: { id: string; first: string; last: string; name: string; isamsId: string; target: string; effort: string; grade: number | null }[] }[] = [];
      for (const { cl } of yearSystems(sql)) {
        const g = await grid(c, a, cl, tm); if (!g || !g.students.length) continue;
        classes.push({ cls: cl, students: g.students.map((st) => { const r = g.results.find((x) => x.id === st.id)!; return { id: st.id, first: st.first, last: st.last, name: st.name, isamsId: st.isamsId, target: st.target, effort: r.effort, grade: r.grade }; }) });
      }
      return { status: 200, body: { cycle: String(t.cycle), name: String(t.name), term: tm, data: String(t.data), classes, sys: sysP } };
    }
    case "trk-isams-ids": {
      if (a.role !== "admin" || a.viewAs) return forbid();
      let n = 0; for (const r of ((Array.isArray(input.items) ? input.items : []) as Json[]).slice(0, 2000)) { const id = str(r.id, 40), sid = str(r.schoolId, 30); if (id && /^\d{4,20}$/.test(sid)) { sql.exec(`UPDATE users SET isams_id=? WHERE id=? AND role='student'`, sid, id); n++; } }
      return { status: 200, body: { ok: true, saved: n } };
    }
    case "trk-summary": {
      // Department Report: tracker attainment grades & progress (vs Target, term to term) per Primary year group.
      const out: { system: string; years: { year: string; term: string; students: number; graded: number; thresholds: Record<string, number>; onTarget: number; close: number; below: number; up: number; same: number; down: number; avg: number | null; skills: Record<string, { avg: number; n: number }> }[] } = { system: "", years: [] };
      const ys = yearSystems(sql);
      out.system = [...new Set(ys.map(({ s }) => `${s.name} v${s.version}`))].join(", ");
      const want = str(input.year, 40);
      for (const { cl, s } of ys) {
        if (want && cl !== want) continue;
        let prev: Map<string, number | null> | null = null;
        for (const tm of TERMS) {
          const g = await grid(c, a, cl, tm); if (!g || !g.students.length) continue;
          const gr = new Map(g.results.map((r) => [r.id, r.grade] as const));
          const graded = g.results.filter((r) => r.grade != null);
          const th: Record<string, number> = {}; for (const t of s.thresholds) th[`${t}+`] = graded.filter((r) => (r.grade as number) >= t).length;
          let onT = 0, close = 0, below = 0, up = 0, same = 0, down = 0;
          for (const r of graded) {
            const st = g.students.find((x) => x.id === r.id)!; const tg = Number(st.target);
            if (st.target && Number.isFinite(tg)) { const d = (r.grade as number) - (capsFor(s, cl) ? tg - 1 : tg); if (d >= 0) onT++; else if (d === -1) close++; else below++; }
            const p = prev?.get(r.id); if (p != null) { if ((r.grade as number) > p) up++; else if ((r.grade as number) === p) same++; else down++; }
          }
          // Breakdown by the six UAE main skills (domains): mean SC score 0–3 over all scored cells of units linked to that skill.
          const sk: Record<string, { sum: number; n: number }> = {};
          for (const u of g.units) { const k = String(u.std?.skill || 0); if (k === "0") continue; for (const st of g.students) u.sc.forEach((_, i) => { const v = g.cells[`${st.id}|${u.id}|${i}`]?.v; if (v != null) { const x = sk[k] || { sum: 0, n: 0 }; x.sum += v; x.n++; sk[k] = x; } }); }
          const skills = Object.fromEntries(Object.entries(sk).map(([k, x]) => [k, { avg: x.sum / x.n, n: x.n }]));
          if (graded.length || g.units.length) out.years.push({ year: cl, term: tm, students: g.students.length, graded: graded.length, thresholds: th, onTarget: onT, close, below, up, same, down, avg: graded.length ? graded.reduce((x, r) => x + (r.grade as number), 0) / graded.length : null, skills });
          prev = gr;
        }
      }
      return { status: 200, body: out };
    }
  }
  return { status: 404, body: { error: "not_found" } };
}
