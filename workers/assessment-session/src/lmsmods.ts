/**
 * LMS modules: Attendance Register, Behaviour Management, Curriculum Management.
 * Runs inside the LMS Durable Object (same SQLite as users/points) via modHandle().
 *
 * Permissions (teacher perms strings, set in Admin → Teachers): att:view att:edit beh:view beh:edit cur:view cur:edit cur:delete (delete is a separate switch).
 * "edit" implies "view". Admin can always do everything. Teachers are limited to their own classes/sections (scope).
 * Students and parents never reach these actions (staff only).
 */
import type { Actor } from "./lms";

type Json = Record<string, unknown>;
type Reply = { status: number; body: unknown };
export type HwLite = { id: string; title: string; kind: string; cls: string; section: string; students: string[]; createdBy: string };
export type ModCtx = {
  sql: SqlStorage;
  hwList: () => HwLite[];
  inScope: (a: Actor, cls: string, section: string, sid?: string) => boolean;
  userRow: (where: string, arg: string) => Record<string, unknown> | undefined;
};

const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").trim().slice(0, max);
const rid = (p: string) => `${p}_${Date.now().toString(36)}${Array.from(crypto.getRandomValues(new Uint8Array(4)), (x) => x.toString(16).padStart(2, "0")).join("")}`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Today in the school's time zone (UTC+4). */
export const today = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const modCan = (a: Actor, m: "att" | "beh" | "cur", op: "view" | "edit" | "delete") =>
  a.role === "admin" || (a.role === "teacher" && (op === "delete" ? a.perms.includes(`${m}:delete`) : a.perms.includes(`${m}:edit`) || (op === "view" && (a.perms.includes(`${m}:view`) || a.perms.includes(`${m}:delete`)))));
export const BEH_CATS = {
  positive: ["Helpfulness", "Kindness", "Effort", "Leadership", "Respect", "Excellent work", "Improvement"],
  concern: ["Disruption", "Disrespect", "Bullying", "Lateness", "Uniform", "Homework not done", "Safety", "Phone / device", "Other"],
};
const STATUS = ["P", "A", "L", "E"];
const FOLLOW = ["none", "open", "in_progress", "done"];

export function initMods(sql: SqlStorage) {
  sql.exec(`CREATE TABLE IF NOT EXISTS att (id TEXT PRIMARY KEY, student TEXT, cls TEXT, section TEXT, day TEXT, period TEXT, status TEXT, note TEXT DEFAULT '', by TEXT, by_name TEXT, at INTEGER, alerted INTEGER DEFAULT 0, UNIQUE (student, day, period))`);
  sql.exec(`CREATE INDEX IF NOT EXISTS att_day ON att (day, cls)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS beh (id TEXT PRIMARY KEY, student TEXT, cls TEXT, section TEXT, day TEXT, kind TEXT, category TEXT, severity INTEGER DEFAULT 1, note TEXT DEFAULT '', action TEXT DEFAULT '', follow TEXT DEFAULT 'none', follow_note TEXT DEFAULT '', sensitive INTEGER DEFAULT 0, by TEXT, by_name TEXT, at INTEGER, updated INTEGER)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS beh_student ON beh (student, day)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS cur (id TEXT PRIMARY KEY, subject TEXT, yr TEXT, term TEXT, title TEXT, objectives TEXT DEFAULT '', lessons TEXT DEFAULT '[]', resources TEXT DEFAULT '[]', wk_from INTEGER DEFAULT 0, wk_to INTEGER DEFAULT 0, status TEXT DEFAULT 'planned', quiz TEXT DEFAULT '', page TEXT DEFAULT '', ord INTEGER DEFAULT 0, by_name TEXT, updated INTEGER)`);
  for (const col of ["links TEXT DEFAULT '[]'", "notes TEXT DEFAULT ''", "sc TEXT DEFAULT '[]'", "std TEXT DEFAULT '{}'"]) { try { sql.exec(`ALTER TABLE cur ADD COLUMN ${col}`); } catch { /* already there */ } }
}

type Link = { t: "hw" | "quiz"; id: string };
const parseLinks = (r: Record<string, unknown>): Link[] => {
  let l: Link[] = [];
  try { l = (JSON.parse(String(r.links || "[]")) as Link[]).filter((x) => x && (x.t === "hw" || x.t === "quiz") && x.id); } catch { /* ignore */ }
  const q = String(r.quiz || "");
  if (q && !l.some((x) => x.t === "quiz" && x.id === q)) l.unshift({ t: "quiz", id: q });
  return l;
};
/** Does this assignment row (qassign) reach the student? */
const qaReaches = (x: Record<string, unknown>, sid: string, cls: string, section: string) => {
  const st = JSON.parse(String(x.students || "[]")) as string[];
  return st.includes(sid) || (!st.length && !!x.cls && String(x.cls) === cls && (!x.section || String(x.section) === section));
};
const hwReaches = (h: HwLite, sid: string, cls: string, section: string) => h.students.includes(sid) || (h.cls ? h.cls === cls && (!h.section || h.section === section) : !h.students.length);
/** Titles/modes for links; for students only the ones actually assigned to them. */
function resolveLinks(c: ModCtx, links: Link[], student: Record<string, unknown> | null) {
  const hws = new Map(c.hwList().map((h) => [h.id, h] as const));
  const qas = c.sql.exec(`SELECT * FROM qassign ORDER BY created DESC`).toArray();
  const out: { t: string; id: string; title: string; mode?: string }[] = [];
  for (const l of links) {
    if (l.t === "hw") {
      const h = hws.get(l.id); if (!h) continue;
      if (student && !hwReaches(h, String(student.id), String(student.cls || ""), String(student.section || ""))) continue;
      out.push({ t: "hw", id: l.id, title: h.title });
    } else {
      const mine = qas.filter((x) => x.quiz === l.id);
      let mode = "individual", title = String(mine[0]?.title || "");
      if (student) {
        const hit = mine.find((x) => qaReaches(x, String(student.id), String(student.cls || ""), String(student.section || "")));
        if (!hit) continue;
        mode = String(hit.mode); title = String(hit.title || "");
      }
      if (!title && l.id.startsWith("tq_")) title = String(c.sql.exec(`SELECT title FROM tquiz WHERE id=?`, l.id).toArray()[0]?.title || "");
      out.push({ t: "quiz", id: l.id, title, mode });
    }
  }
  return out;
}

const setting = (c: ModCtx, k: string, d: number) => { const r = c.sql.exec(`SELECT v FROM settings WHERE k=?`, k).toArray()[0]; const n = Number(r?.v); return r && Number.isFinite(n) ? n : d; };
const attSettings = (c: ModCtx) => ({ windowDays: setting(c, "att:window", 7), low: setting(c, "att:low", 90) });

/** Active students the actor may see (admin: all). Optional class / section filter. */
function students(c: ModCtx, a: Actor, cls: string, section: string) {
  return c.sql.exec(`SELECT id, name, cls, section, email, avatar FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray()
    .filter((r) => (!cls || r.cls === cls) && (!section || r.section === section) && c.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id)));
}
const place = (c: ModCtx, sid: string): [string, string] | null => { const u = c.userRow("id=? AND role='student'", sid); return u ? [String(u.cls || ""), String(u.section || "")] : null; };
const forbid = (e = "forbidden"): Reply => ({ status: 403, body: { error: e } });

export async function modHandle(c: ModCtx, action: string, a: Actor, input: Json): Promise<Reply> {
  const sql = c.sql;
  if (a.role === "student" && (action === "cur-list" || action === "cur-for")) {
    // Students: read-only, own year group only, only linked work that is assigned to them.
    const me = c.userRow("id=?", a.id);
    if (!me) return forbid();
    const yr = String(me.cls || "");
    let rows = sql.exec(`SELECT * FROM cur WHERE yr=? ORDER BY subject, term, wk_from, ord, title`, yr).toArray();
    if (action === "cur-for") {
      const t = input.type === "hw" ? "hw" : "quiz", id = str(input.id, 80);
      rows = rows.filter((r) => parseLinks(r).some((l) => l.t === t && l.id === id));
      return { status: 200, body: { units: rows.map((r) => ({ id: String(r.id), title: String(r.title), yr: String(r.yr), term: String(r.term), subject: String(r.subject) })) } };
    }
    return { status: 200, body: { student: true, canEdit: false, canDelete: false, year: yr, items: rows.map((r) => ({ ...curRow(r), by: "", links: resolveLinks(c, parseLinks(r), me), notes: String(r.notes || "") })) } };
  }
  if (a.role !== "admin" && a.role !== "teacher") return forbid();
  switch (action) {
    // ---------------- Attendance ----------------
    case "att-roster": {
      if (!modCan(a, "att", "view")) return forbid();
      const cls = str(input.cls, 80), section = str(input.section, 80), day = DAY.test(String(input.day)) ? String(input.day) : today(), period = str(input.period, 12) || "Day";
      const st = students(c, a, cls, section);
      const marks = new Map(sql.exec(`SELECT * FROM att WHERE day=? AND period=?`, day, period).toArray().map((r) => [String(r.student), r]));
      const cfg = attSettings(c);
      const age = Math.floor((dayMs(today()) - dayMs(day)) / 864e5);
      const editable = modCan(a, "att", "edit") && day <= today() && (a.role === "admin" || age <= cfg.windowDays);
      const periods = sql.exec(`SELECT DISTINCT period FROM att WHERE day=? AND cls=?`, day, cls).toArray().map((r) => String(r.period));
      return { status: 200, body: { day, period, periods, editable, canEdit: modCan(a, "att", "edit"), settings: cfg, students: st.map((r) => { const m = marks.get(String(r.id)); return { id: String(r.id), name: String(r.name), cls: String(r.cls), section: String(r.section), status: m ? String(m.status) : "", note: m ? String(m.note || "") : "", by: m ? String(m.by_name || "") : "", alerted: !!m?.alerted, parentEmail: /@/.test(String(r.email || "")) }; }) } };
    }
    case "att-save": {
      if (a.viewAs || !modCan(a, "att", "edit")) return forbid();
      const day = String(input.day), period = str(input.period, 12) || "Day";
      if (!DAY.test(day) || day > today()) return { status: 400, body: { error: "bad_day" } };
      const cfg = attSettings(c);
      if (a.role !== "admin" && Math.floor((dayMs(today()) - dayMs(day)) / 864e5) > cfg.windowDays) return { status: 403, body: { error: "edit_window_closed" } };
      const marks = (Array.isArray(input.marks) ? input.marks : []).slice(0, 400) as Json[];
      let saved = 0, skipped = 0;
      const now = Date.now();
      for (const m of marks) {
        const sid = str(m.student, 40), status = String(m.status);
        const pl = place(c, sid);
        if (!pl || !STATUS.includes(status) || !c.inScope(a, pl[0], pl[1], sid)) { skipped++; continue; }
        sql.exec(`INSERT INTO att (id, student, cls, section, day, period, status, note, by, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(student, day, period) DO UPDATE SET status=excluded.status, note=excluded.note, by=excluded.by, by_name=excluded.by_name, at=excluded.at, cls=excluded.cls, section=excluded.section`, rid("at"), sid, pl[0], pl[1], day, period, status, str(m.note, 200), a.id, a.name, now);
        saved++;
      }
      return { status: 200, body: { ok: true, saved, skipped } };
    }
    case "att-clear": {
      if (a.viewAs || !modCan(a, "att", "edit")) return forbid();
      const sid = str(input.student, 40), day = String(input.day), period = str(input.period, 12) || "Day";
      const pl = place(c, sid);
      if (!pl || !c.inScope(a, pl[0], pl[1], sid)) return forbid("not_your_class");
      if (a.role !== "admin" && Math.floor((dayMs(today()) - dayMs(day)) / 864e5) > attSettings(c).windowDays) return forbid("edit_window_closed");
      sql.exec(`DELETE FROM att WHERE student=? AND day=? AND period=?`, sid, day, period);
      return { status: 200, body: { ok: true } };
    }
    case "att-report": {
      if (!modCan(a, "att", "view")) return forbid();
      const from = DAY.test(String(input.from)) ? String(input.from) : today().slice(0, 8) + "01", to = DAY.test(String(input.to)) ? String(input.to) : today();
      const cls = str(input.cls, 80), section = str(input.section, 80), one = str(input.student, 40);
      const allowed = new Map(students(c, a, cls, section).filter((r) => !one || r.id === one).map((r) => [String(r.id), r]));
      const rows = sql.exec(`SELECT * FROM att WHERE day>=? AND day<=? ORDER BY day, period`, from, to).toArray().filter((r) => allowed.has(String(r.student)));
      const per = new Map<string, { P: number; A: number; L: number; E: number }>();
      const daily = new Map<string, { P: number; A: number; L: number; E: number }>();
      for (const r of rows) {
        const s = String(r.status) as "P" | "A" | "L" | "E";
        const p = per.get(String(r.student)) || { P: 0, A: 0, L: 0, E: 0 }; p[s]++; per.set(String(r.student), p);
        const d = daily.get(String(r.day)) || { P: 0, A: 0, L: 0, E: 0 }; d[s]++; daily.set(String(r.day), d);
      }
      const cfg = attSettings(c);
      const out = [...allowed.values()].map((r) => {
        const p = per.get(String(r.id)) || { P: 0, A: 0, L: 0, E: 0 };
        const counted = p.P + p.L + p.A; // excused sessions don't count against the student
        const pct = counted ? Math.round(((p.P + p.L) / counted) * 1000) / 10 : null;
        return { id: String(r.id), name: String(r.name), cls: String(r.cls), section: String(r.section), ...p, total: p.P + p.A + p.L + p.E, pct, low: pct !== null && pct < cfg.low };
      });
      return { status: 200, body: { from, to, settings: cfg, students: out, daily: [...daily.entries()].map(([day, v]) => ({ day, ...v })), records: one ? rows.map((r) => ({ day: String(r.day), period: String(r.period), status: String(r.status), note: String(r.note || ""), by: String(r.by_name || "") })) : undefined } };
    }
    case "att-overview": {
      if (!modCan(a, "att", "view")) return forbid();
      const day = DAY.test(String(input.day)) ? String(input.day) : today();
      const st = students(c, a, "", "");
      const key = (r: Record<string, unknown>) => `${r.cls}|${r.section}`;
      const groups = new Map<string, { cls: string; section: string; students: number; P: number; A: number; L: number; E: number; marked: number; periods: Set<string>; by: Set<string> }>();
      for (const r of st) { const g = groups.get(key(r)) || { cls: String(r.cls), section: String(r.section), students: 0, P: 0, A: 0, L: 0, E: 0, marked: 0, periods: new Set(), by: new Set() }; g.students++; groups.set(key(r), g); }
      const ids = new Map(st.map((r) => [String(r.id), r]));
      const absent: { student: string; name: string; cls: string; section: string; status: string; note: string }[] = [];
      for (const r of sql.exec(`SELECT * FROM att WHERE day=?`, day).toArray()) {
        const u = ids.get(String(r.student)); if (!u) continue;
        const g = groups.get(key(u))!; g[String(r.status) as "P"]++; g.marked++; g.periods.add(String(r.period)); if (r.by_name) g.by.add(String(r.by_name));
        if (r.status === "A") absent.push({ student: String(u.id), name: String(u.name), cls: String(u.cls), section: String(u.section), status: "A", note: String(r.note || "") });
      }
      return { status: 200, body: { day, groups: [...groups.values()].map((g) => ({ ...g, periods: [...g.periods], by: [...g.by] })), absent } };
    }
    case "att-settings": {
      if (a.role !== "admin" || a.viewAs) return forbid();
      const w = Math.max(0, Math.min(365, Math.round(Number(input.windowDays)))), l = Math.max(1, Math.min(100, Math.round(Number(input.low))));
      if (!Number.isFinite(w) || !Number.isFinite(l)) return { status: 400, body: { error: "bad" } };
      for (const [k, v] of [["att:window", w], ["att:low", l]] as const) sql.exec(`INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, String(v));
      return { status: 200, body: { ok: true, settings: attSettings(c) } };
    }

    // ---------------- Behaviour ----------------
    case "beh-list": {
      if (!modCan(a, "beh", "view")) return forbid();
      const cls = str(input.cls, 80), section = str(input.section, 80), one = str(input.student, 40);
      const from = DAY.test(String(input.from)) ? String(input.from) : "0000-00-00", to = DAY.test(String(input.to)) ? String(input.to) : "9999-99-99";
      const kind = str(input.kind, 10), category = str(input.category, 40), follow = str(input.follow, 20), sev = Number(input.severity) || 0;
      const allowed = new Map(students(c, a, cls, section).filter((r) => !one || r.id === one).map((r) => [String(r.id), r]));
      const rows = sql.exec(`SELECT * FROM beh WHERE day>=? AND day<=? ORDER BY day DESC, at DESC LIMIT 6000`, from, to).toArray()
        .filter((r) => allowed.has(String(r.student)) && (!kind || r.kind === kind) && (!category || r.category === category) && (!follow || r.follow === follow) && (!sev || Number(r.severity) === sev));
      return { status: 200, body: { cats: BEH_CATS, canEdit: modCan(a, "beh", "edit"), items: rows.map((r) => beh(r, a, allowed.get(String(r.student))!)) } };
    }
    case "beh-save": {
      if (a.viewAs || !modCan(a, "beh", "edit")) return forbid();
      const sid = str(input.student, 40), pl = place(c, sid);
      if (!pl || !c.inScope(a, pl[0], pl[1], sid)) return forbid("not_your_class");
      const kind = input.kind === "positive" ? "positive" : "concern";
      const category = str(input.category, 40) || "Other";
      const day = DAY.test(String(input.day)) ? String(input.day) : today();
      if (day > today()) return { status: 400, body: { error: "bad_day" } };
      const severity = kind === "positive" ? 1 : Math.max(1, Math.min(3, Math.round(Number(input.severity)) || 1));
      const follow = FOLLOW.includes(String(input.follow)) ? String(input.follow) : kind === "concern" && severity >= 2 ? "open" : "none";
      const note = str(input.note, 1500), action2 = str(input.action, 600), followNote = str(input.followNote, 600), sens = input.sensitive ? 1 : 0;
      if (!note && !action2) return { status: 400, body: { error: "note_required" } };
      const now = Date.now();
      const id = str(input.id, 40);
      const ex = id ? sql.exec(`SELECT * FROM beh WHERE id=?`, id).toArray()[0] : undefined;
      if (ex) {
        const ep = place(c, String(ex.student));
        if (!ep || !c.inScope(a, ep[0], ep[1], String(ex.student))) return forbid("not_your_class");
        if (a.role !== "admin" && ex.sensitive && ex.by !== a.id) return forbid("sensitive");
        sql.exec(`UPDATE beh SET day=?, kind=?, category=?, severity=?, note=?, action=?, follow=?, follow_note=?, sensitive=?, updated=? WHERE id=?`, day, kind, category, severity, note, action2, follow, followNote, sens, now, id);
        return { status: 200, body: { ok: true, id } };
      }
      const nid = rid("bh");
      sql.exec(`INSERT INTO beh (id, student, cls, section, day, kind, category, severity, note, action, follow, follow_note, sensitive, by, by_name, at, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, nid, sid, pl[0], pl[1], day, kind, category, severity, note, action2, follow, followNote, sens, a.id, a.name, now, now);
      // Optional link to class points: +1 for a positive log, -1 for a concern.
      if (input.points === true) sql.exec(`INSERT INTO pts (id, student, cat, label, pts, icon, by, owner, batch, at) VALUES (?, ?, 'beh', ?, ?, ?, ?, ?, ?, ?)`, rid("pt"), sid, category, kind === "positive" ? 1 : -1, kind === "positive" ? "🌟" : "⚠️", a.name, a.id, rid("pb"), now);
      return { status: 200, body: { ok: true, id: nid } };
    }
    case "beh-follow": {
      if (a.viewAs || !modCan(a, "beh", "edit")) return forbid();
      const r = sql.exec(`SELECT * FROM beh WHERE id=?`, str(input.id, 40)).toArray()[0];
      if (!r) return { status: 404, body: { error: "not_found" } };
      const pl = place(c, String(r.student));
      if (!pl || !c.inScope(a, pl[0], pl[1], String(r.student))) return forbid("not_your_class");
      if (a.role !== "admin" && r.sensitive && r.by !== a.id) return forbid("sensitive");
      const follow = FOLLOW.includes(String(input.follow)) ? String(input.follow) : "open";
      sql.exec(`UPDATE beh SET follow=?, follow_note=COALESCE(NULLIF(?, ''), follow_note), updated=? WHERE id=?`, follow, str(input.followNote, 600), Date.now(), String(r.id));
      return { status: 200, body: { ok: true } };
    }
    case "beh-delete": {
      if (a.viewAs || !modCan(a, "beh", "edit")) return forbid();
      const r = sql.exec(`SELECT * FROM beh WHERE id=?`, str(input.id, 40)).toArray()[0];
      if (!r) return { status: 404, body: { error: "not_found" } };
      if (a.role !== "admin" && r.by !== a.id) return forbid("only_author");
      sql.exec(`DELETE FROM beh WHERE id=?`, String(r.id));
      return { status: 200, body: { ok: true } };
    }
    case "beh-points": {
      if (!modCan(a, "beh", "view")) return forbid();
      const sid = str(input.student, 40), pl = place(c, sid);
      if (!pl || !c.inScope(a, pl[0], pl[1], sid)) return forbid("not_your_class");
      const tot = Number(sql.exec(`SELECT COALESCE(SUM(pts),0) AS t FROM pts WHERE student=?`, sid).one().t);
      const recent = sql.exec(`SELECT label, pts, icon, by, at FROM pts WHERE student=? ORDER BY at DESC LIMIT 15`, sid).toArray().map((r) => ({ label: String(r.label), pts: Number(r.pts), icon: String(r.icon || ""), by: String(r.by), at: Number(r.at) }));
      const att = sql.exec(`SELECT status, COUNT(*) AS n FROM att WHERE student=? GROUP BY status`, sid).toArray().reduce((m, r) => ({ ...m, [String(r.status)]: Number(r.n) }), {} as Record<string, number>);
      return { status: 200, body: { total: tot, recent, attendance: modCan(a, "att", "view") ? att : null } };
    }

    // ---------------- Curriculum ----------------
    case "cur-list": {
      if (!modCan(a, "cur", "view")) return forbid();
      const me = a.role === "teacher" ? c.userRow("id=?", a.id) : undefined;
      const subs: string[] = me ? JSON.parse(String(me.subjects || "[]")) : [];
      const rows = sql.exec(`SELECT * FROM cur ORDER BY subject, yr, term, wk_from, ord, title`).toArray().filter((r) => curVisible(c, a, subs, String(r.yr), String(r.subject)));
      return { status: 200, body: { canEdit: modCan(a, "cur", "edit"), canDelete: modCan(a, "cur", "delete"), items: rows.map((r) => ({ ...curRow(r), links: resolveLinks(c, parseLinks(r), null) })) } };
    }
    case "cur-for": {
      if (!modCan(a, "cur", "view")) return { status: 200, body: { units: [] } };
      const me = a.role === "teacher" ? c.userRow("id=?", a.id) : undefined;
      const subs: string[] = me ? JSON.parse(String(me.subjects || "[]")) : [];
      const t = input.type === "hw" ? "hw" : "quiz", id = str(input.id, 80);
      const rows = sql.exec(`SELECT * FROM cur ORDER BY yr, term, wk_from`).toArray().filter((r) => curVisible(c, a, subs, String(r.yr), String(r.subject)) && parseLinks(r).some((l) => l.t === t && l.id === id));
      return { status: 200, body: { units: rows.map((r) => ({ id: String(r.id), title: String(r.title), yr: String(r.yr), term: String(r.term), subject: String(r.subject) })) } };
    }
    case "cur-link-options": {
      if (!modCan(a, "cur", "edit")) return forbid();
      const hw = c.hwList().filter((h) => a.role === "admin" || h.createdBy === a.id || a.perms.includes("viewAll")).map((h) => ({ id: h.id, title: h.title, kind: h.kind, cls: h.cls, section: h.section }));
      const quizzes = new Map<string, string>();
      for (const r of sql.exec(`SELECT quiz, title FROM qassign ORDER BY created DESC`).toArray()) if (!quizzes.has(String(r.quiz)) && (a.role === "admin" || String(r.quiz) && true)) quizzes.set(String(r.quiz), String(r.title || ""));
      const own = sql.exec(`SELECT id, title, owner FROM tquiz`).toArray().filter((r) => a.role === "admin" || r.owner === a.id);
      for (const r of own) quizzes.set(String(r.id), String(r.title));
      return { status: 200, body: { homework: hw, quizzes: [...quizzes].map(([id, title]) => ({ id, title })) } };
    }
    case "cur-save": {
      if (a.viewAs || !modCan(a, "cur", "edit")) return forbid();
      const me = a.role === "teacher" ? c.userRow("id=?", a.id) : undefined;
      const subs: string[] = me ? JSON.parse(String(me.subjects || "[]")) : [];
      const res = curUpsert(c, a, subs, input);
      return res.error ? { status: res.error === "not_allowed" ? 403 : 400, body: { error: res.error } } : { status: 200, body: { ok: true, id: res.id } };
    }
    case "cur-sc": {
      // Success Criteria only (used by the SC editor and bulk SOW import); other unit fields are untouched.
      if (a.viewAs || !modCan(a, "cur", "edit")) return forbid();
      const me = a.role === "teacher" ? c.userRow("id=?", a.id) : undefined;
      const subs: string[] = me ? JSON.parse(String(me.subjects || "[]")) : [];
      const r = sql.exec(`SELECT * FROM cur WHERE id=?`, str(input.id, 40)).toArray()[0];
      if (!r) return { status: 404, body: { error: "not_found" } };
      if (!curVisible(c, a, subs, String(r.yr), String(r.subject))) return forbid("not_allowed");
      const sc = cleanSc(input.sc);
      sql.exec(`UPDATE cur SET sc=?, updated=?, by_name=? WHERE id=?`, JSON.stringify(sc), Date.now(), a.name, String(r.id));
      return { status: 200, body: { ok: true, sc } };
    }
    case "cur-status": {
      if (a.viewAs || !modCan(a, "cur", "edit")) return forbid();
      const me = a.role === "teacher" ? c.userRow("id=?", a.id) : undefined;
      const subs: string[] = me ? JSON.parse(String(me.subjects || "[]")) : [];
      const r = sql.exec(`SELECT * FROM cur WHERE id=?`, str(input.id, 40)).toArray()[0];
      if (!r) return { status: 404, body: { error: "not_found" } };
      if (!curVisible(c, a, subs, String(r.yr), String(r.subject))) return forbid("not_allowed");
      const st = ["planned", "in_progress", "taught"].includes(String(input.status)) ? String(input.status) : "planned";
      sql.exec(`UPDATE cur SET status=?, updated=?, by_name=? WHERE id=?`, st, Date.now(), a.name, String(r.id));
      return { status: 200, body: { ok: true } };
    }
    case "cur-std": {
      // Standards & main skill only (other unit fields untouched). Same permission as editing the unit.
      if (a.viewAs || !modCan(a, "cur", "edit")) return forbid();
      const me = a.role === "teacher" ? c.userRow("id=?", a.id) : undefined;
      const subs: string[] = me ? JSON.parse(String(me.subjects || "[]")) : [];
      const r = sql.exec(`SELECT * FROM cur WHERE id=?`, str(input.id, 40)).toArray()[0];
      if (!r) return { status: 404, body: { error: "not_found" } };
      if (!curVisible(c, a, subs, String(r.yr), String(r.subject))) return forbid("not_allowed");
      const std = parseStd(input.std);
      sql.exec(`UPDATE cur SET std=?, updated=? WHERE id=?`, JSON.stringify(std), Date.now(), String(r.id));
      return { status: 200, body: { ok: true, std } };
    }
    case "cur-delete": {
      if (a.viewAs || !modCan(a, "cur", "delete")) return forbid();
      const me = a.role === "teacher" ? c.userRow("id=?", a.id) : undefined;
      const subs: string[] = me ? JSON.parse(String(me.subjects || "[]")) : [];
      const r = sql.exec(`SELECT * FROM cur WHERE id=?`, str(input.id, 40)).toArray()[0];
      if (!r) return { status: 404, body: { error: "not_found" } };
      if (!curVisible(c, a, subs, String(r.yr), String(r.subject))) return forbid("not_allowed");
      sql.exec(`DELETE FROM cur WHERE id=?`, String(r.id));
      return { status: 200, body: { ok: true } };
    }
    case "cur-import": {
      if (a.viewAs || !modCan(a, "cur", "edit")) return forbid();
      const me = a.role === "teacher" ? c.userRow("id=?", a.id) : undefined;
      const subs: string[] = me ? JSON.parse(String(me.subjects || "[]")) : [];
      const rows = (Array.isArray(input.rows) ? input.rows : []).slice(0, 1000) as Json[];
      let added = 0, updated = 0; const errors: { row: number; error: string }[] = [];
      for (const [i, r] of rows.entries()) {
        const ex = sql.exec(`SELECT id FROM cur WHERE subject=? AND yr=? AND term=? AND title=?`, str(r.subject, 60), str(r.yr, 60), str(r.term, 20), str(r.title, 160)).toArray()[0];
        const res = curUpsert(c, a, subs, { ...r, id: ex ? String(ex.id) : "" });
        if (res.error) errors.push({ row: i + 1, error: res.error }); else if (ex) updated++; else added++;
      }
      return { status: 200, body: { ok: true, added, updated, errors } };
    }
  }
  return { status: 404, body: { error: "not_found" } };
}

function beh(r: Record<string, unknown>, a: Actor, u: Record<string, unknown>) {
  const hidden = !!r.sensitive && a.role !== "admin" && r.by !== a.id; // sensitive notes: author + admin only
  return { id: String(r.id), student: String(r.student), name: String(u.name), cls: String(r.cls), section: String(r.section), day: String(r.day), kind: String(r.kind), category: String(r.category), severity: Number(r.severity), note: hidden ? "" : String(r.note), action: hidden ? "" : String(r.action), follow: String(r.follow), followNote: hidden ? "" : String(r.follow_note), sensitive: !!r.sensitive, restricted: hidden, by: String(r.by_name), mine: r.by === a.id, at: Number(r.at) };
}
function curVisible(c: ModCtx, a: Actor, subs: string[], yr: string, subject: string) {
  if (a.role === "admin") return true;
  if (a.scope?.length && !a.scope.some((x) => x.split("|")[0] === yr)) return false;
  if (subs.length && !subs.includes(subject)) return false;
  return true;
}
/** Success Criteria per unit: a plain list (one statement each, max 30 × 300 chars). */
function parseSc(v: unknown): string[] { try { const a = JSON.parse(String(v || "[]")); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } }
function cleanSc(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : String(v ?? "").split("\n");
  return arr.map((x) => String(x ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/^\s*(?:[-•*·▪]|\d+[.)])\s*/, "").trim().slice(0, 300)).filter(Boolean).slice(0, 30);
}
/** UAE Islamic Education standards linked to a unit: outcome codes (e.g. 1.2.1.1.G2) and one main skill (domain 1–6). */
export function parseStd(v: unknown): { codes: string[]; skill: number } {
  let o: { codes?: unknown; skill?: unknown } = {}; try { o = typeof v === "string" ? JSON.parse(v || "{}") : (v as object) || {}; } catch { o = {}; }
  const codes = Array.isArray(o.codes) ? [...new Set((o.codes as unknown[]).map((x) => String(x).trim()).filter((x) => /^[1-9]\.\d{1,2}\.\d{1,2}\.[1-6]\.(G\d{1,2}|K[12])$/.test(x)))].slice(0, 12) : [];
  const skill = Math.round(Number(o.skill)); return { codes, skill: skill >= 1 && skill <= 6 ? skill : 0 };
}
function curRow(r: Record<string, unknown>) {
  return { id: String(r.id), subject: String(r.subject), yr: String(r.yr), term: String(r.term), title: String(r.title), objectives: String(r.objectives || ""), sc: parseSc(r.sc), std: parseStd(r.std), lessons: JSON.parse(String(r.lessons || "[]")), resources: JSON.parse(String(r.resources || "[]")), wkFrom: Number(r.wk_from), wkTo: Number(r.wk_to), notes: String(r.notes || ""), status: String(r.status), quiz: String(r.quiz || ""), page: String(r.page || ""), ord: Number(r.ord), by: String(r.by_name || ""), updated: Number(r.updated) };
}
function curUpsert(c: ModCtx, a: Actor, subs: string[], input: Json): { id?: string; error?: string } {
  const subject = str(input.subject, 60), yr = str(input.yr, 60), term = str(input.term, 20) || "Term 1", title = str(input.title, 160);
  if (!subject || !yr || !title) return { error: "missing_fields" };
  const cat = c.sql.exec(`SELECT kind, name FROM catalog WHERE kind IN ('subject','class')`).toArray();
  const hasSub = cat.filter((x) => x.kind === "subject"), hasCls = cat.filter((x) => x.kind === "class");
  if (hasSub.length && !hasSub.some((x) => x.name === subject)) return { error: "unknown_subject" };
  if (hasCls.length && !hasCls.some((x) => x.name === yr)) return { error: "unknown_year" };
  if (!curVisible(c, a, subs, yr, subject)) return { error: "not_allowed" };
  const objectives = String(input.objectives ?? "").replace(/\r/g, "").slice(0, 4000);
  const lessons = (Array.isArray(input.lessons) ? input.lessons : []).slice(0, 60).map((l) => { const o = l as Json; return { title: str(o.title, 160), note: str(o.note, 400), done: !!o.done }; }).filter((l) => l.title);
  const resources = (Array.isArray(input.resources) ? input.resources : []).slice(0, 40).map((l) => { const o = l as Json; return { label: str(o.label, 120), url: str(o.url, 500) }; }).filter((l) => l.url && /^(https?:\/\/|\/)/i.test(l.url));
  const wf = Math.max(0, Math.min(60, Math.round(Number(input.wkFrom)) || 0)), wt = Math.max(wf, Math.min(60, Math.round(Number(input.wkTo)) || wf));
  const status = ["planned", "in_progress", "taught"].includes(String(input.status)) ? String(input.status) : "planned";
  const quiz = str(input.quiz, 80), page = str(input.page, 120);
  const id = str(input.id, 40);
  const now = Date.now();
  const prev = id ? c.sql.exec(`SELECT * FROM cur WHERE id=?`, id).toArray()[0] : undefined;
  let links: Link[] = prev ? parseLinks(prev) : quiz ? [{ t: "quiz", id: quiz }] : [];
  if (Array.isArray(input.links)) {
    const hws = new Map(c.hwList().map((h) => [h.id, h] as const));
    links = [];
    for (const raw of (input.links as Json[]).slice(0, 40)) {
      const t = raw.t === "hw" ? "hw" : raw.t === "quiz" ? "quiz" : "", lid = str(raw.id, 80);
      if (!t || !lid || links.some((x) => x.t === t && x.id === lid)) continue;
      if (t === "hw") { const h = hws.get(lid); if (!h) continue; if (a.role !== "admin" && h.createdBy !== a.id && !a.perms.includes("viewAll")) continue; }
      links.push({ t, id: lid });
    }
  } else if (quiz && !links.some((x) => x.t === "quiz" && x.id === quiz)) links.push({ t: "quiz", id: quiz });
  const quiz2 = links.find((x) => x.t === "quiz")?.id || "";
  const sc = JSON.stringify(input.sc === undefined ? parseSc(prev?.sc) : cleanSc(input.sc));
  const std = JSON.stringify(input.std === undefined ? parseStd(prev?.std) : parseStd(input.std));
  const notes = input.notes === undefined ? String(prev?.notes || "") : String(input.notes ?? "").replace(/\r/g, "").slice(0, 3000);
  if (prev) {
    c.sql.exec(`UPDATE cur SET subject=?, yr=?, term=?, title=?, objectives=?, lessons=?, resources=?, wk_from=?, wk_to=?, status=?, quiz=?, page=?, links=?, notes=?, sc=?, std=?, by_name=?, updated=? WHERE id=?`, subject, yr, term, title, objectives, JSON.stringify(lessons), JSON.stringify(resources), wf, wt, status, quiz2, page, JSON.stringify(links), notes, sc, std, a.name, now, id);
    return { id };
  }
  const nid = rid("cu");
  c.sql.exec(`INSERT INTO cur (id, subject, yr, term, title, objectives, lessons, resources, wk_from, wk_to, status, quiz, page, links, notes, sc, std, ord, by_name, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, nid, subject, yr, term, title, objectives, JSON.stringify(lessons), JSON.stringify(resources), wf, wt, status, quiz2, page, JSON.stringify(links), notes, sc, std, Number(input.ord) || 0, a.name, now);
  return { id: nid };
}
