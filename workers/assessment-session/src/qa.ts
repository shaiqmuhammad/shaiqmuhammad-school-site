/**
 * t336: Progress Check Quality Assurance (PC1 = Term 1, PC2 = Term 2, PC3 = Term 3) — EYFS & Primary only.
 * Every number is calculated from the Assessment Tracker grid (same Attainment Grade and the same "4+ / 5+ … % of graded
 * students" rule as the summary block at the bottom of the tracker). KHDA rating = admin-editable thresholds (settings "qa_khda").
 * Teachers: module permission "qa" (View / Add / Edit / Download), off by default; rows limited to their own classes & subjects.
 *   qa-get {filters} · qa-export {filters, kind} · qa-save {filters, data} · qa-khda-save {khda} (admin)
 */
import { mpOf } from "./modperm";
import type { Actor } from "./lms";
import { grid, yearSystems, TERMS, type TrkCtx } from "./tracker";

type Json = Record<string, unknown>;
type Reply = { status: number; body: unknown };
export type QaCtx = TrkCtx & { actorOf: (uid: string) => Actor | null; teachers: () => { id: string; name: string; subj: string[] }[]; subjects: () => string[]; notify: (uids: string[], data: Json) => void };
export const KHDA_LEVELS = ["Outstanding", "Very good", "Good", "Acceptable", "Weak", "Very weak"] as const;
export type KRule = { r: string; a: number; b: number };
export type Khda = { att: KRule[]; prog: KRule[]; note: string };
/** Defaults = the school's PC guidance table (4+ = expected, 5+ = above) mapped onto the KHDA six-point scale. */
const DEF: KRule[] = [{ r: "Outstanding", a: 75, b: 75 }, { r: "Very good", a: 75, b: 61 }, { r: "Good", a: 75, b: 50 }, { r: "Acceptable", a: 75, b: 0 }, { r: "Weak", a: 50, b: 0 }, { r: "Very weak", a: 0, b: 0 }];
type Sql = TrkCtx["sql"];
const n01 = (v: unknown, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : d; };
const clean = (raw: unknown): KRule[] => KHDA_LEVELS.map((r, i) => { const x = (Array.isArray(raw) ? raw : []).find((y: Json) => y && y.r === r) as Json | undefined; return { r, a: n01(x?.a, DEF[i].a), b: n01(x?.b, DEF[i].b) }; });
export function khdaCfg(sql: Sql): Khda {
  let v: Json = {}; try { v = JSON.parse(String(sql.exec(`SELECT v FROM settings WHERE k='qa_khda'`).toArray()[0]?.v || "{}")); } catch { /* defaults */ }
  return { att: clean(v.att), prog: clean(v.prog), note: String(v.note || "") };
}
/** First rule (best first) whose two minimums are met. */
export const rate = (pa: number | null, pb: number | null, rules: KRule[]) => (pa == null ? "" : (rules.find((x) => pa >= x.a - 1e-9 && (pb ?? 0) >= x.b - 1e-9) || rules[rules.length - 1]).r);
export const phaseOf = (cls: string) => (/^(fs|eyfs|kg)/i.test(cls) ? "EYFS" : (() => { const n = Number((cls.match(/\d+/) || [""])[0]); return !n ? "" : n <= 2 ? "EYFS" : n <= 6 ? "Primary" : "Secondary"; })());
export const deptOf = (subj: string) => subj.replace(/\s*[–-]?\s*\b[AB]$/u, "").trim() || subj;
const str = (v: unknown, m: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, m);
const txt = (v: unknown, m = 4000) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").slice(0, m);
/** A teacher's subjects: from their groups, else from their profile. */
const subjOfActor = (a: Actor) => (a.subj?.length ? a.subj : ((a as Actor & { subjects?: string[] }).subjects || []));
const forbid = (e = "forbidden"): Reply => ({ status: 403, body: { error: e } });
const F_KEYS = ["pc", "phase", "dept", "subject", "year", "section", "teacher"] as const;
type Filters = Record<(typeof F_KEYS)[number], string>;

export function qaInit(sql: Sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS qa_rep (k TEXT PRIMARY KEY, filters TEXT, data TEXT, by_id TEXT, by_name TEXT, at INTEGER, created INTEGER)`);
}
type Row = { key: string; label: string; year: string; section: string; subject: string; students: number; graded: number; n: Record<string, number>; pct: Record<string, number | null>; rating: string;
  withTarget: number; onTarget: number; above: number; pExp: number | null; pAbove: number | null; progRating: string; up: number; same: number; down: number; prevGraded: number };

async function build(c: QaCtx, a: Actor, f: Filters) {
  const sql = c.sql; const kh = khdaCfg(sql);
  const term = TERMS[Number(f.pc) - 1] || TERMS[0];
  const who = a.role === "admin" ? (f.teacher ? c.actorOf(f.teacher) : a) : a;
  if (!who) return null;
  const ys = yearSystems(sql).filter(({ cl }) => ["EYFS", "Primary"].includes(phaseOf(cl)) && (!f.phase || phaseOf(cl) === f.phase) && (!f.year || cl === f.year));
  const allSubj = c.subjects();
  const mine = who.role === "admin" ? allSubj : subjOfActor(who);
  const subs = f.subject ? [f.subject] : f.dept ? mine.filter((x) => deptOf(x) === f.dept) : [""];
  const rows: Row[] = []; const sections = new Set<string>(); const years = new Set<string>(); let thresholds: number[] = [4, 5];
  for (const subject of subs) for (const { cl, s } of ys) {
    thresholds = s.thresholds?.length ? s.thresholds : thresholds;
    const g = await grid(c, who, cl, term, "", subject); if (!g || !g.students.length) continue;
    years.add(cl);
    const gp = Number(f.pc) > 1 ? await grid(c, who, cl, TERMS[Number(f.pc) - 2], "", subject) : null;
    const prev = new Map((gp?.results || []).map((r) => [r.id, r.grade] as const));
    const st = new Map(g.students.map((x) => [x.id, x] as const));
    for (const x of g.students) sections.add(x.section);
    const groups = f.year ? [...new Set(g.students.map((x) => x.section))].sort().filter((x) => !f.section || x === f.section) : [""];
    for (const sec of groups) {
      const res = g.results.filter((r) => !sec || st.get(r.id)?.section === sec).filter((r) => !f.section || st.get(r.id)?.section === f.section);
      if (!res.length) continue;
      const graded = res.filter((r) => r.grade != null);
      const n: Record<string, number> = {}, pct: Record<string, number | null> = {};
      for (const t of g.sys.thresholds) { n[`${t}+`] = graded.filter((r) => (r.grade as number) >= t).length; pct[`${t}+`] = graded.length ? (n[`${t}+`] / graded.length) * 100 : null; }
      let wt = 0, on = 0, ab = 0, up = 0, same = 0, down = 0, pg = 0;
      for (const r of graded) {
        const t = Number(st.get(r.id)?.target); const caps = g.sys.capTarget && !(g.sys.capExempt || []).includes(cl);
        if (st.get(r.id)?.target && Number.isFinite(t)) { wt++; const d = (r.grade as number) - (caps ? t - 1 : t); if (d >= 0) on++; if (d >= 1) ab++; }
        const p = prev.get(r.id); if (p != null) { pg++; if ((r.grade as number) > p) up++; else if ((r.grade as number) === p) same++; else down++; }
      }
      const k1 = `${thresholds[0]}+`, k2 = `${thresholds[1] ?? thresholds[0]}+`;
      const pExp = wt ? (on / wt) * 100 : null, pAbove = wt ? (ab / wt) * 100 : null;
      rows.push({ key: [subject, cl, sec].join("|"), label: sec || (/^Year \d+$/.test(cl) ? cl.slice(5) : cl), year: cl, section: sec, subject: g.subject || subject || String((g as { curSubject?: string }).curSubject || g.sys.scope.subject || ""), students: res.length, graded: graded.length, n, pct,
        rating: rate(pct[k1], pct[k2], kh.att), withTarget: wt, onTarget: on, above: ab, pExp, pAbove, progRating: rate(pExp, pAbove, kh.prog), up, same, down, prevGraded: pg });
    }
  }
  // Whole selection row (sum of the rows above, same rule).
  const T = rows.reduce((t, r) => { t.students += r.students; t.graded += r.graded; t.wt += r.withTarget; t.on += r.onTarget; t.ab += r.above; for (const k of Object.keys(r.n)) t.n[k] = (t.n[k] || 0) + r.n[k]; return t; }, { students: 0, graded: 0, wt: 0, on: 0, ab: 0, n: {} as Record<string, number> });
  const k1 = `${thresholds[0]}+`, k2 = `${thresholds[1] ?? thresholds[0]}+`;
  const tp = (k: string) => (T.graded ? ((T.n[k] || 0) / T.graded) * 100 : null);
  const total = rows.length ? { students: T.students, graded: T.graded, n: T.n, pct: Object.fromEntries(Object.keys(T.n).map((k) => [k, tp(k)])), rating: rate(tp(k1), tp(k2), kh.att), pExp: T.wt ? (T.on / T.wt) * 100 : null, pAbove: T.wt ? (T.ab / T.wt) * 100 : null, progRating: rate(T.wt ? (T.on / T.wt) * 100 : null, T.wt ? (T.ab / T.wt) * 100 : null, kh.prog) } : null;
  const scopeYears = yearSystems(sql).map(({ cl }) => cl).filter((cl) => ["EYFS", "Primary"].includes(phaseOf(cl)));
  const options = { pcs: [1, 2, 3], phases: ["EYFS", "Primary"], depts: [...new Set(mine.map(deptOf))].sort(), subjects: mine.filter((x) => !f.dept || deptOf(x) === f.dept).sort(),
    years: scopeYears.filter((cl) => !f.phase || phaseOf(cl) === f.phase), sections: f.year ? [...sections].filter(Boolean).sort() : [],
    teachers: a.role === "admin" ? c.teachers().map((t) => ({ id: t.id, name: t.name })) : [{ id: a.id, name: a.name }] };
  return { term, khda: kh, thresholds: [k1, k2], rows, total, options, staff: who.role === "admin" ? "" : who.name, years: [...years] };
}

const normF = (raw: unknown, a: Actor): Filters => {
  const x = (raw && typeof raw === "object" ? raw : {}) as Json;
  const f = Object.fromEntries(F_KEYS.map((k) => [k, str(x[k], 80)])) as Filters;
  if (!["1", "2", "3"].includes(f.pc)) f.pc = "1";
  if (!["EYFS", "Primary", ""].includes(f.phase)) f.phase = "";
  if (a.role !== "admin") f.teacher = a.id; // a teacher only ever sees / writes their own QA
  return f;
};
const keyOf = (f: Filters) => F_KEYS.map((k) => f[k]).join("~");

export async function qaHandle(c: QaCtx, a: Actor, action: string, input: Json): Promise<Reply> {
  const sql = c.sql; qaInit(sql);
  if (a.role !== "admin" && a.role !== "teacher") return forbid();
  const acc = mpOf(sql as never, a, "qa");
  if (!acc.view) return forbid("module_hidden");
  if (action === "qa-khda-save") {
    if (a.role !== "admin" || a.viewAs) return forbid("admin_only");
    const k = (input.khda || {}) as Json;
    const v = { att: clean(k.att), prog: clean(k.prog), note: txt(k.note, 400) };
    sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('qa_khda', ?)`, JSON.stringify(v));
    return { status: 200, body: { ok: true, khda: v } };
  }
  const f = normF(input.filters, a);
  if (a.role !== "admin" && f.subject && !subjOfActor(a).includes(f.subject)) return forbid("not_your_subject");
  const k = keyOf(f);
  const prev = sql.exec(`SELECT * FROM qa_rep WHERE k=?`, k).toArray()[0];
  if (action === "qa-save") {
    if (a.viewAs) return forbid("read_only");
    if (prev ? !acc.edit : !acc.add) return forbid(prev ? "edit_not_allowed" : "add_not_allowed");
    const d = (input.data || {}) as Json;
    const ovr: Record<string, { a?: number | null; b?: number | null; note: string; by: string; at: number }> = {};
    for (const [rk, v] of Object.entries((d.ovr || {}) as Record<string, Json>).slice(0, 80)) { const x = v || {}; const na = x.a === "" || x.a == null ? null : n01(x.a, 0), nb = x.b === "" || x.b == null ? null : n01(x.b, 0); if (na != null || nb != null) ovr[str(rk, 200)] = { a: na, b: nb, note: txt(x.note, 300), by: str(x.by, 80) || a.name || "Admin", at: Number(x.at) || Date.now() }; }
    const notes: Record<string, string> = {}; for (const [rk, v] of Object.entries((d.rowNotes || {}) as Json).slice(0, 80)) if (txt(v, 600).trim()) notes[str(rk, 200)] = txt(v, 600);
    const data = { staff: str(d.staff, 120), date: str(d.date, 40), strengths: txt(d.strengths), afd: txt(d.afd), actions: txt(d.actions), comment: txt(d.comment), rowNotes: notes, ovr };
    sql.exec(`INSERT OR REPLACE INTO qa_rep (k, filters, data, by_id, by_name, at, created) VALUES (?, ?, ?, ?, ?, ?, ?)`, k, JSON.stringify(f), JSON.stringify(data), a.id, a.name || "Admin", Date.now(), Number(prev?.created) || Date.now());
    // Push "qa_ready" (admin switch off by default; per-user switch): the teacher the report is about, never the author.
    const to = [f.teacher].filter((x) => x && x !== a.id);
    if (to.length) c.notify(to, { by: a.name || "Admin", title: `Progress Check ${f.pc} QA${f.subject ? ` · ${f.subject}` : ""}` });
    return { status: 200, body: { ok: true, updated: !!prev } };
  }
  if (action === "qa-get" || action === "qa-export") {
    if (action === "qa-export" && !acc.dl) return forbid("export_not_allowed");
    const b = await build(c, a, f); if (!b) return { status: 404, body: { error: "teacher_not_found" } };
    let data: Json = {}; try { data = JSON.parse(String(prev?.data || "{}")); } catch { /* */ }
    return { status: 200, body: { filters: f, ...b, report: prev ? { ...data, by: String(prev.by_name), at: Number(prev.at) } : null, access: { view: acc.view, add: acc.add, edit: acc.edit, dl: acc.dl, admin: a.role === "admin" } } };
  }
  return { status: 404, body: { error: "not_found" } };
}
