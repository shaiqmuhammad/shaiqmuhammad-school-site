/**
 * t315/t316: Lesson Packs ("Learning Material" module). A pack is a deck of white slides with elements
 * (text, picture, drawing, audio, YouTube, activity, Quran passage). Types:
 *   material → shown in the students' Learning Libraries;
 *   homework → published as a general homework row (data.pack) so it flows through the Homework tabs/review;
 *   quran    → published as a Quran homework row (surah/verses from the pack's Quran slide) + the slides.
 * Students keep their own layer per slide in lpwork (draw, type, record, picture) and hand in with sub-save.
 * Permissions: module "lp" in modperm (show/view/add/edit/delete) — global → role → subject → per teacher; admin always full.
 */
type Json = Record<string, unknown>;
type Sql = { exec: (q: string, ...b: unknown[]) => { toArray: () => Record<string, unknown>[]; one: () => Record<string, unknown> } };
type Actor = { id: string; role: string; name: string; cls: string; perms: string[]; scope?: string[]; viewAs?: boolean; subj?: string[] };
type Reply = { status: number; body: unknown };
type Acc = { show: boolean; view: boolean; add: boolean; edit: boolean; delete: boolean };
export type PackCtx = {
  sql: Sql;
  acc: (a: Actor) => Acc;
  hwSave: (a: Actor, input: Json) => Promise<Reply>;
  hwDelete: (a: Actor, id: string) => Promise<Reply>;
  notify: (uids: string[], kind: string, data: Json) => void;
  sectionOf: (uid: string) => string;
  subOf: (hw: string, student: string) => { status: string; comments: { at: number }[]; submittedAt?: number } | null;
  hwRow: (id: string) => { id: string; due: number | null } | undefined;
  inScopeIds: (a: Actor, ids: string[]) => boolean;
};
const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").slice(0, max);
const rid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
const forbid = (e = "forbidden"): Reply => ({ status: 403, body: { error: e } });
const TYPES = ["material", "homework", "quran"];
const num = (v: unknown, lo: number, hi: number, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const color = (v: unknown) => (/^#[0-9a-f]{3,8}$/i.test(String(v || "")) ? String(v) : "");
const FONTS = ["Nunito", "Arial", "Georgia", "Times New Roman", "Courier New", "Comic Sans MS", "Amiri", "Tajawal", "Verdana"];
const MEDIA = /^lpm_[a-z0-9_]{6,40}$/i;
const YT = /^[A-Za-z0-9_-]{6,20}$/;

/** Element sanitiser — positions in % of a 16:9 slide. */
function el(e: Json, student = false): Json | null {
  const t = String(e.t || "");
  const base = { id: str(e.id, 30) || rid("e"), t, x: num(e.x, -20, 100), y: num(e.y, -20, 100), w: num(e.w, 1, 120, 30), h: num(e.h, 1, 120, 10), by: student ? "s" : "t" };
  if (t === "text") return { ...base, text: str(e.text, 4000), color: color(e.color) || "#1b2f44", bg: color(e.bg), font: FONTS.includes(String(e.font)) ? String(e.font) : "Nunito", size: num(e.size, 8, 160, 28), bold: e.bold === true, italic: e.italic === true, align: ["start", "center", "end"].includes(String(e.align)) ? String(e.align) : "start" };
  if (t === "img") return MEDIA.test(String(e.src)) ? { ...base, src: String(e.src) } : null;
  if (t === "audio") return MEDIA.test(String(e.src)) ? { ...base, src: String(e.src) } : null;
  if (t === "draw") {
    const paths = (Array.isArray(e.paths) ? (e.paths as Json[]) : []).slice(0, 400).map((p) => ({ c: color(p.c) || "#1b2f44", w: num(p.w, 0.1, 10, 0.4), d: (Array.isArray(p.d) ? (p.d as unknown[]) : []).slice(0, 2000).map((n) => Math.round(num(n, -10, 110) * 10) / 10) }));
    return { ...base, x: 0, y: 0, w: 100, h: 100, paths };
  }
  if (student) return null; // students can't add videos, activities or Quran blocks
  if (t === "yt") return YT.test(String(e.vid)) ? { ...base, vid: String(e.vid), title: str(e.title, 160) } : null;
  if (t === "act") { const code = str(e.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""); const quiz = str(e.quiz, 80).replace(/[^a-z0-9-]/gi, ""); return code || quiz ? { ...base, code, quiz, label: str(e.label, 160) } : null; }
  if (t === "quran") { const surah = Math.trunc(num(e.surah, 1, 114, 1)), from = Math.trunc(num(e.from, 1, 286, 1)); return { ...base, surah, from, to: Math.max(from, Math.trunc(num(e.to, 1, 286, from))), reciter: str(e.reciter, 60) || "Alafasy_128kbps", memorise: e.memorise === true }; }
  return null;
}
function slides(v: unknown, student = false): Json[] {
  return (Array.isArray(v) ? (v as Json[]) : []).slice(0, 60).map((s) => ({ id: str(s?.id, 30) || rid("s"), bg: color(s?.bg) || "#ffffff", els: (Array.isArray(s?.els) ? (s.els as Json[]) : []).slice(0, 80).map((e) => el(e, student)).filter(Boolean) }));
}
export function packInit(sql: Sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS lpack (id TEXT PRIMARY KEY, owner TEXT, owner_name TEXT, title TEXT, type TEXT, subject TEXT DEFAULT '', aud TEXT DEFAULT '[]', students TEXT DEFAULT '[]', topic TEXT DEFAULT '{}', slides TEXT DEFAULT '[]', mode TEXT DEFAULT 'self', assign_at INTEGER DEFAULT 0, due INTEGER DEFAULT 0, status TEXT DEFAULT 'draft', hw TEXT DEFAULT '', live INTEGER DEFAULT -1, tpl INTEGER DEFAULT 0, notified INTEGER DEFAULT 0, due_notified INTEGER DEFAULT 0, created INTEGER, updated INTEGER)`);
  sql.exec(`CREATE TABLE IF NOT EXISTS lpwork (pack TEXT, student TEXT, slides TEXT DEFAULT '[]', seen TEXT DEFAULT '[]', updated INTEGER, PRIMARY KEY (pack, student))`);
}
const row = (r: Record<string, unknown>, full = true) => ({
  id: String(r.id), owner: String(r.owner), ownerName: String(r.owner_name || ""), title: String(r.title), type: String(r.type), subject: String(r.subject || ""),
  aud: JSON.parse(String(r.aud || "[]")), students: JSON.parse(String(r.students || "[]")), topic: JSON.parse(String(r.topic || "{}")), mode: String(r.mode || "self"),
  assignAt: Number(r.assign_at || 0), due: Number(r.due || 0), status: String(r.status), hw: String(r.hw || ""), live: Number(r.live ?? -1), tpl: !!Number(r.tpl || 0), created: Number(r.created), updated: Number(r.updated),
  ...(full ? { slides: JSON.parse(String(r.slides || "[]")) } : { count: (JSON.parse(String(r.slides || "[]")) as unknown[]).length }),
});
const mine = (a: Actor, r: Record<string, unknown>) => a.role === "admin" || String(r.owner) === a.id;
const forStudent = (a: Actor, r: Record<string, unknown>) => String(r.status) === "published" && Number(r.assign_at || 0) <= Date.now() && (JSON.parse(String(r.students || "[]")) as string[]).includes(a.id);

/** Lazy scheduler (runs at most once a minute from any request): release scheduled packs and send due-soon reminders. */
let lastSweep = 0;
export function packSweep(c: PackCtx) {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const r of c.sql.exec(`SELECT * FROM lpack WHERE status='published' AND notified=0 AND assign_at<=?`, now).toArray()) {
    c.sql.exec(`UPDATE lpack SET notified=1 WHERE id=?`, String(r.id));
    c.notify(JSON.parse(String(r.students || "[]")), "lp_new", { title: String(r.title), by: String(r.owner_name || ""), ...(r.hw ? { hw: String(r.hw) } : {}) });
  }
  for (const r of c.sql.exec(`SELECT * FROM lpack WHERE status='published' AND type!='material' AND due_notified=0 AND due>? AND due<?`, now, now + 24 * 3600e3).toArray()) {
    c.sql.exec(`UPDATE lpack SET due_notified=1 WHERE id=?`, String(r.id));
    const left = (JSON.parse(String(r.students || "[]")) as string[]).filter((s) => { const sb = r.hw ? c.subOf(String(r.hw), s) : null; return !sb || sb.status === "draft" || sb.status === "returned"; });
    if (left.length && Number(r.assign_at || 0) <= now) c.notify(left, "lp_due", { title: String(r.title), ...(r.hw ? { hw: String(r.hw) } : {}) });
  }
}

export async function packHandle(c: PackCtx, a: Actor, action: string, input: Json): Promise<Reply> {
  const { sql } = c;
  packSweep(c);
  const staff = a.role === "admin" || a.role === "teacher";
  const acc = staff ? c.acc(a) : { show: true, view: true, add: false, edit: false, delete: false };
  const id = str(input.id, 40);
  const get = () => (id ? sql.exec(`SELECT * FROM lpack WHERE id=?`, id).toArray()[0] : undefined);
  switch (action) {
    case "lp-access": return { status: 200, body: { acc, staff } };
    case "lp-list": {
      if (!staff) {
        // Students: Learning Material (libraries) and any pack homework they were given.
        const items = sql.exec(`SELECT * FROM lpack WHERE status='published' ORDER BY assign_at DESC, updated DESC`).toArray().filter((r) => forStudent(a, r)).map((r) => row(r, false));
        return { status: 200, body: { items } };
      }
      if (!acc.view) return forbid("module_hidden");
      const items = sql.exec(`SELECT * FROM lpack ORDER BY updated DESC LIMIT 400`).toArray().filter((r) => mine(a, r) || Number(r.tpl)).map((r) => row(r, false));
      return { status: 200, body: { items, acc } };
    }
    case "lp-get": {
      const r = get();
      if (!r) return { status: 404, body: { error: "not_found" } };
      if (staff) { if (!acc.view || !(mine(a, r) || Number(r.tpl))) return forbid(); }
      else if (!forStudent(a, r)) return { status: 404, body: { error: "not_found" } };
      const out = row(r);
      if (!staff) {
        const w = sql.exec(`SELECT * FROM lpwork WHERE pack=? AND student=?`, String(r.id), a.id).toArray()[0];
        return { status: 200, body: { pack: out, work: w ? JSON.parse(String(w.slides || "[]")) : [], sub: r.hw ? c.subOf(String(r.hw), a.id) : null } };
      }
      return { status: 200, body: { pack: out, acc } };
    }
    case "lp-save": {
      if (!staff || a.viewAs) return forbid();
      const old = get();
      if (old ? !acc.edit || !mine(a, old) : !acc.add) return forbid(old ? "lp_edit_not_allowed" : "lp_add_not_allowed");
      const title = str(input.title, 160).trim();
      if (!title) return { status: 400, body: { error: "title" } };
      const type = TYPES.includes(String(input.type)) ? String(input.type) : "material";
      const sl = slides(input.slides);
      const blob = JSON.stringify(sl);
      if (blob.length > 900_000) return { status: 413, body: { error: "too_large" } };
      const topic = (input.topic && typeof input.topic === "object" ? input.topic : {}) as Json;
      const tp = { cur: str(topic.cur, 40), title: str(topic.title, 200), yr: str(topic.yr, 60), term: str(topic.term, 20), std: (Array.isArray(topic.std) ? topic.std : []).slice(0, 30).map((x) => str(x, 40)) };
      const aud = (Array.isArray(input.aud) ? input.aud : []).slice(0, 40).map((x) => str(x, 80));
      const students = [...new Set((Array.isArray(input.students) ? input.students : []).map((x) => str(x, 40)).filter(Boolean))].slice(0, 800);
      if (a.role === "teacher" && students.length && !c.inScopeIds(a, students)) return forbid("out_of_scope");
      const vals = [title, type, str(input.subject, 80), JSON.stringify(aud), JSON.stringify(students), JSON.stringify(tp), blob, input.mode === "live" ? "live" : "self", Math.max(0, Number(input.assignAt) || 0), Math.max(0, Number(input.due) || 0), input.tpl === true ? 1 : 0, Date.now()];
      if (old) {
        sql.exec(`UPDATE lpack SET title=?, type=?, subject=?, aud=?, students=?, topic=?, slides=?, mode=?, assign_at=?, due=?, tpl=?, updated=? WHERE id=?`, ...vals, String(old.id));
        if (String(old.status) === "published") { const rr = await publish(c, a, String(old.id)); if (rr.status !== 200) return rr; }
        return { status: 200, body: { ok: true, pack: row(get()!) } };
      }
      const nid = rid("lp");
      sql.exec(`INSERT INTO lpack (id, owner, owner_name, title, type, subject, aud, students, topic, slides, mode, assign_at, due, tpl, updated, created, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`, nid, a.id, a.name, ...vals, Date.now());
      return { status: 200, body: { ok: true, pack: row(sql.exec(`SELECT * FROM lpack WHERE id=?`, nid).toArray()[0]) } };
    }
    case "lp-publish": {
      if (!staff || a.viewAs) return forbid();
      const r = get();
      if (!r || !mine(a, r)) return { status: 404, body: { error: "not_found" } };
      if (!acc.edit && !acc.add) return forbid("lp_edit_not_allowed");
      if (input.off === true) { if (r.hw) await c.hwDelete(a, String(r.hw)); sql.exec(`UPDATE lpack SET status='draft', hw='', notified=0, due_notified=0 WHERE id=?`, id); return { status: 200, body: { ok: true, pack: row(get()!) } }; }
      if (!(JSON.parse(String(r.students || "[]")) as unknown[]).length) return { status: 400, body: { error: "no_students" } };
      sql.exec(`UPDATE lpack SET status='published' WHERE id=?`, id);
      const rr = await publish(c, a, id);
      if (rr.status !== 200) { sql.exec(`UPDATE lpack SET status='draft' WHERE id=?`, id); return rr; }
      lastSweep = 0; packSweep(c);
      return { status: 200, body: { ok: true, pack: row(get()!) } };
    }
    case "lp-dup": {
      if (!staff || a.viewAs || !acc.add) return forbid("lp_add_not_allowed");
      const r = get();
      if (!r || !(mine(a, r) || Number(r.tpl))) return { status: 404, body: { error: "not_found" } };
      const nid = rid("lp");
      sql.exec(`INSERT INTO lpack (id, owner, owner_name, title, type, subject, aud, students, topic, slides, mode, assign_at, due, tpl, status, created, updated) VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, 0, 0, 0, 'draft', ?, ?)`, nid, a.id, a.name, `${String(r.title)} (copy)`.slice(0, 160), String(r.type), String(r.subject || ""), String(r.topic || "{}"), String(r.slides || "[]"), String(r.mode || "self"), Date.now(), Date.now());
      return { status: 200, body: { ok: true, id: nid } };
    }
    case "lp-delete": {
      if (!staff || a.viewAs) return forbid();
      const r = get();
      if (!r || !mine(a, r)) return { status: 404, body: { error: "not_found" } };
      if (!acc.delete) return forbid("lp_delete_not_allowed");
      if (r.hw) await c.hwDelete(a, String(r.hw));
      sql.exec(`DELETE FROM lpack WHERE id=?`, id); sql.exec(`DELETE FROM lpwork WHERE pack=?`, id);
      return { status: 200, body: { ok: true } };
    }
    case "lp-live": {
      // Live mode: the teacher drives the slide; students follow (they poll lp-get).
      if (!staff) { const r = get(); if (!r || !forStudent(a, r)) return { status: 404, body: { error: "not_found" } }; return { status: 200, body: { live: Number(r.live ?? -1) } }; }
      const r = get();
      if (!r || !mine(a, r)) return { status: 404, body: { error: "not_found" } };
      sql.exec(`UPDATE lpack SET live=? WHERE id=?`, input.off === true ? -1 : Math.trunc(num(input.slide, 0, 59)), id);
      return { status: 200, body: { ok: true } };
    }
    case "lp-work-save": {
      if (a.role !== "student") return forbid("students_only");
      const r = get();
      if (!r || !forStudent(a, r)) return { status: 404, body: { error: "not_found" } };
      if (r.hw) {
        const sb = c.subOf(String(r.hw), a.id);
        if (sb?.status === "approved") return { status: 409, body: { error: "already_approved" } };
        if (sb?.status === "submitted" && !sb.comments.some((x) => Number(x.at || 0) > Number(sb.submittedAt || 0))) return { status: 409, body: { error: "already_submitted" } };
      }
      const sl = slides(input.slides, true);
      const blob = JSON.stringify(sl);
      if (blob.length > 600_000) return { status: 413, body: { error: "too_large" } };
      const seen = JSON.stringify((Array.isArray(input.seen) ? input.seen : []).slice(0, 60).map((x) => Math.trunc(num(x, 0, 59))));
      sql.exec(`INSERT INTO lpwork (pack, student, slides, seen, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(pack, student) DO UPDATE SET slides=excluded.slides, seen=excluded.seen, updated=excluded.updated`, id, a.id, blob, seen, Date.now());
      return { status: 200, body: { ok: true } };
    }
    case "lp-work": {
      // Teacher: one student's copy (review) or the progress of everyone.
      if (!staff) return forbid();
      const r = get();
      if (!r || !mine(a, r) || !acc.view) return { status: 404, body: { error: "not_found" } };
      const total = (JSON.parse(String(r.slides || "[]")) as unknown[]).length;
      if (input.student) { const w = sql.exec(`SELECT * FROM lpwork WHERE pack=? AND student=?`, id, str(input.student, 40)).toArray()[0]; return { status: 200, body: { pack: row(r), work: w ? JSON.parse(String(w.slides || "[]")) : [] } }; }
      const rows = sql.exec(`SELECT student, seen, updated FROM lpwork WHERE pack=?`, id).toArray();
      const prog = (JSON.parse(String(r.students || "[]")) as string[]).map((s) => { const w = rows.find((x) => x.student === s); const sb = r.hw ? c.subOf(String(r.hw), s) : null; return { student: s, seen: w ? (JSON.parse(String(w.seen || "[]")) as unknown[]).length : 0, total, updated: w ? Number(w.updated) : 0, status: sb?.status || (w ? "started" : "not_started") }; });
      return { status: 200, body: { progress: prog } };
    }
  }
  return { status: 404, body: { error: "unknown_action" } };
}

/** (Re)publish: homework / quran packs keep one homework row in step (title, students, due, Quran passage). */
async function publish(c: PackCtx, a: Actor, id: string): Promise<Reply> {
  const r = c.sql.exec(`SELECT * FROM lpack WHERE id=?`, id).toArray()[0];
  if (!r) return { status: 404, body: { error: "not_found" } };
  const type = String(r.type);
  if (type === "material") { if (r.hw) { await c.hwDelete(a, String(r.hw)); c.sql.exec(`UPDATE lpack SET hw='' WHERE id=?`, id); } return { status: 200, body: { ok: true } }; }
  const sl = JSON.parse(String(r.slides || "[]")) as { els: Json[] }[];
  const q = sl.flatMap((s) => s.els).find((e) => e.t === "quran");
  if (type === "quran" && !q) return { status: 400, body: { error: "lp_needs_quran_slide" } };
  const students = JSON.parse(String(r.students || "[]")) as string[];
  const assignAt = Number(r.assign_at || 0);
  const data = type === "quran" ? { surah: q!.surah, from: q!.from, to: q!.to, reciter: q!.reciter, memorise: q!.memorise === true, notes: "", pack: id, assignAt } : { slides: [], question: "", pack: id, assignAt };
  const rr = await c.hwSave(a, { id: String(r.hw || "") || undefined, kind: type === "quran" ? "quran" : "general", title: String(r.title), cls: "", section: "", students, due: Number(r.due || 0) || null, data, quiet: true });
  if (rr.status !== 200) return rr;
  const hw = String((rr.body as { id?: string }).id || r.hw || "");
  c.sql.exec(`UPDATE lpack SET hw=? WHERE id=?`, hw, id);
  return { status: 200, body: { ok: true } };
}
