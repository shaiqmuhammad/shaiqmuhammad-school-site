import { loadCat, catPhases, rulePhase, ruleDept } from "./catx";
/**
 * LMS phase 1: student/teacher accounts (username + PIN), homework (Quran + general), review, tracker.
 *
 * One Durable Object ("main") with SQLite. PINs are stored as PBKDF2-SHA256 hashes (100k rounds, random salt).
 * Students/teachers get a signed 30-day token (HMAC with SESSION_SIGNING_KEY, sub "user"); the admin uses the
 * existing admin token. Files (recordings) go through ./storage.ts, which is disabled until R2 is bound.
 *
 *   POST /api/lms/login            {username, pin} -> {token, exp, user}
 *   GET  /api/lms/me               (user)            -> {user}
 *   GET  /api/lms/dashboard        (user)            -> student: {homework[], tracker[]} · teacher: {homework[], classes[]}
 *   GET  /api/lms/users            (admin | teacher+manageUsers)
 *   POST /api/lms/users            {users:[{id?, username, name, role, cls, perms, pin?, disabled?}]} -> {saved, pins:[{username,pin}]}
 *   POST /api/lms/user-delete      {id}
 *   POST /api/lms/users-status     {ids, disabled} bulk Activate/Block (blocked users get "blocked" at login)
 *   POST /api/lms/user-pin         {id, pin?} -> {pin}
 *   POST /api/lms/hw-save          (admin | teacher+assign) {id?, kind, title, cls, students?, due?, data}
 *   POST /api/lms/hw-delete        {id}
 *   GET  /api/lms/hw?id=           homework + my submission (student) or all submissions (staff)
 *   POST /api/lms/sub-save         (student) {hw, text, practised, submit}
 *   POST /api/lms/sub-review       (admin | teacher+review) {id, comment?, like?, status?: approved|returned}
 *   GET  /api/lms/export           (staff) everything as JSON (the site builds the ZIP)
 *   POST /api/lms/upload           501 until file storage (R2) is configured
 *   GET  /api/lms/catalog          (any user) subjects, classes, sections
 *   POST /api/lms/catalog-save     (admin) {kind: subject|class|section, id?, name, parent?}  (renames propagate)
 *   POST /api/lms/catalog-delete   (admin) {id}  (refused while in use)
 *   POST /api/lms/pins-view        (admin only) {ids?} -> {pins: {id: pin|null}}
 *   POST /api/lms/audio-upload?hw= (student: recitation/answer for that homework, replaces the previous one)
 *        /api/lms/audio-upload?sub= (teacher/admin: spoken feedback on a submission) — raw audio body, ≤1.6 MB
 *   GET  /api/lms/audio?id=        the recording (student owner or staff)
 *   POST /api/lms/audio-delete     {id}
 *   GET  /api/lms/notes            {items, unread} · POST /api/lms/notes-read {ids?} (none = all)
 *
 * PINs: the PBKDF2 hash is what login checks. A copy is also kept AES-GCM encrypted with the LMS_PIN_KEY secret
 * (32 random bytes, base64) so the admin can look a PIN up. Users created before that show "reset to view".
 */
import { makeVapid, sendPush, type Vapid } from "./push";
import { textReplaceAll } from "./textfix";
import { scoreFromPct, systems, trackerHandle, trkInit } from "./tracker";
import { qaHandle } from "./qa";
import { MP_PERM, mpAll, mpCfg, mpOf, mpSave } from "./modperm";
import { buildFeedback, fromGrade, overallOf, parseScores, type Scores } from "./quranScore";
import { DurableObject } from "cloudflare:workers";
import { corsHeaders, reply, verifyToken, type AdminEnv } from "./admin";
import { fetchParentReplies, sendAuto, sendParentMail, type MailEnv } from "./mail/mailbox";
import { ttFor, ttRows, ttSE, ttShared, ttTimes } from "./lmsmods";
import { pageHandle, pagesInit } from "./lpages";
import { initMods, modHandle, pubQuizzes, tquizTopics, today as modToday } from "./lmsmods";
import { reportHandle } from "./reports";
import { packHandle, packInit, packSweep, type PackCtx } from "./packs";
import { renderEmail, renderText } from "./mail/template";
import { blobStore, sqliteChunkStore, type BlobStore, type StorageEnv } from "./storage";

export interface LmsEnv extends AdminEnv, StorageEnv, MailEnv {
  LMS: DurableObjectNamespace<LmsStore>;
  /** base64 of 32 random bytes; enables admin PIN viewing. */
  LMS_PIN_KEY?: string;
}

type Json = Record<string, unknown>;
/** Actions allowed in admin read-only "view as" mode. */
const VIEW_AS_READ = new Set(["my-assess", "dl-policy", "dl-grant", "dashboard", "hw", "progress", "quran-map", "leaderboard", "notes", "catalog", "me", "ann-list", "msg-threads", "msg-thread", "msg-contacts", "assess-list", "cur-list", "cur-for", "tquiz-get", "tquiz-list", "class-roster", "pcat-list", "pts-list", "grp-list", "report-log"]);

/** Which LMS notifications also go out by email (when the user has an email and mail is configured). */
const EMAIL_KINDS: Record<string, [string, string]> = {
  hw_new: ["New homework", "You have new homework: {title}."],
  graded: ["Your Quran homework was graded", "{title} was graded by {by}."],
  feedback: ["New feedback from your teacher", "{by} left feedback on {title}."],
  feedback_audio: ["Voice feedback from your teacher", "{by} sent voice feedback on {title}."],
  returned: ["Please try again", "{title} was returned — please practise and submit it again."],
  sub_new: ["New submission", "{student} handed in {title}."],
  reminder: ["Homework reminder", "{title} is due soon."],
};
type Reply = { status: number; body: unknown };
export type Role = "student" | "teacher" | "parent";
export type Actor = { id: string; role: Role | "admin"; name: string; cls: string; perms: string[]; scope?: string[]; stu?: string[]; viewAs?: boolean; subj?: string[]; nameAr?: string };
/** A student's subjects ("Islamic A, Islamic B" → ["Islamic A", "Islamic B"]). */
export const subjList = (v: unknown) => String(v || "").split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
type CatKind = "phase" | "dept" | "subject" | "class" | "section";

const TOKEN_DAYS = 3650; // effectively "until you log out" (sliding renewal on visits); logout, block or PIN reset end it
const MAX_USERS = 3000;
const MAX_HW = 2000;
const FAIL_WINDOW = 15 * 60_000;
const PERMS = ["assign", "review", "manageUsers", "viewAll", "staff", "shareCorrect", "viewAsStudent"] as const;
const STU_OPS = ["view", "add", "edit", "block", "delete"] as const;
const STU_PERM = /^stu:(view|add|edit|block|delete|none)$/;
/** Cartoon avatar code: stored reroll, else derived from id + gender (gender itself never leaves the server for non-admins). */
const AV_N = 24;
function avatarOf(r: Record<string, unknown>): string {
  const g = r.gender === "b" || r.gender === "g" ? String(r.gender) : "n";
  const av = String(r.avatar || "");
  // t305: uploaded profile photo (teachers only since t329 — students always get a character).
  if (av.startsWith("data:image/") && r.role !== "student") return av;
  if (/^a\d{1,2}$/.test(av) && Number(av.slice(1)) < AV_N) return av; // t329: animal characters, for everyone
  if (/^[bgn]\d{1,2}$/.test(av) && av[0] === g && Number(av.slice(1)) < AV_N) return av;
  let h = 7; for (const c of String(r.id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${g}${h % 12}`;
}
/** t302: push text per notification kind ({field} filled from the notification data). New kinds appear in the switches automatically. */
const PUSH_TEXT: Record<string, [string, string]> = {
  child_progress: ["Child progress update", "{child}: {title} — {grade}"],
  qa_ready: ["QA report ready / updated", "{by}: {title}"],
  hw_new: ["New homework", "{title}"], sub_new: ["Homework submitted", "{student}: {title}"], graded: ["Homework graded", "{title}"], approved: ["Homework approved", "{title}"],
  returned: ["Please try again", "{title}"], feedback: ["Teacher feedback", "{title}"], feedback_audio: ["Voice feedback", "{title}"], mistakes: ["Mistakes marked", "{title}"],
  message: ["New message", "{by}: {title}"], announcement: ["Announcement", "{title}"], reminder: ["Homework reminder", "{title}"], revise: ["Time to revise", "{title}"], test: ["Test notification", "Push notifications are working ✅"],
  lesson: ["Lesson in {mins} min", "{subject} · {cls} at {time}"],
  tt_shared: ["Timetable shared", "{by}: {title}"],
  hw_shared: ["Homework shared with you", "{by}: {title}"],
  lp_new: ["New learning material", "{by}: {title}"], lp_due: ["Due soon", "{title} is due within 24 hours"], lp_feedback: ["Teacher feedback on your slides", "{title}"],
};
const DEFAULT_CATS: [string, number, string][] = [["Helping", 1, "🤝"], ["Teamwork", 1, "👥"], ["Recitation", 1, "📖"], ["Respect", 1, "🌟"], ["Hard work", 1, "💪"], ["Off-task", -1, "💤"], ["Disrespect", -1, "⚠️"]];
/** Spaced revision after a pass: 1, 3, 7, 14, 30, then every 60 days. */
const REVISION_DAYS = [1, 3, 7, 14, 30, 60];
const MAX_AUDIO = 1_600_000; // ~3 min at 24 kbps + container overhead, with headroom
const USER_AUDIO_CAP = 30_000_000;
const TOTAL_AUDIO_CAP = 1_500_000_000;
const AUDIO_TYPES = /^audio\/(webm|mp4|ogg|aac|mpeg|x-m4a)(;.*)?$/;
const enc = new TextEncoder();

const str = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
/** Target from a scaled score (only for students without a Target): 67–80→2, 81–93→3, 94–109→4, 110–120→5, 121+→6. */
export const targetFromScaled = (v: string): string => { const n = Number(v); if (!v || !Number.isFinite(n) || n < 67) return ""; return n <= 80 ? "2" : n <= 93 ? "3" : n <= 109 ? "4" : n <= 120 ? "5" : "6"; };
const wallText = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
const rid = (p: string) => `${p}_${Date.now().toString(36)}${hex(crypto.getRandomValues(new Uint8Array(5)))}`;
export const normUser = (s: unknown) => str(s, 40).toLowerCase().replace(/[^a-z0-9._-]/g, "");

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function hmac(key: string, data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
async function hashPin(pin: string, salt: Uint8Array): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 }, k, 256));
}
function newPin(): string {
  const b = crypto.getRandomValues(new Uint32Array(1))[0] % 900000;
  return String(100000 + b);
}
// Any letters, numbers and symbols (4–64 characters); older numeric PINs keep working unchanged.
const validPin = (p: string) => [...p].length >= 4 && [...p].length <= 64;

async function pinKey(env: LmsEnv) {
  if (!env.LMS_PIN_KEY) return null;
  try {
    const raw = Uint8Array.from(atob(env.LMS_PIN_KEY), (c) => c.charCodeAt(0));
    return raw.length === 32 ? await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]) : null;
  } catch {
    return null;
  }
}
async function sealPin(env: LmsEnv, pin: string): Promise<string | null> {
  const k = await pinKey(env);
  if (!k) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return `${b64url(iv)}.${b64url(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(pin))))}`;
}
async function openPin(env: LmsEnv, sealed: unknown): Promise<string | null> {
  const k = sealed ? await pinKey(env) : null;
  if (!k) return null;
  try {
    const [iv, ct] = String(sealed).split(".");
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, k, fromB64url(ct)));
  } catch {
    return null;
  }
}
const strList = (v: unknown, max = 40) => (Array.isArray(v) ? v.map((x) => str(x, 81)).filter(Boolean).slice(0, max) : []);

export async function issueUserToken(env: AdminEnv, uid: string, pv = "") {
  const exp = Date.now() + TOKEN_DAYS * 864e5;
  const payload = b64url(enc.encode(JSON.stringify({ sub: "user", uid, exp, pv })));
  return { token: `${payload}.${b64url(await hmac(env.SESSION_SIGNING_KEY!, payload))}`, exp };
}
async function verifyUserToken(env: AdminEnv, header: string | null): Promise<string | null> { return (await verifyUserTokenPv(env, header))?.uid ?? null; }
/** Verified token: the user id plus the PIN stamp it was issued with (a changed PIN invalidates older tokens). */
async function verifyUserTokenPv(env: AdminEnv, header: string | null): Promise<{ uid: string; pv: string } | null> {
  if (!env.SESSION_SIGNING_KEY || !header?.startsWith("Bearer ")) return null;
  const [payload, sig] = header.slice(7).trim().split(".");
  if (!payload || !sig || !safeEqual(sig, b64url(await hmac(env.SESSION_SIGNING_KEY, payload)))) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { sub?: string; uid?: string; exp?: number; pv?: string };
    return d.sub === "user" && d.uid && d.exp && d.exp > Date.now() ? { uid: d.uid, pv: d.pv || "" } : null;
  } catch {
    return null;
  }
}

const can = (a: Actor, perm: (typeof PERMS)[number]) => a.role === "admin" || (a.role === "teacher" && a.perms.includes(perm));
/** Student-account switches (own classes only is enforced separately via inScope). Legacy "Manage students" without any stu:* switch keeps full access. */
const stuCan = (a: Actor, op: (typeof STU_OPS)[number]) => {
  if (a.role === "admin") return true;
  if (a.role !== "teacher" || !a.perms.includes("manageUsers")) return false;
  const has = a.perms.filter((p) => STU_PERM.test(p));
  return has.length === 0 ? true : has.includes(`stu:${op}`);
};
/** Download switches. Everything stays allowed until the admin turns a switch off. Teachers: "nodl:audio" / "nodl:export" in perms. Students: global setting + optional per-class override. Parents: none. */
type DlKind = "audio" | "export";
type DlCfg = { qr?: boolean; students?: Partial<Record<DlKind, boolean>>; classes?: Record<string, Partial<Record<DlKind, boolean>>> };

/** Quran Homework module switches. Teachers without an explicit set (no "qhw:set") keep full legacy access; admin always has everything. */
const qhwOf = (a: Actor) => {
  if (a.role === "admin") return { set: true, show: true, view: true, add: true, edit: true, del: true };
  if (a.role !== "teacher") return { set: true, show: false, view: false, add: false, edit: false, del: false };
  if (!a.perms.includes("qhw:set")) return { set: false, show: true, view: true, add: true, edit: true, del: true };
  const has = (x: string) => a.perms.includes(`qhw:${x}`);
  const show = has("show");
  const view = show && (has("view") || has("add") || has("edit") || has("delete"));
  return { set: true, show, view, add: show && has("add"), edit: show && has("edit"), del: show && has("delete") };
};
const PASS = Symbol("parent-pass");
const isStaff = (a: Actor) => a.role === "admin" || a.role === "teacher";

export class LmsStore extends DurableObject<LmsEnv> {
  private sql: SqlStorage;
  private files: BlobStore;
  constructor(ctx: DurableObjectState, env: LmsEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Recordings: R2 when bound, else chunked inside this Durable Object's SQLite.
    this.files = env.FILES ? blobStore(env) : sqliteChunkStore(this.sql);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, cls TEXT, salt TEXT, hash TEXT, perms TEXT, disabled INTEGER DEFAULT 0, created INTEGER, last_login INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS homework (id TEXT PRIMARY KEY, kind TEXT, title TEXT, cls TEXT, students TEXT, data TEXT, due INTEGER, created_by TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS push_sub (endpoint TEXT PRIMARY KEY, uid TEXT, p256dh TEXT, auth TEXT, ua TEXT, at INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS push_pref (uid TEXT, kind TEXT, off INTEGER, PRIMARY KEY (uid, kind))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS push_kind (kind TEXT PRIMARY KEY, first INTEGER, admin_off INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS subs (id TEXT PRIMARY KEY, hw TEXT, student TEXT, status TEXT, text TEXT, practised INTEGER DEFAULT 0, liked INTEGER DEFAULT 0, comments TEXT DEFAULT '[]', updated INTEGER, UNIQUE (hw, student))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tracker (id TEXT PRIMARY KEY, student TEXT, surah INTEGER, from_ayah INTEGER, to_ayah INTEGER, hw TEXT UNIQUE, approved INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS fails (k TEXT, t INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, owner TEXT, sub TEXT, kind TEXT, mime TEXT, size INTEGER, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, uid TEXT, kind TEXT, data TEXT, created INTEGER, read INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS notes_uid ON notes (uid, created)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, kind TEXT, name TEXT, parent TEXT DEFAULT '', ord INTEGER DEFAULT 0)`);
    initMods(this.sql);
    packInit(this.sql as never);
    pagesInit(this.sql as never);
    const cols = (t: string) => new Set(this.sql.exec(`PRAGMA table_info(${t})`).toArray().map((r) => String(r.name)));
    const uc = cols("users");
    for (const [c, def] of [["section", "TEXT DEFAULT ''"], ["subjects", "TEXT DEFAULT '[]'"], ["scope", "TEXT DEFAULT '[]'"], ["pin_enc", "TEXT"], ["qr_token", "TEXT"]] as const) if (!uc.has(c)) this.sql.exec(`ALTER TABLE users ADD COLUMN ${c} ${def}`);
    if (!cols("subs").has("audio")) this.sql.exec(`ALTER TABLE subs ADD COLUMN audio TEXT DEFAULT ''`);
    // Quran traffic-light grade (green/yellow = passed, red = practise again) + every graded attempt kept.
    if (!cols("subs").has("grade")) this.sql.exec(`ALTER TABLE subs ADD COLUMN grade TEXT DEFAULT ''`);
    if (!cols("subs").has("attempts")) this.sql.exec(`ALTER TABLE subs ADD COLUMN attempts TEXT DEFAULT '[]'`);
    if (!cols("tracker").has("grade")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN grade TEXT DEFAULT 'green'`);
    // Phase 2: activity days (streaks), revision tracking, settings, parent links, mistake notes.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS activity (student TEXT, day TEXT, PRIMARY KEY (student, day))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS unlocks (hw TEXT, student TEXT, PRIMARY KEY (hw, student))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS qr (token TEXT PRIMARY KEY, hw TEXT, student TEXT, created INTEGER)`);
    // t328: Quran QR codes are permanent and per student + Surah (old per-homework tokens keep working and resolve to the same page).
    if (!cols("qr").has("surah")) this.sql.exec(`ALTER TABLE qr ADD COLUMN surah INTEGER DEFAULT 0`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS viewlog (id TEXT PRIMARY KEY, uid TEXT, name TEXT, role TEXT, at INTEGER)`);
    if (!cols("viewlog").has("by")) this.sql.exec(`ALTER TABLE viewlog ADD COLUMN by TEXT DEFAULT 'Admin'`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, name TEXT, email TEXT, subject TEXT, message TEXT, created INTEGER, read INTEGER DEFAULT 0, emailed INTEGER DEFAULT 0, ip TEXT)`);
    if (!cols("users").has("parent_token")) this.sql.exec(`ALTER TABLE users ADD COLUMN parent_token TEXT DEFAULT ''`);
    if (!cols("users").has("parent_name")) this.sql.exec(`ALTER TABLE users ADD COLUMN parent_name TEXT DEFAULT ''`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS vlikes (vid TEXT, who TEXT, at INTEGER, PRIMARY KEY (vid, who))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS vcomments (id TEXT PRIMARY KEY, vid TEXT, who TEXT, name TEXT, role TEXT, body TEXT, created INTEGER, status TEXT, iph TEXT)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS plink (parent TEXT, student TEXT, PRIMARY KEY (parent, student))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pthreads (thread TEXT PRIMARY KEY, student TEXT, teacher TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pmsg (id TEXT PRIMARY KEY, thread TEXT, student TEXT, teacher TEXT, dir TEXT, subject TEXT, body TEXT, created INTEGER, msgid TEXT, read INTEGER DEFAULT 0)`);
    if (!cols("users").has("email")) this.sql.exec(`ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''`);
    if (!cols("subs").has("mistakes")) this.sql.exec(`ALTER TABLE subs ADD COLUMN mistakes TEXT DEFAULT '[]'`);
    if (!cols("subs").has("submitted_at")) this.sql.exec(`ALTER TABLE subs ADD COLUMN submitted_at INTEGER DEFAULT 0`);
    // Old schema had hw UNIQUE, so one student's approval overwrote another's on class homework: one row per (hw, student).
    const tsql = String(this.sql.exec(`SELECT sql FROM sqlite_master WHERE name='tracker'`).toArray()[0]?.sql || "");
    if (tsql.includes("hw TEXT UNIQUE")) {
      this.sql.exec(`CREATE TABLE tracker_new (id TEXT PRIMARY KEY, student TEXT, surah INTEGER, from_ayah INTEGER, to_ayah INTEGER, hw TEXT, approved INTEGER, grade TEXT DEFAULT 'green', UNIQUE (hw, student))`);
      this.sql.exec(`INSERT OR IGNORE INTO tracker_new SELECT id, student, surah, from_ayah, to_ayah, hw, approved, grade FROM tracker`);
      this.sql.exec(`DROP TABLE tracker`);
      this.sql.exec(`ALTER TABLE tracker_new RENAME TO tracker`);
    }
    // Three-criteria Quran scores (Makharij / Tajweed / Recitation). Older colour grades are backfilled as equal levels.
    if (!cols("subs").has("scores")) this.sql.exec(`ALTER TABLE subs ADD COLUMN scores TEXT DEFAULT ''`);
    if (!cols("tracker").has("scores")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN scores TEXT DEFAULT ''`);
    for (const tb of ["subs", "tracker"] as const) {
      for (const r of this.sql.exec(`SELECT id, grade FROM ${tb} WHERE (scores IS NULL OR scores='') AND grade IN ('green','yellow','red')`).toArray()) {
        const sc = fromGrade(String(r.grade))!;
        this.sql.exec(`UPDATE ${tb} SET scores=? WHERE id=?`, JSON.stringify({ ...sc, fb: buildFeedback(sc) }), String(r.id));
      }
    }
    // Targeted announcements (admin → students / teachers / a class or section) and 1:1 messages.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS ann (id TEXT PRIMARY KEY, title TEXT, body TEXT, aud TEXT, cls TEXT DEFAULT '', section TEXT DEFAULT '', by TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS msgs (id TEXT PRIMARY KEY, thread TEXT, sender TEXT, recipient TEXT, body TEXT, created INTEGER, read INTEGER DEFAULT 0)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS msgs_thread ON msgs (thread, created)`);
    if (!cols("users").has("gender")) this.sql.exec(`ALTER TABLE users ADD COLUMN gender TEXT DEFAULT ''`);
    for (const c of ["subject", "phase", "first_name", "last_name", "dob", "phone", "semail", "nationality", "pref_lang", "sen", "eal", "gt", "target", "scaled", "isams_id", "isams_surname", "name_ar"]) if (!cols("users").has(c)) this.sql.exec(`ALTER TABLE users ADD COLUMN ${c} TEXT DEFAULT ''`);
    // Split existing display names into first / last once.
    for (const r of this.sql.exec(`SELECT id, name FROM users WHERE role='student' AND (first_name IS NULL OR first_name='')`).toArray()) {
      const parts = String(r.name || "").trim().split(/\s+/);
      this.sql.exec(`UPDATE users SET first_name=?, last_name=? WHERE id=?`, parts[0] || "", parts.slice(1).join(" "), String(r.id));
    }
    if (!cols("users").has("last_seen")) this.sql.exec(`ALTER TABLE users ADD COLUMN last_seen INTEGER DEFAULT 0`);
    if (!cols("users").has("avatar")) this.sql.exec(`ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''`);
    // t329: students may not use photos — keep a copy (reversible), switch them to their character.
    if (!cols("users").has("avatar_photo_bak")) this.sql.exec(`ALTER TABLE users ADD COLUMN avatar_photo_bak TEXT DEFAULT ''`);
    this.sql.exec(`UPDATE users SET avatar_photo_bak=avatar, avatar='' WHERE role='student' AND avatar LIKE 'data:image/%'`);
    // Points (ClassDojo-style), custom groups, parent report tokens + send log.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pcat (id TEXT PRIMARY KEY, owner TEXT, label TEXT, pts INTEGER, icon TEXT, pos INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS pts (id TEXT PRIMARY KEY, student TEXT, cat TEXT, label TEXT, pts INTEGER, icon TEXT, by TEXT, owner TEXT, batch TEXT, at INTEGER)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS pts_student ON pts(student, at)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wall (id TEXT PRIMARY KEY, wkey TEXT, by TEXT, name TEXT, text TEXT, image TEXT, audio TEXT, pinned INTEGER DEFAULT 0, at INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wcom (id TEXT PRIMARY KEY, post TEXT, by TEXT, name TEXT, role TEXT, text TEXT, at INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wlike (post TEXT, by TEXT, PRIMARY KEY (post, by))`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS alive (code TEXT PRIMARY KEY, type TEXT, title TEXT, owner TEXT, owner_name TEXT, students TEXT, at INTEGER)`);
    if (!cols("alive").has("locked")) this.sql.exec(`ALTER TABLE alive ADD COLUMN locked INTEGER DEFAULT 0`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS grp (id TEXT PRIMARY KEY, owner TEXT, name TEXT, students TEXT, updated INTEGER)`);
    for (const [c, d] of [["classes", "TEXT DEFAULT '[]'"], ["teachers", "TEXT DEFAULT '[]'"], ["admin", "INTEGER DEFAULT 0"], ["subject", "TEXT DEFAULT ''"]]) if (!cols("grp").has(c)) this.sql.exec(`ALTER TABLE grp ADD COLUMN ${c} ${d}`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rtok (token TEXT PRIMARY KEY, student TEXT, kind TEXT, by TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rlog (id TEXT PRIMARY KEY, student TEXT, kind TEXT, to_addr TEXT, by TEXT, at INTEGER, ok INTEGER)`);
    // Assessment assignments (class/section/students, individual or teacher-led group) + teacher-made assessments.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS qassign (id TEXT PRIMARY KEY, quiz TEXT, title TEXT, mode TEXT, cls TEXT DEFAULT '', section TEXT DEFAULT '', students TEXT DEFAULT '[]', due INTEGER, by TEXT, owner TEXT, created INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tquiz (id TEXT PRIMARY KEY, owner TEXT, owner_name TEXT, title TEXT, data TEXT, updated INTEGER)`);
    if (!cols("tracker").has("rev_count")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN rev_count INTEGER DEFAULT 0`);
    if (!cols("tracker").has("marks")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN marks TEXT DEFAULT ''`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tracker_hist (id TEXT PRIMARY KEY, student TEXT, hw TEXT, surah INTEGER, from_ayah INTEGER, to_ayah INTEGER, grade TEXT, scores TEXT, marks TEXT, at INTEGER)`);
    if (!cols("tracker").has("rev_at")) this.sql.exec(`ALTER TABLE tracker ADD COLUMN rev_at INTEGER DEFAULT 0`);
    trkInit(this.sql as never);
    if (!cols("wall").has("batch")) this.sql.exec(`ALTER TABLE wall ADD COLUMN batch TEXT DEFAULT ''`);
    // Likes/comments carry the group wall they were made in. Existing ones keep the wall of the post copy they were on (no data loss).
    if (!cols("wcom").has("wkey")) { this.sql.exec(`ALTER TABLE wcom ADD COLUMN wkey TEXT DEFAULT ''`); this.sql.exec(`UPDATE wcom SET wkey=COALESCE((SELECT wkey FROM wall WHERE wall.id=wcom.post),'')`); }
    if (!cols("wlike").has("wkey")) { this.sql.exec(`ALTER TABLE wlike ADD COLUMN wkey TEXT DEFAULT ''`); this.sql.exec(`UPDATE wlike SET wkey=COALESCE((SELECT wkey FROM wall WHERE wall.id=wlike.post),'')`); }
    if (!cols("homework").has("section")) this.sql.exec(`ALTER TABLE homework ADD COLUMN section TEXT DEFAULT ''`);
    // One-time migration: free-text class values become catalog classes (idempotent).
    for (const r of this.sql.exec(`SELECT DISTINCT cls FROM users WHERE cls != '' UNION SELECT DISTINCT cls FROM homework WHERE cls != ''`).toArray()) {
      const n = String(r.cls);
      if (!this.sql.exec(`SELECT id FROM catalog WHERE kind='class' AND name=?`, n).toArray().length) this.sql.exec(`INSERT INTO catalog (id, kind, name) VALUES (?, 'class', ?)`, rid("c"), n);
    }
    this.migrateScopeToGroups();
    this.migrateSubjectPhase();
    this.migrateGroupsToAssignment();
    this.migrateViewAllTeachers();
    this.migrateCatalogTree();
  }

  private catalog() {
    const rows = this.sql.exec(`SELECT * FROM catalog ORDER BY kind, ord, name`).toArray().map((r) => ({ id: String(r.id), kind: String(r.kind) as CatKind, name: String(r.name), parent: String(r.parent || "") }));
    const className = new Map(rows.filter((r) => r.kind === "class").map((r) => [r.id, r.name]));
    return {
      // t349: Phase > Department > Subject; classes belong to a phase; sections to a class.
      phases: rows.filter((r) => r.kind === "phase").map(({ id, name }) => ({ id, name })),
      depts: rows.filter((r) => r.kind === "dept").map(({ id, name, parent }) => ({ id, name, phaseId: parent })),
      subjects: rows.filter((r) => r.kind === "subject").map(({ id, name, parent }) => ({ id, name, deptId: parent })),
      classes: rows.filter((r) => r.kind === "class").map(({ id, name, parent }) => ({ id, name, phaseId: parent })),
      sections: rows.filter((r) => r.kind === "section").map(({ id, name, parent }) => ({ id, name, classId: parent, cls: className.get(parent) || "" })),
    };
  }
  /** "" when ok, else an error code. Empty catalog lists don't restrict (fresh installs keep working). */
  private checkPlacement(cls: string, section: string, subjects: string[], scope: string[]) {
    const c = this.catalog();
    if (cls && c.classes.length && !c.classes.some((x) => x.name === cls)) return "unknown_class";
    if (section && !c.sections.some((x) => x.name === section && (!cls || x.cls === cls))) return "unknown_section";
    if (subjects.some((n) => !c.subjects.some((x) => x.name === n))) return "unknown_subject";
    for (const sc of scope) {
      if (sc.startsWith("grp:")) { if (!this.sql.exec(`SELECT id FROM grp WHERE id=? AND admin=1`, sc.slice(4)).toArray().length) return "unknown_scope"; continue; }
      const [k, sec] = sc.split("|");
      if (!c.classes.some((x) => x.name === k) || (sec && !c.sections.some((x) => x.name === sec && x.cls === k))) return "unknown_scope";
    }
    return "";
  }

  private userRow(where: string, arg: string) {
    return this.sql.exec(`SELECT * FROM users WHERE ${where}`, arg).toArray()[0];
  }
  private publicUser(r: Record<string, unknown>) {
    return { id: String(r.id), username: String(r.username), name: String(r.name), nameAr: String(r.name_ar || ""), role: String(r.role) as Role, cls: String(r.cls || ""), section: String(r.section || ""), subjects: JSON.parse(String(r.subjects || "[]")) as string[], scope: JSON.parse(String(r.scope || "[]")) as string[], perms: JSON.parse(String(r.perms || "[]")) as string[], disabled: Boolean(r.disabled), hasPin: Boolean(r.pin_enc), firstName: String(r.first_name || ""), lastName: String(r.last_name || ""), avatar: avatarOf(r), parentEmail: Boolean(r.email), parentName: String(r.parent_name || ""), lastSeen: Number(r.last_seen || 0), created: Number(r.created), lastLogin: r.last_login ? Number(r.last_login) : null };
  }
  /** Admin-only view: every stored field (teachers never receive these). */
  private adminUser(r: Record<string, unknown>) {
    const groups = r.role === "teacher" ? this.sql.exec(`SELECT id, name, subject, teachers FROM grp WHERE admin=1 ORDER BY name`).toArray().filter((g) => (JSON.parse(String(g.teachers || "[]")) as string[]).includes(String(r.id))).map((g) => ({ id: String(g.id), name: String(g.name), subject: String(g.subject || "") })) : undefined;
    return { ...this.publicUser(r), groups, subject: String(r.subject || ""), phase: String(r.phase || ""), email: String(r.email || ""), gender: String(r.gender || ""), dob: String(r.dob || ""), phone: String(r.phone || ""), semail: String(r.semail || ""), nationality: String(r.nationality || ""), prefLang: String(r.pref_lang || ""), sen: r.sen === "1", eal: r.eal === "1", gt: r.gt === "1", target: String(r.target || ""), scaled: String(r.scaled || ""), targetEff: String(r.target || "") || targetFromScaled(String(r.scaled || "")), isamsId: String(r.isams_id || ""), isamsSurname: String(r.isams_surname || "") };
  }
  private failCount(k: string) {
    this.sql.exec(`DELETE FROM fails WHERE t < ?`, Date.now() - FAIL_WINDOW);
    return Number(this.sql.exec(`SELECT COUNT(*) AS n FROM fails WHERE k=?`, k).one().n);
  }

  /** Teachers see students ONLY through admin groups assigned to them. Returns class/section tokens for fully-covered places plus individual ids. Never empty: a teacher with no groups gets a sentinel that matches nothing. */
  /** t346: the teacher's "Teaching assignment" (users.scope + users.subjects, set on Add/Edit Teacher) is the single source of which classes they see. subj = their subjects that students actually take (none match → no subject filter). */
  private teacherScope(tid: string): { scope: string[]; stu: string[]; subj: string[] } {
    const u = this.sql.exec(`SELECT scope, subjects FROM users WHERE id=?`, tid).toArray()[0];
    const raw = u ? (JSON.parse(String(u.scope || "[]")) as string[]).filter(Boolean) : [];
    // t349: "grp:<id>" = an admin group picked in Teaching assignment → its class/section tokens + its individual students.
    const scope = raw.filter((x) => !x.startsWith("grp:")), stu: string[] = [];
    for (const t of raw.filter((x) => x.startsWith("grp:"))) { const g = this.sql.exec(`SELECT students, classes FROM grp WHERE id=? AND admin=1`, t.slice(4)).toArray()[0]; if (!g) continue; scope.push(...(JSON.parse(String(g.classes || "[]")) as string[])); stu.push(...(JSON.parse(String(g.students || "[]")) as string[])); }
    const subs = u ? (JSON.parse(String(u.subjects || "[]")) as string[]) : [];
    const stuSubs = new Set<string>(); for (const r of this.sql.exec(`SELECT DISTINCT subject FROM users WHERE role='student'`).toArray()) for (const x of subjList(r.subject)) stuSubs.add(x);
    return { scope: scope.length ? scope : ["\u0000"], stu: [...new Set(stu)], subj: subs.filter((x) => stuSubs.has(x)) };
  }
  /** t346 one-time: copy each teacher's group-based class access into their Teaching assignment so nobody loses access. Individual students in partly-covered sections add that section. Group subjects are added to the teacher's subjects. Teachers without groups keep their stored assignment. */
  private migrateGroupsToAssignment() {
    if (this.setting("mig:t346") === "1") return;
    const log: unknown[] = [];
    for (const t of this.sql.exec(`SELECT id, username, scope, subjects FROM users WHERE role='teacher'`).toArray()) {
      const tid = String(t.id);
      const gs = this.sql.exec(`SELECT teachers FROM grp WHERE admin=1`).toArray().filter((r) => (JSON.parse(String(r.teachers || "[]")) as string[]).includes(tid));
      if (!gs.length) continue;
      const old = this.legacyGroupScope(tid);
      const sc = new Set(old.scope.filter((x) => x !== "\u0000"));
      for (const sid of old.stu) { const r = this.userRow("id=? AND role='student'", sid); if (r && r.cls) sc.add(r.section ? `${String(r.cls)}|${String(r.section)}` : String(r.cls)); }
      const subs = [...new Set([...(JSON.parse(String(t.subjects || "[]")) as string[]), ...old.subj])];
      this.sql.exec(`UPDATE users SET scope=?, subjects=? WHERE id=?`, JSON.stringify([...sc].sort()), JSON.stringify(subs), tid);
      log.push({ t: String(t.username), before: JSON.parse(String(t.scope || "[]")), after: [...sc].sort(), extraStu: old.stu.length, subs });
    }
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t346', '1') ON CONFLICT(k) DO UPDATE SET v='1'`);
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t346:log', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify(log));
  }
  /** t347 one-time: teachers who already have "View all homework" keep current behaviour — every teacher sharing a subject is pre-selected. */
  private migrateViewAllTeachers() {
    if (this.setting("mig:t347") === "1") return;
    const ts = this.sql.exec(`SELECT id, username, perms, subjects FROM users WHERE role='teacher'`).toArray().map((r) => ({ id: String(r.id), u: String(r.username), perms: JSON.parse(String(r.perms || "[]")) as string[], subs: JSON.parse(String(r.subjects || "[]")) as string[] }));
    const log: unknown[] = [];
    for (const t of ts) {
      if (!t.perms.includes("viewAll") || t.perms.some((p) => p.startsWith("vat:"))) continue;
      const add = ts.filter((o) => o.id !== t.id && o.subs.some((x) => t.subs.includes(x))).map((o) => `vat:${o.id}`);
      this.sql.exec(`UPDATE users SET perms=? WHERE id=?`, JSON.stringify([...t.perms, ...add]), t.id);
      log.push({ t: t.u, before: t.perms, added: add });
    }
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t347', '1') ON CONFLICT(k) DO UPDATE SET v='1'`);
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t347:log', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify(log));
  }
  /** t349 one-time: create Phases (EYFS/Primary/Secondary + any used), Departments from subject names, link subjects → dept, classes → phase (majority of their students' phase, else naming rule). Nothing removed. */
  private migrateCatalogTree() {
    if (this.setting("mig:t349") === "1") return;
    const cat = () => this.sql.exec(`SELECT id, kind, name, parent FROM catalog`).toArray();
    const ensure = (kind: string, name: string, parent = "") => { const ex = cat().find((r) => r.kind === kind && r.name === name); if (ex) return String(ex.id); const id = rid(kind[0]); this.sql.exec(`INSERT INTO catalog (id, kind, name, parent) VALUES (?, ?, ?, ?)`, id, kind, name, parent); return id; };
    const used = new Set<string>(["EYFS", "Primary", "Secondary"]);
    for (const r of this.sql.exec(`SELECT phase FROM users WHERE phase != ''`).toArray()) for (const x of String(r.phase).split(",")) if (x.trim()) used.add(x.trim());
    const ph = new Map([...used].map((n) => [n, ensure("phase", n)]));
    const log: Record<string, unknown> = { phases: [...used], depts: {}, classes: {} };
    for (const s of cat().filter((r) => r.kind === "subject" && !r.parent)) { const d = ruleDept(String(s.name)); const did = ensure("dept", d); this.sql.exec(`UPDATE catalog SET parent=? WHERE id=?`, did, String(s.id)); (log.depts as Record<string, string>)[String(s.name)] = d; }
    for (const c of cat().filter((r) => r.kind === "class" && !r.parent)) {
      const cnt = new Map<string, number>();
      for (const u of this.sql.exec(`SELECT phase FROM users WHERE role='student' AND cls=? AND phase != ''`, String(c.name)).toArray()) cnt.set(String(u.phase), (cnt.get(String(u.phase)) || 0) + 1);
      const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || rulePhase(String(c.name));
      if (best && ph.has(best)) { this.sql.exec(`UPDATE catalog SET parent=? WHERE id=?`, ph.get(best)!, String(c.id)); (log.classes as Record<string, string>)[String(c.name)] = best; }
    }
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t349', '1') ON CONFLICT(k) DO UPDATE SET v='1'`);
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:t349:log', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify(log));
  }
  private legacyGroupScope(tid: string): { scope: string[]; stu: string[]; subj: string[] } {
    const gs = this.sql.exec(`SELECT students, classes, teachers, subject FROM grp WHERE admin=1`).toArray().filter((r) => (JSON.parse(String(r.teachers || "[]")) as string[]).includes(tid));
    // Subject groups (e.g. Islamic A / Islamic B): the teacher only ever sees students who take one of those subjects.
    const subj = [...new Set(gs.map((g) => String(g.subject || "").trim()).filter(Boolean))];
    if (!gs.length) return { scope: ["\u0000"], stu: [], subj };
    const all = this.sql.exec(`SELECT id, cls, section, subject FROM users WHERE role='student' AND disabled=0`).toArray();
    const takes = (u: Record<string, unknown>, sub: string) => !sub || subjList(u.subject).includes(sub);
    const ids = new Set<string>();
    for (const g of gs) {
      const gsub = String(g.subject || "").trim();
      for (const sid of JSON.parse(String(g.students || "[]")) as string[]) ids.add(sid);
      for (const t of JSON.parse(String(g.classes || "[]")) as string[]) { const [c, sc] = t.split("|"); for (const u of all) if (String(u.cls) === c && (!sc || String(u.section) === sc) && takes(u, gsub)) ids.add(String(u.id)); }
    }
    const pool = subj.length ? all.filter((u) => subj.some((x) => subjList(u.subject).includes(x))) : all;
    const place = (u: Record<string, unknown>) => `${String(u.cls || "")}|${String(u.section || "")}`;
    const total = new Map<string, number>(), have = new Map<string, number>();
    for (const u of pool) total.set(place(u), (total.get(place(u)) || 0) + 1);
    for (const u of pool) if (ids.has(String(u.id))) have.set(place(u), (have.get(place(u)) || 0) + 1);
    const scope: string[] = [], covered = new Set<string>();
    for (const [k, n] of have) {
      if (n !== total.get(k)) continue;
      const [c, sc] = k.split("|");
      const sectioned = all.some((u) => String(u.cls) === c && String(u.section || ""));
      if (sc) { scope.push(`${c}|${sc}`); covered.add(k); } else if (!sectioned) { scope.push(c); covered.add(k); }
    }
    const stu = all.filter((u) => ids.has(String(u.id)) && !covered.has(place(u))).map((u) => String(u.id));
    return { scope: scope.length ? scope : ["\u0000"], stu, subj };
  }
  /** "View all homework" for a teacher with subject groups only covers homework from admin or teachers of the same subject. */
  /** t328: homework the owner shared with this teacher (read; correcting needs the per-share switch + the admin "shareCorrect" permission). */
  // t349: per-homework "Share with teachers" was removed; Permissions (See all homework + teacher list) is the only cross-teacher access.
  private sharedTo(_h: { data?: unknown }, _uid: string): boolean { return false; }
  private sharedToOld(h: { data?: unknown }, uid: string): boolean { const sh = ((h.data || {}) as Json).share as { teachers?: string[] } | undefined; return !!sh?.teachers?.includes(uid); }
  private shareCanCorrect(h: { data: unknown }, a: Actor): boolean { const sh = ((h.data || {}) as Json).share as { teachers?: string[]; correct?: boolean } | undefined; return a.role === "teacher" && !!sh?.teachers?.includes(a.id) && sh.correct === true && a.perms.includes("shareCorrect"); }
  private va(a: Actor, by: string): boolean {
    if (!a.perms.includes("viewAll")) return false;
    if (!by) return true;
    const u = this.userRow("id=?", by);
    if (!u || u.role !== "teacher") return true;
    // t347: only homework of the teachers picked in Permissions ("vat:<teacherId>"); none picked = none.
    return a.perms.includes(`vat:${by}`);
  }
  /** Subject rule for teachers with subject groups: the student must take one of the teacher's subjects. */
  private subjOk(a: Actor, sid?: string): boolean {
    if (!a.subj?.length || !sid) return true;
    const u = this.userRow("id=?", sid);
    if (!u || u.role !== "student") return true;
    return a.subj.some((x) => subjList(u.subject).includes(x));
  }
  private mkActor(u: { id: string; role: Role; name: string; cls: string; perms: string[]; scope: string[] }): Actor {
    if (u.role !== "teacher") return { id: u.id, role: u.role, name: u.name, cls: u.cls, perms: u.perms, scope: u.scope, nameAr: (u as { nameAr?: string }).nameAr || "" };
    let subjects: string[] = []; try { subjects = JSON.parse(String(this.userRow("id=?", u.id)?.subjects || "[]")) as string[]; } catch { /* ignore */ }
    return { id: u.id, role: u.role, name: u.name, cls: u.cls, perms: u.perms, subjects, ...this.teacherScope(u.id) } as Actor;
  }
  /** EYFS / Primary / Secondary from a stored class value such as "FS2", "Year 2", "Demo Year 3". FS and Year 1-2 = EYFS, Year 3-6 = Primary, Year 7+ = Secondary. */
  private phaseOfClass(cls: string): string {
    const c = String(cls || "").trim();
    if (!c) return "";
    { const r = this.sql.exec(`SELECT p.name AS n FROM catalog c JOIN catalog p ON p.id=c.parent AND p.kind='phase' WHERE c.kind='class' AND c.name=?`, c).toArray()[0]; if (r) return String(r.n); }
    if (/^(fs|eyfs|foundation|reception|nursery|kg)/i.test(c)) return "EYFS";
    const n = Number((c.match(/\d+/) || [""])[0]);
    if (!n) return "";
    return n <= 2 ? "EYFS" : n <= 6 ? "Primary" : "Secondary";
  }
  private normPhase(v: unknown, multi: boolean): string {
    const ok = (loadCat(this.sql as never), catPhases());
    const xs = (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter((x) => ok.includes(x));
    const u = ok.filter((x) => xs.includes(x));
    return multi ? u.join(",") : u[0] || "";
  }
  /** One-time: every existing student gets subject "Islamic B" and a phase from their class; teachers get a phase from their assigned groups. */
  private migrateSubjectPhase() {
    if (this.setting("mig:subj-phase") === "1") return;
    const log: Record<string, unknown> = { students: 0, byPhase: {}, teachers: [] as string[] };
    const by: Record<string, number> = {};
    for (const r of this.sql.exec(`SELECT id, cls, subject, phase FROM users WHERE role='student'`).toArray()) {
      const ph = String(r.phase || "") || this.phaseOfClass(String(r.cls || ""));
      this.sql.exec(`UPDATE users SET subject=?, phase=? WHERE id=?`, String(r.subject || "") || "Islamic B", ph, String(r.id));
      by[ph || "(none)"] = (by[ph || "(none)"] || 0) + 1;
      log.students = Number(log.students) + 1;
    }
    log.byPhase = by;
    const grps = this.sql.exec(`SELECT students, classes, teachers FROM grp WHERE admin=1`).toArray();
    const stuCls = new Map(this.sql.exec(`SELECT id, cls FROM users WHERE role='student'`).toArray().map((r) => [String(r.id), String(r.cls || "")]));
    for (const t of this.sql.exec(`SELECT id, name, phase FROM users WHERE role='teacher'`).toArray()) {
      if (String(t.phase || "")) continue;
      const ph = new Set<string>();
      for (const g of grps) {
        if (!(JSON.parse(String(g.teachers || "[]")) as string[]).includes(String(t.id))) continue;
        for (const sid of JSON.parse(String(g.students || "[]")) as string[]) ph.add(this.phaseOfClass(stuCls.get(sid) || ""));
        for (const tok of JSON.parse(String(g.classes || "[]")) as string[]) ph.add(this.phaseOfClass(tok.split("|")[0]));
      }
      ph.delete("");
      const val = this.normPhase([...ph], true);
      if (val) { this.sql.exec(`UPDATE users SET phase=? WHERE id=?`, val, String(t.id)); (log.teachers as string[]).push(`${String(t.name)}: ${val}`); }
    }
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:subj-phase', '1') ON CONFLICT(k) DO UPDATE SET v='1'`);
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:subj-phase:log', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify(log));
  }
  /** One-time: teachers with a class-based scope (or none = all) and no assigned group get equivalent admin groups, e.g. "2ABCD". */
  private migrateScopeToGroups() {
    if (this.setting("mig:grp-scope") === "1") return;
    const teachers = this.sql.exec(`SELECT id, name, scope, subjects FROM users WHERE role='teacher'`).toArray();
    const groups = this.sql.exec(`SELECT id, name, subject, classes, teachers FROM grp WHERE admin=1`).toArray();
    const made: string[] = [];
    const classNames = this.sql.exec(`SELECT name FROM catalog WHERE kind='class' ORDER BY name`).toArray().map((r) => String(r.name));
    const label = (toks: string[]) => {
      const byCls = new Map<string, string[]>();
      for (const t of toks) { const [c, sc] = t.split("|"); if (!byCls.has(c)) byCls.set(c, []); if (sc) byCls.get(c)!.push(sc); }
      return [...byCls.entries()].map(([c, ss]) => { const n = c.match(/\d+/)?.[0] || c; return ss.length ? n + ss.map((x) => x.replace(/^\d+/, "")).sort().join("") : n; }).join(" + ");
    };
    for (const t of teachers) {
      const tid = String(t.id);
      if (groups.some((g) => (JSON.parse(String(g.teachers || "[]")) as string[]).includes(tid))) continue;
      let toks = JSON.parse(String(t.scope || "[]")) as string[];
      const whole = !toks.length;
      if (whole) toks = classNames;
      if (!toks.length) continue;
      toks = [...toks].sort();
      const subs = JSON.parse(String(t.subjects || "[]")) as string[];
      const subject = subs.length === 1 ? subs[0] : "";
      const name = whole ? "All classes" : label(toks);
      const key = JSON.stringify(toks);
      const ex = groups.find((g) => JSON.stringify([...(JSON.parse(String(g.classes || "[]")) as string[])].sort()) === key && String(g.subject || "") === subject && String(g.name) === name);
      if (ex) { const tl = JSON.parse(String(ex.teachers || "[]")) as string[]; tl.push(tid); this.sql.exec(`UPDATE grp SET teachers=? WHERE id=?`, JSON.stringify(tl), String(ex.id)); ex.teachers = JSON.stringify(tl); continue; }
      const id = rid("gp");
      this.sql.exec(`INSERT INTO grp (id, owner, name, subject, students, classes, teachers, admin, updated) VALUES (?, 'admin', ?, ?, '[]', ?, ?, 1, ?)`, id, name, subject, JSON.stringify(toks), JSON.stringify([tid]), Date.now());
      groups.push({ id, name, subject, classes: JSON.stringify(toks), teachers: JSON.stringify([tid]) });
      made.push(`${name}${subject ? " · " + subject : ""} → ${String(t.name)}`);
    }
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:grp-scope', '1') ON CONFLICT(k) DO UPDATE SET v='1'`);
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('mig:grp-scope:log', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, JSON.stringify(made));
  }

  /** Resolves a user id from a token into an actor (null when unknown or disabled). */
  private actorOf(r: Record<string, unknown>): Actor {
    return this.mkActor(this.publicUser(r));
  }

  /** RPC for the mail routes: small admin settings (e.g. the email signature). */
  async getSetting(k: string): Promise<string> { return this.setting(k, ""); }
  async putSetting(k: string, v: string): Promise<void> { this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)`, k, v.slice(0, 20000)); }

  private dlCfg(): DlCfg { try { return JSON.parse(this.setting("dl:cfg", "{}")) as DlCfg; } catch { return {}; } }
  /** Account-less pages (QR homework card, public links): may audio be downloaded? Default yes. */
  async qrDlAllowed(): Promise<boolean> { return false; } // fixed rule: account-less (QR / parent link) pages never download audio
  /** May this person download (kind)? Admin always. */
  dlOf(a: Actor, kind: DlKind): boolean {
    if (a.role === "admin") return true;
    if (a.role === "teacher") return !a.perms.includes(`nodl:${kind}`);
    if (a.role !== "student") return false;
    // Fixed rule: students can never download audio, whatever the admin switches say.
    if (kind === "audio") return false;
    const c = this.dlCfg();
    const o = c.classes?.[a.cls]?.[kind];
    if (typeof o === "boolean") return o;
    const g = c.students?.[kind];
    return typeof g === "boolean" ? g : true;
  }
  private setting(k: string, def = ""): string {
    return String(this.sql.exec(`SELECT v FROM settings WHERE k=?`, k).toArray()[0]?.v ?? def);
  }

  /** Server-side list of each teacher's classroom activities (so they can resume on any device). */
  async actReg(owner: string, code: string, type: string, title: string, hostKey: string) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS myacts (code TEXT PRIMARY KEY, owner TEXT, type TEXT, title TEXT, host_key TEXT, created INTEGER)`);
    this.sql.exec(`INSERT OR REPLACE INTO myacts (code, owner, type, title, host_key, created) VALUES (?, ?, ?, ?, ?, ?)`, code, owner, type, title, hostKey, Date.now());
  }
  async actList(owner: string) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS myacts (code TEXT PRIMARY KEY, owner TEXT, type TEXT, title TEXT, host_key TEXT, created INTEGER)`);
    return this.sql.exec(`SELECT * FROM myacts WHERE owner=? ORDER BY created DESC LIMIT 60`, owner).toArray().map((r) => ({ code: String(r.code), type: String(r.type), title: String(r.title), hostKey: String(r.host_key), created: Number(r.created) }));
  }
  async actDel(code: string) {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS myacts (code TEXT PRIMARY KEY, owner TEXT, type TEXT, title TEXT, host_key TEXT, created INTEGER)`);
    this.sql.exec(`DELETE FROM myacts WHERE code=?`, code);
  }
  /** Short stamp of the current PIN hash; tokens carry it so a PIN change/reset signs out older sessions. */
  pinStamp(uid: string): string { const r = this.userRow("id=?", uid); return r ? String(r.hash || "").slice(0, 10) : ""; }
  /** t312: the class roster a live activity / assessment session is locked to (null = open to anyone with the code). */
  async rosterOf(code: string): Promise<{ students: string[] } | null> {
    const r = this.sql.exec(`SELECT students, locked, at FROM alive WHERE code=?`, code).toArray()[0];
    if (!r || !Number(r.locked) || Number(r.at) < Date.now() - 12 * 3600e3) return null;
    return { students: JSON.parse(String(r.students || "[]")) as string[] };
  }
  async actor(uid: string, pv = ""): Promise<Actor | null> {
    const r = this.userRow("id=?", uid);
    if (!r || r.disabled) return null;
    if (pv && String(r.hash || "").slice(0, 10) !== pv) return null;
    return this.mkActor(this.publicUser(r));
  }

  /** Sign a student in from the long random token in their QR card. Revoked by regenerating the token. */
  async qrLogin(token: string, ip: string): Promise<Reply> {
    if (this.failCount(`ip:${ip}`) >= 25) return { status: 429, body: { error: "too_many_attempts" } };
    const r = token.length >= 30 ? this.sql.exec(`SELECT * FROM users WHERE qr_token=? AND role='student'`, token).toArray()[0] : undefined;
    if (!r) { this.sql.exec(`INSERT INTO fails (k, t) VALUES (?, ?)`, `ip:${ip}`, Date.now()); return { status: 401, body: { error: "bad_login" } }; }
    if (r.disabled) return { status: 403, body: { error: "blocked" } };
    this.sql.exec(`UPDATE users SET last_login=? WHERE id=?`, Date.now(), String(r.id));
    return { status: 200, body: { uid: String(r.id), user: this.publicUser(r) } };
  }

  async login(username: string, pin: string, ip: string): Promise<Reply> {
    const u = normUser(username);
    if (this.failCount(`u:${u}`) >= 5 || this.failCount(`ip:${ip}`) >= 25) return { status: 429, body: { error: "too_many_attempts" } };
    const r = this.userRow("username=?", u);
    const pinOk = !!r && safeEqual(await hashPin(pin, fromB64url(String(r.salt))), String(r.hash));
    // Blocked accounts are told so — only after a correct PIN, so it can't be used to probe usernames.
    if (pinOk && r.disabled) return { status: 403, body: { error: "blocked" } };
    const ok = pinOk;
    if (!ok) {
      this.sql.exec(`INSERT INTO fails (k, t) VALUES (?, ?), (?, ?)`, `u:${u}`, Date.now(), `ip:${ip}`, Date.now());
      return { status: 401, body: { error: "bad_login" } };
    }
    this.sql.exec(`DELETE FROM fails WHERE k=?`, `u:${u}`);
    this.sql.exec(`UPDATE users SET last_login=? WHERE id=?`, Date.now(), String(r.id));
    return { status: 200, body: { uid: String(r.id), user: this.publicUser(r) } };
  }

  /** In-app notifications (bell). uid "admin" is the admin. Keeps the newest 100 per person, 60 days. */
  private notify(uids: string[], kind: string, data: Json) {
    const now = Date.now();
    for (const uid of [...new Set(uids)].filter(Boolean)) {
      this.sql.exec(`INSERT INTO notes (id, uid, kind, data, created) VALUES (?, ?, ?, ?, ?)`, rid("n"), uid, kind, JSON.stringify(data), now);
      this.sql.exec(`DELETE FROM notes WHERE uid=? AND id NOT IN (SELECT id FROM notes WHERE uid=? ORDER BY created DESC LIMIT 100)`, uid, uid);
    }
    this.sql.exec(`DELETE FROM notes WHERE created < ?`, now - 60 * 864e5);
    // t302: Web Push copy. Every notifying feature registers its kind automatically (admin + per-user switches).
    this.sql.exec(`INSERT OR IGNORE INTO push_kind (kind, first, admin_off) VALUES (?, ?, 0)`, kind, now);
    this.ctx.waitUntil(this.pushOut([...new Set(uids)].filter(Boolean), kind, data).catch(() => undefined));
    // Email copy (info@ no-reply, Reply-To contact@) for users with an email address.
    const tpl = EMAIL_KINDS[kind];
    if (tpl) {
      const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, k) => String(data[k] ?? ""));
      for (const uid of [...new Set(uids)]) {
        const u = this.userRow("id=?", uid);
        const to = String(u?.email || "");
        if (!to || u?.disabled) continue;
        const link = data.hw ? `https://www.shaiqmuhammad.com/lms/homework?id=${encodeURIComponent(String(data.hw))}` : "https://www.shaiqmuhammad.com/lms";
        this.ctx.waitUntil(sendAuto(this.env as LmsEnv, to, `${tpl[0]} — ${String(u?.name || "")}`.slice(0, 150), { heading: tpl[0], paragraphs: [`Assalamu alaikum,`, `${fill(tpl[1])}${u?.role === "student" ? ` (${String(u?.name)})` : ""}`], button: { label: "Open", url: link }, note: "This is an automatic message — please don't reply. Questions: contact@shaiqmuhammad.com" }).catch(() => false));
      }
    }
  }
  stdInit() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS stddoc (subject TEXT PRIMARY KEY, name TEXT, mime TEXT, lang TEXT, size INTEGER, at INTEGER)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS stddoc_c (subject TEXT, i INTEGER, data TEXT, PRIMARY KEY (subject, i))`);
  }
  /** t304: lesson reminders. While a timetable exists, the store wakes once a minute and sends "lesson" notifications
   *  to the lesson's teacher and students at each person's chosen lead time (default 5 minutes, 0 = off). */
  async planTT() {
    const has = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM tt`).one().n) > 0 && Object.keys(ttTimes(this.sql)).length > 0;
    if (!has) { await this.ctx.storage.deleteAlarm(); return; }
    const cur = await this.ctx.storage.getAlarm();
    if (!cur || cur < Date.now()) await this.ctx.storage.setAlarm(Math.ceil((Date.now() + 1000) / 60000) * 60000 + 2000);
  }
  async alarm() {
    try { this.ttTick(); } finally {
      const has = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM tt`).one().n) > 0;
      if (has) await this.ctx.storage.setAlarm(Math.ceil((Date.now() + 1000) / 60000) * 60000 + 2000);
    }
  }
  ttTick(nowMs = Date.now(), zzOnly = false) {
    const times = ttTimes(this.sql), rows = ttRows(this.sql);
    const d = new Date(nowMs + 4 * 3600e3), dow = d.getUTCDay(), day = d.toISOString().slice(0, 10), mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tt_sent (k TEXT PRIMARY KEY, at INTEGER)`);
    this.sql.exec(`DELETE FROM tt_sent WHERE at < ?`, nowMs - 3 * 864e5);
    const leadOf = (uid: string) => { const r = this.sql.exec(`SELECT v FROM settings WHERE k=?`, `ttlead:${uid}`).toArray()[0]; return r ? Number(r.v) : 5; };
    let sent = 0;
    for (const r of rows.map((x) => ({ ...x, st: ttSE(x, times) })).filter((x) => x.dow === dow && x.st.s && (!zzOnly || /^zz\./.test(String(this.userRow("id=?", x.teacher)?.username || ""))))) {
      const [h, m] = r.st.s.split(":").map(Number); const start = h * 60 + m;
      if (start - mins < 0 || start - mins > 30) continue;
      const studs = this.sql.exec(`SELECT id, username, cls, section FROM users WHERE role='student' AND disabled=0 AND cls=?`, r.cls).toArray().filter((u) => (!zzOnly || /^zz\./.test(String(u.username))) && ttFor(r, String(u.cls || ""), String(u.section || ""))).map((u) => String(u.id));
      for (const uid of [r.teacher, ...studs].filter(Boolean)) {
        const lead = leadOf(uid);
        if (!lead || start - mins !== lead) continue;
        const k = `${day}|${r.id}|${uid}`;
        if (this.sql.exec(`SELECT 1 FROM tt_sent WHERE k=?`, k).toArray().length) continue;
        this.sql.exec(`INSERT INTO tt_sent (k, at) VALUES (?, ?)`, k, nowMs);
        this.notify([uid], "lesson", { subject: r.subject || "Lesson", cls: `${r.cls} ${r.sections.join("")}`.trim(), time: r.st.s, period: r.period, mins: lead });
        sent++;
      }
    }
    return sent;
  }
  /** t311: subjects whose standards this user may read (null = all, for the admin). */
  stdMine(a: Actor): string[] | null {
    if (a.role === "admin" && !a.viewAs) return null;
    const u = this.userRow("id=?", a.id);
    let js: string[] = []; try { js = JSON.parse(String(u?.subjects || "[]")) as string[]; } catch { /* */ }
    // Own subjects (profile) plus the subject of any subject group the admin assigned them to.
    return [...new Set([...(u ? subjList(u.subject) : []), ...js.map(String), ...(a.subj || [])].map((x) => x.trim()).filter(Boolean))];
  }
  /** t304: an assessment % as the tracker entry level: the tracker's SC scale 0–3 (cut-offs from the Attainment system for that year) shown as Level 1–4. */
  levelOf(pct: number, year: string): { level: number; label: string } {
    const all = systems(this.sql as never).filter((x) => x.active);
    const sys = all.find((x) => (x.scope.years || []).includes(year) && x.isDefault) || all.find((x) => (x.scope.years || []).includes(year)) || all.find((x) => x.isDefault) || all[0];
    const cut = sys?.cut || [40, 60, 85];
    const v = scoreFromPct(Number(pct) || 0, cut);
    return { level: v + 1, label: sys?.scale?.find((x) => x.v === v)?.label || ["Working Below", "Working Towards", "Working At", "Greater Depth"][v] };
  }
  private async vapid(): Promise<Vapid> {
    const r = this.sql.exec(`SELECT v FROM settings WHERE k='push:vapid'`).toArray()[0];
    if (r) return JSON.parse(String(r.v)) as Vapid;
    const v = await makeVapid();
    this.sql.exec(`INSERT OR IGNORE INTO settings (k, v) VALUES ('push:vapid', ?)`, JSON.stringify(v));
    return JSON.parse(String(this.sql.exec(`SELECT v FROM settings WHERE k='push:vapid'`).one().v)) as Vapid;
  }
  private async pushOut(uids: string[], kind: string, data: Json) {
    const k = this.sql.exec(`SELECT admin_off FROM push_kind WHERE kind=?`, kind).toArray()[0];
    if (k && Number(k.admin_off)) return;
    const subs = uids.flatMap((uid) => this.sql.exec(`SELECT * FROM push_sub WHERE uid=? AND NOT EXISTS (SELECT 1 FROM push_pref WHERE uid=? AND kind=? AND off=1)`, uid, uid, kind).toArray());
    if (!subs.length) return;
    const v = await this.vapid();
    const [title, body] = PUSH_TEXT[kind] || ["Shaiq Muhammad", "You have a new notification"];
    const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, x) => String(data[x] ?? ""));
    const url = data.hw ? `/lms/homework?id=${encodeURIComponent(String(data.hw))}` : data.thread ? "/lms/messages" : kind.startsWith("lp_") ? "/lms/material" : "/lms";
    for (const sb of subs) {
      const st = await sendPush({ endpoint: String(sb.endpoint), p256dh: String(sb.p256dh), auth: String(sb.auth) }, { title: fill(title), body: fill(body), url, kind }, v).catch(() => 0);
      if (st === 404 || st === 410) this.sql.exec(`DELETE FROM push_sub WHERE endpoint=?`, String(sb.endpoint));
    }
  }
  private studentName(id: string) {
    return String(this.userRow("id=?", id)?.name ?? "?");
  }

  /** Raw audio upload (see header). Body is the recording; caps per person and in total. */
  async audioUpload(a: Actor, q: Json, data: ArrayBuffer, mime: string): Promise<Reply> {
    if (!AUDIO_TYPES.test(mime)) return { status: 415, body: { error: "audio_type" } };
    if (!data.byteLength) return { status: 400, body: { error: "empty" } };
    if (data.byteLength > MAX_AUDIO) return { status: 413, body: { error: "audio_too_long" } };
    const used = Number(this.sql.exec(`SELECT COALESCE(SUM(size),0) AS n FROM blobs WHERE owner=?`, a.id).one().n);
    const total = Number(this.sql.exec(`SELECT COALESCE(SUM(size),0) AS n FROM blobs`).one().n);
    if (used + data.byteLength > USER_AUDIO_CAP) return { status: 409, body: { error: "audio_user_full" } };
    if (total + data.byteLength > TOTAL_AUDIO_CAP) return { status: 409, body: { error: "audio_full" } };
    const id = rid("a");
    const type = mime.split(";")[0];
    if (a.role === "student") {
      const h = this.allHomework(str(q.hw, 40))[0];
      if (!h || !this.assignees(h).includes(a.id)) return { status: 404, body: { error: "not_found" } };
      if (this.lockedFor(h, a.id)) return { status: 409, body: { error: "locked" } };
      let cur = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0];
      if (cur?.status === "approved") return { status: 409, body: { error: "already_approved" } };
      // t302: a submitted piece the teacher commented on (after the submit) can be answered by submitting again.
      if (cur?.status === "submitted" && !(JSON.parse(String(cur.comments || "[]")) as { at?: number }[]).some((x) => Number(x.at || 0) > Number(cur.submitted_at || 0))) return { status: 409, body: { error: "already_submitted" } };
      if (!cur) {
        this.sql.exec(`INSERT INTO subs (id, hw, student, status, text, practised, updated) VALUES (?, ?, ?, 'draft', '', 0, ?)`, rid("s"), h.id, a.id, Date.now());
        cur = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0];
      }
      // Keep recordings that belong to a graded attempt (history); replace an ungraded draft recording.
      const kept = (JSON.parse(String(cur.attempts || "[]")) as { audio: string }[]).some((x) => x.audio === cur.audio);
      if (cur.audio && !kept) await this.dropBlob(String(cur.audio));
      await this.files.put(id, data, type);
      this.sql.exec(`INSERT INTO blobs (id, owner, sub, kind, mime, size, created) VALUES (?, ?, ?, 'rec', ?, ?, ?)`, id, a.id, String(cur.id), type, data.byteLength, Date.now());
      // A recording is the student's working copy (re-record replaces it); handing in is a separate, one-time "Submit Your Homework".
      this.sql.exec(`UPDATE subs SET audio=?, status=CASE WHEN status='returned' THEN 'returned' ELSE 'draft' END, updated=? WHERE id=?`, id, Date.now(), String(cur.id));
      this.touch(a.id);
      return { status: 200, body: { ok: true, id, sub: this.sub(h.id, a.id) } };
    }
    if (!can(a, "review")) return { status: 403, body: { error: "forbidden" } };
    const r = this.sql.exec(`SELECT * FROM subs WHERE id=?`, str(q.sub, 40)).toArray()[0];
    if (!r) return { status: 404, body: { error: "not_found" } };
    await this.files.put(id, data, type);
    // t337: a voice note for one verse mark (?mark=1) — stored for that submission, attached by "mistakes"; no comment, no push, the work stays in To review.
    if (q.mark) { this.sql.exec(`INSERT INTO blobs (id, owner, sub, kind, mime, size, created) VALUES (?, ?, ?, 'mk', ?, ?, ?)`, id, a.id, String(r.id), type, data.byteLength, Date.now()); return { status: 200, body: { ok: true, id } }; }
    this.sql.exec(`INSERT INTO blobs (id, owner, sub, kind, mime, size, created) VALUES (?, ?, ?, 'fb', ?, ?, ?)`, id, a.id, String(r.id), type, data.byteLength, Date.now());
    const comments = JSON.parse(String(r.comments || "[]")) as Json[];
    comments.push({ by: a.name, text: "", audio: id, at: Date.now() });
    this.sql.exec(`UPDATE subs SET comments=?, updated=? WHERE id=?`, JSON.stringify(comments.slice(-50)), Date.now(), String(r.id));
    const h = this.allHomework(String(r.hw))[0];
    this.notify([String(r.student)], "feedback_audio", { hw: String(r.hw), title: h?.title || "", by: a.name });
    return { status: 200, body: { ok: true, id } };
  }

  /** t315: Lesson Pack context (see packs.ts). */
  private packCtx(): PackCtx {
    return {
      sql: this.sql as never,
      acc: (x) => mpOf(this.sql as never, x as never, "lp"),
      hwSave: (x, inp) => this.handle("hw-save", x as Actor, inp),
      hwDelete: (x, id) => this.handle("hw-delete", x as Actor, { id }),
      notify: (u, k, d) => this.notify(u, k, d),
      sectionOf: (uid) => String(this.userRow("id=?", uid)?.section || ""),
      subOf: (hw, st) => this.sub(hw, st) as never,
      hwRow: (id) => this.allHomework(id)[0],
      inScopeIds: (x, ids) => {
        if (x.role !== "teacher" || !x.scope?.length) return true;
        const inScope = (c: string, sec: string) => x.scope!.some((k) => { const [kc, ks] = k.split("|"); return kc === c && (!ks || ks === sec); });
        const rows = this.sql.exec(`SELECT id, cls, section FROM users WHERE role='student'`).toArray().filter((r) => ids.includes(String(r.id)));
        return rows.length === ids.length && rows.every((r) => inScope(String(r.cls || ""), String(r.section || "")) || !!x.stu?.includes(String(r.id)));
      },
    };
  }
  /** t315: Lesson Pack media (pictures, recordings, imported PowerPoint pictures). Staff upload for packs; students upload into their own copy. */
  async lpMediaUpload(a: Actor, data: ArrayBuffer, mime: string): Promise<Reply> {
    const type = mime.split(";")[0];
    const img = /^image\/(png|jpeg|webp|gif)$/.test(type), aud = AUDIO_TYPES.test(mime);
    if (!img && !aud) return { status: 415, body: { error: "media_type" } };
    if (!data.byteLength) return { status: 400, body: { error: "empty" } };
    if (data.byteLength > (img ? 2_500_000 : MAX_AUDIO)) return { status: 413, body: { error: "too_large" } };
    if (a.role === "teacher" && !mpOf(this.sql as never, a as never, "lp").view) return { status: 403, body: { error: "module_hidden" } };
    const used = Number(this.sql.exec(`SELECT COALESCE(SUM(size),0) AS n FROM blobs WHERE owner=?`, a.id).one().n);
    const total = Number(this.sql.exec(`SELECT COALESCE(SUM(size),0) AS n FROM blobs`).one().n);
    if (used + data.byteLength > (a.role === "student" ? USER_AUDIO_CAP : USER_AUDIO_CAP * 10)) return { status: 409, body: { error: "audio_user_full" } };
    if (total + data.byteLength > TOTAL_AUDIO_CAP) return { status: 409, body: { error: "audio_full" } };
    const id = rid("lpm");
    await this.files.put(id, data, type);
    this.sql.exec(`INSERT INTO blobs (id, owner, sub, kind, mime, size, created) VALUES (?, ?, '', 'lpm', ?, ?, ?)`, id, a.id, type, data.byteLength, Date.now());
    return { status: 200, body: { ok: true, id } };
  }
  async lpMediaGet(a: Actor, id: string): Promise<{ status: number; mime?: string; data?: ArrayBuffer; error?: string }> {
    const b = this.sql.exec(`SELECT * FROM blobs WHERE id=? AND kind='lpm'`, id).toArray()[0];
    if (!b) return { status: 404, error: "not_found" };
    const f = await this.files.get(id);
    if (!f) return { status: 404, error: "not_found" };
    return { status: 200, mime: String(b.mime), data: f.body instanceof ArrayBuffer ? f.body : await new Response(f.body).arrayBuffer() };
  }

  async dlAllowed(a: Actor, kind: DlKind): Promise<boolean> { return this.dlOf(a, kind); }
  async audioGet(a: Actor, id: string): Promise<{ status: number; mime?: string; data?: ArrayBuffer; error?: string }> {
    const b = this.sql.exec(`SELECT * FROM blobs WHERE id=?`, id).toArray()[0];
    if (!b) return { status: 404, error: "not_found" };
    const sub = this.sql.exec(`SELECT student FROM subs WHERE id=?`, String(b.sub)).toArray()[0];
    const parentOk = a.role === "parent" && !!sub && this.sql.exec(`SELECT 1 FROM plink WHERE parent=? AND student=?`, a.id, String(sub.student)).toArray().length > 0; // t332: parents hear their own child's recordings and feedback
    if (!isStaff(a) && sub?.student !== a.id && !parentOk) return { status: 403, error: "forbidden" };
    const f = await this.files.get(id);
    if (!f) return { status: 404, error: "not_found" };
    const data = f.body instanceof ArrayBuffer ? f.body : await new Response(f.body).arrayBuffer();
    return { status: 200, mime: String(b.mime), data };
  }

  private async dropBlob(id: string) {
    await this.files.delete(id);
    this.sql.exec(`DELETE FROM blobs WHERE id=?`, id);
  }
  private async dropBlobsOfSubs(subIds: string[]) {
    for (const s of subIds) for (const b of this.sql.exec(`SELECT id FROM blobs WHERE sub=?`, s).toArray()) await this.dropBlob(String(b.id));
  }

  private seenAt = new Map<string, number>();
  /** Online presence: remember when each signed-in person last made a request (throttled to once a minute). */
  private presence(a: Actor) {
    const now = Date.now();
    if (now - (this.seenAt.get(a.id) || 0) < 60_000) return;
    this.seenAt.set(a.id, now);
    if (a.role === "admin") this.sql.exec(`INSERT INTO settings (k, v) VALUES ('seen:admin', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, String(now));
    else this.sql.exec(`UPDATE users SET last_seen=? WHERE id=?`, now, a.id);
  }
  private adminSeen() { return Number(this.sql.exec(`SELECT v FROM settings WHERE k='seen:admin'`).toArray()[0]?.v || 0); }

  async handle(action: string, a: Actor, input: Json): Promise<Reply> {
    if (!a.viewAs) this.presence(a);
    // Per-module Show/Hide for teachers ("hide:<module>" in perms). Hidden modules answer 403 on the server, not just in the menu.
    if (a.role === "teacher") {
      const mod = action === "assess-results" ? "results" : /^msg-/.test(action) ? "messaging" : /^wall-/.test(action) ? "wall" : /^act-/.test(action) ? "activities" : /^(hw-save|hw-delete|hw-unlock|sub-review)$/.test(action) ? "homework" : /^(assess-|tquiz-)/.test(action) ? "assessments" : "";
      if (mod && a.perms.includes(`hide:${mod}`)) return { status: 403, body: { error: "module_hidden" } };
    }
    if (a.role === "parent" && !(input as Record<symbol, unknown>)[PASS]) return this.parentHandle(a, action, input);
    if (action === "att-parent-alert") return this.attParentAlert(a, input);
    if (/^par-(list|save|delete|import)$/.test(action)) return this.parAdmin(a, action, input);
    if (/^report-(dept|student|settings|export|unmatched|link)$/.test(action)) {
      const RES = (this.env as unknown as { RESULTS?: DurableObjectNamespace }).RESULTS;
      let cache: Record<string, unknown>[] | null = null;
      return reportHandle({ sql: this.sql, homework: () => this.allHomework(), assignees: (h) => this.assignees(h), inScope: (x, c2, s2, i) => this.inScope(x, c2, s2, i),
        setLink: RES ? (id, op, sid) => (RES.get(RES.idFromName("main")) as unknown as { setLink(i: string, o: string, s: string): Promise<boolean> }).setLink(id, op, sid) : undefined,
        results: async () => (cache ??= RES ? await (RES.get(RES.idFromName("main")) as unknown as { list(f: object): Promise<Record<string, unknown>[]> }).list({ details: false }) : []) }, a, action, input);
    }
    if (action === "modperm-get" || action === "modperm-save") {
      if (a.role !== "admin" || (action === "modperm-save" && a.viewAs)) return { status: 403, body: { error: "admin_only" } };
      return { status: 200, body: { cfg: action === "modperm-save" ? mpSave(this.sql as never, input.cfg) : mpCfg(this.sql as never) } };
    }
    if (/^(asys|trk|isams)-/.test(action)) {
      const RES = (this.env as unknown as { RESULTS?: DurableObjectNamespace }).RESULTS;
      const memo = new Map<string, Promise<unknown>>();
      return trackerHandle({ sql: this.sql as never, inScope: (x, c2, s2, i) => this.inScope(x, c2, s2, i), homework: () => this.allHomework().map((h) => ({ id: h.id, kind: h.kind, cls: String(h.cls || "") })),
        tagged: (ids, qids) => { const k = ids.join(",") + "/" + qids.join(","); if (!memo.has(k)) memo.set(k, RES ? (RES.get(RES.idFromName("main")) as unknown as { scTagged(i: string[], q: string[]): Promise<unknown> }).scTagged(ids, qids) : Promise.resolve([])); return memo.get(k) as never; } }, a, action, input);
    }
    if (/^qa-/.test(action)) {
      const RES = (this.env as unknown as { RESULTS?: DurableObjectNamespace }).RESULTS;
      const memo = new Map<string, Promise<unknown>>();
      return qaHandle({ sql: this.sql as never, inScope: (x, c2, s2, i) => this.inScope(x, c2, s2, i), homework: () => this.allHomework().map((h) => ({ id: h.id, kind: h.kind, cls: String(h.cls || "") })),
        tagged: (ids, qids) => { const k = ids.join(",") + "/" + qids.join(","); if (!memo.has(k)) memo.set(k, RES ? (RES.get(RES.idFromName("main")) as unknown as { scTagged(i: string[], q: string[]): Promise<unknown> }).scTagged(ids, qids) : Promise.resolve([])); return memo.get(k) as never; },
        actorOf: (uid) => { const r = this.userRow("id=?", uid); return r && String(r.role) === "teacher" ? this.mkActor(this.publicUser(r)) : null; },
        teachers: () => this.sql.exec(`SELECT id, name FROM users WHERE role='teacher' AND COALESCE(disabled,0)=0 ORDER BY name`).toArray().map((r) => ({ id: String(r.id), name: String(r.name), subj: [] })),
        subjects: () => this.sql.exec(`SELECT name FROM catalog WHERE kind='subject' ORDER BY ord, name`).toArray().map((r) => String(r.name)),
        notify: (uids, data) => { this.ctx.waitUntil(this.pushOut(uids, "qa_ready", data).catch(() => undefined)); } }, a, action, input);
    }
    if (/^pg-/.test(action)) return pageHandle({ sql: this.sql as never, acc: (x) => mpOf(this.sql as never, x as never, "lp"), subjectsOf: (uid) => { try { return JSON.parse(String(this.userRow("id=?", uid)?.subjects || "[]")) as string[]; } catch { return []; } } }, a as never, action, input);
    if (/^lp-/.test(action)) return packHandle(this.packCtx(), a as never, action, input);
    if (action === "att-tt-shared") return { status: 200, body: { shared: ttShared(this.sql as never, a as never) } };
    if (/^(att|beh|cur)-/.test(action) || action === "quiz-topics-sync") return modHandle({ sql: this.sql, hwList: () => this.allHomework().map((h) => ({ id: h.id, title: h.title, kind: h.kind, cls: h.cls, section: h.section, students: h.students, createdBy: h.createdBy })), inScope: (x, c, s, i) => this.inScope(x, c, s, i), userRow: (w, g) => this.userRow(w, g), mp: (x, m) => mpOf(this.sql as never, x, m), ttChanged: () => { this.ctx.waitUntil(this.planTT()); }, notify: (u, k, d) => this.notify(u, k, d), canReach: (x, ids) => this.packCtx().inScopeIds(x as never, ids.filter((i) => String(this.userRow("id=?", i)?.role || "") === "student")) }, action, a, input);
    switch (action) {
      case "dl-policy": return { status: 200, body: { audio: this.dlOf(a, "audio"), export: this.dlOf(a, "export") } };
      case "dl-grant": {
        const k = input.kind === "audio" ? "audio" : "export";
        return this.dlOf(a, k) ? { status: 200, body: { ok: true } } : { status: 403, body: { error: "download_not_allowed" } };
      }
      case "dl-get": return a.role === "admin" && !a.viewAs ? { status: 200, body: this.dlCfg() } : { status: 403, body: { error: "admin_only" } };
      case "dl-set": {
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        const pick = (o: unknown) => { const r: Partial<Record<DlKind, boolean>> = {}; const x = (o && typeof o === "object" ? o : {}) as Json; for (const k of ["audio", "export"] as const) if (typeof x[k] === "boolean") r[k] = x[k] as boolean; return r; };
        const cfg: DlCfg = { students: pick(input.students), classes: {} };
        if (typeof input.qr === "boolean") cfg.qr = input.qr;
        const cl = (input.classes && typeof input.classes === "object" ? input.classes : {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(cl).slice(0, 60)) { const p = pick(v); if (Object.keys(p).length) cfg.classes![str(k, 60)] = p; }
        this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('dl:cfg', ?)`, JSON.stringify(cfg));
        return { status: 200, body: cfg };
      }
      case "me": {
        // t288: students carry their enrolled subjects and whether their assessments/area open in Arabic (Islamic A; both subjects = Arabic).
        if (a.role === "student") { const r = this.userRow("id=?", a.id); const subject = subjList(r?.subject); return { status: 200, body: { user: { ...a, subject: subject.join(", "), arabic: subject.includes("Islamic A") } } }; }
        // t292: staff get their effective module permissions so menus and buttons match the server.
        return { status: 200, body: { user: a.role === "admin" || a.role === "teacher" ? { ...a, mods: mpAll(this.sql as never, a) } : a } };
      }

      case "name-mode": {
        // How student names print on certificates and QR cards: auto (follows the language), ar, en or both. Admin sets it.
        if (input.__method === "POST") {
          if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
          const m = ["auto", "ar", "en", "both"].includes(String(input.mode)) ? String(input.mode) : "auto";
          this.sql.exec(`INSERT INTO settings (k, v) VALUES ('name:mode', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, m);
          return { status: 200, body: { mode: m } };
        }
        return { status: 200, body: { mode: this.setting("name:mode", "auto") } };
      }

      case "text-fix": {
        // Admin only: find (dry, default) or replace a text everywhere in the LMS store (e.g. a corrected surname). Logins untouched.
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        return { status: 200, body: { ok: true, hits: textReplaceAll(this.sql as never, str(input.from, 120), str(input.to, 120), input.dry !== false) } };
      }
      case "names-set": {
        // Admin only: correct a student's forename/surname spelling (username, PIN and login stay unchanged). items: [{id, firstName, lastName}]
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const done: { id: string; from: string; to: string }[] = [];
        for (const raw of (Array.isArray(input.items) ? (input.items as Json[]) : []).slice(0, 1000)) {
          const u = this.userRow("id=?", str(raw.id, 40)); const fn = str(raw.firstName, 40), ln = str(raw.lastName, 40);
          if (!u || u.role !== "student" || !fn) continue;
          const to = `${fn} ${ln}`.trim();
          this.sql.exec(`UPDATE users SET first_name=?, last_name=?, name=? WHERE id=?`, fn, ln, to, String(u.id));
          done.push({ id: String(u.id), from: String(u.name), to });
        }
        return { status: 200, body: { ok: true, done } };
      }
      case "targets-set": {
        // Admin only: set tracker Target / scaled score for students without touching other fields. items: [{id, target?, scaled?}]
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        let saved = 0;
        for (const raw of (Array.isArray(input.items) ? (input.items as Json[]) : []).slice(0, 1000)) {
          const u = this.userRow("id=?", str(raw.id, 40));
          if (!u || u.role !== "student") continue;
          const t = Math.round(Number(raw.target)), sc = Math.round(Number(raw.scaled));
          if (raw.target !== undefined) this.sql.exec(`UPDATE users SET target=? WHERE id=?`, raw.target === "" || raw.target === null || !(t >= 1 && t <= 9) ? "" : String(t), String(u.id));
          if (raw.scaled !== undefined) this.sql.exec(`UPDATE users SET scaled=? WHERE id=?`, raw.scaled === "" || raw.scaled === null || !(sc >= 1 && sc <= 200) ? "" : String(sc), String(u.id));
          if (raw.isamsId !== undefined) this.sql.exec(`UPDATE users SET isams_id=? WHERE id=?`, str(raw.isamsId, 20).replace(/[^0-9A-Za-z-]/g, ""), String(u.id));
          if (raw.isamsSurname !== undefined) this.sql.exec(`UPDATE users SET isams_surname=? WHERE id=?`, str(raw.isamsSurname, 80), String(u.id));
          saved++;
        }
        return { status: 200, body: { ok: true, saved } };
      }
      case "users": {
        if (!stuCan(a, "view") && !(input.__method === "POST" && (stuCan(a, "edit") || stuCan(a, "add")))) return { status: 403, body: { error: "forbidden" } };
        if (input.__method !== "POST") {
          return { status: 200, body: { users: this.sql.exec(`SELECT * FROM users ORDER BY role DESC, cls, name`).toArray().filter((r) => a.role === "admin" || (r.role === "student" && this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id)))).map((r) => (a.role === "admin" ? this.adminUser(r) : this.publicUser(r))), now: Date.now(), adminSeen: this.adminSeen() } };
        }
        const list = Array.isArray(input.users) ? (input.users as Json[]).slice(0, 1000) : [];
        const pins: { username: string; name: string; pin: string }[] = [];
        const errors: { row: number; username: string; error: string }[] = [];
        let saved = 0;
        for (const [i, raw] of list.entries()) {
          const username = normUser(raw.username);
          const name = str(raw.name, 80);
          const role: Role = raw.role === "teacher" ? "teacher" : "student";
          // Only the admin can create or edit teachers.
          if (role === "teacher" && a.role !== "admin") { errors.push({ row: i + 1, username, error: "admin_only" }); continue; }
          const perms = role === "teacher" ? (Array.isArray(raw.perms) ? (raw.perms as unknown[]).map(String).filter((p) => (PERMS as readonly string[]).includes(p) || STU_PERM.test(p) || /^(act|host):[\w*-]{1,80}$/.test(p) || /^vat:u_[\w-]{1,60}$/.test(p) || /^(att|beh):(view|edit)$|^cur:(view|edit|delete)$|^qhw:(set|show|view|add|edit|delete)$|^nodl:(audio|export)$|^hide:(messaging|wall|activities|homework|assessments|results)$|^rep:view$|^trk:(view|edit|effort|xlsx|pdf|isams):(on|off)$|^rep:(kpi|attainment|progress|quran|homework|coverage|drill|pdf|xlsx):(on|off)$/.test(p) || MP_PERM.test(p)).slice(0, 80) : ["assign", "review"]) : [];
          const cls = str(raw.cls, 40);
          const section = role === "student" ? str(raw.section, 40) : "";
          const subjects = role === "teacher" ? strList(raw.subjects) : [];
          const scope = role === "teacher" ? strList(raw.scope, 80) : [];
          let email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw.email || "").trim()) ? String(raw.email).trim().slice(0, 120) : "";
          // Teachers with "Manage students" may only add/edit students in their own classes.
          if (a.role === "teacher" && !this.inScope(a, cls, section)) { errors.push({ row: i + 1, username, error: "not_your_class" }); continue; }
          const gender = raw.gender === "b" || raw.gender === "g" ? String(raw.gender) : "";
          const isAdm = a.role === "admin";
          const placement = this.checkPlacement(cls, section, subjects, scope);
          if (placement) { errors.push({ row: i + 1, username, error: placement }); continue; }
          const existing = raw.id ? this.userRow("id=?", String(raw.id)) : this.userRow("username=?", username);
          let prevCls = "", prevPhase = "";
          if (a.role === "teacher" && !stuCan(a, existing ? "edit" : "add")) { errors.push({ row: i + 1, username, error: existing ? "no_edit_permission" : "no_add_permission" }); continue; }
          if (!username || username.length < 3) { errors.push({ row: i + 1, username, error: "username" }); continue; }
          if (!name) { errors.push({ row: i + 1, username, error: "name" }); continue; }
          const clash = this.userRow("username=?", username);
          if (clash && (!existing || clash.id !== existing.id)) { errors.push({ row: i + 1, username, error: "username_taken" }); continue; }
          let pin = str(raw.pin, 64);
          if (pin && !validPin(pin)) { errors.push({ row: i + 1, username, error: "pin_digits" }); continue; }
          if (existing) {
            if (existing.role === "parent") { errors.push({ row: i + 1, username, error: "use_parents_page" }); continue; }
            if (existing.role === "teacher" && a.role !== "admin") { errors.push({ row: i + 1, username, error: "admin_only" }); continue; }
            if (a.role !== "admin" || raw.email === undefined) email = String(existing.email || "");
            if (a.role === "teacher" && !this.inScope(a, String(existing.cls || ""), String(existing.section || ""), String(existing.id))) { errors.push({ row: i + 1, username, error: "not_your_class" }); continue; }
            if (isAdm && role === "student") this.savePrivate(String(existing.id), raw, gender);
            prevCls = String(existing.cls || ""); prevPhase = String(existing.phase || "");
            this.sql.exec(`UPDATE users SET username=?, name=?, role=?, cls=?, section=?, subjects=?, scope=?, perms=?, disabled=?, email=? WHERE id=?`, username, name, role, cls, section, JSON.stringify(subjects), JSON.stringify(scope), JSON.stringify(perms), stuCan(a, "block") ? (raw.disabled ? 1 : 0) : Number(existing.disabled || 0), raw.email === undefined ? String(existing.email || "") : email, String(existing.id));
            if (pin && a.role === "admin") await this.setPin(String(existing.id), pin);
            if (a.role !== "admin" && role === "student") { const pp = name.split(/\s+/); this.sql.exec(`UPDATE users SET first_name=?, last_name=? WHERE id=?`, pp[0] || "", pp.slice(1).join(" "), String(existing.id)); }
          } else {
            if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM users`).one().n) >= MAX_USERS) { errors.push({ row: i + 1, username, error: "full" }); continue; }
            if (!pin) pin = newPin();
            const id = rid("u");
            this.sql.exec(`INSERT INTO users (id, username, name, role, cls, section, subjects, scope, perms, disabled, created, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, username, name, role, cls, section, JSON.stringify(subjects), JSON.stringify(scope), JSON.stringify(perms), stuCan(a, "block") && raw.disabled ? 1 : 0, Date.now(), email);
            await this.setPin(id, pin);
            if (role === "student") { if (isAdm) this.savePrivate(id, raw, gender); const pp = name.split(/\s+/); if (!isAdm || !raw.firstName) this.sql.exec(`UPDATE users SET first_name=?, last_name=? WHERE id=?`, pp[0] || "", pp.slice(1).join(" "), id); }
            pins.push({ username, name, pin });
          }
          {
            const uid = String((existing || this.userRow("username=?", username))?.id || "");
            if (uid) {
              if (isAdm && raw.subject !== undefined && role === "student") this.sql.exec(`UPDATE users SET subject=? WHERE id=?`, subjList(Array.isArray(raw.subject) ? (raw.subject as unknown[]).join(",") : str(raw.subject, 120)).join(", "), uid);
              if (role === "student") {
                const given = isAdm && raw.phase !== undefined ? this.normPhase(raw.phase, false) : "";
                const auto = !prevPhase || prevCls !== cls ? this.phaseOfClass(cls) : prevPhase;
                this.sql.exec(`UPDATE users SET phase=? WHERE id=?`, given || auto, uid);
              } else if (isAdm && raw.phase !== undefined) this.sql.exec(`UPDATE users SET phase=? WHERE id=?`, this.normPhase(raw.phase, true), uid);
            }
          }
          saved++;
        }
        return { status: 200, body: { saved, pins, errors } };
      }

      case "users-status": {
        // Bulk Activate / Block. Teachers can only be changed by the admin.
        if (!stuCan(a, "block")) return { status: 403, body: { error: "forbidden" } };
        const ids = strList(input.ids, 1000);
        const off = input.disabled ? 1 : 0;
        let changed = 0;
        for (const id of ids) {
          const r = this.userRow("id=?", id);
          if (!r || ((r.role === "teacher" || r.role === "parent") && a.role !== "admin") || (a.role === "teacher" && !this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id)))) continue;
          this.sql.exec(`UPDATE users SET disabled=? WHERE id=?`, off, id);
          changed++;
        }
        return { status: 200, body: { ok: true, changed } };
      }

      case "user-delete": {
        if (!stuCan(a, "delete")) return { status: 403, body: { error: "forbidden" } };
        const r = this.userRow("id=?", str(input.id, 40));
        if (!r) return { status: 404, body: { error: "not_found" } };
        if ((r.role === "teacher" || r.role === "parent") && a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        if (a.role === "teacher" && !this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id))) return { status: 403, body: { error: "not_your_class" } };
        this.sql.exec(`DELETE FROM plink WHERE student=? OR parent=?`, String(r.id), String(r.id));
        this.sql.exec(`DELETE FROM pts WHERE student=?`, String(r.id));
        this.sql.exec(`DELETE FROM users WHERE id=?`, String(r.id));
        await this.dropBlobsOfSubs(this.sql.exec(`SELECT id FROM subs WHERE student=?`, String(r.id)).toArray().map((x) => String(x.id)));
        this.sql.exec(`DELETE FROM notes WHERE uid=?`, String(r.id));
        this.sql.exec(`DELETE FROM subs WHERE student=?`, String(r.id));
        this.sql.exec(`DELETE FROM tracker WHERE student=?`, String(r.id));
        return { status: 200, body: { ok: true } };
      }

      case "user-pin": {
        // Teachers can never set or reset a student's PIN (that would let them sign in as the student).
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        if (!stuCan(a, "edit")) return { status: 403, body: { error: "forbidden" } };
        const r = this.userRow("id=?", str(input.id, 40));
        if (!r) return { status: 404, body: { error: "not_found" } };
        if ((r.role === "teacher" || r.role === "parent") && a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const pin = str(input.pin, 64) || newPin();
        if (!validPin(pin)) return { status: 400, body: { error: "pin_digits" } };
        await this.setPin(String(r.id), pin);
        return { status: 200, body: { pin } };
      }

      case "catalog":
        return { status: 200, body: this.catalog() };

      case "ann-list": {
        const rows = this.sql.exec(`SELECT * FROM ann ORDER BY created DESC LIMIT 50`).toArray().filter((r) => a.role === "admin" || this.annFor(r, a));
        return { status: 200, body: { items: rows.slice(0, a.role === "admin" ? 50 : 10).map((r) => ({ id: String(r.id), title: String(r.title), body: String(r.body), aud: String(r.aud), cls: String(r.cls || ""), section: String(r.section || ""), by: String(r.by), created: Number(r.created) })) } };
      }
      case "ann-save": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const aud = ["all", "students", "teachers", "class"].includes(String(input.aud)) ? String(input.aud) : "all";
        const title = str(input.title, 140), body = str(input.body, 2000);
        if (!title) return { status: 400, body: { error: "title_required" } };
        const row = { id: rid("a"), title, body, aud, cls: aud === "class" ? str(input.cls, 80) : "", section: aud === "class" ? str(input.section, 80) : "", by: a.name, created: Date.now() };
        this.sql.exec(`INSERT INTO ann (id, title, body, aud, cls, section, by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, row.id, row.title, row.body, row.aud, row.cls, row.section, row.by, row.created);
        const users = this.sql.exec(`SELECT id, role, cls, section, scope FROM users WHERE disabled=0`).toArray().filter((u) => this.annFor(row, { id: String(u.id), role: String(u.role) as Role, name: "", cls: String(u.cls || ""), perms: [], scope: String(u.role) === "teacher" ? this.teacherScope(String(u.id)).scope : JSON.parse(String(u.scope || "[]")), section: String(u.section || "") } as Actor & { section: string }));
        this.notify(users.map((u) => String(u.id)), "announcement", { title });
        return { status: 200, body: { ok: true, sent: users.length } };
      }
      case "ann-delete": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        this.sql.exec(`DELETE FROM ann WHERE id=?`, str(input.id, 40));
        return { status: 200, body: { ok: true } };
      }

      case "push-key": {
        return { status: 200, body: { key: (await this.vapid()).pub } };
      }
      case "push-sub": {
        if (a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const ep = str(input.endpoint, 1000), p = str(input.p256dh, 200), au = str(input.auth, 100);
        if (!/^https:\/\//.test(ep) || !p || !au) return { status: 400, body: { error: "bad_input" } };
        if (input.off) { this.sql.exec(`DELETE FROM push_sub WHERE endpoint=? AND uid=?`, ep, a.id); return { status: 200, body: { ok: true } }; }
        this.sql.exec(`INSERT INTO push_sub (endpoint, uid, p256dh, auth, ua, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET uid=excluded.uid, p256dh=excluded.p256dh, auth=excluded.auth, ua=excluded.ua, at=excluded.at`, ep, a.id, p, au, str(input.ua, 200), Date.now());
        return { status: 200, body: { ok: true } };
      }
      case "push-prefs": {
        // Per-user switches per feature type (and, for the admin, the global switch per type).
        if (a.viewAs) return { status: 403, body: { error: "forbidden" } };
        this.sql.exec(`INSERT OR IGNORE INTO push_kind (kind, first, admin_off) VALUES ('child_progress', ?, 1)`, Date.now()); // t332: off until the admin turns it on
        this.sql.exec(`INSERT OR IGNORE INTO push_kind (kind, first, admin_off) VALUES ('qa_ready', ?, 1)`, Date.now()); // t336: off until the admin turns it on
        for (const kk of Object.keys(PUSH_TEXT)) this.sql.exec(`INSERT OR IGNORE INTO push_kind (kind, first, admin_off) VALUES (?, ?, 0)`, kk, Date.now());
        if (input.kind) {
          const kd = str(input.kind, 40);
          if (input.admin !== undefined) { if (a.role !== "admin") return { status: 403, body: { error: "forbidden" } }; this.sql.exec(`UPDATE push_kind SET admin_off=? WHERE kind=?`, input.admin ? 0 : 1, kd); }
          if (input.on !== undefined) this.sql.exec(`INSERT INTO push_pref (uid, kind, off) VALUES (?, ?, ?) ON CONFLICT(uid, kind) DO UPDATE SET off=excluded.off`, a.id, kd, input.on ? 0 : 1);
        }
        const offs = new Set(this.sql.exec(`SELECT kind FROM push_pref WHERE uid=? AND off=1`, a.id).toArray().map((r) => String(r.kind)));
        const kinds = this.sql.exec(`SELECT kind, admin_off FROM push_kind ORDER BY first, kind`).toArray().map((r) => ({ kind: String(r.kind), label: (PUSH_TEXT[String(r.kind)] || [String(r.kind)])[0], adminOn: !Number(r.admin_off), on: !offs.has(String(r.kind)) }));
        const devices = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM push_sub WHERE uid=?`, a.id).one().n);
        return { status: 200, body: { kinds, devices } };
      }
      case "tt-tick-test": {
        // Admin test hook: run the lesson-reminder check for a given time, only for zz test accounts.
        if (a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
        return { status: 200, body: { sent: this.ttTick(Number(input.at) || Date.now(), true) } };
      }
      case "push-test": {
        // Sends a test push to the caller's own devices only.
        if (a.viewAs) return { status: 403, body: { error: "forbidden" } };
        this.notify([a.id], "test", { by: a.name });
        return { status: 200, body: { ok: true } };
      }
      case "my-avatar": {
        // t302/t303: a student (or teacher) picks their own character from the 12 cartoon avatars of their kind.
        if (a.viewAs || a.role === "parent") return { status: 403, body: { error: "forbidden" } };
        const u0 = this.userRow("id=?", a.id);
        if (!u0) return { status: 404, body: { error: "not_found" } };
        const g = u0.gender === "b" || u0.gender === "g" ? String(u0.gender) : "n";
        const n = Math.floor(Number(input.n));
        if (!(n >= 0 && n < AV_N)) return { status: 400, body: { error: "bad_input" } };
        const code = `${input.kind === "a" ? "a" : g}${n}`;
        this.sql.exec(`UPDATE users SET avatar=? WHERE id=?`, code, a.id);
        return { status: 200, body: { avatar: code, kind: g } };
      }
      case "ui-prefs": {
        // t304: per-user menu layout (rail order/hidden, dashboard tiles order/hidden).
        if (a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const k = `ui:${a.id}`;
        if (input.save && typeof input.save === "object") { const v = JSON.stringify(input.save).slice(0, 6000); this.sql.exec(`INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, k, v); }
        if (input.reset) this.sql.exec(`DELETE FROM settings WHERE k=?`, k);
        let v: unknown = {}; try { v = JSON.parse(String(this.sql.exec(`SELECT v FROM settings WHERE k=?`, k).toArray()[0]?.v || "{}")); } catch { v = {}; }
        return { status: 200, body: { prefs: v } };
      }
      case "my-photo": {
        // t305: own profile photo (already cropped + compressed in the browser), or remove it to go back to a character.
        if (a.viewAs || a.role === "parent" || a.role === "admin") return { status: 403, body: { error: "forbidden" } };
        if (a.role === "student" && !input.remove) return { status: 403, body: { error: "photos_not_allowed" } };
        if (input.remove) { this.sql.exec(`UPDATE users SET avatar='' WHERE id=?`, a.id); return { status: 200, body: { avatar: avatarOf(this.userRow("id=?", a.id) || {}) } }; }
        const d = String(input.data || "");
        if (!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d) || d.length > 40000) return { status: 400, body: { error: "photo_too_big" } };
        this.sql.exec(`UPDATE users SET avatar=? WHERE id=?`, d, a.id);
        return { status: 200, body: { avatar: d } };
      }
      case "std-doc-list": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        this.stdInit();
        // t311: teachers only see the standards of their own subject(s); admin sees all.
        const mine = this.stdMine(a);
        return { status: 200, body: { all: mine === null, subjects: mine, items: this.sql.exec(`SELECT subject, name, lang, size, at FROM stddoc ORDER BY subject`).toArray().filter((r) => mine === null || mine.some((x) => x.toLowerCase() === String(r.subject).toLowerCase())).map((r) => ({ subject: String(r.subject), name: String(r.name), lang: String(r.lang || ""), size: Number(r.size), at: Number(r.at) })) } };
      }
      case "std-doc-get": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        this.stdInit();
        const subj = str(input.subject, 80);
        const mine = this.stdMine(a);
        if (mine !== null && !mine.some((x) => x.toLowerCase() === subj.toLowerCase())) return { status: 403, body: { error: "not_your_subject" } };
        const m = this.sql.exec(`SELECT * FROM stddoc WHERE subject=?`, subj).toArray()[0];
        if (!m) return { status: 404, body: { error: "not_found" } };
        const data = this.sql.exec(`SELECT data FROM stddoc_c WHERE subject=? ORDER BY i`, subj).toArray().map((r) => String(r.data)).join("");
        return { status: 200, body: { subject: subj, name: String(m.name), mime: String(m.mime), lang: String(m.lang || ""), data } };
      }
      case "std-doc-save": {
        // t304: the Standards document of a subject (admin, Subjects form). Stored in chunks; one per subject.
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        this.stdInit();
        const subj = str(input.subject, 80);
        if (!subj) return { status: 400, body: { error: "name" } };
        if (input.remove) { this.sql.exec(`DELETE FROM stddoc WHERE subject=?`, subj); this.sql.exec(`DELETE FROM stddoc_c WHERE subject=?`, subj); return { status: 200, body: { ok: true } }; }
        const data = String(input.data || "").replace(/^data:[^,]*,/, "");
        const mime = /^(application\/pdf|image\/(png|jpeg)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(String(input.mime)) ? String(input.mime) : "";
        if (!mime || !/^[A-Za-z0-9+/=]+$/.test(data) || data.length > 14_000_000) return { status: 400, body: { error: "bad_file" } };
        this.sql.exec(`DELETE FROM stddoc_c WHERE subject=?`, subj);
        for (let i = 0, k = 0; i < data.length; i += 900_000, k++) this.sql.exec(`INSERT INTO stddoc_c (subject, i, data) VALUES (?, ?, ?)`, subj, k, data.slice(i, i + 900_000));
        this.sql.exec(`INSERT INTO stddoc (subject, name, mime, lang, size, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(subject) DO UPDATE SET name=excluded.name, mime=excluded.mime, lang=excluded.lang, size=excluded.size, at=excluded.at`, subj, str(input.name, 120) || "Standards", mime, input.lang === "ar" ? "ar" : "en", Math.floor(data.length * 0.75), Date.now());
        return { status: 200, body: { ok: true } };
      }
      case "my-avatar-kind": {
        if (a.viewAs || a.role === "parent") return { status: 403, body: { error: "forbidden" } };
        const u0 = this.userRow("id=?", a.id);
        if (!u0) return { status: 404, body: { error: "not_found" } };
        return { status: 200, body: { avatar: avatarOf(u0), kind: u0.gender === "b" || u0.gender === "g" ? String(u0.gender) : "n", name: String(u0.name || ""), nameAr: String(u0.name_ar || ""), arabic: subjList(u0.subject).includes("Islamic A"), photos: u0.role !== "student" } };
      }
      case "user-avatar": {
        // Teacher/admin: reroll the cartoon avatar (gender stays server-side; set by the admin only).
        const sid = str(input.id, 40);
        if (!isStaff(a) || a.viewAs || !this.inScope(a, ...this.placeOf(sid), sid)) return { status: 403, body: { error: "forbidden" } };
        const u0 = this.userRow("id=? AND role='student'", sid);
        if (!u0) return { status: 404, body: { error: "not_found" } };
        const g = u0.gender === "b" || u0.gender === "g" ? String(u0.gender) : "n";
        const cur = avatarOf(u0);
        let code = cur;
        while (code === cur) code = `${g}${Math.floor(Math.random() * AV_N)}`;
        this.sql.exec(`UPDATE users SET avatar=? WHERE id=?`, code, sid);
        return { status: 200, body: { avatar: code } };
      }
      case "class-roster": {
        // Students the teacher teaches (admin: all), with avatar + points total, for the "My classes" view.
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        const tot = new Map(this.sql.exec(`SELECT student, SUM(pts) AS t FROM pts GROUP BY student`).toArray().map((r) => [String(r.student), Number(r.t)]));
        const students = this.sql.exec(`SELECT id, name, first_name, last_name, cls, section, gender, avatar, email, last_seen FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray()
          .filter((r) => this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id)))
          .map((r) => ({ id: String(r.id), name: String(r.name), cls: String(r.cls || ""), section: String(r.section || ""), avatar: avatarOf(r), parentEmail: Boolean(r.email), seen: Number(r.last_seen || 0), points: tot.get(String(r.id)) || 0 }));
        return { status: 200, body: { students, assigned: a.role === "teacher" ? [...new Set((a.scope || []).filter((x) => x && x !== "\u0000"))] : [], canManage: stuCan(a, "view"), stuPerms: { view: stuCan(a, "view"), add: stuCan(a, "add"), edit: stuCan(a, "edit"), block: stuCan(a, "block"), delete: stuCan(a, "delete") }, now: Date.now() } };
      }
      case "act-publish": {
        // Teacher started a live activity for chosen students: it shows up on their LMS home with a one-tap Join (no code to type).
        if (!isStaff(a) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        { const ty = str(input.type, 12); if (a.role === "teacher" && (a.perms.includes("hide:activities") || !(a.perms.includes("act:*") || a.perms.includes(`act:${ty}`) || (ty === "assess" && a.perms.some((p) => p.startsWith("host:")))))) return { status: 403, body: { error: "activity_not_allowed" } }; }
        const code = str(input.code, 8).toUpperCase();
        const ids = strList(input.students, 300).filter((sid) => this.inScope(a, ...this.placeOf(sid), sid));
        if (!/^[A-Z0-9]{4,8}$/.test(code) || !ids.length) return { status: 400, body: { error: "bad" } };
        this.sql.exec(`DELETE FROM alive WHERE at<?`, Date.now() - 6 * 3600e3);
        // t312: locked = only these students may join (signed in, under their account name); everyone else is refused.
        this.sql.exec(`INSERT OR REPLACE INTO alive (code, type, title, owner, owner_name, students, at, locked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, code, str(input.type, 12), str(input.title, 120), a.id, a.name, JSON.stringify(ids), Date.now(), input.locked === true ? 1 : 0);
        return { status: 200, body: { ok: true, count: ids.length, locked: input.locked === true } };
      }
      case "act-live": {
        if (a.role !== "student") return { status: 200, body: { items: [] } };
        const rows = this.sql.exec(`SELECT code, type, title, owner_name, students, at FROM alive WHERE at>? ORDER BY at DESC`, Date.now() - 3 * 3600e3).toArray();
        return { status: 200, body: { items: rows.filter((r) => (JSON.parse(String(r.students)) as string[]).includes(a.id)).map((r) => ({ code: String(r.code), type: String(r.type), title: String(r.title), teacher: String(r.owner_name), at: Number(r.at) })) } };
      }
      case "wall-classes": {
        const staff = isStaff(a);
        const names = new Map(this.sql.exec(`SELECT id, name FROM users WHERE role='student'`).toArray().map((r) => [String(r.id), String(r.name)]));
        const grps = this.wallGroups().filter((g) => (a.role === "student" ? g.ids.includes(a.id) : a.role === "admin" || g.teachers.includes(a.id)));
        const items: { key: string; label: string; group?: boolean; members?: { id: string; name: string }[]; count?: number }[] = grps.map((g) => ({
          key: `g:${g.id}`, label: g.subject ? `${g.name} · ${g.subject}` : g.name, group: true, count: g.ids.length,
          ...(staff ? { members: g.ids.filter((sid) => a.role === "admin" || this.inScope(a, ...this.placeOf(sid), sid)).map((sid) => ({ id: sid, name: names.get(sid) || "" })).sort((x, y) => x.name.localeCompare(y.name)) } : {}),
        }));
        // Older class-based walls that already have posts stay visible (read/comment) to the people in that class.
        const old = this.sql.exec(`SELECT DISTINCT wkey FROM wall WHERE wkey NOT LIKE 'g:%'`).toArray().map((r) => String(r.wkey)).filter((k) => this.wallKeyOk(a, k));
        for (const k of old) items.push({ key: k, label: k.split("|").filter(Boolean).join(" · ") });
        return { status: 200, body: { items, canPost: staff && !a.viewAs && grps.length > 0 } };
      }
      case "wall-list": {
        // One wall ("key") or several selected group walls ("keys"): posts merged, newest first; a post sent to several
        // selected groups at once (same batch) is shown once, with every group it went to.
        const keys = [...new Set((Array.isArray(input.keys) ? (input.keys as unknown[]) : [input.key]).map((k) => str(k, 80)).filter(Boolean))].slice(0, 30);
        if (!keys.length || keys.some((k) => !this.wallKeyOk(a, k))) return { status: 403, body: { error: "forbidden" } };
        const rows = this.sql.exec(`SELECT id, wkey, batch, by, name, text, image IS NOT NULL AND image<>'' AS hasImg, audio IS NOT NULL AND audio<>'' AS hasAud, pinned, at FROM wall WHERE wkey IN (${keys.map(() => "?").join(",")}) ORDER BY pinned DESC, at DESC LIMIT ${keys.length > 1 ? 150 : 60}`, ...keys).toArray();
        const seen = new Map<string, Record<string, unknown> & { keys: string[] }>();
        const posts: (Record<string, unknown> & { keys: string[] })[] = [];
        for (const r of rows) { const b = String(r.batch || ""); const ex = b ? seen.get(b) : undefined; if (ex) { if (!ex.keys.includes(String(r.wkey))) ex.keys.push(String(r.wkey)); continue; } const o = { ...r, keys: [String(r.wkey)] }; if (b) seen.set(b, o); posts.push(o); }
        // Per group: each post copy (one per group wall) holds only the likes/comments made in that group's wall.
        const inter = (id: string, key: string) => ({
          key, post: id,
          likes: Number(this.sql.exec(`SELECT COUNT(*) AS n FROM wlike WHERE post=? AND wkey=?`, id, key).one().n), liked: this.sql.exec(`SELECT 1 FROM wlike WHERE post=? AND wkey=? AND by=?`, id, key, a.id).toArray().length > 0,
          comments: this.sql.exec(`SELECT id, name, role, text, at FROM wcom WHERE post=? AND wkey=? ORDER BY at`, id, key).toArray().map((m) => ({ id: String(m.id), name: String(m.name), role: String(m.role), text: String(m.text), at: Number(m.at) })),
        });
        const copyOf = new Map<string, string>(); for (const r of rows) copyOf.set(`${r.batch || r.id}|${r.wkey}`, String(r.id));
        const out = posts.map((p) => {
          const groups = p.keys.map((k) => inter(copyOf.get(`${p.batch || p.id}|${k}`) || String(p.id), k));
          return { keys: p.keys, id: String(p.id), name: String(p.name), text: String(p.text), hasImage: !!p.hasImg, hasAudio: !!p.hasAud, pinned: !!p.pinned, at: Number(p.at), likes: groups[0].likes, liked: groups[0].liked, comments: groups[0].comments, groups };
        });
        return { status: 200, body: { posts: out, canModerate: isStaff(a) && !a.viewAs } };
      }
      case "wall-media": {
        const r = this.sql.exec(`SELECT wkey, image, audio FROM wall WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        if (!this.wallKeyOk(a, String(r.wkey))) return { status: 403, body: { error: "forbidden" } };
        if (input.dl && !this.dlOf(a, "audio")) return { status: 403, body: { error: "download_not_allowed" } };
        return { status: 200, body: { image: String(r.image || ""), audio: String(r.audio || "") } };
      }
      case "wall-post": {
        // One group ("key") or several ("keys"): one copy per group wall, linked by a shared batch id.
        const keys = [...new Set((Array.isArray(input.keys) ? (input.keys as unknown[]) : [input.key]).map((k) => str(k, 80)).filter(Boolean))].slice(0, 30);
        if (!isStaff(a) || a.viewAs || !keys.length || keys.some((k) => !k.startsWith("g:") || !this.wallKeyOk(a, k))) return { status: 403, body: { error: "forbidden" } };
        const text = wallText(input.text, 1500);
        const image = String(input.image || ""), audio = String(input.audio || "");
        if ((image && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 1_000_000)) || (audio && (!/^data:audio\/[a-z0-9.+-]+(;codecs=[a-z0-9.,-]+)?;base64,[A-Za-z0-9+/=]+$/i.test(audio) || audio.length > 900_000))) return { status: 400, body: { error: "bad_media" } };
        if (!text && !image && !audio) return { status: 400, body: { error: "empty" } };
        const batch = keys.length > 1 ? rid("wb") : "", at = Date.now();
        for (const k of keys) this.sql.exec(`INSERT INTO wall (id, wkey, by, name, text, image, audio, pinned, at, batch) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`, rid("wp"), k, a.id, a.name, text, image, audio, at, batch);
        return { status: 200, body: { ok: true, count: keys.length } };
      }
      case "wall-comment": {
        const p = this.sql.exec(`SELECT wkey FROM wall WHERE id=?`, str(input.post, 40)).toArray()[0];
        if (!p || a.viewAs) return { status: 404, body: { error: "not_found" } };
        if (!this.wallKeyOk(a, String(p.wkey)) || (input.key !== undefined && str(input.key, 80) !== String(p.wkey))) return { status: 403, body: { error: "forbidden" } };
        const text = wallText(input.text, 400);
        if (!text) return { status: 400, body: { error: "empty" } };
        const recent = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM wcom WHERE by=? AND at>?`, a.id, Date.now() - 60_000).one().n);
        if (recent >= 8) return { status: 429, body: { error: "slow_down" } };
        this.sql.exec(`INSERT INTO wcom (id, post, by, name, role, text, at, wkey) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, rid("wc"), str(input.post, 40), a.id, a.name, a.role, text, Date.now(), String(p.wkey));
        return { status: 200, body: { ok: true } };
      }
      case "wall-like": {
        const p = this.sql.exec(`SELECT wkey FROM wall WHERE id=?`, str(input.post, 40)).toArray()[0];
        if (!p || a.viewAs) return { status: 404, body: { error: "not_found" } };
        if (!this.wallKeyOk(a, String(p.wkey)) || (input.key !== undefined && str(input.key, 80) !== String(p.wkey))) return { status: 403, body: { error: "forbidden" } };
        const id = str(input.post, 40);
        if (this.sql.exec(`SELECT 1 FROM wlike WHERE post=? AND by=?`, id, a.id).toArray().length) this.sql.exec(`DELETE FROM wlike WHERE post=? AND by=?`, id, a.id);
        else this.sql.exec(`INSERT INTO wlike (post, by, wkey) VALUES (?, ?, ?)`, id, a.id, String(p.wkey));
        return { status: 200, body: { ok: true } };
      }
      case "wall-mod": {
        // Teacher/admin moderation: delete a post or comment, pin/unpin a post.
        if (!isStaff(a) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const op = str(input.op, 12);
        if (op === "delcom") {
          const m = this.sql.exec(`SELECT w.wkey FROM wcom c JOIN wall w ON w.id=c.post WHERE c.id=?`, str(input.id, 40)).toArray()[0];
          if (!m) return { status: 404, body: { error: "not_found" } };
          if (!this.wallKeyOk(a, String(m.wkey))) return { status: 403, body: { error: "forbidden" } };
          this.sql.exec(`DELETE FROM wcom WHERE id=?`, str(input.id, 40));
          return { status: 200, body: { ok: true } };
        }
        const p = this.sql.exec(`SELECT wkey FROM wall WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!p) return { status: 404, body: { error: "not_found" } };
        if (!this.wallKeyOk(a, String(p.wkey))) return { status: 403, body: { error: "forbidden" } };
        const id0 = str(input.id, 40);
        // A post sent to several groups at once: delete/pin acts on every copy this person may moderate.
        const b = String(this.sql.exec(`SELECT batch FROM wall WHERE id=?`, id0).toArray()[0]?.batch || "");
        const ids = b ? this.sql.exec(`SELECT id, wkey FROM wall WHERE batch=?`, b).toArray().filter((r) => this.wallKeyOk(a, String(r.wkey))).map((r) => String(r.id)) : [id0];
        if (op !== "delete" && op !== "pin" && op !== "unpin") return { status: 400, body: { error: "bad" } };
        for (const id of ids) {
          if (op === "delete") { this.sql.exec(`DELETE FROM wcom WHERE post=?`, id); this.sql.exec(`DELETE FROM wlike WHERE post=?`, id); this.sql.exec(`DELETE FROM wall WHERE id=?`, id); }
          else this.sql.exec(`UPDATE wall SET pinned=? WHERE id=?`, op === "pin" ? 1 : 0, id);
        }
        return { status: 200, body: { ok: true } };
      }
      case "pcat-list": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        if (!this.sql.exec(`SELECT 1 FROM pcat WHERE owner=?`, a.id).toArray().length) DEFAULT_CATS.forEach(([l, p, ic], i) => this.sql.exec(`INSERT INTO pcat (id, owner, label, pts, icon, pos) VALUES (?, ?, ?, ?, ?, ?)`, rid("pc"), a.id, l, p, ic, i));
        for (const d of this.sql.exec(`SELECT id, label, pts FROM pcat WHERE owner=? ORDER BY pos, rowid`, a.id).toArray().reduce((acc, r, _i, all) => { const k = `${String(r.label).toLowerCase().trim()}|${Number(r.pts) > 0}`; (acc.seen as Set<string>).has(k) ? (acc.drop as string[]).push(String(r.id)) : (acc.seen as Set<string>).add(k); void all; return acc; }, { seen: new Set<string>(), drop: [] as string[] }).drop) this.sql.exec(`DELETE FROM pcat WHERE id=?`, d);
        return { status: 200, body: { items: this.sql.exec(`SELECT id, label, pts, icon FROM pcat WHERE owner=? ORDER BY pos, label`, a.id).toArray().map((r) => ({ id: String(r.id), label: String(r.label), pts: Number(r.pts), icon: String(r.icon || "") })) } };
      }
      case "pcat-save": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        const label = str(input.label, 40), pts = Math.max(-5, Math.min(5, Math.round(Number(input.pts) || 0))) || 1, icon = str(input.icon, 8);
        if (!label) return { status: 400, body: { error: "label_required" } };
        let id = str(input.id, 40);
        // A repeated reason (same wording and direction) counts as one: reuse and update it instead of adding a copy.
        const dupe = this.sql.exec(`SELECT id FROM pcat WHERE owner=? AND LOWER(TRIM(label))=? AND (pts>0)=?`, a.id, label.toLowerCase().trim(), pts > 0).toArray()[0];
        if (dupe && String(dupe.id) !== id) { if (id) this.sql.exec(`DELETE FROM pcat WHERE id=? AND owner=?`, id, a.id); id = String(dupe.id); }
        if (id && this.sql.exec(`SELECT 1 FROM pcat WHERE id=? AND owner=?`, id, a.id).toArray().length) this.sql.exec(`UPDATE pcat SET label=?, pts=?, icon=? WHERE id=?`, label, pts, icon, id);
        else this.sql.exec(`INSERT INTO pcat (id, owner, label, pts, icon, pos) VALUES (?, ?, ?, ?, ?, ?)`, rid("pc"), a.id, label, pts, icon, 99);
        return { status: 200, body: { ok: true } };
      }
      case "pcat-delete": {
        this.sql.exec(`DELETE FROM pcat WHERE id=? AND owner=?`, str(input.id, 40), a.id);
        return { status: 200, body: { ok: true } };
      }
      case "pts-award": {
        if (!isStaff(a) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const c = this.sql.exec(`SELECT * FROM pcat WHERE id=? AND owner=?`, str(input.cat, 40), a.id).toArray()[0];
        if (!c) return { status: 404, body: { error: "not_found" } };
        const ids = strList(input.students, 300).filter((sid) => this.inScope(a, ...this.placeOf(sid), sid));
        if (!ids.length) return { status: 400, body: { error: "no_students" } };
        const batch = rid("pb"), at = Date.now();
        for (const sid of ids) this.sql.exec(`INSERT INTO pts (id, student, cat, label, pts, icon, by, owner, batch, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, rid("pt"), sid, String(c.id), String(c.label), Number(c.pts), String(c.icon || ""), a.name, a.id, batch, at);
        return { status: 200, body: { ok: true, batch, count: ids.length } };
      }
      case "pts-undo": {
        // Undo the teacher's most recent award (or a given batch of theirs).
        const b = str(input.batch, 40) || String(this.sql.exec(`SELECT batch FROM pts WHERE owner=? ORDER BY at DESC LIMIT 1`, a.id).toArray()[0]?.batch || "");
        if (!b) return { status: 404, body: { error: "nothing_to_undo" } };
        const n = this.sql.exec(`SELECT COUNT(*) AS n FROM pts WHERE batch=? AND owner=?`, b, a.id).one().n;
        this.sql.exec(`DELETE FROM pts WHERE batch=? AND owner=?`, b, a.id);
        return { status: 200, body: { ok: true, removed: Number(n) } };
      }
      case "pts-list": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        const from = Number(input.from) || 0, to = Number(input.to) || Date.now() + 86400000;
        let ids: string[] = strList(input.students, 500);
        const cls = str(input.cls, 80), section = str(input.section, 80);
        if (!ids.length) ids = this.sql.exec(`SELECT id, cls, section FROM users WHERE role='student'`).toArray().filter((r) => (!cls || r.cls === cls) && (!section || r.section === section)).map((r) => String(r.id));
        ids = ids.filter((sid) => this.inScope(a, ...this.placeOf(sid), sid));
        const set = new Set(ids);
        const rows = this.sql.exec(`SELECT p.*, u.name AS sname FROM pts p LEFT JOIN users u ON u.id=p.student WHERE p.at>=? AND p.at<? ORDER BY p.at DESC LIMIT 5000`, from, to).toArray().filter((r) => set.has(String(r.student)));
        return { status: 200, body: { items: rows.map((r) => ({ id: String(r.id), student: String(r.student), name: String(r.sname || ""), label: String(r.label), pts: Number(r.pts), icon: String(r.icon || ""), by: String(r.by), at: Number(r.at) })) } };
      }
      case "grp-list": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        // Own groups + admin groups assigned to this teacher. Admin-made groups = explicit students + whole classes/sections; teachers only get members inside their own scope.
        const all = this.sql.exec(`SELECT * FROM grp ORDER BY name`).toArray();
        const stu = this.sql.exec(`SELECT id, cls, section FROM users WHERE role='student' AND disabled=0`).toArray();
        // t349: groups picked in the teacher's Teaching assignment ("grp:<id>") count as assigned too.
        const myGrp = a.role === "teacher" ? (JSON.parse(String(this.userRow("id=?", a.id)?.scope || "[]")) as string[]).filter((x) => x.startsWith("grp:")).map((x) => x.slice(4)) : [];
        const rows = all.filter((r) => a.role === "admin" || r.owner === a.id || (Number(r.admin) === 1 && ((JSON.parse(String(r.teachers || "[]")) as string[]).includes(a.id) || myGrp.includes(String(r.id)))));
        return { status: 200, body: { items: rows.map((r) => {
          const toks = JSON.parse(String(r.classes || "[]")) as string[];
          const ids = new Set(JSON.parse(String(r.students || "[]")) as string[]);
          for (const u of stu) for (const t of toks) { const [c, sc] = t.split("|"); if (String(u.cls) === c && (!sc || String(u.section) === sc)) ids.add(String(u.id)); }
          const members = [...ids].filter((sid) => a.role === "admin" || this.inScope(a, ...this.placeOf(sid), sid));
          const adminMade = Number(r.admin) === 1;
          return { id: String(r.id), name: String(r.name), subject: String(r.subject || ""), students: members, owner: String(r.owner), assigned: adminMade && a.role !== "admin", adminGroup: adminMade, classes: toks, teachers: a.role === "admin" ? (JSON.parse(String(r.teachers || "[]")) as string[]) : undefined, rawStudents: a.role === "admin" ? (JSON.parse(String(r.students || "[]")) as string[]) : undefined };
        }) } };
      }
      case "grp-admin-save": {
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        const name = str(input.name, 60);
        if (!name) return { status: 400, body: { error: "name_required" } };
        const students = strList(input.students, 500).filter((sid) => this.userRow("id=? AND role='student'", sid));
        const teachers = strList(input.teachers, 100).filter((tid) => this.userRow("id=? AND role='teacher'", tid));
        const classes = strList(input.classes, 80).map((c) => str(c, 80));
        const subject = str(input.subject, 60);
        const id = str(input.id, 40);
        const ex = id ? this.sql.exec(`SELECT id, admin FROM grp WHERE id=?`, id).toArray()[0] : undefined;
        if (id && !ex) return { status: 404, body: { error: "not_found" } };
        if (ex) this.sql.exec(`UPDATE grp SET name=?, subject=?, students=?, classes=?, teachers=?, admin=1, updated=? WHERE id=?`, name, subject, JSON.stringify(students), JSON.stringify(classes), JSON.stringify(teachers), Date.now(), id);
        else this.sql.exec(`INSERT INTO grp (id, owner, name, subject, students, classes, teachers, admin, updated) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`, rid("gp"), a.id, name, subject, JSON.stringify(students), JSON.stringify(classes), JSON.stringify(teachers), Date.now());
        return { status: 200, body: { ok: true } };
      }
      case "grp-admin-assign": {
        // Assignment view: add / remove groups for one teacher.
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        const tid = str(input.teacher, 40);
        if (!this.userRow("id=? AND role='teacher'", tid)) return { status: 404, body: { error: "not_found" } };
        const add = new Set(strList(input.add, 200)), rem = new Set(strList(input.remove, 200));
        for (const r of this.sql.exec(`SELECT id, teachers FROM grp WHERE admin=1`).toArray()) {
          const cur = JSON.parse(String(r.teachers || "[]")) as string[];
          let next = cur;
          if (add.has(String(r.id)) && !cur.includes(tid)) next = [...cur, tid];
          if (rem.has(String(r.id))) next = next.filter((x) => x !== tid);
          if (next !== cur) this.sql.exec(`UPDATE grp SET teachers=?, updated=? WHERE id=?`, JSON.stringify(next), Date.now(), String(r.id));
        }
        return { status: 200, body: { ok: true } };
      }
      case "grp-admin-copy": {
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        const r = this.sql.exec(`SELECT * FROM grp WHERE id=? AND admin=1`, str(input.id, 40)).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        const nid = rid("gp");
        const teachers = Array.isArray(input.teachers) ? JSON.stringify(strList(input.teachers, 100).filter((tid) => this.userRow("id=? AND role='teacher'", tid))) : "[]";
        this.sql.exec(`INSERT INTO grp (id, owner, name, subject, students, classes, teachers, admin, updated) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`, nid, a.id, str(input.name, 60) || `${String(r.name)} (copy)`.slice(0, 60), String(r.subject || ""), String(r.students || "[]"), String(r.classes || "[]"), teachers, Date.now());
        return { status: 200, body: { ok: true, id: nid } };
      }
      case "grp-save": {
        // Only the admin creates/edits groups (Admin > Members > Groups); teachers just use the groups assigned to them.
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        const name = str(input.name, 60);
        if (!name) return { status: 400, body: { error: "name_required" } };
        const students = strList(input.students, 300).filter((sid) => this.inScope(a, ...this.placeOf(sid), sid));
        const id = str(input.id, 40);
        const ex = id ? this.sql.exec(`SELECT owner FROM grp WHERE id=?`, id).toArray()[0] : undefined;
        if (ex && a.role !== "admin" && ex.owner !== a.id) return { status: 403, body: { error: "forbidden" } };
        if (ex) this.sql.exec(`UPDATE grp SET name=?, students=?, updated=? WHERE id=?`, name, JSON.stringify(students), Date.now(), id);
        else this.sql.exec(`INSERT INTO grp (id, owner, name, students, updated) VALUES (?, ?, ?, ?, ?)`, rid("gp"), a.id, name, JSON.stringify(students), Date.now());
        return { status: 200, body: { ok: true } };
      }
      case "grp-delete": {
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        const r = this.sql.exec(`SELECT owner FROM grp WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r || (a.role !== "admin" && r.owner !== a.id)) return { status: 403, body: { error: "forbidden" } };
        this.sql.exec(`DELETE FROM grp WHERE id=?`, str(input.id, 40));
        return { status: 200, body: { ok: true } };
      }
      case "report-email": {
        // Parent report: a tokenised read-only link (points or Quran). preview=true returns the exact email without sending.
        const sid = str(input.id, 40), kind = input.kind === "quran" ? "quran" : "points";
        if (!isStaff(a) || a.viewAs || !this.inScope(a, ...this.placeOf(sid), sid)) return { status: 403, body: { error: "forbidden" } };
        const u = this.userRow("id=? AND role='student'", sid);
        if (!u) return { status: 404, body: { error: "not_found" } };
        const to = String(u.email || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { status: 400, body: { error: "no_parent_email" } };
        let tok = String(this.sql.exec(`SELECT token FROM rtok WHERE student=? AND kind=?`, sid, kind).toArray()[0]?.token || "");
        if (!tok || input.reset === true) { this.sql.exec(`DELETE FROM rtok WHERE student=? AND kind=?`, sid, kind); tok = b64url(crypto.getRandomValues(new Uint8Array(24))); this.sql.exec(`INSERT INTO rtok (token, student, kind, by, created) VALUES (?, ?, ?, ?, ?)`, tok, sid, kind, a.id, Date.now()); }
        const url = `https://www.shaiqmuhammad.com/r?t=${tok}`;
        const title = kind === "quran" ? "Quran learning report" : "Points & behaviour report";
        const mail = { heading: `${title} — ${String(u.name)}`, paragraphs: ["Assalamu alaikum,", `Here is ${String(u.name)}'s ${title.toLowerCase()} from ${a.name}. The link opens a private, read-only page (no login needed). Please don't share it.`], button: { label: "View report", url }, note: "Automatic message — please don't reply. Questions: contact@shaiqmuhammad.com" };
        const subject = `${title} — ${String(u.name)}`;
        if (input.preview === true) return { status: 200, body: { to: a.role === "admin" ? to : to.replace(/^(.).*(@.*)$/, "$1•••$2"), subject, ...mail, url } };
        const ok = await sendAuto(this.env as LmsEnv, to, subject, mail).catch(() => false);
        this.sql.exec(`INSERT INTO rlog (id, student, kind, to_addr, by, at, ok) VALUES (?, ?, ?, ?, ?, ?, ?)`, rid("rl"), sid, kind, to, a.name, Date.now(), ok ? 1 : 0);
        return { status: ok ? 200 : 502, body: ok ? { ok: true } : { error: "mail_failed" } };
      }
      case "report-log": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        const rows = this.sql.exec(`SELECT l.*, u.name AS sname, u.cls, u.section FROM rlog l LEFT JOIN users u ON u.id=l.student ORDER BY l.at DESC LIMIT 300`).toArray().filter((r) => a.role === "admin" || this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id)));
        return { status: 200, body: { items: rows.map((r) => ({ id: String(r.id), student: String(r.sname || ""), kind: String(r.kind), to: String(r.to_addr), by: String(r.by), at: Number(r.at), ok: !!r.ok })) } };
      }
      case "my-assess": {
        // t329: a student's own assessment record — every attempt with score and the per-question report.
        const RES = (this.env as unknown as { RESULTS?: DurableObjectNamespace }).RESULTS;
        if (a.role !== "student" || !RES) return { status: 403, body: { error: "forbidden" } };
        const rs = await (RES.get(RES.idFromName("main")) as unknown as { byStudent(sid: string): Promise<Record<string, unknown>[]> }).byStudent(a.id);
        return { status: 200, body: { items: rs.map((r) => ({ ...r, ...this.levelOf(Number(r.percentage), String(r.year || "")) })) } };
      }
      case "assess-results": {
        // Teacher: results of assessments they created or assigned (+ group sessions of quizzes they may host). Admin: all.
        const RES = (this.env as unknown as { RESULTS?: DurableObjectNamespace }).RESULTS;
        if (!isStaff(a) || !RES) return { status: 403, body: { error: "forbidden" } };
        const mineQ = new Set<string>([...this.sql.exec(`SELECT id FROM tquiz WHERE owner=?`, a.id).toArray().map((r) => String(r.id)), ...this.sql.exec(`SELECT quiz FROM qassign WHERE owner=?`, a.id).toArray().map((r) => String(r.quiz))]);
        const hosts = a.perms.filter((p) => p.startsWith("host:")).map((p) => p.slice(5));
        const all = await (RES.get(RES.idFromName("main")) as unknown as { list(f: object): Promise<Record<string, unknown>[]> }).list({ details: false });
        const items = all.filter((r) => a.role === "admin" || mineQ.has(String(r.quizId)) || mineQ.has(String(r.quizSlug)) || (r.kind === "group" && (hosts.includes("*") || hosts.includes(String(r.quizSlug)) || hosts.includes(String(r.quizId)))));
        return { status: 200, body: { items: items.map((r) => ({ ...r, ...this.levelOf(Number(r.percentage), String(r.year || "")) })) } };
      }
      case "assess-list": {
        // Students: assessments assigned to them. Staff: assignments they made (admin: all).
        const rows = this.sql.exec(`SELECT * FROM qassign ORDER BY created DESC LIMIT 300`).toArray();
        const out = (r: Record<string, unknown>) => ({ id: String(r.id), quiz: String(r.quiz), title: String(r.title), mode: String(r.mode), cls: String(r.cls || ""), section: String(r.section || ""), students: JSON.parse(String(r.students || "[]")) as string[], due: r.due ? Number(r.due) : null, by: String(r.by), created: Number(r.created) });
        if (a.role === "student") {
          const u = this.userRow("id=?", a.id);
          const mine = rows.filter((r) => { const st = JSON.parse(String(r.students || "[]")) as string[]; return st.includes(a.id) || (!st.length && r.cls && String(r.cls) === String(u?.cls || "") && (!r.section || String(r.section) === String(u?.section || ""))); });
          return { status: 200, body: { items: mine.map(out) } };
        }
        return { status: 200, body: { items: rows.filter((r) => a.role === "admin" || r.owner === a.id).map(out) } };
      }
      case "assess-assign": {
        if (a.role !== "admin" && !can(a, "assign")) return { status: 403, body: { error: "forbidden" } };
        const quiz = str(input.quiz, 80), title = str(input.title, 140);
        if (!quiz) return { status: 400, body: { error: "quiz_required" } };
        if (a.role === "teacher" && !quiz.startsWith("tq_") && !(a.perms.includes("host:*") || a.perms.includes(`host:${quiz}`))) return { status: 403, body: { error: "not_allowed" } };
        if (quiz.startsWith("tq_") && a.role !== "admin") { const t = this.sql.exec(`SELECT owner FROM tquiz WHERE id=?`, quiz).toArray()[0]; if (!t || t.owner !== a.id) return { status: 403, body: { error: "not_allowed" } }; }
        const cls = str(input.cls, 80), section = str(input.section, 80);
        const students = strList(input.students, 200).filter((sid) => this.canSeeStudent(a, sid));
        if (!students.length && !cls) return { status: 400, body: { error: "target_required" } };
        if (a.role === "teacher" && cls && a.scope?.length && !a.scope.some((x) => { const [k, s2] = x.split("|"); return k === cls && (!s2 || !section || s2 === section); })) return { status: 403, body: { error: "not_your_class" } };
        const mode = input.mode === "group" ? "group" : "individual";
        const due = Number(input.due) > 0 ? Number(input.due) : null;
        const id = rid("qa");
        this.sql.exec(`INSERT INTO qassign (id, quiz, title, mode, cls, section, students, due, by, owner, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, quiz, title, mode, students.length ? "" : cls, students.length ? "" : section, JSON.stringify(students), due, a.name, a.id, Date.now());
        const targets = students.length ? students : this.sql.exec(`SELECT id FROM users WHERE role='student' AND disabled=0 AND cls=?`, cls).toArray().filter((u) => !section || this.userRow("id=?", String(u.id))?.section === section).map((u) => String(u.id));
        this.notify(targets, "hw_new", { title: title || quiz, assess: id });
        return { status: 200, body: { ok: true, id, sent: targets.length } };
      }
      case "assess-unassign": {
        const r = this.sql.exec(`SELECT owner FROM qassign WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r || (a.role !== "admin" && r.owner !== a.id)) return { status: 403, body: { error: "forbidden" } };
        this.sql.exec(`DELETE FROM qassign WHERE id=?`, str(input.id, 40));
        return { status: 200, body: { ok: true } };
      }
      case "tquiz-list": {
        if (a.role === "student") return { status: 403, body: { error: "forbidden" } };
        const rows = this.sql.exec(`SELECT id, owner, owner_name, title, updated FROM tquiz ORDER BY updated DESC`).toArray().filter((r) => a.role === "admin" || r.owner === a.id);
        return { status: 200, body: { items: rows.map((r) => ({ id: String(r.id), owner: String(r.owner), ownerName: String(r.owner_name), title: String(r.title), updated: Number(r.updated) })) } };
      }
      case "tquiz-get": {
        const id = str(input.id, 40);
        const r = this.sql.exec(`SELECT * FROM tquiz WHERE id=?`, id).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        if (a.role === "student") {
          // Students may load it only when it is assigned to them.
          const u = this.userRow("id=?", a.id);
          const ok = this.sql.exec(`SELECT students, cls, section FROM qassign WHERE quiz=?`, id).toArray().some((x) => { const st = JSON.parse(String(x.students || "[]")) as string[]; return st.includes(a.id) || (!st.length && x.cls === String(u?.cls || "") && (!x.section || x.section === String(u?.section || ""))); });
          if (!ok) return { status: 403, body: { error: "forbidden" } };
        } else if (a.role !== "admin" && r.owner !== a.id && !this.sql.exec(`SELECT 1 FROM qassign WHERE quiz=?`, id).toArray().length) return { status: 403, body: { error: "forbidden" } };
        return { status: 200, body: { quiz: JSON.parse(String(r.data)) } };
      }
      case "tquiz-save": {
        if (a.role !== "admin" && a.role !== "teacher") return { status: 403, body: { error: "forbidden" } };
        const q = (input.quiz || {}) as Record<string, unknown>;
        const raw = JSON.stringify(q);
        if (raw.length > 900_000) return { status: 413, body: { error: "too_large" } };
        let id = str(q.id, 40);
        const existing = id ? this.sql.exec(`SELECT owner FROM tquiz WHERE id=?`, id).toArray()[0] : undefined;
        if (existing && a.role !== "admin" && existing.owner !== a.id) return { status: 403, body: { error: "forbidden" } };
        if (!existing) id = rid("tq");
        // Every assessment belongs to exactly one curriculum topic; a topic has only one assessment.
        const topic = str(q.topic, 40);
        const unit = topic ? this.sql.exec(`SELECT id, yr, term, wk_from, title, links, quiz FROM cur WHERE id=?`, topic).toArray()[0] : undefined;
        if (!topic) return { status: 400, body: { error: "topic_required" } };
        if (!unit) return { status: 400, body: { error: "topic_unknown" } };
        const otherT = tquizTopics(this.sql).find((t) => t.topic === topic && t.id !== id);
        const otherP = (await pubQuizzes()).find((p) => p.topic === topic);
        if (otherT || otherP) return { status: 409, body: { error: "topic_taken", existing: otherT ? { slug: otherT.id, title: otherT.title } : { slug: otherP!.slug, title: otherP!.title } } };
        const data = JSON.stringify({ ...q, id, slug: id, topic });
        // Keep the curriculum link in step: drop this quiz from any other unit, add it to its topic.
        for (const r of this.sql.exec(`SELECT id, links, quiz FROM cur`).toArray()) {
          let l: { t: string; id: string }[] = []; try { l = JSON.parse(String(r.links || "[]")); } catch { l = []; }
          const had = l.some((x) => x.t === "quiz" && x.id === id) || String(r.quiz || "") === id;
          const want = String(r.id) === topic;
          if (had === want) continue;
          const next = want ? [{ t: "quiz", id }, ...l.filter((x) => !(x.t === "quiz" && x.id === id))] : l.filter((x) => !(x.t === "quiz" && x.id === id));
          this.sql.exec(`UPDATE cur SET links=?, quiz=? WHERE id=?`, JSON.stringify(next), next.find((x) => x.t === "quiz")?.id || "", String(r.id));
        }
        if (existing) this.sql.exec(`UPDATE tquiz SET title=?, data=?, updated=? WHERE id=?`, str(q.title, 140), data, Date.now(), id);
        else this.sql.exec(`INSERT INTO tquiz (id, owner, owner_name, title, data, updated) VALUES (?, ?, ?, ?, ?, ?)`, id, a.id, a.name, str(q.title, 140), data, Date.now());
        return { status: 200, body: { ok: true, id } };
      }
      case "tquiz-delete": {
        const id = str(input.id, 40);
        const r = this.sql.exec(`SELECT owner FROM tquiz WHERE id=?`, id).toArray()[0];
        if (!r || (a.role !== "admin" && r.owner !== a.id)) return { status: 403, body: { error: "forbidden" } };
        this.sql.exec(`DELETE FROM tquiz WHERE id=?`, id);
        this.sql.exec(`DELETE FROM qassign WHERE quiz=?`, id);
        for (const c of this.sql.exec(`SELECT id, links, quiz FROM cur`).toArray()) { let l: { t: string; id: string }[] = []; try { l = JSON.parse(String(c.links || "[]")); } catch { l = []; } if (l.some((x) => x.id === id) || c.quiz === id) { const n = l.filter((x) => x.id !== id); this.sql.exec(`UPDATE cur SET links=?, quiz=? WHERE id=?`, JSON.stringify(n), n.find((x) => x.t === "quiz")?.id || "", String(c.id)); } }
        return { status: 200, body: { ok: true } };
      }


      // ---- Parent mail: teachers see only the parent's NAME; address stays server-side. ----
      case "parent-contacts": {
        if (!isStaff(a) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const items = this.sql.exec(`SELECT id, name, cls, section, email, parent_name FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray()
          .filter((r) => this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id)))
          .map((r) => ({ student: String(r.id), studentName: String(r.name), cls: [r.cls, r.section].filter(Boolean).join(" "), parentName: String(r.parent_name || ""), canMail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(r.email || "")) }));
        return { status: 200, body: { items } };
      }
      case "parent-mail-preview":
      case "parent-mail-send": {
        if (!isStaff(a) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const sid = str(input.student, 40), subject = str(input.subject, 150), text = str(input.body, 5000);
        const u = this.userRow("id=? AND role='student'", sid);
        if (!u) return { status: 404, body: { error: "not_found" } };
        if (!this.inScope(a, String(u.cls || ""), String(u.section || ""), String(u.id))) return { status: 403, body: { error: "not_your_class" } };
        if (!subject || !text) return { status: 400, body: { error: "empty" } };
        const to = String(u.email || "");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { status: 400, body: { error: "no_parent_email" } };
        const pname = String(u.parent_name || "").trim();
        const mail = { heading: subject, paragraphs: [pname ? `Assalamu alaikum ${pname},` : "Assalamu alaikum,", text, `— ${a.name}${a.role === "admin" ? "" : ", teacher of " + String(u.name)}`], note: "You can simply reply to this email — your reply goes to the teacher through the school." };
        if (action === "parent-mail-preview") return { status: 200, body: { html: renderEmail(mail), to: pname || "Parent", subject } };
        if (input.confirm !== true) return { status: 400, body: { error: "confirm_required" } };
        let th = this.sql.exec(`SELECT thread FROM pthreads WHERE student=? AND teacher=?`, sid, a.id).toArray()[0];
        if (!th) { const t = "pm" + hex(crypto.getRandomValues(new Uint8Array(4))); this.sql.exec(`INSERT INTO pthreads (thread, student, teacher, created) VALUES (?, ?, ?, ?)`, t, sid, a.id, Date.now()); th = { thread: t }; }
        const token = String(th.thread);
        const msgid = `pm-${hex(crypto.getRandomValues(new Uint8Array(8)))}@shaiqmuhammad.com`;
        const fullSubject = `[PM-${token.slice(2)}] ${subject}`.slice(0, 200);
        try { await sendParentMail(this.env as LmsEnv, { to, token, subject: fullSubject, html: renderEmail(mail), text: renderText(mail), messageId: msgid, fromName: "Shaiq Muhammad School" }); } catch (e) { return { status: 502, body: { error: "mail_error", detail: (e as Error).message.slice(0, 120) } }; }
        this.sql.exec(`INSERT INTO pmsg (id, thread, student, teacher, dir, subject, body, created, msgid, read) VALUES (?, ?, ?, ?, 'out', ?, ?, ?, ?, 1)`, rid("pm"), token, sid, a.id, subject, text, Date.now(), msgid);
        return { status: 200, body: { ok: true, thread: token } };
      }
      case "parent-threads": {
        if (!isStaff(a) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        if (input.sync) await this.syncParentMail();
        const rows = this.sql.exec(`SELECT t.thread, t.student, t.teacher, MAX(m.created) AS last, COUNT(m.id) AS n, SUM(CASE WHEN m.dir='in' AND m.read=0 THEN 1 ELSE 0 END) AS unread FROM pthreads t JOIN pmsg m ON m.thread=t.thread GROUP BY t.thread ORDER BY last DESC LIMIT 300`).toArray()
          .filter((r) => a.role === "admin" || String(r.teacher) === a.id);
        const items = rows.map((r) => {
          const u = this.userRow("id=?", String(r.student)); const t = this.userRow("id=?", String(r.teacher));
          const lm = this.sql.exec(`SELECT body, dir FROM pmsg WHERE thread=? ORDER BY created DESC LIMIT 1`, String(r.thread)).one();
          return { thread: String(r.thread), student: String(r.student), studentName: String(u?.name || "—"), cls: [u?.cls, u?.section].filter(Boolean).join(" "), parentName: String(u?.parent_name || ""), teacherName: String(t?.name || "—"), last: Number(r.last), count: Number(r.n), unread: Number(r.unread || 0), preview: String(lm.body).slice(0, 80), lastDir: String(lm.dir) };
        });
        return { status: 200, body: { items, unread: items.reduce((x, t) => x + t.unread, 0) } };
      }
      case "parent-thread": {
        if (!isStaff(a) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const th = this.sql.exec(`SELECT * FROM pthreads WHERE thread=?`, str(input.thread, 20)).toArray()[0];
        if (!th || (a.role !== "admin" && String(th.teacher) !== a.id)) return { status: 403, body: { error: "forbidden" } };
        const items = this.sql.exec(`SELECT id, dir, subject, body, created FROM pmsg WHERE thread=? ORDER BY created LIMIT 500`, String(th.thread)).toArray().map((r) => ({ id: String(r.id), dir: String(r.dir), subject: String(r.subject), body: String(r.body), created: Number(r.created) }));
        this.sql.exec(`UPDATE pmsg SET read=1 WHERE thread=? AND dir='in'`, String(th.thread));
        return { status: 200, body: { items } };
      }
      case "parent-log": {
        // Full record of parent mail about one student (teacher in that class, or admin).
        if (!isStaff(a) || a.viewAs) return { status: 403, body: { error: "forbidden" } };
        const sid = str(input.student, 40); const u = this.userRow("id=? AND role='student'", sid);
        if (!u || !this.inScope(a, String(u.cls || ""), String(u.section || ""), String(u.id))) return { status: 403, body: { error: "forbidden" } };
        const items = this.sql.exec(`SELECT m.id, m.dir, m.subject, m.body, m.created, m.teacher FROM pmsg m WHERE m.student=? ORDER BY m.created DESC LIMIT 300`, sid).toArray().map((r) => ({ id: String(r.id), dir: String(r.dir), subject: String(r.subject), body: String(r.body), created: Number(r.created), teacherName: String(this.userRow("id=?", String(r.teacher))?.name || "—") }));
        return { status: 200, body: { items } };
      }
      case "parent-delete-all": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const th = str(input.thread, 20);
        this.sql.exec(`DELETE FROM pmsg WHERE thread=?`, th); this.sql.exec(`DELETE FROM pthreads WHERE thread=?`, th);
        return { status: 200, body: { ok: true } };
      }
      case "vid-admin-list": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const st = str(input.status, 10);
        const items = this.sql.exec(`SELECT id, vid, name, role, body, created, status FROM vcomments ${st ? "WHERE status=?" : "WHERE ?=?"} ORDER BY (status='pending') DESC, created DESC LIMIT 300`, ...(st ? [st] : ["1", "1"])).toArray().map((r) => ({ id: String(r.id), vid: String(r.vid), name: String(r.name), role: String(r.role), text: String(r.body), at: Number(r.created), status: String(r.status) }));
        const pending = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM vcomments WHERE status='pending'`).one().n);
        return { status: 200, body: { items, pending } };
      }
      case "vid-admin-set": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const cid = str(input.id, 40), st = str(input.status, 10);
        if (st === "delete") this.sql.exec(`DELETE FROM vcomments WHERE id=?`, cid);
        else if (st === "ok" || st === "hidden") this.sql.exec(`UPDATE vcomments SET status=? WHERE id=?`, st, cid);
        else return { status: 400, body: { error: "bad_status" } };
        return { status: 200, body: { ok: true } };
      }
      case "msg-contacts": {
        return { status: 200, body: { items: this.msgContacts(a) } };
      }
      case "msg-threads": {
        // Admin sees every thread (moderation); others only their own.
        const rows = this.sql.exec(`SELECT thread, MAX(created) AS last, COUNT(*) AS n FROM msgs GROUP BY thread ORDER BY last DESC LIMIT 200`).toArray().filter((r) => a.role === "admin" || String(r.thread).split("~").includes(a.id));
        const nameOf = (id: string) => (id === "admin" ? "Admin" : String(this.userRow("id=?", id)?.name || "—"));
        const items = rows.map((r) => {
          const ids = String(r.thread).split("~");
          const lastMsg = this.sql.exec(`SELECT body, sender FROM msgs WHERE thread=? ORDER BY created DESC LIMIT 1`, String(r.thread)).one();
          const unread = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM msgs WHERE thread=? AND recipient=? AND read=0`, String(r.thread), a.id).one().n);
          const other = ids.find((x) => x !== a.id) || ids[0];
          return { thread: String(r.thread), with: other, withName: nameOf(other), people: ids.map(nameOf), mine: ids.includes(a.id), last: Number(r.last), preview: String(lastMsg.body).slice(0, 80), unread };
        });
        return { status: 200, body: { items, unread: items.reduce((x, t) => x + t.unread, 0) } };
      }
      case "msg-thread": {
        const thread = str(input.thread, 120) || [a.id, str(input.with, 40)].sort().join("~");
        if (a.role !== "admin" && !thread.split("~").includes(a.id)) return { status: 403, body: { error: "forbidden" } };
        const items = this.sql.exec(`SELECT * FROM msgs WHERE thread=? ORDER BY created LIMIT 500`, thread).toArray().map((r) => ({ id: String(r.id), sender: String(r.sender), body: String(r.body), created: Number(r.created), mine: String(r.sender) === a.id }));
        if (!a.viewAs) this.sql.exec(`UPDATE msgs SET read=1 WHERE thread=? AND recipient=?`, thread, a.id);
        return { status: 200, body: { thread, items } };
      }
      case "msg-send": {
        if (a.viewAs) return { status: 403, body: { error: "read_only" } };
        const to = str(input.to, 40), body = str(input.body, 2000);
        if (!body) return { status: 400, body: { error: "empty" } };
        if (!this.msgContacts(a).some((c) => c.id === to)) return { status: 403, body: { error: "not_allowed" } };
        const thread = [a.id, to].sort().join("~");
        this.sql.exec(`INSERT INTO msgs (id, thread, sender, recipient, body, created) VALUES (?, ?, ?, ?, ?, ?)`, rid("m"), thread, a.id, to, body, Date.now());
        this.notify([to], "message", { by: a.name, title: body.slice(0, 60), thread });
        return { status: 200, body: { ok: true, thread } };
      }
      case "msg-delete": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        this.sql.exec(`DELETE FROM msgs WHERE id=?`, str(input.id, 40));
        return { status: 200, body: { ok: true } };
      }

      case "notes": {
        const items = this.sql.exec(`SELECT * FROM notes WHERE uid=? ORDER BY created DESC LIMIT 30`, a.id).toArray().map((r) => ({ id: String(r.id), kind: String(r.kind), data: JSON.parse(String(r.data || "{}")) as Json, created: Number(r.created), read: Boolean(r.read) }));
        const unread = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM notes WHERE uid=? AND read=0`, a.id).one().n);
        return { status: 200, body: { items, unread } };
      }

      case "notes-read": {
        const ids = strList(input.ids, 100);
        if (ids.length) for (const id of ids) this.sql.exec(`UPDATE notes SET read=1 WHERE uid=? AND id=?`, a.id, id);
        else this.sql.exec(`UPDATE notes SET read=1 WHERE uid=?`, a.id);
        return { status: 200, body: { ok: true } };
      }

      case "audio-delete": {
        const b = this.sql.exec(`SELECT * FROM blobs WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!b) return { status: 404, body: { error: "not_found" } };
        const r = this.sql.exec(`SELECT * FROM subs WHERE id=?`, String(b.sub)).toArray()[0];
        if (b.kind === "rec") {
          if (!(a.role === "student" && r?.student === a.id) && a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
          if (a.role === "student" && r?.status === "approved") return { status: 409, body: { error: "already_approved" } };
          if (r) this.sql.exec(`UPDATE subs SET audio='' WHERE id=?`, String(r.id));
        } else {
          if (b.owner !== a.id && a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
          if (r) this.sql.exec(`UPDATE subs SET comments=? WHERE id=?`, JSON.stringify((JSON.parse(String(r.comments || "[]")) as Json[]).filter((c) => c.audio !== b.id)), String(r.id));
        }
        await this.dropBlob(String(b.id));
        return { status: 200, body: { ok: true } };
      }

      case "catalog-save": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const kind = (["phase", "dept", "subject", "class", "section"] as const).find((k) => k === input.kind);
        const name = str(input.name, 40);
        if (!kind || !name) return { status: 400, body: { error: "name" } };
        // t349: section → class (required); dept → phase, subject → dept, class → phase (optional).
        const pk = ({ section: "class", dept: "phase", subject: "dept", class: "phase", phase: "" } as const)[kind];
        const parent = pk ? str(input.parent, 40) : "";
        if (kind === "section" && !this.sql.exec(`SELECT id FROM catalog WHERE id=? AND kind='class'`, parent).toArray().length) return { status: 400, body: { error: "unknown_class" } };
        if (parent && kind !== "section" && !this.sql.exec(`SELECT id FROM catalog WHERE id=? AND kind=?`, parent, pk).toArray().length) return { status: 400, body: { error: "unknown_parent" } };
        const id = str(input.id, 40);
        const dup = kind === "section" ? this.sql.exec(`SELECT id FROM catalog WHERE kind=? AND name=? AND parent=?`, kind, name, parent).toArray()[0] : this.sql.exec(`SELECT id FROM catalog WHERE kind=? AND name=?`, kind, name).toArray()[0];
        if (dup && String(dup.id) !== id) return { status: 409, body: { error: "duplicate" } };
        if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM catalog`).one().n) >= 500 && !id) return { status: 409, body: { error: "full" } };
        if (!id) {
          const nid = rid(kind[0]);
          this.sql.exec(`INSERT INTO catalog (id, kind, name, parent) VALUES (?, ?, ?, ?)`, nid, kind, name, parent);
          return { status: 200, body: { ok: true, id: nid, ...this.catalog() } };
        }
        const old = this.sql.exec(`SELECT * FROM catalog WHERE id=?`, id).toArray()[0];
        if (!old || old.kind !== kind) return { status: 404, body: { error: "not_found" } };
        const was = String(old.name);
        this.sql.exec(`UPDATE catalog SET name=?, parent=? WHERE id=?`, name, kind === "section" ? parent || String(old.parent || "") : input.parent !== undefined ? parent : String(old.parent || ""), id);
        if (was !== name) this.renameEverywhere(kind, was, name, kind === "section" ? this.className(String(old.parent)) : "");
        return { status: 200, body: { ok: true, id, ...this.catalog() } };
      }

      case "catalog-delete": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const r = this.sql.exec(`SELECT * FROM catalog WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        const n = String(r.name);
        const users = this.sql.exec(`SELECT cls, section, subjects, scope FROM users`).toArray();
        const scopeHas = (u: Record<string, unknown>, f: (s: string) => boolean) => (JSON.parse(String(u.scope || "[]")) as string[]).some(f);
        // In use? Report what uses it; "force" removes it everywhere (people are unassigned, never deleted; homework keeps its old label).
        const k = r.kind === "section" ? this.className(String(r.parent)) : n;
        const isCls = (u: Record<string, unknown>) => r.kind === "class" ? u.cls === n : r.kind === "section" ? u.cls === k && u.section === n : false;
        const tokHit = (t: string) => r.kind === "class" ? t.split("|")[0] === n : r.kind === "section" ? t === `${k}|${n}` : false;
        const det = {
          students: users.filter((u) => r.kind === "subject" ? false : isCls(u)).length,
          teachers: users.filter((u) => r.kind === "subject" ? (JSON.parse(String(u.subjects || "[]")) as string[]).includes(n) : scopeHas(u, tokHit)).length,
          sections: r.kind === "class" ? Number(this.sql.exec(`SELECT COUNT(*) AS c FROM catalog WHERE parent=?`, String(r.id)).one().c) : 0,
          homework: r.kind === "class" ? Number(this.sql.exec(`SELECT COUNT(*) AS c FROM homework WHERE cls=?`, n).one().c) : r.kind === "section" ? Number(this.sql.exec(`SELECT COUNT(*) AS c FROM homework WHERE cls=? AND section=?`, k, n).one().c) : 0,
        };
        const used = det.students + det.teachers + det.sections + det.homework;
        if (used && !input.force) return { status: 409, body: { error: "in_use", count: used, detail: det } };
        if (used) {
          const all = this.sql.exec(`SELECT id, cls, section, subjects, scope FROM users`).toArray();
          for (const u of all) {
            const id = String(u.id);
            if (r.kind === "subject") { const sub = JSON.parse(String(u.subjects || "[]")) as string[]; if (sub.includes(n)) this.sql.exec(`UPDATE users SET subjects=? WHERE id=?`, JSON.stringify(sub.filter((x) => x !== n)), id); continue; }
            if (r.kind === "class" && u.cls === n) this.sql.exec(`UPDATE users SET cls='', section='' WHERE id=?`, id);
            if (r.kind === "section" && u.cls === k && u.section === n) this.sql.exec(`UPDATE users SET section='' WHERE id=?`, id);
            const sc = JSON.parse(String(u.scope || "[]")) as string[];
            if (sc.some(tokHit)) this.sql.exec(`UPDATE users SET scope=? WHERE id=?`, JSON.stringify(sc.filter((t) => !tokHit(t))), id);
          }
          if (r.kind !== "subject") for (const g of this.sql.exec(`SELECT id, classes FROM grp`).toArray()) { const t = JSON.parse(String(g.classes || "[]")) as string[]; if (t.some(tokHit)) this.sql.exec(`UPDATE grp SET classes=? WHERE id=?`, JSON.stringify(t.filter((x) => !tokHit(x))), String(g.id)); }
          if (r.kind === "class") this.sql.exec(`DELETE FROM catalog WHERE parent=?`, String(r.id));
        }
        if (r.kind === "phase" || r.kind === "dept") this.sql.exec(`UPDATE catalog SET parent='' WHERE parent=?`, String(r.id));
        this.sql.exec(`DELETE FROM catalog WHERE id=?`, String(r.id));
        return { status: 200, body: { ok: true, ...this.catalog() } };
      }

      case "pins-view": {
        // Admin: everyone. Teachers with student "View": only students inside their own classes/sections.
        const tview = a.role === "teacher" && !a.viewAs && stuCan(a, "view");
        if (a.role !== "admin" && !tview) return { status: 403, body: { error: "forbidden" } };
        if (!(await pinKey(this.env))) return { status: 503, body: { error: "pin_key_missing" } };
        const ids = strList(input.ids, 3000);
        let rows = this.sql.exec(`SELECT id, role, cls, section, pin_enc FROM users`).toArray();
        if (ids.length) rows = rows.filter((r) => ids.includes(String(r.id)));
        if (tview) rows = rows.filter((r) => r.role === "student" && this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id)));
        const pins: Record<string, string | null> = {};
        for (const r of rows) pins[String(r.id)] = await openPin(this.env, r.pin_enc);
        return { status: 200, body: { pins } };
      }

      case "logins-list": {
        // Student Logins cards: username, PIN and the QR login token for every student the caller may see.
        const tview = a.role === "teacher" && !a.viewAs && stuCan(a, "view");
        if (a.role !== "admin" && !tview) return { status: 403, body: { error: "forbidden" } };
        if (!(await pinKey(this.env))) return { status: 503, body: { error: "pin_key_missing" } };
        const rows = this.sql.exec(`SELECT * FROM users WHERE role='student' ORDER BY cls, section, name`).toArray().filter((r) => a.role === "admin" || this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id)));
        const items = [];
        for (const r of rows) {
          let tok = String(r.qr_token || "");
          if (!tok) { tok = b64url(crypto.getRandomValues(new Uint8Array(32))); this.sql.exec(`UPDATE users SET qr_token=? WHERE id=?`, tok, String(r.id)); }
          items.push({ id: String(r.id), name: String(r.name), nameAr: String(r.name_ar || ""), username: String(r.username), cls: String(r.cls || ""), section: String(r.section || ""), avatar: avatarOf(r), disabled: Boolean(r.disabled), pin: await openPin(this.env, r.pin_enc), token: tok });
        }
        return { status: 200, body: { items } };
      }

      case "login-token-reset": {
        // Regenerate (revoke) a student's QR login token. Admin, or a teacher with student Edit for a student in scope.
        if (a.viewAs || (a.role !== "admin" && !(a.role === "teacher" && stuCan(a, "edit")))) return { status: 403, body: { error: "forbidden" } };
        const r = this.userRow("id=?", str(input.id, 40));
        if (!r || r.role !== "student") return { status: 404, body: { error: "not_found" } };
        if (a.role !== "admin" && !this.inScope(a, String(r.cls || ""), String(r.section || ""), String(r.id))) return { status: 403, body: { error: "not_your_class" } };
        const tok = b64url(crypto.getRandomValues(new Uint8Array(32)));
        this.sql.exec(`UPDATE users SET qr_token=? WHERE id=?`, tok, String(r.id));
        return { status: 200, body: { token: tok } };
      }

      case "pin-change": {
        // Students, teachers and parents change their OWN PIN from an active signed-in session (no current PIN asked). Admin/view-as: not here.
        if (a.viewAs || (a.role !== "student" && a.role !== "teacher" && a.role !== "parent")) return { status: 403, body: { error: "forbidden" } };
        const key = `pc:${a.id}`;
        if (this.failCount(key) >= 5) return { status: 429, body: { error: "too_many_attempts" } };
        const next = str(input.next, 64);
        if ([...next].length < 6 || [...next].length > 64) return { status: 400, body: { error: "pin_min_6" } };
        this.sql.exec(`INSERT INTO fails (k, t) VALUES (?, ?)`, key, Date.now());
        await this.setPin(a.id, next);
        return { status: 200, body: { ok: true } };
      }

      case "hw-save": {
        const kind = input.kind === "quran" ? "quran" : "general";
        {
          // Quran Homework switches (teachers with an explicit set): Add for new, Edit for existing; plain homework still needs "assign".
          const q = qhwOf(a);
          if (input.id && this.sharedOnly(str(input.id, 40), a)) return { status: 403, body: { error: "share_owner_only" } };
          const prevKind = input.id ? String(this.sql.exec(`SELECT kind FROM homework WHERE id=?`, str(input.id, 40)).toArray()[0]?.kind || "") : "";
          const touchesQ = kind === "quran" || prevKind === "quran";
          if (a.role === "teacher" && touchesQ && q.set && !(input.id ? q.edit : q.add)) return { status: 403, body: { error: "quran_not_allowed" } };
          if (!can(a, "assign") && !(a.role === "teacher" && touchesQ && q.set)) return { status: 403, body: { error: "forbidden" } };
        }
        const title = str(input.title, 160);
        if (!title) return { status: 400, body: { error: "title" } };
        const d = (input.data && typeof input.data === "object" ? input.data : {}) as Json;
        let data: Json;
        if (kind === "quran") {
          const surah = Math.trunc(Number(d.surah));
          const from = Math.trunc(Number(d.from));
          const to = Math.trunc(Number(d.to));
          if (!(surah >= 1 && surah <= 114) || !(from >= 1) || !(to >= from) || to - from > 300) return { status: 400, body: { error: "verses" } };
          data = { ...(d.pack ? { pack: str(d.pack, 40), assignAt: Number(d.assignAt) || 0 } : {}), surah, from, to, reciter: str(d.reciter, 60) || "Alafasy_128kbps", notes: str(d.notes, 1000), translit: d.translit === true, translation: d.translation === true, extra: str(d.extra, 80), memorise: d.memorise === true, memoAudio: d.memoAudio !== false };
        } else {
          const slides = (Array.isArray(d.slides) ? (d.slides as Json[]) : []).slice(0, 30).map((s) => ({ title: str(s.title, 160), text: str(s.text, 3000), image: /^https:\/\//.test(String(s.image || "")) ? str(s.image, 500) : "" }));
          data = { slides, question: str(d.question, 1000), ...(d.pack ? { pack: str(d.pack, 40), assignAt: Number(d.assignAt) || 0 } : {}) };
        }
        const students = Array.isArray(input.students) ? (input.students as unknown[]).map((x) => str(x, 40)).filter(Boolean).slice(0, 500) : [];
        const cls = str(input.cls, 40);
        const section = cls ? str(input.section, 40) : "";
        if (a.role === "teacher" && a.scope?.length) {
          // Teachers limited to their classes/sections; picked students must be in scope too.
          const inScope = (c: string, sec: string) => a.scope!.some((x) => { const [k, s2] = x.split("|"); return k === c && (!s2 || s2 === sec); });
          if (students.length) {
            const rows = this.sql.exec(`SELECT id, cls, section FROM users WHERE role='student'`).toArray().filter((r) => students.includes(String(r.id)));
            if (rows.some((r) => !inScope(String(r.cls || ""), String(r.section || "")) && !a.stu?.includes(String(r.id)))) return { status: 403, body: { error: "out_of_scope" } };
          }
          if (cls && !(section ? inScope(cls, section) : a.scope.includes(cls))) return { status: 403, body: { error: "out_of_scope" } };
          if (!cls && !students.length) return { status: 403, body: { error: "out_of_scope" } };
        }
        const due = Number(input.due) > 0 ? Number(input.due) : null;
        const blob = JSON.stringify(data);
        if (input.id) {
          const r = this.sql.exec(`SELECT created_by FROM homework WHERE id=?`, str(input.id, 40)).toArray()[0];
          if (!r) return { status: 404, body: { error: "not_found" } };
          if (a.role !== "admin" && r.created_by !== a.id && !this.va(a, String(r.created_by || ""))) return { status: 403, body: { error: "forbidden" } };
          this.sql.exec(`UPDATE homework SET kind=?, title=?, cls=?, section=?, students=?, data=?, due=? WHERE id=?`, kind, title, cls, section, JSON.stringify(students), blob, due, str(input.id, 40));
          return { status: 200, body: { ok: true, id: str(input.id, 40) } };
        }
        if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM homework`).one().n) >= MAX_HW) return { status: 409, body: { error: "full" } };
        const id = rid("hw");
        this.sql.exec(`INSERT INTO homework (id, kind, title, cls, section, students, data, due, created_by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, kind, title, cls, section, JSON.stringify(students), blob, due, a.id, Date.now());
        if (input.quiet !== true) this.notify(this.assignees({ cls, section, students }), "hw_new", { hw: id, title, by: a.name });
        return { status: 200, body: { ok: true, id } };
      }

      case "hw-delete": {
        const id = str(input.id, 40);
        const r = this.sql.exec(`SELECT created_by, kind FROM homework WHERE id=?`, id).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        if (this.sharedOnly(id, a)) return { status: 403, body: { error: "share_owner_only" } };
        const qd = qhwOf(a);
        if (a.role === "teacher" && r.kind === "quran" && qd.set && !qd.del) return { status: 403, body: { error: "quran_not_allowed" } };
        if (!can(a, "assign") && !(a.role === "teacher" && r.kind === "quran" && qd.set && qd.del)) return { status: 403, body: { error: "forbidden" } };
        if (a.role !== "admin" && r.created_by !== a.id && !this.va(a, String(r.created_by || ""))) return { status: 403, body: { error: "forbidden" } };
        this.sql.exec(`DELETE FROM homework WHERE id=?`, id);
        await this.dropBlobsOfSubs(this.sql.exec(`SELECT id FROM subs WHERE hw=?`, id).toArray().map((x) => String(x.id)));
        this.sql.exec(`DELETE FROM subs WHERE hw=?`, id);
        this.sql.exec(`DELETE FROM tracker WHERE hw=?`, id);
        return { status: 200, body: { ok: true } };
      }

      case "dashboard": {
        if (a.role === "student") {
          if (!a.viewAs) { this.touch(a.id); this.remind(a); }
          const hw = this.assignedTo(a).map((h) => { const sb = this.sub(h.id, a.id); return { ...h, sub: sb, locked: this.lockedFor(h, a.id), lockedBy: this.lockInfo(h, a.id), late: !!(h.due && ((sb?.submittedAt || 0) > h.due || (!(sb?.submittedAt) && h.due < Date.now()))) }; });
          return { status: 200, body: { homework: hw, tracker: this.trackerOf(a.id), progress: this.progressOf(a.id), leaderboard: this.setting("leaderboard", "off") !== "off" } };
        }
        const qd = qhwOf(a);
        const all = this.allHomework().filter((h) => a.role === "admin" || this.va(a, h.createdBy) || h.createdBy === a.id || this.sharedTo(h, a.id)).filter((h) => h.kind !== "quran" || (qd.show && qd.view));
        const counts = new Map<string, Record<string, number>>();
        for (const s of this.sql.exec(`SELECT hw, status, COUNT(*) AS n FROM subs GROUP BY hw, status`).toArray()) {
          const c = counts.get(String(s.hw)) || {};
          c[String(s.status)] = Number(s.n);
          counts.set(String(s.hw), c);
        }
        // t302: a submitted piece the teacher has commented on (after the last submit) waits for the student; it leaves the review list until the student responds.
        for (const s of this.sql.exec(`SELECT hw, comments, submitted_at FROM subs WHERE status='submitted'`).toArray()) {
          const cm = JSON.parse(String(s.comments || "[]")) as { at?: number }[];
          if (!cm.some((x) => Number(x.at || 0) > Number(s.submitted_at || 0))) continue;
          const c = counts.get(String(s.hw)) || {};
          c.waiting = (c.waiting || 0) + 1;
          counts.set(String(s.hw), c);
        }
        const classes = this.sql.exec(`SELECT cls, COUNT(*) AS n FROM users WHERE role='student' AND disabled=0 GROUP BY cls ORDER BY cls`).toArray().map((r) => ({ cls: String(r.cls || ""), students: Number(r.n) }));
        const allStudents = this.sql.exec(`SELECT id, name, cls, section FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray().map((r) => ({ id: String(r.id), name: String(r.name), cls: String(r.cls || ""), section: String(r.section || "") }));
        // Teachers with a class/section scope only see their own pupils (admins and unscoped teachers see all).
        const scoped = a.role === "teacher" && (a.scope || []).length > 0;
        const okFor = (c: string, sec: string) => (a.scope || []).some((x) => { const [k, s2] = x.split("|"); return k === c && (!s2 || s2 === sec); });
        const students = scoped ? allStudents.filter((x) => okFor(x.cls, x.section) || (a.stu || []).includes(x.id)) : allStudents;
        // t349: assigned classes show even with 0 students (empty class cards; students can be added later).
        const mineCls = [...new Set((a.scope || []).filter((x) => x && x !== "\u0000").map((x) => x.split("|")[0]))];
        const classesOut = scoped ? [...classes.map((c) => ({ ...c, students: students.filter((x) => x.cls === c.cls).length })).filter((c) => c.students > 0 || mineCls.includes(c.cls)), ...mineCls.filter((c) => !classes.some((x) => x.cls === c)).map((c) => ({ cls: c, students: 0 }))] : classes;
        return { status: 200, body: { homework: all.map((h) => ({ ...h, counts: counts.get(h.id) || {}, assigned: this.assignees(h).length })), classes: classesOut, students, catalog: this.catalog(), scope: a.scope || [], quran: { show: qd.show, view: qd.view, add: qd.add, edit: qd.edit, del: qd.del } } };
      }

      case "corrected": {
        // Graded Quran homework (Excellent/Good passed, or Needs practice sent back) for the teacher's own homework (admin/viewAll: all).
        if (a.role === "student" || a.role === "parent") return { status: 403, body: { error: "forbidden" } };
        const qd = qhwOf(a);
        if (a.role === "teacher" && !(qd.show && qd.view)) return { status: 403, body: { error: "quran_not_allowed" } };
        const hws = new Map(this.allHomework().filter((h) => h.kind === "quran").map((h) => [h.id, h]));
        const mine = (h: { createdBy: string; data?: unknown }, r: Record<string, unknown>) => a.role === "admin" || this.va(a, h.createdBy) || h.createdBy === a.id || this.sharedTo(h, a.id) || (JSON.parse(String(r.attempts || "[]")) as { by: string; byId?: string }[]).some((x) => x.byId === a.id || x.by === a.name) || (JSON.parse(String(r.comments || "[]")) as { by: string; byId?: string }[]).some((x) => x.byId === a.id || x.by === a.name);
        const names = new Map(this.sql.exec(`SELECT id, name, cls, section FROM users`).toArray().map((r) => [String(r.id), { name: String(r.name), cls: String(r.cls || ""), section: String(r.section || "") }]));
        // t347: also list work a teacher corrected with feedback (comments / verse marks / voice notes after the last submit) but did not grade yet — shown to the assigning teacher and the correcting teacher.
        const fbOf = (r: Record<string, unknown>) => { const cm = JSON.parse(String(r.comments || "[]")) as { by: string; at?: number }[]; const after = cm.filter((x) => Number(x.at || 0) > Number(r.submitted_at || 0)); const mk = (JSON.parse(String(r.mistakes || "[]")) as unknown[]).length; return { after, mk }; };
        const items = this.sql.exec(`SELECT * FROM subs WHERE (grade != '' AND status IN ('approved','returned')) OR status='submitted' ORDER BY updated DESC LIMIT 2000`).toArray().filter((r) => {
          if (!hws.has(String(r.hw))) return false;
          const fb = String(r.status) === "submitted" ? fbOf(r) : null;
          if (fb && !fb.after.length && !fb.mk) return false;
          return mine(hws.get(String(r.hw))!, r) || !!(fb && fb.after.some((x) => x.by === a.name));
        }).slice(0, 1000).map((r) => {
          const h = hws.get(String(r.hw))!; const at = JSON.parse(String(r.attempts || "[]")) as { at: number; by: string }[]; const last = at[at.length - 1];
          const u = names.get(String(r.student));
          const fb = String(r.status) === "submitted" ? fbOf(r) : null; const lc = fb?.after[fb.after.length - 1];
          return { id: String(r.id), hw: h.id, title: h.title, data: h.data, student: String(r.student), name: u?.name ?? "?", cls: u?.cls ?? "", section: u?.section ?? "", grade: String(r.grade || ""), status: fb ? "feedback" : String(r.status), scores: r.scores ? JSON.parse(String(r.scores)) : null, gradedAt: fb ? Number(lc?.at || r.updated) : last?.at || Number(r.updated), by: fb ? lc?.by || "" : last?.by || "", setBy: names.get(h.createdBy)?.name || "" };
        });
        return { status: 200, body: { items } };
      }

      case "hw": {
        const h = this.allHomework(str(input.id, 40))[0];
        if (!h) return { status: 404, body: { error: "not_found" } };
        if (a.role === "student") {
          if (!this.assignees(h).includes(a.id)) return { status: 403, body: { error: "forbidden" } };
          return { status: 200, body: { homework: { ...h, locked: this.lockedFor(h, a.id), lockedBy: this.lockInfo(h, a.id) }, sub: this.sub(h.id, a.id) } };
        }
        if (h.kind === "quran" && a.role === "teacher") { const qv = qhwOf(a); if (!(qv.show && qv.view)) return { status: 403, body: { error: "quran_not_allowed" } }; }
        // t347: teachers open only their own, shared, or picked teachers' homework (View all homework → selected teachers).
        if (a.role === "teacher" && h.createdBy !== a.id && !this.va(a, h.createdBy) && !this.sharedTo(h, a.id)) return { status: 403, body: { error: "forbidden" } };
        const names = new Map(this.sql.exec(`SELECT id, name, cls FROM users`).toArray().map((r) => [String(r.id), { name: String(r.name), cls: String(r.cls || "") }]));
        const subs = this.sql.exec(`SELECT * FROM subs WHERE hw=? ORDER BY updated DESC`, h.id).toArray().map((r) => ({ ...this.withVersions(this.subOut(r), r), student: String(r.student), name: names.get(String(r.student))?.name ?? "?", cls: names.get(String(r.student))?.cls ?? "" }));
        const pending = this.assignees(h).filter((id) => !subs.some((s) => s.student === id)).map((id) => ({ id, name: names.get(id)?.name ?? "?" }));
        return { status: 200, body: { homework: h, subs, notStarted: pending } };
      }

      case "sub-save": {
        if (a.role !== "student") return { status: 403, body: { error: "students_only" } };
        const h = this.allHomework(str(input.hw, 40))[0];
        if (!h || !this.assignees(h).includes(a.id)) return { status: 404, body: { error: "not_found" } };
        if (this.lockedFor(h, a.id)) return { status: 409, body: { error: "locked" } };
        const cur = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0];
        if (cur?.status === "approved") return { status: 409, body: { error: "already_approved" } };
      if (cur?.status === "submitted" && !(JSON.parse(String(cur.comments || "[]")) as { at?: number }[]).some((x) => Number(x.at || 0) > Number(cur.submitted_at || 0))) return { status: 409, body: { error: "already_submitted" } };
        const status = input.submit === true ? "submitted" : cur?.status === "returned" ? "returned" : "draft";
        const text = str(input.text, 4000);
        const practised = input.practised === true ? 1 : 0;
        if (cur) this.sql.exec(`UPDATE subs SET status=?, text=?, practised=?, updated=? WHERE id=?`, status, text, practised, Date.now(), String(cur.id));
        else this.sql.exec(`INSERT INTO subs (id, hw, student, status, text, practised, updated) VALUES (?, ?, ?, ?, ?, ?, ?)`, rid("s"), h.id, a.id, status, text, practised, Date.now());
        this.touch(a.id);
        if (status === "submitted") this.sql.exec(`UPDATE subs SET submitted_at=? WHERE hw=? AND student=?`, Date.now(), h.id, a.id);
        if (status === "submitted") this.notify([h.createdBy, "admin"], "sub_new", { hw: h.id, title: h.title, student: a.name });
        return { status: 200, body: { ok: true, sub: this.sub(h.id, a.id) } };
      }

      case "sub-review": {
        if (!can(a, "review")) return { status: 403, body: { error: "forbidden" } };
        const r = this.sql.exec(`SELECT * FROM subs WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        { const hs = this.allHomework(String(r.hw))[0]; if (hs && a.role === "teacher" && hs.createdBy !== a.id && !this.va(a, hs.createdBy) && !this.sharedTo(hs, a.id)) return { status: 403, body: { error: "forbidden" } }; }
        { const hs = this.allHomework(String(r.hw))[0]; if (hs && a.role === "teacher" && hs.createdBy !== a.id && !this.va(a, hs.createdBy) && this.sharedTo(hs, a.id) && !this.shareCanCorrect(hs, a)) return { status: 403, body: { error: "share_view_only" } }; }
        { const hq0 = this.allHomework(String(r.hw))[0]; if (hq0?.kind === "quran" && a.role === "teacher") { const qv = qhwOf(a); if (!(qv.show && qv.view)) return { status: 403, body: { error: "quran_not_allowed" } }; } }
        const comments = JSON.parse(String(r.comments || "[]")) as { by: string; text: string; at: number }[];
        const c = str(input.comment, 1000);
        if (c) comments.push({ by: a.name, byId: a.id, text: c, at: Date.now() } as { by: string; text: string; at: number });
        const liked = typeof input.like === "boolean" ? (input.like ? 1 : 0) : Number(r.liked);
        const hq = this.allHomework(String(r.hw))[0];
        // Quran: three criteria (or a legacy colour) -> overall grade + generated feedback.
        let scores: Scores | null = hq?.kind === "quran" ? parseScores(input.scores) || (["green", "yellow", "red"].includes(String(input.grade)) ? fromGrade(String(input.grade)) : null) : null;
        const grade = scores ? overallOf(scores) : "";
        if (scores) scores = { ...scores, fb: buildFeedback(scores, JSON.parse(String(r.mistakes || "[]")) as { text: string; note?: string }[], c) };
        // Green/Yellow = passed (approved); Red = back to the student to practise the same verses again.
        let status = input.status === "approved" || input.status === "returned" ? String(input.status) : String(r.status);
        if (grade) status = grade === "red" ? "returned" : "approved";
        const attempts = JSON.parse(String(r.attempts || "[]")) as { n: number; audio: string; grade: string; by: string; at: number; scores?: Scores }[];
        if (grade) attempts.push({ n: attempts.length + 1, audio: String(r.audio || ""), grade, by: a.name, byId: a.id, at: Date.now(), scores: scores || undefined } as (typeof attempts)[number]);
        if (scores) this.sql.exec(`UPDATE subs SET scores=? WHERE id=?`, JSON.stringify(scores), String(r.id));
        this.sql.exec(`UPDATE subs SET comments=?, liked=?, status=?, grade=?, attempts=?, updated=? WHERE id=?`, JSON.stringify(comments.slice(-50)), liked, status, grade || String(r.grade || ""), JSON.stringify(attempts.slice(-300)), Date.now(), String(r.id));
        if (grade === "red") this.sql.exec(`UPDATE subs SET audio='', practised=0 WHERE id=?`, String(r.id));
        {
          const hh = this.allHomework(String(r.hw))[0];
          const nd = { hw: String(r.hw), title: hh?.title || "", by: a.name };
          if (grade) this.notify([String(r.student)], "graded", { ...nd, grade });
          else if (status !== String(r.status) && (status === "approved" || status === "returned")) this.notify([String(r.student)], status, nd);
          else if (c) this.notify([String(r.student)], (this.allHomework(String(r.hw))[0]?.data as Json | undefined)?.pack ? "lp_feedback" : "feedback", nd);
        }
        // Approving a Quran homework updates the student's tracker automatically.
        const h = this.allHomework(String(r.hw))[0];
        if (h?.kind === "quran") {
          // Tracker row per homework with its latest grade (red rows show as "needs practice", not learned).
          const d = h.data as { surah: number; from: number; to: number };
          const g = grade || (status === "approved" ? "green" : "");
          const sc = scores || parseScores(r.scores) || fromGrade(g);
          const mk = String(this.sql.exec(`SELECT mistakes FROM subs WHERE id=?`, String(r.id)).toArray()[0]?.mistakes || "");
          this.syncTrk(String(r.student), h.id, d, g, sc, mk, Date.now(), true);
          if (grade) {
            // t332: tell linked parents (push only, type "child_progress": admin switch off by default, per-parent switch).
            const ps = this.sql.exec(`SELECT parent FROM plink WHERE student=?`, String(r.student)).toArray().map((x) => String(x.parent));
            if (ps.length) {
              this.sql.exec(`INSERT OR IGNORE INTO push_kind (kind, first, admin_off) VALUES ('child_progress', ?, 1)`, Date.now());
              this.ctx.waitUntil(this.pushOut(ps, "child_progress", { child: this.studentName(String(r.student)), title: h.title, grade }).catch(() => undefined));
            }
          }
        }
        return { status: 200, body: { ok: true } };
      }

      case "email-pin": {
        // Admin emails a user their username + PIN (from info@, Reply-To contact@).
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        const u = this.userRow("id=?", str(input.id, 40));
        if (!u?.email) return { status: 400, body: { error: "no_email" } };
        const pin = u.pin_enc ? await openPin(this.env as LmsEnv, String(u.pin_enc)).catch(() => "") : "";
        if (!pin) return { status: 409, body: { error: "reset_pin_first" } };
        const ok = await sendAuto(this.env as LmsEnv, String(u.email), "Your sign-in details — Shaiq Muhammad", { heading: `Sign-in details for ${String(u.name)}`, paragraphs: ["Assalamu alaikum,", `Username: ${String(u.username)}`, `PIN: ${pin}`, "Keep this PIN private."], button: { label: "Sign in", url: "https://www.shaiqmuhammad.com/lms/login" }, note: "Automatic message — please don't reply. Questions: contact@shaiqmuhammad.com" }).catch(() => false);
        return ok ? { status: 200, body: { ok: true } } : { status: 503, body: { error: "mail_not_configured" } };
      }

      case "hw-unlock": {
        // Teacher/admin override: let one student work on a Quran homework even though earlier verses aren't passed yet (or re-lock).
        if (!can(a, "assign") && !can(a, "review")) return { status: 403, body: { error: "forbidden" } };
        const h = this.allHomework(str(input.hw, 40))[0];
        if (!h) return { status: 404, body: { error: "not_found" } };
        if (h.kind === "quran" && a.role === "teacher") { const qv = qhwOf(a); if (!(qv.show && qv.edit) && qv.set) return { status: 403, body: { error: "quran_not_allowed" } }; }
        const sid = str(input.student, 40);
        if (input.__method === "POST") {
          if (input.unlock === false) this.sql.exec(`DELETE FROM unlocks WHERE hw=? AND student=?`, h.id, sid);
          else this.sql.exec(`INSERT OR IGNORE INTO unlocks (hw, student) VALUES (?, ?)`, h.id, sid);
        }
        const locks = this.assignees(h).map((s2) => ({ student: s2, name: String(this.userRow("id=?", s2)?.name || s2), section: String(this.userRow("id=?", s2)?.section || ""), lockedBy: this.lockInfo(h, s2), unlocked: this.sql.exec(`SELECT 1 FROM unlocks WHERE hw=? AND student=?`, h.id, s2).toArray().length > 0 }));
        return { status: 200, body: { ok: true, locks } };
      }
      case "qpre-get": case "qpre-save": {
        // t328: Quran correction quick comments per criterion (m/t/r/h), each [English, Arabic]. Admin edits; staff read.
        if (action === "qpre-save") {
          if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
          const raw = (input.presets || {}) as Record<string, unknown>; const out: Record<string, [string, string][]> = {};
          for (const k of ["m", "t", "r", "h"]) out[k] = (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : []).slice(0, 60).map((x) => (Array.isArray(x) ? [str(x[0], 120), str(x[1] ?? x[0], 120)] : [str(x, 120), str(x, 120)]) as [string, string]).filter((x) => x[0]);
          this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('qpresets', ?)`, JSON.stringify(out));
          return { status: 200, body: { ok: true, presets: out } };
        }
        if (a.role === "student") return { status: 403, body: { error: "forbidden" } };
        const v = this.sql.exec(`SELECT v FROM settings WHERE k='qpresets'`).toArray()[0]?.v;
        return { status: 200, body: { presets: v ? JSON.parse(String(v)) : null } };
      }
      case "hw-share": {
        // t349: per-homework sharing removed — Permissions (See all homework + teacher list) controls correction access.
        if (Date.now() > 0) return { status: 410, body: { error: "share_removed" } };
        // t328: owner (or admin) shares a homework with other teachers; "correct" lets them grade it (needs the admin shareCorrect permission too).
        const h = this.allHomework(str(input.hw, 40))[0];
        if (!h) return { status: 404, body: { error: "not_found" } };
        const own = a.role === "admin" || h.createdBy === a.id;
        const teachers = this.sql.exec(`SELECT id, name, perms, subjects FROM users WHERE role='teacher' AND COALESCE(disabled,0)=0 ORDER BY name`).toArray().filter((t) => String(t.id) !== h.createdBy).map((t) => ({ id: String(t.id), name: String(t.name), permitted: String(t.perms || "").includes("shareCorrect") }));
        const cur = ((h.data as Json).share || { teachers: [], correct: false }) as { teachers: string[]; correct: boolean };
        if (input.__method === "POST") {
          if (!own || a.viewAs) return { status: 403, body: { error: "owner_only" } };
          const ids = (Array.isArray(input.teachers) ? input.teachers : []).map((x) => str(x, 40)).filter((x) => teachers.some((t) => t.id === x)).slice(0, 60);
          const next = { teachers: ids, correct: input.correct === true };
          this.sql.exec(`UPDATE homework SET data=? WHERE id=?`, JSON.stringify({ ...(h.data as Json), share: next }), h.id);
          const fresh = ids.filter((x) => !cur.teachers.includes(x) || (next.correct && !cur.correct));
          if (fresh.length) this.notify(fresh, "hw_shared", { hw: h.id, title: h.title, by: a.name, correct: next.correct });
          return { status: 200, body: { ok: true, share: next } };
        }
        return { status: 200, body: { share: cur, teachers: own ? teachers : [], own } };
      }
      case "qr-links": {
        // Teacher/admin: per-student QR tokens for one homework (created on demand; reset/revoke one).
        if (!can(a, "assign") && !can(a, "review")) return { status: 403, body: { error: "forbidden" } };
        const h = this.allHomework(str(input.hw, 40))[0];
        if (!h) return { status: 404, body: { error: "not_found" } };
        if (input.__method === "POST") {
          const sid = str(input.student, 40);
          if (h.kind === "quran" && (input.revoke === true || input.reset === true)) return { status: 409, body: { error: "qr_permanent" } };
          if (input.revoke === true || input.reset === true) this.sql.exec(`DELETE FROM qr WHERE hw=? AND student=?`, h.id, sid);
          if (input.revoke === true) this.sql.exec(`INSERT INTO qr (token, hw, student, created) VALUES (?, ?, ?, 0)`, "revoked:" + rid("x"), h.id, sid);
        }
        const out = this.assignees(h).map((sid) => {
          const u = this.userRow("id=?", sid);
          let row = h.kind === "quran" ? this.qrFor(sid, Number((h.data as Json).surah) || 0, h.id) : this.sql.exec(`SELECT token FROM qr WHERE hw=? AND student=?`, h.id, sid).toArray()[0];
          if (!row) {
            const tok = b64url(crypto.getRandomValues(new Uint8Array(18)));
            this.sql.exec(`INSERT INTO qr (token, hw, student, created) VALUES (?, ?, ?, ?)`, tok, h.id, sid, Date.now());
            row = { token: tok };
          }
          const t = String(row.token);
          return { student: sid, name: String(u?.name || "?"), nameAr: String(u?.name_ar || ""), arabic: subjList(u?.subject).includes("Islamic A"), cls: String(u?.cls || ""), section: String(u?.section || ""), token: t.startsWith("revoked:") ? "" : t };
        });
        return { status: 200, body: { links: out, teacher: a.name } };
      }

      case "perm-switch": {
        // t333 (admin): one general permission on/off for one or many teachers (same stored list as the Permissions panel).
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        const perm = str(input.perm, 40);
        if (perm !== "shareCorrect") return { status: 400, body: { error: "bad_perm" } };
        const on = input.on === true; let n = 0;
        for (const id of strList(input.ids, 300)) {
          const r = this.userRow("id=? AND role='teacher'", id); if (!r) continue;
          let ps: string[] = []; try { ps = JSON.parse(String(r.perms || "[]")) as string[]; } catch { ps = []; }
          const next = on ? [...new Set([...ps, perm])] : ps.filter((x) => x !== perm);
          if (next.length !== ps.length) { this.sql.exec(`UPDATE users SET perms=? WHERE id=?`, JSON.stringify(next), id); n++; }
        }
        return { status: 200, body: { ok: true, changed: n } };
      }
      case "quran-backfill": {
        // t332 (admin): graded Quran work that never reached the tracker (or whose marks/scores are stale) — dry run unless run=true.
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        const run = input.run === true;
        const qhw = new Map(this.allHomework().filter((h) => h.kind === "quran").map((h) => [h.id, h] as const));
        const out: { student: string; hw: string; why: string }[] = [];
        let hist = 0;
        for (const r of this.sql.exec(`SELECT id, hw, student, status, grade, scores, mistakes, updated, attempts FROM subs`).toArray()) {
          const h = qhw.get(String(r.hw)); if (!h) continue;
          const d = h.data as { surah: number; from: number; to: number };
          const g = String(r.grade || "") || (r.status === "approved" ? "green" : "");
          if (!g) continue;
          const t = this.sql.exec(`SELECT grade, scores, marks FROM tracker WHERE hw=? AND student=?`, h.id, String(r.student)).toArray()[0];
          const mk = String(r.mistakes || "[]");
          const sc = parseScores(r.scores) || fromGrade(g);
          const why = !t ? "missing" : String(t.grade) !== g ? "grade" : String(t.marks || "[]") !== mk ? "marks" : (parseScores(r.scores) && !String(t.scores || "").includes(String(r.scores).slice(0, 20))) ? "scores" : "";
          const hasHist = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM tracker_hist WHERE hw=? AND student=?`, h.id, String(r.student)).one().n) > 0;
          if (why) out.push({ student: String(r.student), hw: h.id, why });
          if (!hasHist) hist++;
          if (run && (why || !hasHist)) this.syncTrk(String(r.student), h.id, d, g, sc, mk, t ? Number(this.sql.exec(`SELECT approved FROM tracker WHERE hw=? AND student=?`, h.id, String(r.student)).toArray()[0]?.approved || r.updated) : Number(r.updated) || Date.now(), !hasHist);
        }
        return { status: 200, body: { run, fixes: out, histAdded: hist } };
      }
      case "viewas-log": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        return { status: 200, body: { items: this.sql.exec(`SELECT * FROM viewlog ORDER BY at DESC LIMIT 200`).toArray().map((r) => ({ uid: String(r.uid), name: String(r.name), role: String(r.role), at: Number(r.at), by: String(r.by || "Admin") })) } };
      }

      case "contacts": {
        if (a.role !== "admin") return { status: 403, body: { error: "admin_only" } };
        if (input.__method === "POST" && input.id) {
          if (input.delete === true) this.sql.exec(`DELETE FROM contacts WHERE id=?`, str(input.id, 40));
          else this.sql.exec(`UPDATE contacts SET read=1 WHERE id=?`, str(input.id, 40));
        }
        const items = this.sql.exec(`SELECT * FROM contacts ORDER BY created DESC LIMIT 200`).toArray().map((r) => ({ id: String(r.id), name: String(r.name), email: String(r.email), subject: String(r.subject), message: String(r.message), created: Number(r.created), read: Boolean(r.read), emailed: Boolean(r.emailed) }));
        return { status: 200, body: { items, unread: items.filter((x) => !x.read).length } };
      }

      case "progress": {
        // Per-student tracker screen for teachers (in scope) and admin.
        const sid = str(input.id, 40);
        if (!this.canSeeStudent(a, sid)) return { status: 403, body: { error: "forbidden" } };
        const u = this.userRow("id=?", sid);
        if (!u || u.role !== "student") return { status: 404, body: { error: "not_found" } };
        const sa = this.actorOf(u);
        const hw = this.assignedTo(sa).map((h) => { const sb = this.sub(h.id, sid); return { id: h.id, title: h.title, kind: h.kind, data: h.data, due: h.due, status: sb?.status || "none", grade: sb?.grade || "", attempts: sb?.attempts?.length || 0, late: !!(h.due && ((sb?.submittedAt || 0) > h.due || (!(sb?.submittedAt) && h.due < Date.now()))) }; });
        return { status: 200, body: { student: { ...(a.role === "admin" && !a.viewAs ? this.adminUser(u) : this.publicUser(u)), arabic: subjList(u.subject).includes("Islamic A") }, homework: hw, tracker: this.trackerOf(sid), progress: this.progressOf(sid), parentLink: String(u.parent_token || "") } };
      }

      case "quran-map": {
        // Class heatmap: students × surahs with best grade.
        if (!can(a, "review") && a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
        if (a.role === "teacher") { const qv = qhwOf(a); if (!(qv.show && qv.view)) return { status: 403, body: { error: "quran_not_allowed" } }; }
        const cls = str(input.cls, 40);
        const section = str(input.section, 40);
        const students = this.sql.exec(`SELECT * FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray().filter((u) => (!cls || u.cls === cls) && (!section || u.section === section) && this.canSeeStudent(a, String(u.id)));
        const rank: Record<string, number> = { red: 1, yellow: 2, green: 3 };
        const rows = students.map((u) => {
          const cells: Record<number, { grade: string; verses: number; m?: number; t?: number; r?: number; h?: number }> = {};
          // t332: latest version wins — cells take the grade and marks of the most recently graded work on that Surah.
          for (const t of [...this.trackerOf(String(u.id))].sort((x, y) => x.approved - y.approved)) {
            const c = cells[t.surah] || { grade: "", verses: 0 };
            if (t.scores) for (const k of ["m", "t", "r"] as const) c[k] = t.scores[k];
            if (t.scores?.h) c.h = t.scores.h;
            if (t.grade !== "red") c.verses += t.to - t.from + 1;
            void rank; c.grade = t.grade;
            cells[t.surah] = c;
          }
          return { id: String(u.id), name: String(u.name), cls: String(u.cls || ""), section: String(u.section || ""), cells };
        });
        const surahs = [...new Set(rows.flatMap((r) => Object.keys(r.cells).map(Number)))].sort((x, y) => y - x);
        return { status: 200, body: { rows, surahs } };
      }

      case "revise": {
        // Student marks a passed passage as revised -> next spaced interval.
        if (a.role !== "student") return { status: 403, body: { error: "students_only" } };
        const hw = str(input.hw, 40);
        this.sql.exec(`UPDATE tracker SET rev_count=rev_count+1, rev_at=? WHERE hw=? AND student=? AND grade!='red'`, Date.now(), hw, a.id);
        this.touch(a.id);
        return { status: 200, body: { ok: true, tracker: this.trackerOf(a.id) } };
      }

      case "practice": {
        // Any practice (repeat-after-me / memorisation test) counts for the streak.
        if (a.role === "student") this.touch(a.id);
        return { status: 200, body: { ok: true } };
      }

      case "admin-prefs": {
        // Admin dashboard preferences (quick-access bar), stored server-side so they follow the admin to any computer.
        if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
        if (input.__method === "POST") {
          const q = Array.isArray(input.quick) ? (input.quick as unknown[]).slice(0, 24).map((x) => { const o = (x || {}) as Record<string, unknown>; return { tab: str(o.tab, 30), label: str(o.label, 40), icon: str(o.icon, 30) }; }).filter((x) => x.tab) : [];
          this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('admin_quick', ?)`, JSON.stringify(q));
          if (typeof input.dashIcon === "string") this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('admin_dash_icon', ?)`, str(input.dashIcon, 30));
        }
        const raw = this.setting("admin_quick", "");
        return { status: 200, body: { quick: raw ? JSON.parse(raw) : null, dashIcon: this.setting("admin_dash_icon", "") } };
      }
      case "settings": {
        if (input.__method === "POST") {
          if (!can(a, "assign") && a.role !== "admin") return { status: 403, body: { error: "forbidden" } };
          const v = ["off", "on", "top3"].includes(String(input.leaderboard)) ? String(input.leaderboard) : "off";
          this.sql.exec(`INSERT OR REPLACE INTO settings (k, v) VALUES ('leaderboard', ?)`, v);
        }
        return { status: 200, body: { leaderboard: this.setting("leaderboard", "off") } };
      }

      case "leaderboard": {
        // Weekly stars within the student's class (or a chosen class for staff). Hidden unless a teacher turned it on.
        const mode = this.setting("leaderboard", "off");
        if (a.role === "student" && mode === "off") return { status: 403, body: { error: "leaderboard_off" } };
        const cls = a.role === "student" ? a.cls : str(input.cls, 40);
        const since = Date.now() - 7 * 864e5;
        const list = this.sql.exec(`SELECT id, name, cls FROM users WHERE role='student' AND disabled=0`).toArray().filter((u) => !cls || u.cls === cls).filter((u) => a.role === "student" || this.canSeeStudent(a, String(u.id)))
          .map((u) => ({ id: String(u.id), name: String(u.name), stars: this.progressOf(String(u.id), since).stars }))
          .filter((x) => x.stars > 0).sort((x, y) => y.stars - x.stars);
        const top = mode === "top3" && a.role === "student" ? list.slice(0, 3) : list.slice(0, 20);
        return { status: 200, body: { mode, cls, list: top.map((x, i) => ({ rank: i + 1, name: x.name, stars: x.stars, me: x.id === a.id })) } };
      }

      case "parent-link": {
        const sid = str(input.id, 40);
        if (!this.canSeeStudent(a, sid)) return { status: 403, body: { error: "forbidden" } };
        const u = this.userRow("id=?", sid);
        if (!u || u.role !== "student") return { status: 404, body: { error: "not_found" } };
        let tok = String(u.parent_token || "");
        if (!tok || input.reset === true || input.revoke === true) {
          tok = input.revoke === true ? "" : b64url(crypto.getRandomValues(new Uint8Array(24)));
          this.sql.exec(`UPDATE users SET parent_token=? WHERE id=?`, tok, sid);
        }
        return { status: 200, body: { token: tok } };
      }

      case "mistakes": {
        // Teacher marks mistakes on an exact verse/word of a Quran submission.
        if (!can(a, "review")) return { status: 403, body: { error: "forbidden" } };
        const r = this.sql.exec(`SELECT * FROM subs WHERE id=?`, str(input.id, 40)).toArray()[0];
        if (!r) return { status: 404, body: { error: "not_found" } };
        const list = (Array.isArray(input.mistakes) ? (input.mistakes as Json[]) : []).slice(0, 100).map((m) => ({ ayah: Math.trunc(Number(m.ayah)) || 0, word: Math.trunc(Number(m.word)), text: str(m.text, 80), note: str(m.note, 300), ...(m.audio ? { audio: str(m.audio, 60) } : {}) })).filter((m) => m.ayah > 0);
        this.sql.exec(`UPDATE subs SET mistakes=?, updated=? WHERE id=?`, JSON.stringify(list), Date.now(), String(r.id));
        this.sql.exec(`UPDATE tracker SET marks=? WHERE hw=? AND student=?`, JSON.stringify(list), String(r.hw), String(r.student)); // t332: verse marks flow to the tracker
        const h = this.allHomework(String(r.hw))[0];
        if (list.length) this.notify([String(r.student)], "mistakes", { hw: String(r.hw), title: h?.title || "", by: a.name, count: list.length });
        return { status: 200, body: { ok: true } };
      }

      case "export": {
        if (!isStaff(a)) return { status: 403, body: { error: "forbidden" } };
        if (!this.dlOf(a, "export")) return { status: 403, body: { error: "download_not_allowed" } };
        const hw = this.allHomework().filter((h) => a.role === "admin" || this.va(a, h.createdBy) || h.createdBy === a.id || this.sharedTo(h, a.id));
        const ids = new Set(hw.map((h) => h.id));
        const users = this.sql.exec(`SELECT id, username, name, role, cls, section FROM users`).toArray().map((r) => ({ id: String(r.id), username: String(r.username), name: String(r.name), role: String(r.role), cls: String(r.cls || ""), section: String(r.section || "") }));
        const subs = this.sql.exec(`SELECT * FROM subs ORDER BY updated`).toArray().filter((r) => ids.has(String(r.hw))).map((r) => ({ ...this.subOut(r), hw: String(r.hw), student: String(r.student) }));
        const tracker = this.sql.exec(`SELECT * FROM tracker ORDER BY approved`).toArray().map((r) => ({ student: String(r.student), surah: Number(r.surah), from: Number(r.from_ayah), to: Number(r.to_ayah), hw: String(r.hw), approved: Number(r.approved) }));
        return { status: 200, body: { exportedAt: Date.now(), homework: hw, subs, users, tracker } };
      }
    }
    return { status: 404, body: { error: "unknown_action" } };
  }

  private className(id: string) {
    return String(this.sql.exec(`SELECT name FROM catalog WHERE id=?`, id).toArray()[0]?.name ?? "");
  }
  /** Keeps users, homework and teacher scopes pointing at a renamed subject/class/section. */
  private renameEverywhere(kind: CatKind, was: string, now: string, inClass: string) {
    if (kind === "phase") { for (const u of this.sql.exec(`SELECT id, phase FROM users`).toArray()) { const l = String(u.phase || "").split(","); if (l.includes(was)) this.sql.exec(`UPDATE users SET phase=? WHERE id=?`, l.map((x) => (x === was ? now : x)).join(","), String(u.id)); } return; }
    if (kind === "dept") return;
    const users = this.sql.exec(`SELECT id, subjects, scope FROM users`).toArray();
    if (kind === "subject") {
      for (const u of users) { const l = JSON.parse(String(u.subjects || "[]")) as string[]; if (l.includes(was)) this.sql.exec(`UPDATE users SET subjects=? WHERE id=?`, JSON.stringify(l.map((x) => (x === was ? now : x))), String(u.id)); }
      return;
    }
    if (kind === "class") {
      this.sql.exec(`UPDATE users SET cls=? WHERE cls=?`, now, was);
      this.sql.exec(`UPDATE homework SET cls=? WHERE cls=?`, now, was);
    } else {
      this.sql.exec(`UPDATE users SET section=? WHERE cls=? AND section=?`, now, inClass, was);
      this.sql.exec(`UPDATE homework SET section=? WHERE cls=? AND section=?`, now, inClass, was);
    }
    for (const u of users) {
      const l = JSON.parse(String(u.scope || "[]")) as string[];
      const next = l.map((x) => { const [k, s2] = x.split("|"); if (kind === "class") return k === was ? [now, s2].filter(Boolean).join("|") : x; return k === inClass && s2 === was ? `${k}|${now}` : x; });
      if (next.join() !== l.join()) this.sql.exec(`UPDATE users SET scope=? WHERE id=?`, JSON.stringify(next), String(u.id));
    }
  }

  private async setPin(id: string, pin: string) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    this.sql.exec(`UPDATE users SET salt=?, hash=?, pin_enc=? WHERE id=?`, b64url(salt), await hashPin(pin, salt), await sealPin(this.env, pin), id);
    // A new PIN from the teacher/admin also lifts any sign-in lockout for that username.
    const u = this.sql.exec(`SELECT username FROM users WHERE id=?`, id).toArray()[0];
    if (u) this.sql.exec(`DELETE FROM fails WHERE k=?`, `u:${u.username}`);
  }
  private allHomework(id?: string) {
    const rows = id ? this.sql.exec(`SELECT * FROM homework WHERE id=?`, id).toArray() : this.sql.exec(`SELECT * FROM homework ORDER BY created DESC`).toArray();
    return rows.map((r) => ({ id: String(r.id), kind: String(r.kind) as "quran" | "general", title: String(r.title), cls: String(r.cls || ""), section: String(r.section || ""), students: JSON.parse(String(r.students || "[]")) as string[], data: JSON.parse(String(r.data || "{}")) as Json, due: r.due ? Number(r.due) : null, createdBy: String(r.created_by), created: Number(r.created) }));
  }
  /** Students a homework is for: the listed students, else everyone in its class ("" = all students). */
  private assignees(h: { cls: string; section: string; students: string[]; createdBy?: string }): string[] {
    // Target = individual students ∪ class/section members (no class and no students = everyone).
    // Homework set by a teacher with subject groups only reaches students taking that subject.
    if (!h.cls && h.students.length) return h.students;
    const rows = h.cls
      ? h.section
        ? this.sql.exec(`SELECT id, subject FROM users WHERE role='student' AND disabled=0 AND cls=? AND section=?`, h.cls, h.section).toArray()
        : this.sql.exec(`SELECT id, subject FROM users WHERE role='student' AND disabled=0 AND cls=?`, h.cls).toArray()
      : this.sql.exec(`SELECT id, subject FROM users WHERE role='student' AND disabled=0`).toArray();
    const by = h.createdBy ? this.userRow("id=?", h.createdBy) : undefined;
    const subj = by && by.role === "teacher" ? this.teacherScope(String(by.id)).subj : [];
    const ok = (r: Record<string, unknown>) => !subj.length || subj.some((x) => subjList(r.subject).includes(x));
    return [...new Set([...h.students, ...rows.filter(ok).map((r) => String(r.id))])];
  }
  private assignedTo(a: Actor) {
    const sec = String(this.userRow("id=?", a.id)?.section || "");
    const now = Date.now();
    return this.allHomework().filter((h) => !(Number((h.data as Json).assignAt || 0) > now)).filter((h) => (h.students.includes(a.id) || (h.cls ? h.cls === a.cls && (!h.section || h.section === sec) : !h.students.length)));
  }
  private subOut(r: Record<string, unknown>) {
    return { id: String(r.id), status: String(r.status), text: String(r.text || ""), practised: Boolean(r.practised), liked: Boolean(r.liked), comments: JSON.parse(String(r.comments || "[]")) as { by: string; text: string; at: number; audio?: string }[], audio: String(r.audio || ""), grade: String(r.grade || ""), scores: parseScores(r.scores) || fromGrade(String(r.grade || "")), mistakes: JSON.parse(String(r.mistakes || "[]")) as { ayah: number; word: number; text: string; note: string }[], submittedAt: Number(r.submitted_at || 0), attempts: (JSON.parse(String(r.attempts || "[]")) as { n: number; audio: string; grade: string; by: string; at: number; scores?: Scores }[]).map((x) => ({ ...x, scores: x.scores || fromGrade(x.grade) || undefined })), updated: Number(r.updated) };
  }
  /** t328: Quran submissions carry the student's full version timeline on that Surah (teacher view). */
  private withVersions<T extends { id: string }>(o: T, r: Record<string, unknown>): T {
    const h = this.allHomework(String(r.hw))[0]; const s2 = h?.kind === "quran" ? Number((h.data as Json).surah) || 0 : 0;
    return s2 ? { ...o, versions: this.surahVersions(String(r.student), s2) } : o;
  }
  private sub(hw: string, student: string) {
    const r = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, hw, student).toArray()[0];
    return r ? this.withVersions(this.subOut(r), r) : null;
  }
  /** t332: one Quran tracker row per (homework, student) = its latest graded version; every grading is also kept in tracker_hist. */
  private syncTrk(student: string, hw: string, d: { surah: number; from: number; to: number }, g: string, sc: unknown, marks: string, at: number, hist: boolean) {
    this.sql.exec(`DELETE FROM tracker WHERE hw=? AND student=?`, hw, student);
    const s2 = sc as (Record<string, unknown> & { fb?: unknown }) | null;
    const scs = s2 ? JSON.stringify(s2.fb ? s2 : { ...s2, fb: buildFeedback(s2 as never) }) : "";
    if (!g) return;
    this.sql.exec(`INSERT INTO tracker (id, student, surah, from_ayah, to_ayah, hw, approved, grade, scores, marks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, rid("t"), student, d.surah, d.from, d.to, hw, at, g, scs, marks);
    if (hist) this.sql.exec(`INSERT INTO tracker_hist (id, student, hw, surah, from_ayah, to_ayah, grade, scores, marks, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, rid("th"), student, hw, d.surah, d.from, d.to, g, scs, marks, at);
  }

  private trackerOf(student: string) {
    return this.sql.exec(`SELECT surah, from_ayah, to_ayah, approved, grade, hw, rev_count, rev_at, scores, marks FROM tracker WHERE student=? ORDER BY surah, from_ayah`, student).toArray().map((r) => {
      const revCount = Number(r.rev_count || 0);
      const last = Number(r.rev_at || 0) || Number(r.approved);
      const g = String(r.grade || "green");
      const revDue = g !== "red" ? last + REVISION_DAYS[Math.min(revCount, REVISION_DAYS.length - 1)] * 864e5 : 0;
      return { surah: Number(r.surah), from: Number(r.from_ayah), to: Number(r.to_ayah), approved: Number(r.approved), grade: g, hw: String(r.hw), revCount, revDue, scores: parseScores(r.scores) || fromGrade(g), marks: (() => { try { return JSON.parse(String(r.marks || "[]")) as unknown[]; } catch { return []; } })() };
    });
  }

  /** Marks today as an active day for streaks (Dubai day boundary). */
  private touch(student: string) {
    const day = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
    this.sql.exec(`INSERT OR IGNORE INTO activity (student, day) VALUES (?, ?)`, student, day);
  }

  /** Stars, streak and badges, computed from grades/submissions/activity. */
  private progressOf(student: string, since = 0) {
    const subs = this.sql.exec(`SELECT status, grade, updated FROM subs WHERE student=?`, student).toArray().filter((r) => Number(r.updated) >= since);
    const greens = subs.filter((r) => r.grade === "green").length;
    const yellows = subs.filter((r) => r.grade === "yellow").length;
    const handed = subs.filter((r) => r.status === "submitted" || r.status === "approved").length;
    const stars = greens * 3 + yellows * 2 + handed;
    const days = new Set(this.sql.exec(`SELECT day FROM activity WHERE student=?`, student).toArray().map((r) => String(r.day)));
    let streak = 0;
    const d0 = new Date(Date.now() + 4 * 3600e3);
    const key = (d: Date) => d.toISOString().slice(0, 10);
    if (!days.has(key(d0))) d0.setUTCDate(d0.getUTCDate() - 1); // today not done yet: count up to yesterday
    while (days.has(key(d0))) { streak++; d0.setUTCDate(d0.getUTCDate() - 1); }
    const tracker = this.trackerOf(student).filter((t) => t.grade !== "red");
    const badges: string[] = [];
    if (handed >= 1) badges.push("first_step");
    if (greens >= 1) badges.push("first_green");
    if (greens >= 5) badges.push("five_greens");
    if (streak >= 3) badges.push("streak_3");
    if (streak >= 7) badges.push("streak_7");
    if (tracker.reduce((n, t) => n + (t.to - t.from + 1), 0) >= 50) badges.push("fifty_verses");
    if (tracker.some((t) => t.revCount >= 3)) badges.push("reviser");
    return { stars, streak, greens, yellows, handed, badges, activeDays: days.size };
  }

  /** Lazy reminders when a student opens the LMS: due within 24h / overdue, and revision due. One note per item per day. */
  private remind(a: Actor) {
    const now = Date.now();
    const today = new Date(now + 4 * 3600e3).toISOString().slice(0, 10);
    const sent = new Set(this.sql.exec(`SELECT data FROM notes WHERE uid=? AND kind IN ('reminder','revise') AND created > ?`, a.id, now - 864e5).toArray().map((r) => String((JSON.parse(String(r.data || "{}")) as Json).key || "")));
    for (const h of this.assignedTo(a)) {
      if (!h.due || this.lockedFor(h, a.id)) continue;
      const st = this.sql.exec(`SELECT status FROM subs WHERE hw=? AND student=?`, h.id, a.id).toArray()[0]?.status;
      if (st === "submitted" || st === "approved") continue;
      if (h.due - now < 864e5) {
        const key = `due:${h.id}:${today}`;
        if (!sent.has(key)) this.notify([a.id], "reminder", { hw: h.id, title: h.title, key, overdue: h.due < now });
      }
    }
    for (const t of this.trackerOf(a.id)) {
      if (t.revDue && t.revDue <= now) {
        const key = `rev:${t.hw}:${today}`;
        if (!sent.has(key)) this.notify([a.id], "revise", { hw: t.hw, title: `${t.surah}:${t.from}-${t.to}`, surah: t.surah, from: t.from, to: t.to, key });
      }
    }
  }

  /** Is this announcement meant for this person? */
  private annFor(r: Record<string, unknown>, a: Actor & { section?: string }): boolean {
    const aud = String(r.aud);
    if (aud === "all") return true;
    if (aud === "students") return a.role === "student";
    if (aud === "teachers") return a.role === "teacher";
    const cls = String(r.cls || ""), sec = String(r.section || "");
    if (a.role === "student") {
      const u = a.section !== undefined ? a : (this.userRow("id=?", a.id) as unknown as { cls: string; section: string } | null);
      return !!u && String(u.cls || "") === cls && (!sec || String((u as { section?: string }).section || "") === sec);
    }
    if (a.role === "teacher") return !a.scope?.length || a.scope.some((x) => { const [k, s2] = x.split("|"); return k === cls && (!sec || !s2 || s2 === sec); });
    return false;
  }

  /** Site-own video engagement (likes + comments), public endpoints. Visitor comments wait for admin approval. */
  async vid(action: string, a: Actor | null, q: Json): Promise<Reply> {
    const id = str(q.id, 20);
    if (!/^[\w-]{6,20}$/.test(id)) return { status: 400, body: { error: "bad_id" } };
    const cid = str(q.cid, 40).replace(/[^\w-]/g, "");
    const who = a ? a.id : cid.length >= 8 ? `c:${cid}` : "";
    if (action === "vid-pub-info") {
      const likes = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM vlikes WHERE vid=?`, id).one().n);
      const liked = !!who && this.sql.exec(`SELECT 1 FROM vlikes WHERE vid=? AND who=?`, id, who).toArray().length > 0;
      const comments = this.sql.exec(`SELECT name, role, body, created FROM vcomments WHERE vid=? AND status='ok' ORDER BY created DESC LIMIT 100`, id).toArray().map((r) => ({ name: String(r.name), role: String(r.role), text: String(r.body), at: Number(r.created) }));
      const mine = who ? Number(this.sql.exec(`SELECT COUNT(*) AS n FROM vcomments WHERE vid=? AND who=? AND status='pending'`, id, who).one().n) : 0;
      return { status: 200, body: { likes, liked, comments, pendingMine: mine } };
    }
    if (action === "vid-pub-like") {
      if (!who) return { status: 400, body: { error: "no_identity" } };
      const had = this.sql.exec(`SELECT 1 FROM vlikes WHERE vid=? AND who=?`, id, who).toArray().length > 0;
      if (had) this.sql.exec(`DELETE FROM vlikes WHERE vid=? AND who=?`, id, who);
      else {
        if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM vlikes WHERE who=? AND at>?`, who, Date.now() - 3_600_000).one().n) >= 60) return { status: 429, body: { error: "slow_down" } };
        this.sql.exec(`INSERT INTO vlikes (vid, who, at) VALUES (?, ?, ?)`, id, who, Date.now());
      }
      return { status: 200, body: { liked: !had, likes: Number(this.sql.exec(`SELECT COUNT(*) AS n FROM vlikes WHERE vid=?`, id).one().n) } };
    }
    if (action === "vid-pub-comment") {
      if (str(q.website, 100)) return { status: 200, body: { ok: true, pending: true } };
      const text = str(q.text, 500);
      if (text.length < 2) return { status: 400, body: { error: "empty" } };
      if (/(https?:|www\.|\w\.(com|net|org|ru|xyz|io)\b)/i.test(text)) return { status: 400, body: { error: "no_links" } };
      if (!who) return { status: 400, body: { error: "no_identity" } };
      const name = a ? (a.role === "student" ? a.name.split(/\s+/)[0] : a.name) : str(q.name, 40);
      if (!name) return { status: 400, body: { error: "name_required" } };
      const iph = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vid:${str(q.ip, 60)}`)))).slice(0, 16);
      const hr = Date.now() - 3_600_000;
      if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM vcomments WHERE who=? AND created>?`, who, hr).one().n) >= 5 || Number(this.sql.exec(`SELECT COUNT(*) AS n FROM vcomments WHERE iph=? AND created>?`, iph, hr).one().n) >= 10) return { status: 429, body: { error: "slow_down" } };
      if (this.sql.exec(`SELECT 1 FROM vcomments WHERE vid=? AND who=? AND body=?`, id, who, text).toArray().length) return { status: 200, body: { ok: true, pending: !a } };
      const status = a ? "ok" : "pending";
      this.sql.exec(`INSERT INTO vcomments (id, vid, who, name, role, body, created, status, iph) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, rid("vc"), id, who, name, a ? a.role : "visitor", text, Date.now(), status, iph);
      return { status: 200, body: { ok: true, pending: !a } };
    }
    return { status: 404, body: { error: "unknown_action" } };
  }

  /** Mirrors parent replies from the iCloud mailbox into pmsg (matched by token). Throttled to once per 30 s. */
  private async syncParentMail() {
    const last = Number(this.sql.exec(`SELECT v FROM settings WHERE k='pm:sync'`).toArray()[0]?.v || 0);
    if (Date.now() - last < 30_000) return;
    this.sql.exec(`INSERT INTO settings (k, v) VALUES ('pm:sync', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`, String(Date.now()));
    let reps: Awaited<ReturnType<typeof fetchParentReplies>> = [];
    try { reps = await fetchParentReplies(this.env as LmsEnv, Date.now() - 21 * 86_400_000); } catch { return; }
    for (const r of reps) {
      const mid = r.messageId.replace(/[<>]/g, "");
      if (mid.startsWith("pm-")) continue; // our own outgoing copy
      const th = this.sql.exec(`SELECT * FROM pthreads WHERE thread=?`, r.token).toArray()[0];
      if (!th) continue;
      if (this.sql.exec(`SELECT id FROM pmsg WHERE msgid=?`, mid).toArray().length) continue;
      let body = r.text.replace(/\r/g, "");
      const cut = body.search(/^(On .{5,200}wrote:|-{2,}\s*Original Message|From:\s.+@|>)/im);
      if (cut > 0) body = body.slice(0, cut);
      body = body.trim().slice(0, 5000) || "(empty reply)";
      const t = Date.parse(r.date); 
      this.sql.exec(`INSERT INTO pmsg (id, thread, student, teacher, dir, subject, body, created, msgid, read) VALUES (?, ?, ?, ?, 'in', ?, ?, ?, ?, 0)`, rid("pm"), r.token, String(th.student), String(th.teacher), r.subject.replace(/\[PM-[a-f0-9]{8}\]\s*/i, "").slice(0, 150), body, Number.isFinite(t) ? t : Date.now(), mid);
      this.notify([String(th.teacher)], "message", { by: "Parent", title: body.slice(0, 60), thread: r.token });
    }
  }

  /** Who may this person message? Students: their teachers + admin (never other students). Teachers: their students + admin. Admin: everyone. */
  private msgContacts(a: Actor): { id: string; name: string; role: string; cls: string; seen: number }[] {
    const users = this.sql.exec(`SELECT id, name, role, cls, section, scope, perms, last_seen FROM users WHERE disabled=0 ORDER BY role DESC, name`).toArray();
    const out = (u: Record<string, unknown>) => ({ id: String(u.id), name: String(u.name), role: String(u.role), cls: [u.cls, u.section].filter(Boolean).join(" "), seen: Number(u.last_seen || 0) });
    const admin = { id: "admin", name: "Admin", role: "admin", cls: "", seen: this.adminSeen() };
    if (a.role === "admin") return users.map(out);
    if (a.role === "teacher") {
      const parents = users.filter((u) => u.role === "parent").map((u) => ({ u, kids: this.kidsOf(String(u.id)).filter((k) => this.canSeeStudent(a, k.id)) })).filter((x) => x.kids.length)
        .map((x) => ({ id: String(x.u.id), name: String(x.u.name), role: "parent", cls: `Parent · ${x.kids.map((k) => k.name).join(", ")}`, seen: Number(x.u.last_seen || 0) }));
      return [admin, ...users.filter((u) => u.role === "student" && this.canSeeStudent(a, String(u.id))).map(out), ...parents];
    }
    if (a.role === "parent") {
      const kids = this.kidsOf(a.id);
      const ts = users.filter((u) => {
        if (u.role !== "teacher") return false;
        const t: Actor = { id: String(u.id), role: "teacher", name: "", cls: "", perms: JSON.parse(String(u.perms || "[]")), ...this.teacherScope(String(u.id)) };
        return (t.scope || []).length > 0 && kids.some((k) => this.canSeeStudent(t, k.id));
      });
      return [admin, ...ts.map(out)];
    }
    const teachers = users.filter((u) => {
      if (u.role !== "teacher") return false;
      const t: Actor = { id: String(u.id), role: "teacher", name: "", cls: "", perms: JSON.parse(String(u.perms || "[]")), ...this.teacherScope(String(u.id)) };
      return (t.scope || []).length > 0 && this.canSeeStudent(t, a.id);
    });
    return [admin, ...teachers.map(out)];
  }

  /** Admin-only student fields. Name = first + last when given. */
  private savePrivate(id: string, raw: Json, gender: string) {
    const cur = this.userRow("id=?", id) || {};
    const has = (k: string) => raw[k] !== undefined;
    const v = (k: string, col: string, n = 80) => (has(k) ? str(raw[k], n) : String(cur[col] || ""));
    const dobIn = has("dob") ? str(raw.dob, 10) : String(cur.dob || "");
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(dobIn) ? dobIn : "";
    const seIn = v("semail", "semail", 120);
    const semail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seIn) ? seIn : "";
    const fl = (k: string, col: string) => (has(k) ? (raw[k] ? "1" : "") : String(cur[col] || ""));
    if (has("parentName")) this.sql.exec(`UPDATE users SET parent_name=? WHERE id=?`, str(raw.parentName, 80), id);
    // Tracker Target (1–7, kept exactly as entered) and optional scaled score (used only when there is no Target).
    if (has("target")) { const t = Math.round(Number(raw.target)); this.sql.exec(`UPDATE users SET target=? WHERE id=?`, raw.target === "" || raw.target === null || !(t >= 1 && t <= 9) ? "" : String(t), id); }
    if (has("nameAr")) this.sql.exec(`UPDATE users SET name_ar=? WHERE id=?`, str(raw.nameAr, 120), id);
    if (has("isamsId")) this.sql.exec(`UPDATE users SET isams_id=? WHERE id=?`, str(raw.isamsId, 20).replace(/[^0-9A-Za-z-]/g, ""), id);
    if (has("isamsSurname")) this.sql.exec(`UPDATE users SET isams_surname=? WHERE id=?`, str(raw.isamsSurname, 80), id);
    if (has("scaled")) { const t = Math.round(Number(raw.scaled)); this.sql.exec(`UPDATE users SET scaled=? WHERE id=?`, raw.scaled === "" || raw.scaled === null || !(t >= 1 && t <= 200) ? "" : String(t), id); }
    this.sql.exec(`UPDATE users SET gender=?, dob=?, phone=?, semail=?, nationality=?, pref_lang=?, sen=?, eal=?, gt=? WHERE id=?`, has("gender") ? gender : String(cur.gender || ""), dob, v("phone", "phone", 30), semail, v("nationality", "nationality", 40), v("prefLang", "pref_lang", 30), fl("sen", "sen"), fl("eal", "eal"), fl("gt", "gt"), id);
    if (has("firstName") || has("lastName")) {
      const f = str(raw.firstName, 40), l = str(raw.lastName, 40);
      if (f) this.sql.exec(`UPDATE users SET first_name=?, last_name=?, name=? WHERE id=?`, f, l, `${f} ${l}`.trim(), id);
    }
  }
  /** Teacher's class scope (no scope = all classes); admin always. */
  /** Who may open a class wall: that class's students, teachers whose scope covers it, and admin. */
  /** Admin-made student groups (walls are per group): full member ids = listed students + whole classes/sections. */
  private wallGroups(): { id: string; name: string; subject: string; teachers: string[]; ids: string[] }[] {
    const stu = this.sql.exec(`SELECT id, cls, section FROM users WHERE role='student' AND disabled=0`).toArray();
    return this.sql.exec(`SELECT * FROM grp WHERE admin=1 ORDER BY name`).toArray().map((r) => {
      const toks = JSON.parse(String(r.classes || "[]")) as string[];
      const ids = new Set(JSON.parse(String(r.students || "[]")) as string[]);
      for (const u of stu) for (const t of toks) { const [c, sc] = t.split("|"); if (String(u.cls) === c && (!sc || String(u.section) === sc)) ids.add(String(u.id)); }
      return { id: String(r.id), name: String(r.name), subject: String(r.subject || ""), teachers: JSON.parse(String(r.teachers || "[]")) as string[], ids: [...ids] };
    });
  }
  /** May this actor read/write the wall with this key? "g:<groupId>" = group wall; "Class|Section" = older class wall (still readable). */
  private wallKeyOk(a: Actor, key: string): boolean {
    if (key.startsWith("g:")) {
      const g = this.wallGroups().find((x) => x.id === key.slice(2));
      if (!g) return false;
      if (a.role === "admin") return true;
      if (a.role === "student") return g.ids.includes(a.id);
      return a.role === "teacher" && g.teachers.includes(a.id);
    }
    const [c, s2] = key.split("|");
    return this.wallAllowed(a, c, s2 || "");
  }
  private wallAllowed(a: Actor, cls: string, section: string): boolean {
    if (!cls) return false;
    if (a.role === "student") { const [c, s2] = this.placeOf(a.id); return c === cls && s2 === section; }
    return this.inScope(a, cls, section);
  }
  // ================= Parent accounts =================
  private kidsOf(pid: string) {
    return this.sql.exec(`SELECT u.id, u.name, u.cls, u.section, u.avatar, u.gender FROM plink p JOIN users u ON u.id=p.student WHERE p.parent=? AND u.role='student' AND u.disabled=0 ORDER BY u.name`, pid).toArray()
      .map((r) => ({ id: String(r.id), name: String(r.name), cls: String(r.cls || ""), section: String(r.section || ""), avatar: avatarOf(r) }));
  }
  /** Everything a parent may do. Child data is fetched through the child's own student actor, read-only, after the link is verified. */
  private async parentHandle(a: Actor, action: string, input: Json): Promise<Reply> {
    const pass = (x: Json): Json => { const o = { ...x }; (o as Record<symbol, unknown>)[PASS] = true; return o; };
    const kids = this.kidsOf(a.id);
    switch (action) {
      case "me": return { status: 200, body: { user: { ...a, children: kids } } };
      case "par-children": return { status: 200, body: { children: kids } };
      case "att-tt-shared": case "push-prefs": case "pin-change": case "dl-policy": case "dl-grant": case "notes": case "notes-read": case "msg-contacts": case "msg-threads": case "msg-thread": case "msg-send":
        return this.handle(action, a, pass(input));
    }
    const CHILD = new Set(["par-quran", "par-trk", "my-assess", "dashboard", "hw", "assess-list", "cur-list", "ann-list", "wall-classes", "wall-list", "wall-media", "par-att", "par-beh", "par-results"]);
    if (!CHILD.has(action)) return { status: 403, body: { error: "forbidden" } };
    const cid = str(input.child, 40) || (kids.length === 1 ? kids[0].id : "");
    const kid = kids.find((k) => k.id === cid);
    if (!kid) return { status: 403, body: { error: "not_your_child" } };
    const srow = this.userRow("id=? AND role='student'", kid.id);
    if (!srow) return { status: 403, body: { error: "not_your_child" } };
    const sa: Actor = { ...this.actorOf(srow), viewAs: true };
    const clean: Json = { ...input }; delete clean.child;
    switch (action) {
      case "par-att": {
        const rows = this.sql.exec(`SELECT day, period, status FROM att WHERE student=? ORDER BY day DESC, period LIMIT 400`, kid.id).toArray();
        const n: Record<string, number> = { P: 0, A: 0, L: 0, E: 0 };
        for (const r of rows) n[String(r.status)] = (n[String(r.status)] || 0) + 1;
        const base = n.P + n.L + n.A;
        return { status: 200, body: { counts: n, pct: base ? Math.round(((n.P + n.L) / base) * 1000) / 10 : null, items: rows.slice(0, 120).map((r) => ({ day: String(r.day), period: String(r.period), status: String(r.status) })) } };
      }
      case "par-beh": {
        const tot = Number(this.sql.exec(`SELECT COALESCE(SUM(pts),0) AS t FROM pts WHERE student=?`, kid.id).one().t);
        const items = this.sql.exec(`SELECT label, pts, icon, at FROM pts WHERE student=? ORDER BY at DESC LIMIT 80`, kid.id).toArray().map((r) => ({ label: String(r.label), pts: Number(r.pts), icon: String(r.icon || ""), at: Number(r.at) }));
        return { status: 200, body: { total: tot, items } };
      }
      case "par-quran": {
        // t332: the child's Quran journey — per Surah: latest tracker rows (grade, marks incl. Memorisation, verse marks), version timeline (recordings + feedback) and grading history.
        const rows = this.trackerOf(kid.id);
        const surahs = new Set<number>(rows.map((t) => t.surah));
        for (const h of this.allHomework()) if (h.kind === "quran" && this.sql.exec(`SELECT 1 FROM subs WHERE hw=? AND student=?`, h.id, kid.id).toArray().length) surahs.add(Number((h.data as Json).surah) || 0);
        const hist = this.sql.exec(`SELECT surah, from_ayah, to_ayah, grade, scores, at FROM tracker_hist WHERE student=? ORDER BY at`, kid.id).toArray().map((r) => ({ surah: Number(r.surah), from: Number(r.from_ayah), to: Number(r.to_ayah), grade: String(r.grade), scores: parseScores(r.scores), at: Number(r.at) }));
        const list = [...surahs].filter(Boolean).sort((x, y) => x - y).map((surah) => ({ surah, rows: rows.filter((t) => t.surah === surah), versions: this.surahVersions(kid.id, surah), history: hist.filter((x) => x.surah === surah) }));
        return { status: 200, body: { surahs: list } };
      }
      case "par-trk": {
        // t332: Assessment Tracker grades (EYFS / Primary classes only), read through an admin-level grid and cut down to this child's own row.
        const cls = String(srow.cls || "");
        if (!/^(FS|Year [1-6]\b)/i.test(cls)) return { status: 200, body: { applies: false, terms: [] } };
        const adm: Actor = { id: "admin", role: "admin", name: "Admin", cls: "", perms: [...PERMS] };
        const terms: { term: string; grade: unknown; target: unknown }[] = [];
        for (const term of ["Term 1", "Term 2", "Term 3"]) {
          const r = await this.handle("trk-get", adm, { cls, term } as Json).catch(() => null);
          const b = r?.status === 200 ? (r.body as { results?: { id: string; grade?: unknown }[]; students?: { id: string; target?: unknown }[] }) : null;
          const me = b?.results?.find((x) => x.id === kid.id);
          if (me) terms.push({ term, grade: me.grade ?? null, target: b?.students?.find((x) => x.id === kid.id)?.target ?? null });
        }
        return { status: 200, body: { applies: true, cls, terms } };
      }
      case "par-results": {
        // Assessment results are recorded by the name typed at the quiz, so they are matched by name AND an assessment assigned to this child.
        const RES = (this.env as unknown as { RESULTS?: DurableObjectNamespace }).RESULTS;
        const assigned = (await this.handle("assess-list", sa, {})).body as { items: { quiz: string; title: string }[] };
        if (!RES) return { status: 200, body: { items: [], assigned: assigned.items } };
        const nm = String(srow.name).trim().toLowerCase();
        const slugs = new Set(assigned.items.map((x) => x.quiz));
        const all = await (RES.get(RES.idFromName("main")) as unknown as { list(f: object): Promise<Record<string, unknown>[]> }).list({ details: false });
        const items = all.filter((r) => r.linkState !== "ignored" && (String(r.studentId || "") === String(srow.id) || (!r.studentId && r.kind === "individual" && String(r.name).trim().toLowerCase() === nm && (slugs.has(String(r.quizSlug)) || slugs.has(String(r.quizId)))))).slice(0, 60)
          .map((r) => ({ quizTitle: String(r.quizTitle), score: Number(r.score), maxScore: Number(r.maxScore), percentage: Number(r.percentage), finishedAt: Number(r.finishedAt), ...this.levelOf(Number(r.percentage), String(srow.cls || r.year || "")) }));
        return { status: 200, body: { items, assigned: assigned.items } };
      }
    }
    return this.handle(action, sa, clean);
  }

  /** Admin: parent accounts (login + PIN) linked to students. Admin-only; emails never leave this action set. */
  private async parAdmin(a: Actor, action: string, input: Json): Promise<Reply> {
    if (a.role !== "admin" || a.viewAs) return { status: 403, body: { error: "admin_only" } };
    const listOut = () => this.sql.exec(`SELECT * FROM users WHERE role='parent' ORDER BY name`).toArray().map((r) => ({ id: String(r.id), username: String(r.username), name: String(r.name), email: String(r.email || ""), disabled: Boolean(r.disabled), hasPin: Boolean(r.pin_enc), lastLogin: r.last_login ? Number(r.last_login) : null, kids: this.sql.exec(`SELECT u.id, u.name, u.cls, u.section FROM plink p JOIN users u ON u.id=p.student WHERE p.parent=? ORDER BY u.name`, String(r.id)).toArray().map((k) => ({ id: String(k.id), name: String(k.name), cls: String(k.cls || ""), section: String(k.section || "") })) }));
    const slug = (t: string) => normUser(t.toLowerCase().replace(/\s+/g, ".")).replace(/^\.+|\.+$/g, "").slice(0, 28) || "parent";
    const freeName = (base: string) => { let u = base, n = 1; while (this.userRow("username=?", u)) u = `${base}${++n}`; return u; };
    const link = (pid: string, ids: string[]) => { for (const sid of ids) if (this.userRow("id=? AND role='student'", sid)) this.sql.exec(`INSERT OR IGNORE INTO plink (parent, student) VALUES (?, ?)`, pid, sid); };
    switch (action) {
      case "par-list": return { status: 200, body: { items: listOut() } };
      case "par-save": {
        const name = str(input.name, 80), ids = strList(input.students, 50);
        const emailIn = String(input.email || "").trim();
        const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailIn) ? emailIn.slice(0, 120) : "";
        if (!name) return { status: 400, body: { error: "name" } };
        let pin = str(input.pin, 64);
        if (pin && !validPin(pin)) return { status: 400, body: { error: "pin_digits" } };
        const existing = input.id ? this.userRow("id=? AND role='parent'", str(input.id, 40)) : undefined;
        if (input.id && !existing) return { status: 404, body: { error: "not_found" } };
        const username = normUser(input.username);
        if (username.length < 3) return { status: 400, body: { error: "username" } };
        const clash = this.userRow("username=?", username);
        if (clash && (!existing || clash.id !== existing.id)) return { status: 409, body: { error: "username_taken" } };
        let id: string;
        if (existing) {
          id = String(existing.id);
          this.sql.exec(`UPDATE users SET username=?, name=?, email=?, disabled=? WHERE id=?`, username, name, input.email === undefined ? String(existing.email || "") : email, input.disabled ? 1 : 0, id);
          if (pin) await this.setPin(id, pin);
        } else {
          if (Number(this.sql.exec(`SELECT COUNT(*) AS n FROM users`).one().n) >= MAX_USERS) return { status: 409, body: { error: "full" } };
          id = rid("u"); if (!pin) pin = newPin();
          this.sql.exec(`INSERT INTO users (id, username, name, role, cls, section, subjects, scope, perms, disabled, created, email) VALUES (?, ?, ?, 'parent', '', '', '[]', '[]', '[]', 0, ?, ?)`, id, username, name, Date.now(), email);
          await this.setPin(id, pin);
        }
        this.sql.exec(`DELETE FROM plink WHERE parent=?`, id);
        link(id, ids);
        return { status: 200, body: { ok: true, id, pin: existing ? (pin || undefined) : pin } };
      }
      case "par-delete": {
        const r = this.userRow("id=? AND role='parent'", str(input.id, 40));
        if (!r) return { status: 404, body: { error: "not_found" } };
        this.sql.exec(`DELETE FROM plink WHERE parent=?`, String(r.id));
        this.sql.exec(`DELETE FROM notes WHERE uid=?`, String(r.id));
        this.sql.exec(`DELETE FROM users WHERE id=?`, String(r.id));
        return { status: 200, body: { ok: true } };
      }
      case "par-import": {
        // From each student's existing parent name / email: one account per distinct parent email (or name when there is no email).
        const only = strList(input.students, 3000);
        const studs = this.sql.exec(`SELECT id, name, cls, section, email, parent_name FROM users WHERE role='student' AND disabled=0 ORDER BY cls, section, name`).toArray().filter((r) => !only.length || only.includes(String(r.id)));
        type G = { key: string; name: string; email: string; ids: string[]; names: string[] };
        const groups = new Map<string, G>();
        for (const r of studs) {
          const em = String(r.email || "").trim().toLowerCase(), pn = String(r.parent_name || "").trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) && !pn) continue;
          const key = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) ? `e:${em}` : `n:${pn.toLowerCase()}`;
          const g = groups.get(key) || { key, name: pn || `Parent of ${String(r.name)}`, email: /^[^\s@]+@/.test(em) ? em : "", ids: [], names: [] };
          g.ids.push(String(r.id)); g.names.push(String(r.name)); groups.set(key, g);
        }
        const plan = [...groups.values()].map((g) => {
          const ex = g.email ? this.sql.exec(`SELECT id, name FROM users WHERE role='parent' AND LOWER(email)=?`, g.email).toArray()[0] : undefined;
          return { ...g, existing: ex ? String(ex.id) : "", action: ex ? "link" : "create" };
        });
        if (input.confirm !== true) return { status: 200, body: { plan: plan.map((g) => ({ name: g.name, email: g.email, students: g.names, action: g.action })) } };
        const pins: { username: string; name: string; pin: string; students: string[] }[] = [];
        let created = 0, linked = 0;
        for (const g of plan) {
          if (g.existing) { link(g.existing, g.ids); linked++; continue; }
          const username = freeName(`p.${slug(g.name)}`), pin = newPin(), id = rid("u");
          this.sql.exec(`INSERT INTO users (id, username, name, role, cls, section, subjects, scope, perms, disabled, created, email) VALUES (?, ?, ?, 'parent', '', '', '[]', '[]', '[]', 0, ?, ?)`, id, username, g.name, Date.now(), g.email);
          await this.setPin(id, pin); link(id, g.ids); created++;
          pins.push({ username, name: g.name, pin, students: g.names });
        }
        return { status: 200, body: { ok: true, created, linked, pins } };
      }
    }
    return { status: 404, body: { error: "not_found" } };
  }

  /** Absence notice to a parent: only on an explicit teacher action, reusing the parent-mail flow (preview first; the address is never returned to teachers). */
  private async attParentAlert(a: Actor, input: Json): Promise<Reply> {
    if (a.viewAs || !(a.role === "admin" || (a.role === "teacher" && a.perms.includes("att:edit")))) return { status: 403, body: { error: "forbidden" } };
    const sid = str(input.student, 40), day = str(input.day, 10);
    const u = this.userRow("id=? AND role='student'", sid);
    if (!u) return { status: 404, body: { error: "not_found" } };
    if (!this.inScope(a, String(u.cls || ""), String(u.section || ""), String(u.id))) return { status: 403, body: { error: "not_your_class" } };
    const rec = this.sql.exec(`SELECT * FROM att WHERE student=? AND day=? AND status='A' LIMIT 1`, sid, day).toArray()[0];
    if (!rec) return { status: 400, body: { error: "not_absent" } };
    const subject = `Absence notice — ${String(u.name)} (${day})`.slice(0, 150);
    const body = str(input.body, 2000) || `${String(u.name)} was marked absent on ${day}. If this is unexpected or you have already informed the school, please reply to this email.`;
    const r = await this.handle(input.confirm === true ? "parent-mail-send" : "parent-mail-preview", a, { student: sid, subject, body, confirm: input.confirm === true });
    if (r.status === 200 && input.confirm === true) this.sql.exec(`UPDATE att SET alerted=? WHERE student=? AND day=?`, Date.now(), sid, day);
    return r.status === 200 ? { status: 200, body: { ...(r.body as Json), subject, body, today: modToday() } } : r;
  }

  private inScope(a: Actor, cls: string, section: string, sid?: string): boolean {
    if (a.role === "admin") return true;
    if (a.role !== "teacher") return false;
    if (sid && a.stu?.includes(sid)) return true;
    if (!a.scope?.length) return false;
    return a.scope.some((x) => { const [k, s2] = x.split("|"); return k === cls && (!s2 || !section || s2 === section); }) && this.subjOk(a, sid);
  }
  private placeOf(sid: string): [string, string] {
    const u = this.userRow("id=? AND role='student'", sid);
    return u ? [String(u.cls || ""), String(u.section || "")] : ["\u0000", "\u0000"];
  }
  /** Public parent report (token): only that student's points or Quran data, read-only. */
  reportView(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: 404, body: { error: "not_found" } };
    const t = this.sql.exec(`SELECT * FROM rtok WHERE token=?`, token).toArray()[0];
    const u = t && this.userRow("id=? AND role='student'", String(t.student));
    if (!t || !u) return { status: 404, body: { error: "not_found" } };
    const base = { kind: String(t.kind), name: String(u.name), cls: String(u.cls || ""), section: String(u.section || ""), avatar: avatarOf(u), id: String(u.id) };
    if (t.kind === "quran") return { status: 200, body: { ...base, tracker: this.trackerOf(String(u.id)), progress: this.progressOf(String(u.id)) } };
    const pts = this.sql.exec(`SELECT label, pts, icon, by, at FROM pts WHERE student=? AND at>? ORDER BY at DESC LIMIT 2000`, String(u.id), Date.now() - 366 * 86400000).toArray().map((r) => ({ label: String(r.label), pts: Number(r.pts), icon: String(r.icon || ""), by: String(r.by), at: Number(r.at) }));
    return { status: 200, body: { ...base, points: pts } };
  }

  private canSeeStudent(a: Actor, sid: string): boolean {
    if (a.role === "admin") return true;
    if (a.role !== "teacher" || !can(a, "review")) return false;
    if (a.stu?.includes(sid)) return true;
    if (!a.scope?.length) return false;
    const u = this.userRow("id=?", sid);
    return !!u && a.scope.some((x) => { const [k, s2] = x.split("|"); return k === String(u.cls || "") && (!s2 || s2 === String(u.section || "")); }) && this.subjOk(a, sid);
  }

  /** Public contact form: store (always), rate-limit per IP (5/hour, 20/day site-wide per IP). */
  contactSave(ip: string, m: { name: string; email: string; subject: string; message: string }): { ok: boolean; id?: string; error?: string } {
    const now = Date.now();
    const recent = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM contacts WHERE ip=? AND created>?`, ip, now - 3600e3).one().n);
    const day = Number(this.sql.exec(`SELECT COUNT(*) AS n FROM contacts WHERE ip=? AND created>?`, ip, now - 864e5).one().n);
    if (recent >= 5 || day >= 20) return { ok: false, error: "rate_limited" };
    const id = rid("c");
    this.sql.exec(`INSERT INTO contacts (id, name, email, subject, message, created, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, m.name, m.email, m.subject, m.message, now, ip);
    this.sql.exec(`DELETE FROM contacts WHERE created < ?`, now - 365 * 864e5);
    return { ok: true, id };
  }
  contactEmailed(id: string) {
    this.sql.exec(`UPDATE contacts SET emailed=1 WHERE id=?`, id);
  }

  /** Admin "view as" access log. */
  /** t329 (t328 follow-up): a teacher who only has this homework because it was shared with them may not edit or delete it. */
  private sharedOnly(id: string, a: Actor): boolean {
    if (a.role !== "teacher") return false;
    const h = this.allHomework(id)[0];
    return !!h && h.createdBy !== a.id && this.sharedTo(h, a.id);
  }

  /** t329: a teacher with the viewAsStudent permission opens a student in their scope (read-only, logged). */
  async teacherViewAs(tid: string, pv: string, sid: string): Promise<Actor | null> {
    const t = await this.actor(tid, pv);
    if (!t || t.role !== "teacher" || !t.perms.includes("viewAsStudent")) return null;
    const u = this.userRow("id=?", sid);
    if (!u || String(u.role) !== "student" || !this.inScope(t, ...this.placeOf(sid), sid)) return null;
    const s = await this.actor(sid);
    if (!s) return null;
    this.logViewAs(sid, `${t.name} (teacher)`);
    return { ...s, viewAs: true };
  }

  logViewAs(uid: string, by = "Admin") {
    const u = this.userRow("id=?", uid);
    if (!u) return;
    const now = Date.now();
    // One log row per user per viewer per 10 minutes is enough.
    const last = this.sql.exec(`SELECT at FROM viewlog WHERE uid=? AND by=? ORDER BY at DESC LIMIT 1`, uid, by).toArray()[0];
    if (!last || now - Number(last.at) > 600e3) this.sql.exec(`INSERT INTO viewlog (id, uid, name, role, at, by) VALUES (?, ?, ?, ?, ?, ?)`, rid("v"), uid, String(u.name), String(u.role), now, by);
    this.sql.exec(`DELETE FROM viewlog WHERE at < ?`, now - 180 * 864e5);
  }

  /** QR token page: strictly one student + one homework, read-only. */
  qrView(token: string) {
    if (!/^[A-Za-z0-9_-]{22,64}$/.test(token)) return { status: 404, body: { error: "not_found" } };
    const q = this.sql.exec(`SELECT * FROM qr WHERE token=?`, token).toArray()[0];
    if (!q) return { status: 404, body: { error: "not_found" } };
    let h = this.allHomework(String(q.hw))[0];
    const u = this.userRow("id=?", String(q.student));
    // t328: a Quran code belongs to the student + Surah: it shows the latest homework on that Surah and every version.
    const qs = Number(q.surah) || (h?.kind === "quran" ? Number((h.data as Json).surah) || 0 : 0);
    const sameS = qs ? this.allHomework().filter((x) => x.kind === "quran" && Number((x.data as Json).surah) === qs && this.assignees(x).includes(String(q.student))) : [];
    if (sameS.length) { const withSub = sameS.filter((x) => this.sub(x.id, String(q.student))); h = (withSub.length ? withSub : sameS).sort((a2, b2) => Number(b2.created || 0) - Number(a2.created || 0))[0]; }
    if (!h || !u || u.disabled) return { status: 404, body: { error: "not_found" } };
    const sb = this.sub(h.id, String(u.id));
    const recs = [...new Set([...(sb?.attempts || []).map((x) => x.audio), sb?.audio || ""].filter(Boolean))];
    const d = h.data as { surah?: number; from?: number; to?: number; reciter?: string; translit?: boolean; translation?: boolean };
    const tracker = h.kind === "quran" ? this.trackerOf(String(u.id)).filter((t) => t.surah === d.surah) : [];
    return { status: 200, body: {
      student: String(u.name), studentAr: String(u.name_ar || ""), arabic: subjList(u.subject).includes("Islamic A"), cls: String(u.cls || ""), section: String(u.section || ""),
      homework: { title: h.title, kind: h.kind, data: h.kind === "quran" ? { surah: d.surah, from: d.from, to: d.to, reciter: d.reciter, translit: d.translit, translation: d.translation } : {} },
      status: sb?.status || "none", grade: sb?.grade || "", scores: sb?.scores || null,
      recordings: recs, recAt: Object.fromEntries(recs.map((id) => [id, Number(this.sql.exec(`SELECT created FROM blobs WHERE id=?`, id).toArray()[0]?.created || 0)])), attempts: (sb?.attempts || []).map((x) => ({ n: x.n, grade: x.grade, audio: x.audio, at: x.at, scores: x.scores })),
      feedback: (sb?.comments || []).map((c) => ({ by: c.by, text: c.text, audio: c.audio || "", at: c.at })),
      tracker, versions: qs ? this.surahVersions(String(u.id), qs) : [],
    } };
  }
  /** t328: the one permanent QR token for a student + Surah (earliest existing token wins; created on demand). */
  private qrFor(student: string, surah: number, hw: string): { token: string } {
    if (surah) {
      for (const r of this.sql.exec(`SELECT token, hw, surah FROM qr WHERE student=? AND token NOT LIKE 'revoked:%' ORDER BY created`, student).toArray()) {
        const s2 = Number(r.surah) || Number((this.allHomework(String(r.hw))[0]?.data as Json | undefined)?.surah) || 0;
        if (s2 && !Number(r.surah)) this.sql.exec(`UPDATE qr SET surah=? WHERE token=?`, s2, String(r.token));
        if (s2 === surah) return { token: String(r.token) };
      }
    }
    const tok = b64url(crypto.getRandomValues(new Uint8Array(18)));
    this.sql.exec(`INSERT INTO qr (token, hw, student, created, surah) VALUES (?, ?, ?, ?, ?)`, tok, hw, student, Date.now(), surah);
    return { token: tok };
  }
  /** t328: every submission on a Surah (all its homework) as numbered versions v1, v2… with recording, marks and feedback. */
  private surahVersions(student: string, surah: number) {
    const hws = this.allHomework().filter((x) => x.kind === "quran" && Number((x.data as Json).surah) === surah);
    const out: { hw: string; title: string; from: number; to: number; audio: string; at: number; grade: string; scores: Scores | null; by: string; pending: boolean; feedback: string[] }[] = [];
    for (const h of hws) {
      const r = this.sql.exec(`SELECT * FROM subs WHERE hw=? AND student=?`, h.id, student).toArray()[0]; if (!r) continue;
      const d = h.data as Json; const comments = JSON.parse(String(r.comments || "[]")) as { text: string; at: number }[];
      const att = JSON.parse(String(r.attempts || "[]")) as { audio: string; grade: string; by: string; at: number; scores?: Scores }[];
      let prev = 0;
      for (const x of att) { out.push({ hw: h.id, title: h.title, from: Number(d.from) || 0, to: Number(d.to) || 0, audio: x.audio || "", at: x.at, grade: x.grade, scores: x.scores || fromGrade(x.grade), by: x.by, pending: false, feedback: comments.filter((c) => c.at > prev && c.at <= x.at + 5000).map((c) => c.text) }); prev = x.at + 5000; }
      if (r.audio && String(r.status) === "submitted" && !att.some((x) => x.audio === String(r.audio))) out.push({ hw: h.id, title: h.title, from: Number(d.from) || 0, to: Number(d.to) || 0, audio: String(r.audio), at: Number(r.submitted_at || r.updated || 0), grade: "", scores: null, by: "", pending: true, feedback: [] });
    }
    return out.sort((a2, b2) => a2.at - b2.at).map((v, i) => ({ v: i + 1, ...v }));
  }

  async qrAudio(token: string, id: string): Promise<{ status: number; mime?: string; data?: ArrayBuffer }> {
    const q = this.sql.exec(`SELECT * FROM qr WHERE token=?`, token).toArray()[0];
    if (!q || !/^[A-Za-z0-9_-]{22,64}$/.test(token)) return { status: 404 };
    const qs = Number(q.surah) || Number((this.allHomework(String(q.hw))[0]?.data as Json | undefined)?.surah) || 0;
    const okHw = new Set([String(q.hw), ...(qs ? this.allHomework().filter((x) => x.kind === "quran" && Number((x.data as Json).surah) === qs).map((x) => x.id) : [])]);
    const b0 = this.sql.exec(`SELECT b.*, s.hw AS shw FROM blobs b JOIN subs s ON s.id=b.sub WHERE b.id=? AND s.student=?`, id, String(q.student)).toArray()[0];
    const b = b0 && okHw.has(String(b0.shw)) ? b0 : undefined;
    if (!b) return { status: 404 };
    const f = await this.files.get(id);
    if (!f) return { status: 404 };
    return { status: 200, mime: String(b.mime), data: f.body instanceof ArrayBuffer ? f.body : await new Response(f.body).arrayBuffer() };
  }

  /** Read-only parent view by secret token. */
  parentView(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: 404, body: { error: "not_found" } };
    const u = this.sql.exec(`SELECT * FROM users WHERE parent_token=? AND role='student'`, token).toArray()[0];
    if (!u) return { status: 404, body: { error: "not_found" } };
    const a = this.actorOf(u);
    const hw = this.assignedTo(a).map((h) => { const sb = this.sub(h.id, a.id); return { id: h.id, title: h.title, kind: h.kind, due: h.due, status: sb?.status || "none", grade: sb?.grade || "", late: !!(h.due && ((sb?.submittedAt || 0) > h.due || (!sb?.submittedAt && h.due < Date.now()))), comments: (sb?.comments || []).filter((c) => c.text).map((c) => ({ by: c.by, text: c.text, at: c.at })) }; });
    return { status: 200, body: { name: String(u.name), cls: String(u.cls || ""), section: String(u.section || ""), homework: hw, tracker: this.trackerOf(a.id), progress: this.progressOf(a.id) } };
  }

  /** A Quran homework stays locked until every earlier Quran homework on the same surah is passed (green/yellow), unless staff unlocked it. */
  private lockedFor(h: ReturnType<LmsStore["allHomework"]>[number], student: string): boolean { return !!this.lockInfo(h, student); }
  private lockInfo(h: ReturnType<LmsStore["allHomework"]>[number], student: string): { surah: number; from: number; to: number; title: string } | null {
    if (h.kind !== "quran") return null;
    if (this.sql.exec(`SELECT 1 FROM unlocks WHERE hw=? AND student=?`, h.id, student).toArray().length) return null;
    const surah = Number((h.data as { surah?: number }).surah);
    const o = this.allHomework().filter((o) => {
      if (o.id === h.id || o.kind !== "quran" || o.created >= h.created || Number((o.data as { surah?: number }).surah) !== surah) return false;
      if (!this.assignees(o).includes(student)) return false;
      const st = this.sql.exec(`SELECT status FROM subs WHERE hw=? AND student=?`, o.id, student).toArray()[0];
      return st?.status !== "approved";
    }).sort((x, y) => x.created - y.created)[0];
    if (!o) return null;
    const d = o.data as { surah?: number; from?: number; to?: number };
    return { surah, from: Number(d.from) || 1, to: Number(d.to) || Number(d.from) || 1, title: o.title };
  }
}

export async function handleLms(request: Request, env: LmsEnv, action: string): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  const store = env.LMS.get(env.LMS.idFromName("main"));
  if (action === "qr-audio") {
    const q = new URL(request.url).searchParams;
    if (q.get("dl") === "1" && !(await store.qrDlAllowed())) return reply(origin, { error: "download_not_allowed" }, 403);
    const r = (await store.qrAudio(str(q.get("t"), 80), str(q.get("id"), 40))) as unknown as { status: number; mime?: string; data?: ArrayBuffer };
    if (r.status !== 200 || !r.data) return reply(origin, { error: "not_found" }, 404);
    return new Response(r.data, { headers: { ...corsHeaders(origin), "Content-Type": r.mime || "audio/mpeg", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" } });
  }
  if (action === "lp-media-upload" || action === "lp-media") {
    const a = await lmsActor(request, env, store);
    if (!a) return reply(origin, { error: "unauthorized" }, 401);
    if (action === "lp-media") {
      const r = (await store.lpMediaGet(a, str(new URL(request.url).searchParams.get("id"), 60))) as unknown as { status: number; mime?: string; data?: ArrayBuffer; error?: string };
      if (r.status !== 200 || !r.data) return reply(origin, { error: r.error }, r.status);
      return new Response(r.data, { headers: { ...corsHeaders(origin), "Content-Type": r.mime || "application/octet-stream", "Cache-Control": "private, max-age=604800" } });
    }
    if (a.viewAs) return reply(origin, { error: "read_only" }, 403);
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    if (Number(request.headers.get("Content-Length") || 0) > 2_600_000) return reply(origin, { error: "too_large" }, 413);
    const r = (await store.lpMediaUpload(a, await request.arrayBuffer(), request.headers.get("Content-Type") || "")) as unknown as Reply;
    return reply(origin, r.body, r.status);
  }
  if (action === "audio-upload" || action === "audio") {
    const a = await lmsActor(request, env, store);
    if (!a) return reply(origin, { error: "unauthorized" }, 401);
    if (a.viewAs && action !== "audio") return reply(origin, { error: "read_only" }, 403);
    const q = Object.fromEntries(new URL(request.url).searchParams) as Json;
    if (action === "audio") {
      if (q.dl === "1" && !(await store.dlAllowed(a, "audio"))) return reply(origin, { error: "download_not_allowed" }, 403);
      const r = (await store.audioGet(a, str(q.id, 40))) as unknown as { status: number; mime?: string; data?: ArrayBuffer; error?: string };
      if (r.status !== 200 || !r.data) return reply(origin, { error: r.error }, r.status);
      return new Response(r.data, { headers: { ...corsHeaders(origin), "Content-Type": r.mime || "application/octet-stream", "Cache-Control": "private, max-age=86400" } });
    }
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    if (Number(request.headers.get("Content-Length") || 0) > MAX_AUDIO) return reply(origin, { error: "audio_too_long" }, 413);
    const buf = await request.arrayBuffer();
    const r = (await store.audioUpload(a, q, buf, request.headers.get("Content-Type") || "")) as unknown as Reply;
    return reply(origin, r.body, r.status);
  }
  let body: Json = {};
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > (action === "std-doc-save" ? 14_500_000 : action === "wall-post" ? 2_200_000 : /^(lp-(save|work-save)|pg-(save|import))$/.test(action) ? 950_000 : 200_000)) return reply(origin, { error: "too_large" }, 413);
    try {
      body = JSON.parse(text || "{}") as Json;
    } catch {
      return reply(origin, { error: "bad_json" }, 400);
    }
  }
  if (action === "qr-login") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    if (!env.SESSION_SIGNING_KEY) return reply(origin, { error: "not_configured" }, 503);
    const r = (await store.qrLogin(str(body.t, 80), request.headers.get("CF-Connecting-IP") || "?")) as unknown as Reply;
    if (r.status !== 200) return reply(origin, r.body, r.status);
    const ok = r.body as { uid: string; user: unknown };
    const t = await issueUserToken(env, ok.uid, (await store.pinStamp(ok.uid)) as unknown as string);
    return reply(origin, { ...t, user: ok.user });
  }
  if (action === "login") {
    if (request.method !== "POST") return reply(origin, { error: "method" }, 405);
    if (!env.SESSION_SIGNING_KEY) return reply(origin, { error: "not_configured" }, 503);
    const pin = str(body.pin, 64);
    if (!normUser(body.username) || !validPin(pin)) return reply(origin, { error: "bad_login" }, 401);
    const r = (await store.login(String(body.username), pin, request.headers.get("CF-Connecting-IP") || "?")) as unknown as Reply;
    if (r.status !== 200) return reply(origin, r.body, r.status);
    const ok = r.body as { uid: string; user: unknown };
    const t = await issueUserToken(env, ok.uid, (await store.pinStamp(ok.uid)) as unknown as string);
    return reply(origin, { ...t, user: ok.user });
  }
  if (action === "upload") {
    if (!blobStore(env).enabled) return reply(origin, { error: "storage_not_configured" }, 501);
    return reply(origin, { error: "not_implemented" }, 501);
  }
  if (action === "parent") {
    const r = (await store.parentView(str(new URL(request.url).searchParams.get("t") || body.t, 80))) as unknown as Reply;
    return reply(origin, r.body, r.status);
  }
  if (action === "report") {
    const r = (await store.reportView(str(new URL(request.url).searchParams.get("t") || body.t, 80))) as unknown as Reply;
    return reply(origin, r.body, r.status);
  }
  if (action === "qr") {
    const r = (await store.qrView(str(new URL(request.url).searchParams.get("t") || body.t, 80))) as unknown as Reply;
    return reply(origin, r.status === 200 ? { ...(r.body as object), dl: await store.qrDlAllowed() } : r.body, r.status);
  }
  if (action.startsWith("vid-pub-")) {
    const a0 = await lmsActor(request, env, store).catch(() => null);
    const q0: Json = { ...Object.fromEntries(new URL(request.url).searchParams), ...body, ip: request.headers.get("CF-Connecting-IP") || "?" };
    const r0 = (await store.vid(action, a0 && !a0.viewAs ? a0 : null, q0)) as unknown as Reply;
    return reply(origin, r0.body, r0.status);
  }
  const actor = await lmsActor(request, env, store);
  if (!actor) return reply(origin, { error: "unauthorized" }, 401);
  if (actor.viewAs && !VIEW_AS_READ.has(action)) return reply(origin, { error: "read_only" }, 403);
  const url = new URL(request.url);
  const input: Json = { ...Object.fromEntries(url.searchParams), ...body, __method: request.method };
  if (action === "refresh") {
    // Sliding renewal: a valid, active session gets a fresh 30-day token (never for admin / view-as).
    if (actor.role === "admin" || actor.viewAs) return reply(origin, { error: "forbidden" }, 403);
    const t = await issueUserToken(env, actor.id, (await store.pinStamp(actor.id)) as unknown as string);
    return reply(origin, { ...t, user: actor });
  }
  const r = (await store.handle(action, actor, input)) as unknown as Reply;
  if (action === "pin-change" && r.status === 200) {
    // The user's own PIN change keeps THIS session alive (fresh token with the new stamp); other sessions end.
    const t = await issueUserToken(env, actor.id, (await store.pinStamp(actor.id)) as unknown as string);
    return reply(origin, { ...(r.body as object), ...t }, 200);
  }
  return reply(origin, r.body, r.status);
}

/** The verified LMS user id behind a request (no role check). */
/** Signed-in, active STUDENT id from an LMS token (header "Bearer …" or the raw token), else null. Used to link quiz results to the account. */
export async function studentIdOf(env: LmsEnv, tokenOrHeader: string | null | undefined): Promise<string | null> {
  if (!tokenOrHeader || !env.LMS) return null;
  const tk = await verifyUserTokenPv(env, tokenOrHeader.startsWith("Bearer ") ? tokenOrHeader : `Bearer ${tokenOrHeader}`);
  if (!tk) return null;
  const u = (await env.LMS.get(env.LMS.idFromName("main")).actor(tk.uid, tk.pv)) as unknown as Actor | null;
  return u && u.role === "student" ? u.id : null;
}
/** t312: join gate for locked codes — null if the code is open; else ok (with the student's account name) or refused. */
export async function rosterGate(env: LmsEnv, code: string, lmsToken: string): Promise<{ ok: boolean; sid?: string; name?: string } | null> {
  if (!env.LMS) return null;
  const store = env.LMS.get(env.LMS.idFromName("main"));
  const ro = (await store.rosterOf(code)) as unknown as { students: string[] } | null;
  if (!ro) return null;
  const tk = lmsToken ? await verifyUserTokenPv(env, lmsToken.startsWith("Bearer ") ? lmsToken : `Bearer ${lmsToken}`) : null;
  const u = tk ? ((await store.actor(tk.uid, tk.pv)) as unknown as Actor | null) : null;
  if (!u || u.role !== "student" || !ro.students.includes(u.id)) return { ok: false };
  return { ok: true, sid: u.id, name: u.name };
}
export async function teacherIdOf(request: Request, env: LmsEnv): Promise<string | null> {
  return (await verifyUserTokenPv(env, request.headers.get("Authorization")))?.uid ?? null;
}

/** A signed-in, active teacher holding an extra permission like "act:wall" or "host:<quiz>" (Classroom Activities access). */
export async function teacherWithPerm(request: Request, env: LmsEnv, perm: string): Promise<boolean> {
  const tk = await verifyUserTokenPv(env, request.headers.get("Authorization"));
  if (!tk) return false;
  const u = (await env.LMS.get(env.LMS.idFromName("main")).actor(tk.uid, tk.pv)) as unknown as Actor | null;
  // t350: activities are enforced per type — "act:<type>" or "act:*"; "act:any" = holds at least one; "hide:activities" blocks all activities.
  if (!u || u.role !== "teacher") return false;
  if (perm.startsWith("act:") && u.perms.includes("hide:activities")) return false;
  if (perm === "act:any") return u.perms.some((p) => p.startsWith("act:"));
  return u.perms.includes(perm) || u.perms.includes(perm.split(":")[0] + ":*");
}

async function lmsActor(request: Request, env: LmsEnv, store: DurableObjectStub<LmsStore>): Promise<Actor | null> {
  const auth = request.headers.get("Authorization");
  if (await verifyToken(env, auth)) {
    // Admin "view as": read-only impersonation using ONLY the admin session (logged).
    const as = str(request.headers.get("X-View-As"), 40);
    if (as) {
      const u = (await store.actor(as)) as unknown as Actor | null;
      if (!u) return null;
      await store.logViewAs(as);
      return { ...u, viewAs: true };
    }
    return { id: "admin", role: "admin", name: "Admin", cls: "", perms: [...PERMS] };
  }
  const tk = await verifyUserTokenPv(env, auth);
  if (!tk) return null;
  const as = str(request.headers.get("X-View-As"), 40);
  // t329: teacher "log in as student" — read-only, scope + permission checked, audit-logged. Never falls back to the teacher.
  if (as) return (await store.teacherViewAs(tk.uid, tk.pv, as)) as unknown as Actor | null;
  return (await store.actor(tk.uid, tk.pv)) as unknown as Actor | null;
}
